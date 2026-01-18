import { audioEngine } from './audioEngine';
import { SYNTH_PRESETS, SynthPreset, OscillatorType } from './presets/synthPresets';

// Re-export types for backward compatibility
export type { OscillatorType, SynthPreset };
export { SYNTH_PRESETS };

interface Voice {
    id: number;
    oscillators: OscillatorNode[];
    gains: GainNode[];
    filter: BiquadFilterNode;
    envelope: GainNode;
    stopTime: number;
    isReleasing: boolean;
}

export class SynthEngine {
    private context: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private limiter: DynamicsCompressorNode | null = null;
    private reverb: ConvolverNode | null = null;
    private reverbGain: GainNode | null = null;
    private dryGain: GainNode | null = null;
    private activeVoices: Map<number, Voice> = new Map();
    private currentPreset: SynthPreset = SYNTH_PRESETS[0];
    private maxPolyphony = 16;
    private nextVoiceId = 1;

    async initialize() {
        if (this.context) return;

        await audioEngine.initialize();
        this.context = audioEngine.getContext();

        // Limiter to prevent clipping/glitches
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 6;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.001;
        this.limiter.release.value = 0.1;

        // Master output chain
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0.35;

        // Dry/wet for reverb
        this.dryGain = this.context.createGain();
        this.reverbGain = this.context.createGain();
        this.dryGain.gain.value = 0.75;
        this.reverbGain.gain.value = 0.25;

        // Create reverb impulse
        await this.createReverb();

        // Signal chain: masterGain -> limiter -> dry/wet -> native AudioContext destination
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.dryGain);
        this.dryGain.connect(this.context.destination);

