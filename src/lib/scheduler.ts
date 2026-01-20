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
    
    // Configuration constants
    private static readonly RETRY_DELAY_MS = 500;
    private static readonly MAX_RETRIES = 2;
    private static readonly TOTAL_ATTEMPTS = AudioScheduler.MAX_RETRIES + 1;

    // Cache for audio buffers and pending loads
    private audioBufferCache = new Map<string, AudioBuffer>();
    private pendingLoads = new Map<string, Promise<void>>();
    
    // Queue for playback requests when buffer is not ready
    private pendingPlaybackRequests = new Map<string, Array<{
        time: number;
        volume: number;
        pan: number;
        semitones: number;
        trackId: number;
    }>>();

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

    private constructor() { }

    public static getInstance(): AudioScheduler {
        if (!AudioScheduler.instance) AudioScheduler.instance = new AudioScheduler();
        return AudioScheduler.instance;
    }

    public async start() {
        if (this.timerID) return; // Legacy guard
        if (this.workletNode && this.isRunning()) return; // Already running with worklet

        try {
            await audioEngine.initialize();
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

        // Await all clips to be preloaded before starting playback
        await this.preloadProjectClips(this.tracksCache);

        this.storeUnsubscribe = useProjectStore.subscribe((state) => {
            if (this.tracksCache !== state.tracks) {
                this.tracksCache = state.tracks;
                this.cacheInstruments(state.tracks);
                // Preload new clips asynchronously (don't block)
                void this.preloadProjectClips(state.tracks);
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

        // 1. REUSE OR CREATE WORKLETS
        let workletReady = false;

        // If we already have a worklet, just restart it
        if (this.workletNode) {
            console.log("AudioScheduler: Restarting existing Worklet");
            this.workletNode.port.postMessage({ type: 'start' });
            // Sync tick to current
            this.workletNode.port.postMessage({ type: 'setTick', tick: this.current16thNote });
            workletReady = true;
        }
        // Otherwise create new
        else {
            try {
                const result = await audioEngine.registerSchedulerWorklet();
                if (result && result.node) {
                    this.workletNode = result.node;

                    this.workletNode.port.onmessage = (ev) => this.handleWorkletMessage(ev.data);

                    this.workletNode.port.postMessage({
                        type: 'start',
                        interval: SCHEDULER_INTERVAL / 1000
                    });

                    console.log("AudioScheduler: Using AudioWorklet Metronome for timing");
                    workletReady = true;
                }
            } catch (e) {
                console.warn('Worklet registration failed, falling back to interval', e);
            }
        }

        // 2. Fallback to setInterval
        if (!workletReady) {
            console.log('AudioScheduler: Starting Interval Scheduler (Fallback)');
            this.timerID = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);
        }

        // Ensure visual loop is also running
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(() => this.visualLoop());
        }
    }

    private scheduler() {
        if (!this.isRunning()) return;

        // Debug log to confirm scheduler heartbeat
        // Debug log to confirm scheduler heartbeat
        if (Math.random() < 0.01) console.log("Scheduler heartbeat", this.nextNoteTime, audioEngine.getNow(), this.isRunning());

        // While there are notes that will need to play before the next interval
        // Lookahead scheduler loop
        try {
            const now = audioEngine.getNow();
            const lookAheadTime = now + LOOKAHEAD_TIME;

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

    // Worklet message handler refactored to drive the loop
    private handleWorkletMessage(msg: any) {
        if (msg.type === 'tick') {
            // Log sample of ticks to verify flow
            if (Math.random() < 0.005) {
                console.log("[AudioScheduler] Received tick from Worklet", msg.time);
            }
            // Worklet says "wake up", so we run the scheduler
            this.scheduler();
        }
    }

    /**
     * Preload an audio clip with retry logic
     * Private internal method - use preloadAudioClip() for public API
     */
    private async preloadAudioClipInternal(url: string, retryCount = 0): Promise<void> {
        // Return existing buffer immediately if cached
        if (this.audioBufferCache.has(url)) return;
        
        // Return existing pending load to avoid duplicate fetch/decode
        if (this.pendingLoads.has(url)) {
            return this.pendingLoads.get(url)!;
        }

        const loadPromise = (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioEngine.getContext().decodeAudioData(arrayBuffer);
                this.audioBufferCache.set(url, audioBuffer);
                
                // Flush any pending playback requests for this clip
                this.flushPendingPlaybackRequests(url);
            } catch (e) {
                console.error(`Failed to load audio clip (attempt ${retryCount + 1}/${AudioScheduler.TOTAL_ATTEMPTS}):`, url, e);
                
                // Retry up to MAX_RETRIES times
                if (retryCount < AudioScheduler.MAX_RETRIES) {
                    console.log(`Retrying decode for ${url}...`);
                    this.pendingLoads.delete(url);
                    // Wait a bit before retrying with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, AudioScheduler.RETRY_DELAY_MS * (retryCount + 1)));
                    return this.preloadAudioClipInternal(url, retryCount + 1);
                } else {
                    // Permanently failed after retries - log but don't throw
                    console.error(`Permanently failed to load audio clip after ${AudioScheduler.TOTAL_ATTEMPTS} attempts:`, url);
                    // Clear any pending playback requests since we can't fulfill them
                    this.pendingPlaybackRequests.delete(url);
                }
            } finally {
                this.pendingLoads.delete(url);
            }
        })();
        
        this.pendingLoads.set(url, loadPromise);
        return loadPromise;
    }
    
    /**
     * Public API to preload an audio clip
     */
    public async preloadAudioClip(url: string): Promise<void> {
        return this.preloadAudioClipInternal(url, 0);
    }

    private async preloadProjectClips(tracks: Track[]): Promise<void> {
        const clipUrls: string[] = [];
        
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            for (let j = 0; j < track.clips.length; j++) {
                const clip: any = track.clips[j];
                if (clip.audioUrl && !this.audioBufferCache.has(clip.audioUrl)) {
                    clipUrls.push(clip.audioUrl);
                }
            }
        }
        
        if (clipUrls.length === 0) return Promise.resolve();
        
        console.log(`Preloading ${clipUrls.length} audio clips...`);
        
        // Load all clips in parallel
        const loadPromises = clipUrls.map(url => 
            this.preloadAudioClip(url).catch(err => {
                console.error(`Failed to preload clip ${url}:`, err);
                // Don't let one failure stop the rest
                return Promise.resolve();
            })
        );
        
        await Promise.all(loadPromises);
        console.log(`Preloaded ${clipUrls.length} audio clips successfully`);
    }
    
    /**
     * Flush pending playback requests for a URL once it's loaded
     */
    private flushPendingPlaybackRequests(url: string) {
        const pending = this.pendingPlaybackRequests.get(url);
        if (!pending || pending.length === 0) return;
        
        console.log(`Flushing ${pending.length} pending playback requests for ${url}`);
        
        for (const req of pending) {
            // Check if scheduled time has passed
            const now = audioEngine.getNow();
            if (req.time < now) {
                // Time has passed, schedule at next available grid slot
                const bpm = this.tempoCache;
                const secondsPerBeat = 60.0 / bpm;
                const secondsPer16th = 0.25 * secondsPerBeat;
                const nextGridTime = now + secondsPer16th;
                console.log(`Rescheduling delayed audio from ${req.time} to ${nextGridTime}`);
                this.triggerAudio(url, nextGridTime, req.volume, req.pan, req.semitones, req.trackId);
            } else {
                // Still in future, trigger normally
                this.triggerAudio(url, req.time, req.volume, req.pan, req.semitones, req.trackId);
            }
        }
        
        this.pendingPlaybackRequests.delete(url);
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

        // Stop Worklet (Pause it, don't disconnect - we reuse it)
        if (this.workletNode) {
            try {
                this.workletNode.port.postMessage({ type: 'stop' });
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
        // We are running if we have a workaround timer OR (Worklet Node exists AND internal engines are running)
        // Note: AudioContext state check is good but sometimes context runs while we are paused.
        // We really need an internal flag. For now, rely on AudioContext state + Node existence as proxy,
        // but 'stop' sets rafId to null. So rafId is a good proxy for "are we officially playing".
        return this.rafId !== null;
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

                    // Log very close matches to debug if we are missing them
                    if (Math.abs(noteDiff) < 0.25) {
                        // console.log(`[Scheduler] Checking note: Track ${track.id} Pitch ${note.pitch} Start ${absNoteStart} Current ${currentBeat} Diff ${noteDiff}`);
                    }

                    if (noteDiff >= 0 && noteDiff < stepSize) {
                        const key = `${tickIndex}:${track.id}:${note.id}`;
                        if (!this.scheduledNotes.has(key)) {
                            console.log(`[AudioScheduler] Scheduled Note! Track ${track.id} Pitch ${note.pitch} @ ${time.toFixed(3)}s`);
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
     * Enhanced: Queue playback if buffer not ready, never skip
     */
    private triggerAudio(url: string, time: number, volume: number, pan: number, semitones = 0, trackId = 0) {
        if (!this.audioBufferCache.has(url)) {
            // Buffer not ready - enqueue the playback request
            if (!this.pendingPlaybackRequests.has(url)) {
                this.pendingPlaybackRequests.set(url, []);
            }
            this.pendingPlaybackRequests.get(url)!.push({
                time,
                volume,
                pan,
                semitones,
                trackId
            });
            
            console.log(`Audio clip not buffered, queuing playback request: ${url} at time ${time}`);
            
            // Start loading the clip if not already loading
            void this.preloadAudioClip(url).catch(err => {
                console.error(`Failed to load audio clip for queued playback:`, url, err);
            });
            
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
        console.log(`[AudioScheduler] Triggering Note: Track=${track.id} Pitch=${note.pitch} Time=${time} Duration=${durationSec}`);
        try {
            if (track.type === 'drums') {
                void this.engines?.toneDrumMachine.playNote(track.id, note.pitch, note.velocity, time);
            } else if (track.type === 'midi' || !track.type) {
                // FIX: Default to 'Grand Piano' to match PianoRoll preview default (Issue: "Random sounds")
                const inst = instrument || 'Grand Piano';
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
        if (!this.isRunning()) return;

        const now = audioEngine.getNow();
        const songTime = now - this.startTime;

        const { activeProject } = useProjectStore.getState();
        const bpm = activeProject?.tempo || 120;
        const currentBeat = (songTime * bpm) / 60;

        updatePlaybackTime(songTime, currentBeat);

        // FIX: Pass continuous (fractional) 16th notes instead of quantized 'current16thNote'
        // This ensures subscribers like MasterPlayhead animate smoothly at 60fps
        // instead of stepping every 125ms (8fps)
        this.onProgressCallbacks.forEach(cb => cb(songTime, currentBeat * 4));

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
        updatePlaybackTime(timeInSeconds, currentBeat); // Updates hook state (low freq)

        // FIX: Force visual update for subscribers (MasterPlayhead) even if stopped
        // This ensures the playhead snaps immediately when seek/stop occurs
        this.onProgressCallbacks.forEach(cb => cb(timeInSeconds, currentBeat * 4));

        this.scheduledNotes.clear();
    }

    public updateInstrumentCache(trackId: number, instrument: string) {
        this.instrumentCache.set(trackId, instrument);
    }

    public setTempo(tempo: number) {
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
        return {
            sabUsed: false,
            // Returning dummy stats to keep UI happy if it checks these
            head: 0,
            tail: 0,
            unread: 0,
            avgLatencyMs: 0,
            samples: 0
        };
    }
    
    /**
     * Get loading status for clips
     */
    public getLoadingStatus() {
        return {
            pendingLoads: this.pendingLoads.size,
            cachedClips: this.audioBufferCache.size,
            pendingPlaybacks: Array.from(this.pendingPlaybackRequests.values()).reduce((sum, arr) => sum + arr.length, 0),
            isLoading: this.pendingLoads.size > 0
        };
    }
}

export const audioScheduler = AudioScheduler.getInstance();
