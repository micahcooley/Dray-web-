import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';
import type { BassEngineInterface } from '../engineTypes';

/**
 * ToneBassEngine - Premium bass synthesis with distinct presets
 * Each preset creates a unique bass sound using different synthesis techniques
 */
class ToneBassEngine implements BassEngineInterface {
    private trackSynths: Map<string, any> = new Map();
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private lastPreviewNote: { key: string, note: number | string } | null = null;

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            await audioEngine.initialize();
            const ToneLib = await ensureTone() as ToneLibType;
            await (ToneLib as any).start();
            this.initialized = true;
        })();
        return this.initializationPromise;
    }

    private getDest(trackId: number) {
        return audioEngine.getTrackChannel(trackId).input;
    }

    /**
     * Create preset-specific bass synthesizer with proper sound design
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
            case 'Sub Bass':
            case 'Sub': {
                // Pure, clean sub bass - the foundation
                const compressor = new ToneLib.Compressor({ threshold: -20, ratio: 4 });
                const limiter = new ToneLib.Limiter(-3);
                const lowpass = new ToneLib.Filter({ frequency: 120, type: 'lowpass', Q: 0.5 });

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.95, release: 0.3 },
                    filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 1, release: 0.3, baseFrequency: 200, octaves: 0 }
                });

                synth.connect(lowpass);
                lowpass.connect(compressor);
                compressor.connect(limiter);
                limiter.connect(dest);
                effects = [lowpass, compressor, limiter];
                break;
            }

            case 'Synth Bass':
            case 'Synth': {
                // Classic analog-style synth bass
                const filter = new ToneLib.Filter({ frequency: 1200, type: 'lowpass', Q: 2 });
                const compressor = new ToneLib.Compressor({ threshold: -15, ratio: 3 });

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
                    filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.2, baseFrequency: 300, octaves: 2.5 }
                });

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(dest);
                effects = [filter, compressor];
                break;
            }

            case 'Reese Bass':
            case 'Reese': {
                // Classic DnB detuned sawtooth bass with movement
                const phaser = new ToneLib.Phaser({ frequency: 0.3, octaves: 2, baseFrequency: 200 });
                const distortion = new ToneLib.Distortion({ distortion: 0.15 });
                const lowpass = new ToneLib.Filter({ frequency: 800, type: 'lowpass', Q: 1 });

                // Create three detuned oscillators for that thick Reese sound
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.85, release: 0.15 }
                });
                synth.set({ detune: 0 });

                // Create additional detuned voices manually via effects
                const chorus = new ToneLib.Chorus({ frequency: 0.5, delayTime: 3.5, depth: 0.7 }).start();

                synth.connect(chorus);
                chorus.connect(phaser);
                phaser.connect(distortion);
                distortion.connect(lowpass);
                lowpass.connect(dest);
                effects = [chorus, phaser, distortion, lowpass];
                break;
            }

            case '808 Bass':
            case '808': {
                // Trap 808 with pitch envelope decay
                const distortion = new ToneLib.Distortion({ distortion: 0.1 });
                const compressor = new ToneLib.Compressor({ threshold: -12, ratio: 6 });
                const limiter = new ToneLib.Limiter(-2);

                synth = new ToneLib.MembraneSynth({
                    pitchDecay: 0.08,
                    octaves: 4,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.8, sustain: 0.01, release: 0.8 }
                });

                synth.connect(distortion);
                distortion.connect(compressor);
                compressor.connect(limiter);
                limiter.connect(dest);
                effects = [distortion, compressor, limiter];
                break;
            }

            case 'Acid Bass':
            case 'Acid':
            case 'TB-303': {
                // Classic TB-303 acid bass with resonant filter
                const filter = new ToneLib.Filter({ frequency: 400, type: 'lowpass', Q: 15 });
                const filterEnv = new ToneLib.FrequencyEnvelope({
                    attack: 0.01,
                    decay: 0.3,
                    sustain: 0.1,
                    release: 0.2,
                    baseFrequency: 200,
                    octaves: 4
                });
                const distortion = new ToneLib.Distortion({ distortion: 0.3 });
                const compressor = new ToneLib.Compressor({ threshold: -18, ratio: 4 });

                filterEnv.connect(filter.frequency);

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.1 },
                    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1, baseFrequency: 200, octaves: 3.5 }
                });

                synth.connect(filter);
                filter.connect(distortion);
                distortion.connect(compressor);
                compressor.connect(dest);
                effects = [filter, filterEnv, distortion, compressor];
                break;
            }

            case 'FM Bass': {
                // FM synthesis bass with metallic harmonics
                const filter = new ToneLib.Filter({ frequency: 1500, type: 'lowpass', Q: 1 });
                const compressor = new ToneLib.Compressor({ threshold: -15, ratio: 3 });

                synth = new ToneLib.FMSynth({
                    harmonicity: 3,
                    modulationIndex: 15,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.3, sustain: 0.4, release: 0.2 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 }
                });

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(dest);
                effects = [filter, compressor];
                break;
            }

            case 'Wobble Bass':
            case 'Wobble':
            case 'Dubstep': {
                // Classic dubstep wobble with LFO-modulated filter
                const filter = new ToneLib.Filter({ frequency: 500, type: 'lowpass', Q: 8 });
                const lfo = new ToneLib.LFO({ frequency: 4, min: 100, max: 2000 });
                const distortion = new ToneLib.Distortion({ distortion: 0.4 });
                const compressor = new ToneLib.Compressor({ threshold: -12, ratio: 5 });

                lfo.connect(filter.frequency);
                lfo.start();

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 },
                    filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.1, baseFrequency: 500, octaves: 0 }
                });

                synth.connect(filter);
                filter.connect(distortion);
                distortion.connect(compressor);
                compressor.connect(dest);
                effects = [filter, lfo, distortion, compressor];
                break;
            }

            case 'Pluck Bass':
            case 'Slap Bass': {
                // Plucky, percussive bass with quick attack
                const filter = new ToneLib.Filter({ frequency: 2000, type: 'lowpass', Q: 3 });
                const compressor = new ToneLib.Compressor({ threshold: -15, ratio: 4 });

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0.1, release: 0.15 },
                    filterEnvelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.1, baseFrequency: 300, octaves: 3 }
                });

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(dest);
                effects = [filter, compressor];
                break;
            }

            case 'Moog Bass':
            case 'Analog Bass': {
                // Classic Moog-style ladder filter bass
                const filter = new ToneLib.Filter({ frequency: 800, type: 'lowpass', Q: 4 });
                const distortion = new ToneLib.Distortion({ distortion: 0.2 });
                const compressor = new ToneLib.Compressor({ threshold: -18, ratio: 4 });

                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.005, decay: 0.25, sustain: 0.7, release: 0.25 },
                    filterEnvelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.2, baseFrequency: 150, octaves: 2.5 }
                });

                synth.connect(filter);
                filter.connect(distortion);
                distortion.connect(compressor);
                compressor.connect(dest);
                effects = [filter, distortion, compressor];
                break;
            }

            case 'Fingered Bass':
            case 'Finger Bass': {
                // Electric bass guitar simulation
                const filter = new ToneLib.Filter({ frequency: 1200, type: 'lowpass', Q: 1.5 });
                const compressor = new ToneLib.Compressor({ threshold: -20, ratio: 3 });
                const reverb = new ToneLib.Reverb({ decay: 0.5, wet: 0.1 });

                synth = new ToneLib.PluckSynth({
                    attackNoise: 1.5,
                    dampening: 2000,
                    resonance: 0.98,
                    release: 0.8
                });

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(reverb);
                reverb.connect(dest);
                effects = [filter, compressor, reverb];
                break;
            }

            default: {
                // Default fallback - nice general bass sound
                const compressor = new ToneLib.Compressor({ threshold: -15, ratio: 3 });
                synth = new ToneLib.MonoSynth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2 }
                });
                synth.connect(compressor);
                compressor.connect(dest);
                effects = [compressor];
            }
        }

        const synthBundle = { synth, effects };
        this.trackSynths.set(key, synthBundle);
        return synthBundle;
    }

    async playNote(trackId: number, note: number | string, duration: string | number, velocity: number, preset: string, time?: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, preset);
        const ToneLib = await ensureTone() as ToneLibType;

        // TRANSPOSE DOWN 1 OCTAVE
        let p = note;
        if (typeof note === 'number') {
            p = Math.max(0, note - 12);
        }

        const n = typeof p === 'number' ? (ToneLib as any).Frequency(p, 'midi').toNote() : p;
        const t = time ?? (ToneLib as any).now();

        bundle.synth.triggerAttackRelease?.(n, duration, t, velocity);
    }

    /**
     * Preview a note - monophonic (stops previous preview note before starting new one)
     * Signature: (trackId, preset, note, velocity) - standardized across all engines
     * OPTIMIZED: Uses synchronous cache lookup for instant playback on cached synths.
     */
    previewNote(trackId: number, preset: string, note: number | string, velocity: number = 0.7) {
        const key = `${trackId}-${preset}`;

        // Stop previous preview note (sync, fast)
        if (this.lastPreviewNote) {
            try {
                const prevBundle = this.trackSynths.get(this.lastPreviewNote.key);
                if (prevBundle) {
                    if (prevBundle.synth.triggerRelease) prevBundle.synth.triggerRelease(this.lastPreviewNote.note);
                    else if (prevBundle.synth.releaseAll) prevBundle.synth.releaseAll();
                }
            } catch (e) { }
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

            // TRANSPOSE DOWN 1 OCTAVE for Bass Engine feel
            let n = note;
            if (typeof note === 'number') {
                n = ToneLib.Frequency(Math.max(0, note - 12), 'midi').toNote();
            }

            try {
                bundle.synth.triggerAttackRelease?.(n, '8n', undefined, velocity);
                this.lastPreviewNote = { key, note: n };
            } catch (e) {
                console.error("Error in previewNote (async):", e);
            }
        }).catch(e => console.error("Error getting synth for preview:", e));
    }

    stopAll() {
        this.trackSynths.forEach(bundle => {
            try { bundle.synth?.releaseAll?.() || bundle.synth?.triggerRelease?.(); } catch { }
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

export const toneBassEngine = new ToneBassEngine();
