import { audioEngine } from './audioEngine';
import { useProjectStore } from '../store/useProjectStore';
import { updatePlaybackTime } from '../hooks/usePlaybackTime';
import { LOOKAHEAD_TIME, SCHEDULER_INTERVAL, BEATS_VISIBLE, getEngineForInstrument } from './constants';
import type { MidiNote, Track, Clip } from './types';

export class AudioScheduler {
    private static instance: AudioScheduler;
    private instrumentCache = new Map<number, string>();
    private nextNoteTime = 0;
    private timerID: ReturnType<typeof setInterval> | null = null;
    private current16thNote = 0;
    private startTime = 0;
    private startOffset = 0;

    // Cache for audio buffers and pending loads
    private audioBufferCache = new Map<string, AudioBuffer>();
    private pendingLoads = new Set<string>();

    // Keys for scheduled events (tick-based) to avoid float precision issues
    private scheduledNotes = new Set<string>();

    // Active sample sources for stopping playback (Issue #18)
    private activeSampleSources = new Map<number, AudioBufferSourceNode[]>();

    // Pooled nodes per track to reduce GC pressure (Issue #11)
    private trackAudioNodes = new Map<number, { gain: GainNode; panner: StereoPannerNode }>();

    // UI progress callbacks
    private onProgressCallbacks = new Set<(time: number, step: number) => void>();

    // cached state
    private tracksCache: Track[] = [];
    private tempoCache = 120;
    private storeUnsubscribe: (() => void) | null = null;
    private rafId: number | null = null;

    // Lazy-loaded engines module
    private engines: any = null;

    // Worklet support
    private workletNode: AudioWorkletNode | null = null;

    // Configurable poll interval
    private pollIntervalMs = 6;

    // Diagnostics tracking
    private diagnostics = {
        usingWorklet: false,
        totalTicks: 0,
        missedTicks: 0,
        latencySamples: [] as number[],
        latencySum: 0,
        lastTickTime: 0,
        expectedTickTime: 0,
        jitterSamples: [] as number[],
        samplesScheduled: 0,
        samplesDropped: 0,
        maxLatencySamples: 1000, // Keep last 1000 samples for percentile calculation
    };

    private constructor() { }

    public static getInstance(): AudioScheduler {
        if (!AudioScheduler.instance) AudioScheduler.instance = new AudioScheduler();
        return AudioScheduler.instance;
    }

    public async start() {
        if (this.timerID) return;

        try {
            await audioEngine.initialize();

            // Ensure context is running
            await audioEngine.resume();

            if (!this.engines) this.engines = await import('./toneEngine');

            await Promise.all([
                this.engines.toneSynthEngine.initialize(),
                this.engines.toneDrumMachine.initialize(),
                this.engines.toneBassEngine.initialize(),
                this.engines.toneKeysEngine.initialize(),
                this.engines.toneVocalEngine.initialize(),
                this.engines.toneFXEngine.initialize(),
            ]);
        } catch (e) {
            console.error('Failed to start audio scheduler or engines', e);
            this.stop();
            throw e;
        }

        const store = useProjectStore.getState();
        this.tracksCache = store.tracks;
        this.tempoCache = store.activeProject?.tempo || 120;

        this.preloadProjectClips(this.tracksCache);

        this.storeUnsubscribe = useProjectStore.subscribe((state) => {
            if (this.tracksCache !== state.tracks) {
                this.tracksCache = state.tracks;
                this.cacheInstruments(state.tracks);
                this.preloadProjectClips(state.tracks);
            }
            const newTempo = state.activeProject?.tempo || 120;
            if (newTempo !== this.tempoCache) this.setTempo(newTempo);
            this.tempoCache = newTempo;
        });

        this.scheduledNotes.clear();
        this.cacheInstruments(store.tracks);

        const bpm = this.tempoCache;
        const secondsPerBeat = 60.0 / bpm;
        const secondsPer16th = 0.25 * secondsPerBeat;

        this.startOffset = this.current16thNote * secondsPer16th;
        this.startTime = audioEngine.getNow() - this.startOffset;
        this.nextNoteTime = audioEngine.getNow();

        // Reset diagnostics
        this.diagnostics.totalTicks = 0;
        this.diagnostics.missedTicks = 0;
        this.diagnostics.latencySamples = [];
        this.diagnostics.latencySum = 0;
        this.diagnostics.jitterSamples = [];
        this.diagnostics.samplesScheduled = 0;
        this.diagnostics.samplesDropped = 0;
        this.diagnostics.lastTickTime = 0;
        this.diagnostics.expectedTickTime = 0;

        // 1. Try to register and use AudioWorklet
        let workletReady = false;
        try {
            const result = await audioEngine.registerSchedulerWorklet();
            if (result && result.node) {
                this.workletNode = result.node;

                // Set up message handling
                this.workletNode.port.onmessage = (ev) => this.handleWorkletMessage(ev.data);

                // Initialize Worklet
                this.workletNode.port.postMessage({
                    type: 'init',
                    startTick: this.current16thNote,
                    tempo: this.tempoCache
                });

                this.workletNode.port.postMessage({ type: 'start' });

                console.log("AudioScheduler: Using AudioWorklet for timing");
                workletReady = true;
                this.diagnostics.usingWorklet = true;
            }
        } catch (e) {
            console.warn('Worklet registration failed, falling back to interval', e);
            this.diagnostics.usingWorklet = false;
        }

        // 2. Always use setInterval for the main Lookahead loop (Issue: Worklet jitter)
        // We use the worklet primarily to keep the AudioContext clock alive/robust if needed, 
        // but the actual scheduling logic is now safe to run on Main Thread via Lookahead.
        console.log('AudioScheduler: Starting Lookahead Scheduler');
        this.timerID = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);

