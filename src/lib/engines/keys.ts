import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';
import { globalReverbs } from './globalReverb'; // Import global reverbs
import type { KeysEngineInterface } from '../engineTypes';
import { PREVIEW_TRACK_ID } from '../constants';

/**
 * ToneKeysEngine - Premium keyboard synthesis with distinct presets
 * Each preset creates a unique sound character using different synthesis techniques
 */
class ToneKeysEngine implements KeysEngineInterface {
    private trackSynths: Map<string, any> = new Map();
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private lastPreviewNote: { key: string, note: number | string } | null = null;

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;
        this.initializationPromise = (async () => {
            await audioEngine.initialize();
            await ensureTone();
            await globalReverbs.initialize(); // Ensure globals are ready
            this.initialized = true;
        })();
        return this.initializationPromise;
    }

    // Helper to add reverb send
    private attachReverb(source: any, type: 'short' | 'medium' | 'long', amount: number, key: string) {
        const rev = globalReverbs.getReverb(type);
        if (!rev) return;
        ensureTone().then((ToneLib: any) => {
            const g = new ToneLib.Gain(amount);
            source.connect(g);
            g.connect(rev);
            // Track for disposal if needed (simplified here)
        });
    }

    private getDest(trackId: number) {
        return audioEngine.getTrackChannel(trackId).input;
    }

    /**
     * Create preset-specific synthesizer with proper sound design
     */
    private async getSynth(trackId: number, type: string) {
        const key = `${trackId}-${type}`;
        if (this.trackSynths.has(key)) return this.trackSynths.get(key);

        if (!this.initialized) await this.initialize();
        const ToneLib = await ensureTone() as ToneLibType;
        const dest = this.getDest(trackId);

        let synth: any;
        let effects: any[] = [];

        switch (type) {
            case 'Electric Piano':
            case 'E-Piano': {
                // FM synthesis for that classic DX7 Rhodes-style sound
                const tremolo = new ToneLib.Tremolo({ frequency: 3.5, depth: 0.3 }).start();
                const chorus = new ToneLib.Chorus({ frequency: 1.2, delayTime: 3.5, depth: 0.4 }).start();
                const reverb = new ToneLib.Reverb({ decay: 1.5, wet: 0.25 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 3.0,
                    modulationIndex: 14,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.2, sustain: 0.3, release: 0.8 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.5 }
                });

                synth.connect(tremolo);
                tremolo.connect(chorus);
                // chorus.connect(reverb); // Removed local reverb
                chorus.connect(dest);     // Connect directly
                this.attachReverb(chorus, 'medium', 0.25, key);

                effects = [tremolo, chorus];
                break;
            }

            case 'Rhodes':
            case 'Fender Rhodes': {
                // Classic Rhodes with characteristic bark and bell tones
                const tremolo = new ToneLib.Tremolo({ frequency: 4.2, depth: 0.25 }).start();
                const phaser = new ToneLib.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350 });
                const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.2 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 2,
                    modulationIndex: 8,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.5, sustain: 0.25, release: 1 },
                    modulation: { type: 'triangle' },
                    modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.8 }
                });

                synth.connect(tremolo);
                tremolo.connect(phaser);
                // phaser.connect(reverb);
                phaser.connect(dest);
                this.attachReverb(phaser, 'medium', 0.2, key);

                effects = [tremolo, phaser];
                break;
            }

            case 'Wurlitzer':
            case 'Wurli': {
                // Brighter, more aggressive FM - the "funky" electric piano
                const distortion = new ToneLib.Distortion({ distortion: 0.15 });
                const tremolo = new ToneLib.Tremolo({ frequency: 5.5, depth: 0.4 }).start();
                const reverb = new ToneLib.Reverb({ decay: 1, wet: 0.15 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 4,
                    modulationIndex: 20,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.8, sustain: 0.2, release: 0.5 },
                    modulation: { type: 'sawtooth' },
                    modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.3 }
                });

                synth.connect(distortion);
                distortion.connect(tremolo);
                // tremolo.connect(reverb);
                tremolo.connect(dest);
                this.attachReverb(tremolo, 'short', 0.15, key);

                effects = [distortion, tremolo];
                break;
            }

            case 'Clavinet':
            case 'Clav': {
                // Plucky, funky clavinet with resonant filter
                const autoFilter = new ToneLib.AutoFilter({ frequency: 2, baseFrequency: 800, octaves: 4 }).start();
                const distortion = new ToneLib.Distortion({ distortion: 0.25 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.15 }
                });

                // High resonance filter for that clav bite
                const filter = new ToneLib.Filter({ frequency: 2500, type: 'lowpass', Q: 8 });

                synth.connect(filter);
                filter.connect(autoFilter);
                autoFilter.connect(distortion);
                distortion.connect(dest);
                effects = [filter, autoFilter, distortion];
                break;
            }

            case 'Warm Keys': {
                // Soft, warm analog-style keys
                const chorus = new ToneLib.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.5 }).start();
                const reverb = new ToneLib.Reverb({ decay: 2.5, wet: 0.3 });
                const filter = new ToneLib.Filter({ frequency: 1800, type: 'lowpass', Q: 0.5 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.02, decay: 0.5, sustain: 0.5, release: 0.6 }
                });

                synth.connect(filter);
                filter.connect(chorus);
                // chorus.connect(reverb);
                chorus.connect(dest);
                this.attachReverb(chorus, 'long', 0.3, key);

                effects = [filter, chorus];
                break;
            }

            case 'Lofi Keys':
            case 'Lo-Fi Keys': {
                // Degraded, vintage sound with bitcrusher and wow/flutter
                const bitcrusher = new ToneLib.BitCrusher({ bits: 8 });
                const filter = new ToneLib.Filter({ frequency: 2200, type: 'lowpass', Q: 0.3 });
                const vibrato = new ToneLib.Vibrato({ frequency: 0.5, depth: 0.08 });
                const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.35 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.02, decay: 0.6, sustain: 0.35, release: 0.8 }
                });

                synth.connect(bitcrusher);
                bitcrusher.connect(filter);
                filter.connect(vibrato);
                // vibrato.connect(reverb);
                vibrato.connect(dest);
                this.attachReverb(vibrato, 'medium', 0.35, key);

                effects = [bitcrusher, filter, vibrato];
                break;
            }

            case 'Synth Organ':
            case 'Organ': {
                // Additive sine harmonics simulating drawbar organ
                const chorus = new ToneLib.Chorus({ frequency: 6, delayTime: 2, depth: 0.3 }).start();
                const distortion = new ToneLib.Distortion({ distortion: 0.08 });
                const reverb = new ToneLib.Reverb({ decay: 1.5, wet: 0.2 });

                // Use AMSynth for harmonic richness
                synth = new ToneLib.PolySynth(ToneLib.AMSynth, {
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.1 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 }
                });

                synth.connect(chorus);
                chorus.connect(distortion);
                // distortion.connect(reverb);
                distortion.connect(dest);
                this.attachReverb(distortion, 'medium', 0.2, key);

                effects = [chorus, distortion];
                break;
            }

            case 'Grand Piano':
            case 'Piano': {
                // Sampler-less piano approximation using FM
                // FIXED: Changed harmonicity from 2.5 to 1.0 to ensure integer harmonics (accurate scale)
                const reverb = new ToneLib.Reverb({ decay: 3, wet: 0.25 });
                const compressor = new ToneLib.Compressor({ threshold: -20, ratio: 3 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 1.0,
                    modulationIndex: 8,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 2, sustain: 0.1, release: 1.5 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 1 }
                });

                synth.connect(compressor);
                // compressor.connect(reverb);
                compressor.connect(dest);
                this.attachReverb(compressor, 'medium', 0.25, key);

                effects = [compressor];
                break;
            }

            case 'Harpsichord': {
                // Plucky, metallic harpsichord using FM synthesis
                const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.3 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 8,
                    modulationIndex: 30,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
                });

                // synth.connect(reverb);
                synth.connect(dest);
                this.attachReverb(synth, 'medium', 0.3, key);

                effects = [];
                break;
            }

            case 'Celesta': {
                // Bell-like orchestral celesta - slightly metallic
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.25, feedback: 0.15, wet: 0.12 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 5.0,
                    modulationIndex: 12,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 1.5 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.8 }
                });

                synth.connect(delay);
                delay.connect(dest);
                this.attachReverb(delay, 'long', 0.45, key);

                effects = [delay];
                break;
            }

            case 'Music Box': {
                // Delicate, twinkling music box - higher pitched, shorter decay
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.15, feedback: 0.3, wet: 0.2 });
                const filter = new ToneLib.Filter({ frequency: 6000, type: 'highpass' });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 8,
                    modulationIndex: 18,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.0 },
                    modulation: { type: 'triangle' },
                    modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.5 }
                });

                synth.connect(filter);
                filter.connect(delay);
                delay.connect(dest);
                this.attachReverb(delay, 'long', 0.55, key);

                effects = [filter, delay];
                break;
            }

            case 'Upright Piano': {
                // Warmer, woodier piano with less brightness than grand
                // FIXED: Changed from 2.2 (inharmonic) to 1.0 (harmonic)
                const compressor = new ToneLib.Compressor({ threshold: -18, ratio: 3 });
                const filter = new ToneLib.Filter({ frequency: 3000, type: 'lowpass' });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 1.0,
                    modulationIndex: 8,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.002, decay: 1.5, sustain: 0.15, release: 1.2 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.8 }
                });

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(dest);
                this.attachReverb(compressor, 'medium', 0.2, key);

                effects = [filter, compressor];
                break;
            }

            case 'Hammond B3': {
                // Classic Hammond organ with rotary speaker simulation
                const chorus = new ToneLib.Chorus({ frequency: 6, delayTime: 2.5, depth: 0.5 }).start();
                const tremolo = new ToneLib.Tremolo({ frequency: 6.5, depth: 0.4 }).start();
                const distortion = new ToneLib.Distortion({ distortion: 0.12 });

                // Hammond uses additive synthesis with drawbars - simulate with AMSynth
                synth = new ToneLib.PolySynth(ToneLib.AMSynth, {
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.005, decay: 0.05, sustain: 0.95, release: 0.1 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.1 }
                });

                synth.connect(distortion);
                distortion.connect(chorus);
                chorus.connect(tremolo);
                tremolo.connect(dest);
                this.attachReverb(tremolo, 'medium', 0.15, key);

                effects = [distortion, chorus, tremolo];
                break;
            }

            case 'Bells': {
                // Bright metallic bells
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.2, feedback: 0.25, wet: 0.2 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 7,
                    modulationIndex: 15,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.0 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 }
                });

                synth.connect(delay);
                delay.connect(dest);
                this.attachReverb(delay, 'long', 0.5, key);

                effects = [delay];
                break;
            }

            case 'Marimba': {
                // Wooden mallet percussion - warm, rounded attack
                const filter = new ToneLib.Filter({ frequency: 2000, type: 'lowpass', Q: 1 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 4,
                    modulationIndex: 4,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.6 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.3 }
                });

                synth.connect(filter);
                filter.connect(dest);
                this.attachReverb(filter, 'short', 0.2, key);

                effects = [filter];
                break;
            }

            case 'Vibraphone':
            case 'Vibes': {
                // Metal bars with motor-driven vibrato
                const tremolo = new ToneLib.Tremolo({ frequency: 5.5, depth: 0.3 }).start();
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.15, feedback: 0.2, wet: 0.15 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 6,
                    modulationIndex: 8,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 3, sustain: 0.1, release: 2 },
                    modulation: { type: 'triangle' },
                    modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0.2, release: 1 }
                });

                synth.connect(tremolo);
                tremolo.connect(delay);
                delay.connect(dest);
                this.attachReverb(delay, 'long', 0.4, key);

                effects = [tremolo, delay];
                break;
            }

            case 'Kalimba': {
                // African thumb piano - plucky, bright, metallic tines
                const filter = new ToneLib.Filter({ frequency: 4000, type: 'bandpass', Q: 2 });

                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 5,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.2 },
                    modulation: { type: 'triangle' },
                    modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 }
                });

                synth.connect(filter);
                filter.connect(dest);
                this.attachReverb(filter, 'medium', 0.35, key);

                effects = [filter];
                break;
            }

            default: {
                // Default fallback - nice general purpose keys sound
                const reverb = new ToneLib.Reverb({ decay: 1.5, wet: 0.2 });
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.5 }
                });
                // synth.connect(reverb);
                synth.connect(dest);
                this.attachReverb(synth, 'medium', 0.2, key);
                effects = [];
            }
        }

        // Store synth with its effects for proper cleanup
        const synthBundle = { synth, effects };
        this.trackSynths.set(key, synthBundle);
        return synthBundle;
    }

    async playNote(trackId: number, note: number | string, duration: string | number, velocity: number, preset: string, time?: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, preset);
        const ToneLib = await ensureTone() as ToneLibType;
        const n = typeof note === 'number' ? (ToneLib as any).Frequency(note, 'midi').toNote() : note;
        bundle.synth.triggerAttackRelease?.(n, duration, time ?? (ToneLib as any).now(), velocity);
    }

    /**
     * Preview a note - monophonic UI-only playback (stops previous preview note before starting new one)
     * 
     * Contract:
     * - Uses PREVIEW_TRACK_ID for isolated preview playback (not part of timeline data)
     * - Monophonic: Only one preview note plays at a time to avoid UI chaos
     * - Cleanup: Fully stops and releases previous preview note before starting new one
     * - Optimization: Synchronous cache lookup for instant playback on cached synths
     * - Isolation: Preview notes are separate from main track polyphonic playback
     * 
     * Note: Preview notes may include effect tails from reverb/delay. Consider routing
     * to a dry bus in the future if effect tails become problematic for UI responsiveness.
     * 
     * @param trackId - Should always be PREVIEW_TRACK_ID for preview playback
     * @param preset - Keys preset name (e.g., 'Grand Piano', 'Rhodes')
     * @param note - MIDI note number or note name (e.g., 60 or 'C4')
     * @param velocity - Note velocity (0-1, default 0.7)
     */
    previewNote(trackId: number, preset: string, note: number | string, velocity: number = 0.7) {
        const key = `${trackId}-${preset}`;

        // Stop previous preview note (sync, fast)
        // This prevents audio bleed and ensures monophonic preview behavior
        if (this.lastPreviewNote) {
            try {
                const prevBundle = this.trackSynths.get(this.lastPreviewNote.key);
                if (prevBundle && prevBundle.synth) {
                    // Fully release the previous note to stop oscillators and cancel envelopes
                    if (prevBundle.synth.triggerRelease) {
                        prevBundle.synth.triggerRelease(this.lastPreviewNote.note);
                    }
                    if (prevBundle.synth.releaseAll) {
                        prevBundle.synth.releaseAll();
                    }
                }
            } catch (e) {
                // Silently handle cleanup errors to avoid blocking new preview
            }
        }

        // FAST PATH: If synth is already cached, play immediately
        const cachedBundle = this.trackSynths.get(key);
        if (cachedBundle) {
            ensureTone().then((ToneLib: any) => {
                const n = typeof note === 'number' ? ToneLib.Frequency(note, 'midi').toNote() : note;
                try {
                    cachedBundle.synth.triggerAttackRelease?.(n, '8n', undefined, velocity);
                    this.lastPreviewNote = { key, note: n };
                } catch (e) {
                    console.error("Error in previewNote (cached):", e);
                }
            });
            return;
        }

        // SLOW PATH: Synth not cached, create it async and play when ready
        this.getSynth(trackId, preset).then(async bundle => {
            const ToneLib = await ensureTone() as any;
            const n = typeof note === 'number' ? ToneLib.Frequency(note, 'midi').toNote() : note;
            try {
                bundle.synth.triggerAttackRelease?.(n, '8n', undefined, velocity);
                this.lastPreviewNote = { key, note: n };
            } catch (e) {
                console.error("Error in previewNote (async):", e);
            }
        }).catch(e => console.error("Error getting synth for preview:", e));
    }

    async playChord(trackId: number, preset: string, notes: (number | string)[], duration: string | number, velocity: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, preset);
        const ToneLib = await ensureTone() as ToneLibType;
        const n = notes.map(x => typeof x === 'number' ? ToneLib.Frequency(x, 'midi').toNote() : x);
        if (bundle.synth.triggerAttackRelease) bundle.synth.triggerAttackRelease(n, duration, ToneLib.now(), velocity);
    }

    stopAll() {
        this.trackSynths.forEach(bundle => {
            try { bundle.synth?.releaseAll?.(); } catch { }
        });
    }

    dispose() {
        this.trackSynths.forEach(bundle => {
            try { bundle.synth?.dispose?.(); } catch { }
            bundle.effects?.forEach((e: any) => { try { e?.dispose?.(); } catch { } });
        });
        this.trackSynths.clear();
    }
}

export const toneKeysEngine = new ToneKeysEngine();