        if (this.reverb) {
            this.limiter.connect(this.reverb);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.context.destination);
        }
    }

    private async createReverb() {
        if (!this.context) return;

        const length = this.context.sampleRate * 1.5;
        const impulse = this.context.createBuffer(2, length, this.context.sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }

        this.reverb = this.context.createConvolver();
        this.reverb.buffer = impulse;
    }

    setPreset(preset: SynthPreset) {
        this.currentPreset = preset;
    }

    setPresetByName(name: string) {
        const preset = SYNTH_PRESETS.find(p => p.name === name);
        if (preset) {
            this.currentPreset = preset;
            console.log('[SynthEngine] Preset set:', name);
        } else {
            console.warn('[SynthEngine] Preset not found:', name, '- using default');
        }
    }

    // Clean up old voices to prevent polyphony issues
    private cleanupVoices() {
        if (this.activeVoices.size >= this.maxPolyphony) {
            // Find and remove the oldest releasing voice
            let oldestKey: number | null = null;
            let oldestTime = Infinity;

            for (const [key, voice] of this.activeVoices) {
                if (voice.isReleasing && voice.stopTime < oldestTime) {
                    oldestTime = voice.stopTime;
                    oldestKey = key;
                }
            }

            if (oldestKey !== null) {
                const voice = this.activeVoices.get(oldestKey);
                if (voice) {
                    try {
                        voice.oscillators.forEach(osc => {
                            try { osc.stop(); } catch { }
                        });
                    } catch { }
                    this.activeVoices.delete(oldestKey);
                }
            }
        }
    }

    noteOn(midiNote: number, velocity: number = 0.8, time?: number): number {
        if (!this.context || !this.masterGain) return 0;

        // Ensure time is valid
        const startTime = time || this.context.currentTime;

        // Stop any existing note on this pitch first (with a tiny overlap for legato if immediate)
        this.noteOff(midiNote, undefined, startTime);

        // Clean up old voices
        this.cleanupVoices();

        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const p = this.currentPreset;
        const voiceId = this.nextVoiceId++;

        // Clamp velocity
        velocity = Math.max(0.1, Math.min(1, velocity));

        const oscillators: OscillatorNode[] = [];
        const gains: GainNode[] = [];

        for (const oscConfig of p.oscillators) {
            const osc = this.context.createOscillator();
            osc.type = oscConfig.type;
            osc.frequency.value = freq;
            osc.detune.value = oscConfig.detune;

            const oscGain = this.context.createGain();
            oscGain.gain.value = oscConfig.gain * 0.8; // Reduce overall gain

            osc.connect(oscGain);
            oscillators.push(osc);
            gains.push(oscGain);
        }

        // Create filter
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = p.filterFreq;
        filter.Q.value = Math.min(p.filterQ, 10); // Clamp Q to prevent resonance issues

        // Filter envelope - smooth transitions
        const filterStart = Math.max(20, p.filterFreq * 0.25);
        filter.frequency.setValueAtTime(filterStart, startTime);
        filter.frequency.exponentialRampToValueAtTime(p.filterFreq, startTime + p.attack + 0.01);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, p.filterFreq * 0.6), startTime + p.attack + p.decay);

        // Envelope with smooth transitions
        const envelope = this.context.createGain();
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(velocity * 0.8, startTime + Math.max(0.003, p.attack));
        envelope.gain.linearRampToValueAtTime(velocity * p.sustain * 0.8 + 0.001, startTime + p.attack + p.decay);

        // Connect all oscillator gains to filter
        for (const gain of gains) {
            gain.connect(filter);
        }
        filter.connect(envelope);

        // Set reverb mix
        if (this.reverbGain && this.dryGain) {
            this.reverbGain.gain.setValueAtTime(p.reverbMix * 0.4, startTime);
            this.dryGain.gain.setValueAtTime(1 - (p.reverbMix * 0.25), startTime);
        }

        envelope.connect(this.masterGain);

        // Start all oscillators
        for (const osc of oscillators) {
            osc.start(startTime);
        }

        this.activeVoices.set(midiNote, {
            id: voiceId,
            oscillators,
            gains,
            filter,
            envelope,
            stopTime: 0,
            isReleasing: false
        });

        return voiceId;
    }

    noteOff(midiNote: number, specificVoiceId?: number, time?: number) {
        const voice = this.activeVoices.get(midiNote);
        if (!voice || !this.context) return;

        // If specificVoiceId is provided, ONLY stop if it matches the current voice ID.
        if (specificVoiceId !== undefined && voice.id !== specificVoiceId) return;

        // Already releasing, skip
        if (voice.isReleasing) return;

        const stopTime = time || this.context.currentTime;
        const p = this.currentPreset;
        const releaseTime = Math.min(p.release, 2); // Cap release time

        voice.isReleasing = true;
        voice.stopTime = stopTime;

        // Smooth release
        voice.envelope.gain.cancelScheduledValues(stopTime);
        voice.envelope.gain.setTargetAtTime(0, stopTime, releaseTime / 4);

        const oscStopTime = stopTime + releaseTime + 0.1;

        for (const osc of voice.oscillators) {
            try {
                osc.stop(oscStopTime);
            } catch {
                // Oscillator may already be stopped
            }
        }

        // Clean up after release
        setTimeout(() => {
            const currentVoice = this.activeVoices.get(midiNote);
            if (currentVoice && currentVoice.id === voice.id) {
                this.activeVoices.delete(midiNote);
            }
        }, (stopTime - this.context.currentTime + releaseTime + 0.2) * 1000);
    }

    playNote(midiNote: number, duration: number = 0.5, velocity: number = 0.8, time?: number) {
        // Don't allow extremely short or long durations
        duration = Math.max(0.05, Math.min(duration, 5));

        const startTime = time || (this.context?.currentTime || 0);

        const voiceId = this.noteOn(midiNote, velocity, startTime);
        this.noteOff(midiNote, voiceId, startTime + duration);
    }

    playChord(notes: number[], duration: number = 0.5, velocity: number = 0.7) {
        // Stagger notes slightly for more natural sound
        notes.forEach((note, i) => {
            setTimeout(() => {
                const voiceId = this.noteOn(note, velocity - (i * 0.03));
                setTimeout(() => this.noteOff(note, voiceId), duration * 1000);
            }, i * 15);
        });
    }

    // Stop all notes immediately
    panic() {
        for (const [_key, voice] of this.activeVoices) {
            try {
                voice.oscillators.forEach(osc => {
                    try { osc.stop(); } catch { }
                });
            } catch { }
        }
        this.activeVoices.clear();
    }
}

export const synthEngine = new SynthEngine();