        this.visualLoop();
    }

    private scheduler() {
        // Lookahead scheduler loop
        try {
            const now = audioEngine.getNow();
            const lookAheadTime = now + LOOKAHEAD_TIME;

            // Track tick timing for diagnostics
            const schedulerCallTime = now;
            
            // Schedule all notes within the lookahead window
            while (this.nextNoteTime < lookAheadTime) {
                // Calculate beat from nextNoteTime
                // Round to nearest 16th to avoid drift accumulation
                const secondsPerBeat = 60.0 / this.tempoCache;
                const secondsPer16th = 0.25 * secondsPerBeat;

                // Determine the 16th note index based on time since start
                const timeSinceStart = this.nextNoteTime - this.startTime;
                // Rounding helps keep it locked to grid
                const current16th = Math.round(timeSinceStart / secondsPer16th);

                this.current16thNote = current16th; // Sync state

                // Track diagnostics for this tick
                this.diagnostics.totalTicks++;
                
                // Calculate expected tick time
                if (this.diagnostics.expectedTickTime === 0) {
                    this.diagnostics.expectedTickTime = this.nextNoteTime;
                } else {
                    this.diagnostics.expectedTickTime += secondsPer16th;
                }

                // Calculate latency (time between when we should have scheduled vs when we did)
                const latency = schedulerCallTime - this.nextNoteTime;
                if (latency > 0) {
                    // We're behind schedule
                    const latencyMs = latency * 1000;
                    this.diagnostics.latencySamples.push(latencyMs);
                    this.diagnostics.latencySum += latencyMs;
                    
                    // Keep only recent samples
                    if (this.diagnostics.latencySamples.length > this.diagnostics.maxLatencySamples) {
                        const removed = this.diagnostics.latencySamples.shift()!;
                        this.diagnostics.latencySum -= removed;
                    }

                    // Track missed ticks (latency > threshold, e.g., > half a tick duration)
                    if (latencyMs > (secondsPer16th * 500)) { // 50% of tick duration
                        this.diagnostics.missedTicks++;
                    }
                }

                // Calculate jitter (variation in tick timing)
                if (this.diagnostics.lastTickTime > 0) {
                    const actualInterval = this.nextNoteTime - this.diagnostics.lastTickTime;
                    const expectedInterval = secondsPer16th;
                    const jitter = Math.abs(actualInterval - expectedInterval) * 1000; // in ms
                    this.diagnostics.jitterSamples.push(jitter);
                    
                    // Keep only recent jitter samples
                    if (this.diagnostics.jitterSamples.length > this.diagnostics.maxLatencySamples) {
                        this.diagnostics.jitterSamples.shift();
                    }
                }
                this.diagnostics.lastTickTime = this.nextNoteTime;

                this.scheduleNotesAtTime(this.current16thNote, this.nextNoteTime);
                this.advanceNote();
            }
        } catch (e) {
            console.error('Scheduler loop error', e);
            // Don't stop, just log. Stopping kills playback on one error.
        }
    }

    private advanceNote() {
        const tempo = this.tempoCache || 120;
        const secondsPerBeat = 60.0 / tempo;
        const secondsPer16th = 0.25 * secondsPerBeat;

        this.nextNoteTime += secondsPer16th;
        this.current16thNote++;

        // Loop logic
        const maxSteps = this.scopedNotes !== null ? this.scopedLoopEnd * 4 : BEATS_VISIBLE * 4;

        if (this.current16thNote >= maxSteps) {
            if (this.scopedNotes !== null) {
                // Loop scoped playback
                this.current16thNote = this.scopedLoopStart * 4;
                // We must clear scheduled notes so they can play again
                this.scheduledNotes.clear();
            } else {
                // Main loop - infinite scroll or loop back?
                // Current behavior was: reset to 0
                this.current16thNote = 0;
                this.scheduledNotes.clear();
                // Note: we should probably reset startTime here to keep numbers sane?
                // But nextNoteTime must remain linear for AudioContext.
                // So we just wrap the index.
            }
        }
    }

    // Worklet message handler refactored to NOT schedule, just sync/debug
    private handleWorkletMessage(msg: any) {
        if (msg.type === 'tick') {
            // Track worklet tick messages for diagnostic purposes
            const now = audioEngine.getNow();
            const receivedTime = now;
            const workletTime = msg.engineTime || now;
            
            // Calculate latency from worklet to main thread
            const workletLatency = (receivedTime - workletTime) * 1000; // in ms
            
            if (workletLatency > 0 && workletLatency < 1000) { // Sanity check
                this.diagnostics.latencySamples.push(workletLatency);
                this.diagnostics.latencySum += workletLatency;
                
                // Keep only recent samples
                if (this.diagnostics.latencySamples.length > this.diagnostics.maxLatencySamples) {
                    const removed = this.diagnostics.latencySamples.shift()!;
                    this.diagnostics.latencySum -= removed;
                }
            }
        }
    }

    public async preloadAudioClip(url: string) {
        if (this.audioBufferCache.has(url)) return;
        if (this.pendingLoads.has(url)) return;

        this.pendingLoads.add(url);
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioEngine.getContext().decodeAudioData(arrayBuffer);
            this.audioBufferCache.set(url, audioBuffer);
        } catch (e) {
            console.error('Failed to load audio clip:', url, e);
        } finally {
            this.pendingLoads.delete(url);
        }
    }

    private preloadProjectClips(tracks: Track[]) {
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            for (let j = 0; j < track.clips.length; j++) {
                const clip: any = track.clips[j];
                if (clip.audioUrl) this.preloadAudioClip(clip.audioUrl);
            }
        }
    }

    private cacheInstruments(tracks: Track[]) {
        this.instrumentCache.clear();
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            if (t.instrument) this.instrumentCache.set(t.id, t.instrument);
        }
    }

    public async stop() {
        // Clear interval fallback
        if (this.timerID && typeof this.timerID !== 'number') {
            clearInterval(this.timerID);
        }
        this.timerID = null;

        // Stop Worklet
        if (this.workletNode) {
            try {
                this.workletNode.port.postMessage({ type: 'stop' });
                // We don't disconnect/close to allow restart reuse logic if we wanted, 
                // but for now let's keep it simple
            } catch (e) { console.error(e); }
        }

        if (this.storeUnsubscribe) {
            this.storeUnsubscribe();
            this.storeUnsubscribe = null;
        }

        this.scheduledNotes.clear();

        // Release engines if needed, or just stop sounds
        try {
            this.engines?.toneSynthEngine.stopAll();
            this.engines?.toneDrumMachine.stopAll();
            this.engines?.toneBassEngine.stopAll();
            this.engines?.toneKeysEngine.stopAll();
            this.engines?.toneVocalEngine.stopAll();
            this.engines?.toneFXEngine.stopAll?.();
        } catch (e) { console.error('Engine stopAll error', e); }

        // Stop all active sample sources (Issue #18: stoppable samples)
        this.activeSampleSources.forEach((sources) => {
            sources.forEach(source => {
                try { source.stop(); } catch { /* already stopped */ }
            });
        });
        this.activeSampleSources.clear();

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // Reset diagnostic state
        // this.diagnostics... (removed)
    }

    public isRunning(): boolean {
        return this.timerID !== null;
    }

    // Scoped / Advance / Loop logic
    private scopedNotes: MidiNote[] | null = null;
    private scopedTrackId: number | null = null;
    private scopedInstrument: string | null = null;
    private scopedTrackType: 'midi' | 'drums' | 'audio' | undefined = undefined;
    private scopedLoopStart = 0;
    private scopedLoopEnd = 16;

    public setScopedMode(notes: MidiNote[], trackId: number, instrument: string, type: 'midi' | 'drums' | 'audio', loopStart = 0, loopEnd = 16) {
        this.scopedNotes = notes;
        this.scopedTrackId = trackId;
        this.scopedInstrument = instrument;
        this.scopedTrackType = type;
        this.scopedLoopStart = loopStart;
        this.scopedLoopEnd = loopEnd;
    }

    public clearScopedMode() {
        this.scopedNotes = null;
        this.scopedTrackId = null;
        this.scopedInstrument = null;
        this.scopedTrackType = undefined;
        this.scopedLoopStart = 0;
        this.scopedLoopEnd = 16;
    }

    // Main thread fallback scheduler


    private scheduleNotesAtTime(beatNumber: number, time: number) {
        if (this.scopedNotes && this.scopedTrackId !== null) {
            const beatWithinClip = beatNumber * 0.25;
            for (let i = 0; i < this.scopedNotes.length; i++) {
                const note = this.scopedNotes[i];
                if (Math.abs(note.start - beatWithinClip) < 0.01) {
                    const key = `${beatNumber}:${this.scopedTrackId}:${note.id}`;
                    if (!this.scheduledNotes.has(key)) {
                        this.scheduledNotes.add(key);
                        const trackFake = { id: this.scopedTrackId, type: this.scopedTrackType, instrument: this.scopedInstrument } as any;
                        const durationSec = note.duration * (60 / (useProjectStore.getState().activeProject?.tempo || 120));
                        this.triggerNote(trackFake, note, this.scopedInstrument || undefined, time, durationSec);
                    }
                }
            }
            return;
        }

        const tracks = this.tracksCache;
        const bpm = this.tempoCache;
        const secondsPerBeat = 60 / bpm;
        const stepSize = 0.25; // 16th
        const currentBeat = beatNumber * stepSize;
        const tickIndex = beatNumber;

        for (let tI = 0; tI < tracks.length; tI++) {
            const track = tracks[tI];
            if (track.muted) continue;
            const cachedInstrument = this.instrumentCache.get(track.id) || track.instrument;

            for (let cI = 0; cI < track.clips.length; cI++) {
                const clip: Clip = track.clips[cI];
                const clipStartBeat = clip.start || 0;

                if (track.type === 'audio' || (clip as any).audioUrl) {
                    const audioUrl = (clip as any).audioUrl;
                    if (!audioUrl) continue;
                    if (Math.abs(clipStartBeat - currentBeat) < stepSize) {
                        const clipKey = `${tickIndex}:audio:${track.id}:${clipStartBeat}`;
                        if (!this.scheduledNotes.has(clipKey)) {
                            this.scheduledNotes.add(clipKey);
                            const preciseTime = time + (clipStartBeat - currentBeat) * secondsPerBeat;
                            this.triggerAudio(audioUrl, preciseTime, track.volume, track.pan, (clip as any).pitch || 0, track.id);
                        }
                    }
                    continue;
                }

                if (!clip.notes) continue;
                for (let nI = 0; nI < clip.notes.length; nI++) {
                    const note = clip.notes[nI] as MidiNote;
                    const absNoteStart = clipStartBeat + note.start;
                    const noteDiff = absNoteStart - currentBeat;
                    if (noteDiff >= 0 && noteDiff < stepSize) {
                        const key = `${tickIndex}:${track.id}:${note.id}`;
                        if (!this.scheduledNotes.has(key)) {
                            this.scheduledNotes.add(key);
                            const noteTimeOffset = noteDiff * secondsPerBeat;
                            const preciseTime = time + noteTimeOffset;
                            const noteDurationSec = note.duration * secondsPerBeat;
                            this.triggerNote(track, note, cachedInstrument, preciseTime, noteDurationSec);
                        }
                    }
                }
            }
        }

        if (this.scheduledNotes.size > 20000) this.scheduledNotes.clear();
    }

    /**
     * Get or create pooled audio nodes for a track (Issue #11: reduces GC pressure)
     */
    private getPooledAudioNodes(trackId: number): { gain: GainNode; panner: StereoPannerNode } {
        if (this.trackAudioNodes.has(trackId)) {
            return this.trackAudioNodes.get(trackId)!;
        }
        const ctx = audioEngine.getContext();
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();

        // Connect pooled nodes to track channel (Issue #13: proper mixer routing)
        gain.connect(panner);
        try {
            const trackChannel = audioEngine.getTrackChannel(trackId);
            panner.connect(trackChannel.input);
        } catch {
            // Fallback to destination if track channel doesn't exist
            panner.connect(ctx.destination);
        }

        const nodes = { gain, panner };
        this.trackAudioNodes.set(trackId, nodes);
        return nodes;
    }

    /**
     * Trigger audio sample playback with proper routing and tracking
     * Fixes: #11 (GC pressure), #13 (mixer bypass), #18 (unstoppable samples)
     */
    private triggerAudio(url: string, time: number, volume: number, pan: number, semitones = 0, trackId = 0) {
        if (!this.audioBufferCache.has(url)) {
            this.preloadAudioClip(url);
            console.warn('Audio clip not buffered, skipping:', url);
            return;
        }

        const buffer = this.audioBufferCache.get(url)!;
        const ctx = audioEngine.getContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        if (semitones !== 0) {
            const detune = semitones * 100;
            try { source.detune.value = detune; } catch { /* detune not supported */ }
        }

        // Use pooled nodes for this track (reduces GC)
        const { gain, panner } = this.getPooledAudioNodes(trackId);

        // Update volume and pan for this sample
        gain.gain.setValueAtTime(typeof volume === 'number' ? volume : 1, time);
        panner.pan.setValueAtTime(typeof pan === 'number' ? pan / 100 : 0, time);

        // Connect source to pooled gain node
        source.connect(gain);
        source.start(time);

        // Track active source for stopping (Issue #18)
        if (!this.activeSampleSources.has(trackId)) {
            this.activeSampleSources.set(trackId, []);
        }
        this.activeSampleSources.get(trackId)!.push(source);

        // Clean up reference when source ends naturally
        source.onended = () => {
            const sources = this.activeSampleSources.get(trackId);
            if (sources) {
                const idx = sources.indexOf(source);
                if (idx > -1) sources.splice(idx, 1);
            }
        };
    }

    private triggerNote(track: Track, note: MidiNote, instrument: string | undefined, time: number, durationSec: number) {
        try {
            if (track.type === 'drums') {
                void this.engines?.toneDrumMachine.playNote(track.id, note.pitch, note.velocity, time);
            } else if (track.type === 'midi' || !track.type) {
                const inst = instrument || 'Super Saw';
                const engine = getEngineForInstrument(inst);

                switch (engine) {
                    case 'bass':
                        void this.engines?.toneBassEngine.playNote(track.id, note.pitch, durationSec, note.velocity, inst, time);
                        break;
                    case 'keys':
                        void this.engines?.toneKeysEngine.playNote(track.id, note.pitch, durationSec, note.velocity, inst, time);
                        break;
                    case 'vocal':
                        void this.engines?.toneVocalEngine.playNote(track.id, note.pitch, durationSec, note.velocity, inst, time);
                        break;
                    case 'fx':
                        void this.engines?.toneFXEngine.playFX(track.id, inst, note.velocity, durationSec);
                        break;
                    case 'synth':
                    default:
                        void this.engines?.toneSynthEngine.playNote(track.id, inst, note.pitch, durationSec, note.velocity, time);
                        break;
                }
            }
        } catch (e) {
            console.error('Error triggering note', e);
        }
    }



    private visualLoop() {
        if (!this.timerID) return;

        const now = audioEngine.getNow();
        const songTime = now - this.startTime;

        const { activeProject } = useProjectStore.getState();
        const bpm = activeProject?.tempo || 120;
        const currentBeat = (songTime * bpm) / 60;

        updatePlaybackTime(songTime, currentBeat);

        this.onProgressCallbacks.forEach(cb => cb(songTime, this.current16thNote));

        this.rafId = requestAnimationFrame(() => this.visualLoop());
    }

    public subscribe(callback: (time: number, step: number) => void) {
        this.onProgressCallbacks.add(callback);
        return () => { this.onProgressCallbacks.delete(callback); };
    }

    public setTime(timeInSeconds: number) {
        const { activeProject } = useProjectStore.getState();
        const tempo = activeProject?.tempo || 120;
        const secondsPerBeat = 60.0 / tempo;
        const secondsPer16th = 0.25 * secondsPerBeat;

        this.current16thNote = Math.floor(timeInSeconds / secondsPer16th);
        this.startOffset = timeInSeconds;

        if (this.isRunning()) {
            this.startTime = audioEngine.getNow() - this.startOffset;
            this.nextNoteTime = audioEngine.getNow() + 0.05;

            // Sync worklet if active
            if (this.workletNode) {
                this.workletNode.port.postMessage({ type: 'setTick', tick: this.current16thNote });
            }
        }

        const currentBeat = (timeInSeconds * tempo) / 60;
        updatePlaybackTime(timeInSeconds, currentBeat);

        this.scheduledNotes.clear();
    }

    public updateInstrumentCache(trackId: number, instrument: string) {
        this.instrumentCache.set(trackId, instrument);
    }

    private setTempo(tempo: number) {
        this.tempoCache = tempo;
        if (this.workletNode) {
            this.workletNode.port.postMessage({ type: 'setTempo', tempo });
        }
    }

    public setLookahead(lookaheadSeconds: number) {
        // Not implemented in simplified worklet yet, can add if needed
    }

    public setNotifyThreshold(threshold: number) {
        // Not needed for message-based
    }

    public setPollInterval(ms: number) {
        this.pollIntervalMs = Math.max(1, ms || 6);
    }

    public getDiagnostics() {
        // Calculate average latency
        const avgLatencyMs = this.diagnostics.latencySamples.length > 0
            ? this.diagnostics.latencySum / this.diagnostics.latencySamples.length
            : 0;

        // Calculate 95th percentile latency
        let p95LatencyMs = 0;
        if (this.diagnostics.latencySamples.length > 0) {
            const sorted = [...this.diagnostics.latencySamples].sort((a, b) => a - b);
            const index = Math.floor(sorted.length * 0.95);
            p95LatencyMs = sorted[index] || 0;
        }

        // Calculate average jitter
        const avgJitterMs = this.diagnostics.jitterSamples.length > 0
            ? this.diagnostics.jitterSamples.reduce((sum, val) => sum + val, 0) / this.diagnostics.jitterSamples.length
            : 0;

        // Calculate max jitter
        const maxJitterMs = this.diagnostics.jitterSamples.length > 0
            ? Math.max(...this.diagnostics.jitterSamples)
            : 0;

        return {
            // Legacy fields for backward compatibility
            sabUsed: false,
            head: 0,
            tail: 0,
            unread: 0,
            avgLatencyMs,
            samples: this.diagnostics.latencySamples.length,

            // New comprehensive diagnostics
            usingWorklet: this.diagnostics.usingWorklet,
            totalTicks: this.diagnostics.totalTicks,
            missedTicks: this.diagnostics.missedTicks,
            missedTickPercentage: this.diagnostics.totalTicks > 0 
                ? (this.diagnostics.missedTicks / this.diagnostics.totalTicks) * 100 
                : 0,
            p95LatencyMs,
            avgJitterMs,
            maxJitterMs,
            latencySamples: [...this.diagnostics.latencySamples], // Copy for UI visualization
            jitterSamples: [...this.diagnostics.jitterSamples], // Copy for UI visualization
            samplesScheduled: this.diagnostics.samplesScheduled,
            samplesDropped: this.diagnostics.samplesDropped,
            isRunning: this.isRunning(),
            currentTempo: this.tempoCache,
            audioContextState: audioEngine.getState(),
        };
    }
}

export const audioScheduler = AudioScheduler.getInstance();
