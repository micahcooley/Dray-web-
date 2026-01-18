import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';
import type { VocalEngineInterface } from '../engineTypes';

/**
 * Formant frequencies for different vowel sounds
 * Based on average human vocal formant data
 */
const VOWEL_FORMANTS = {
    'A': { f1: 800, f2: 1200, f3: 2500, q1: 8, q2: 12, q3: 10 },   // "ah" sound
    'E': { f1: 400, f2: 2000, f3: 2800, q1: 10, q2: 10, q3: 8 },   // "ee" sound
    'I': { f1: 350, f2: 2200, f3: 2900, q1: 10, q2: 12, q3: 8 },   // "ih" sound
    'O': { f1: 500, f2: 800, f3: 2500, q1: 8, q2: 10, q3: 10 },    // "oh" sound
    'U': { f1: 350, f2: 700, f3: 2500, q1: 10, q2: 10, q3: 8 },    // "oo" sound
};

/**
 * ToneVocalEngine - Formant-based vocal synthesis
 * Creates choir-like and vocal pad sounds using formant filtering
 */
class ToneVocalEngine implements VocalEngineInterface {
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
            this.initialized = true;
        })();
        return this.initializationPromise;
    }

    private getDest(trackId: number) {
        return audioEngine.getTrackChannel(trackId).input;
    }

    /**
     * Create a formant filter bank for vowel shaping
     */
    private async createFormantFilters(ToneLib: ToneLibType, vowel: keyof typeof VOWEL_FORMANTS = 'A') {
        const formants = VOWEL_FORMANTS[vowel];

        const filter1 = new ToneLib.Filter({ frequency: formants.f1, type: 'bandpass', Q: formants.q1 });
        const filter2 = new ToneLib.Filter({ frequency: formants.f2, type: 'bandpass', Q: formants.q2 });
        const filter3 = new ToneLib.Filter({ frequency: formants.f3, type: 'bandpass', Q: formants.q3 });

        // Mix the formants with different gains
        const gain1 = new ToneLib.Gain(1.0);
        const gain2 = new ToneLib.Gain(0.7);
        const gain3 = new ToneLib.Gain(0.4);

        filter1.connect(gain1);
        filter2.connect(gain2);
        filter3.connect(gain3);

        // Merge to output
        const merge = new ToneLib.Gain(0.5);
        gain1.connect(merge);
        gain2.connect(merge);
        gain3.connect(merge);

        return {
            filters: [filter1, filter2, filter3],
            gains: [gain1, gain2, gain3],
            output: merge,
            connect: (source: any) => {
                source.connect(filter1);
                source.connect(filter2);
                source.connect(filter3);
            }
        };
    }

    /**
     * Create preset-specific vocal synthesizer
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
            case 'Choir':
            case 'Choir Aah': {
                // Rich choir pad with "Aah" vowel formants
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const vibrato = new ToneLib.Vibrato({ frequency: 5.5, depth: 0.08 });
                const chorus = new ToneLib.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.4 }).start();
                const reverb = new ToneLib.Reverb({ decay: 4, wet: 0.5 });

                // Multiple detuned voices for ensemble
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.5, decay: 0.3, sustain: 0.75, release: 1.2 }
                });
                synth.set({ detune: 0 });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(chorus);
                chorus.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, chorus, reverb];
                break;
            }

            case 'Choir Ooh': {
                // Choir with "Ooh" vowel formants - softer, rounder
                const formantBank = await this.createFormantFilters(ToneLib, 'O');
                const vibrato = new ToneLib.Vibrato({ frequency: 5, depth: 0.06 });
                const chorus = new ToneLib.Chorus({ frequency: 0.6, delayTime: 5, depth: 0.5 }).start();
                const reverb = new ToneLib.Reverb({ decay: 5, wet: 0.55 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 1.5 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(chorus);
                chorus.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, chorus, reverb];
                break;
            }

            case 'Choir Eeh': {
                // Choir with "Eeh" vowel formants - brighter, angelic
                const formantBank = await this.createFormantFilters(ToneLib, 'E');
                const vibrato = new ToneLib.Vibrato({ frequency: 6, depth: 0.1 });
                const chorus = new ToneLib.Chorus({ frequency: 1, delayTime: 3, depth: 0.35 }).start();
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.3, feedback: 0.2, wet: 0.15 });
                const reverb = new ToneLib.Reverb({ decay: 4.5, wet: 0.5 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.3 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(chorus);
                chorus.connect(delay);
                delay.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, chorus, delay, reverb];
                break;
            }

            case 'Vocal Pad': {
                // Evolving vocal texture pad
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const lfo = new ToneLib.LFO({ frequency: 0.1, min: 400, max: 1200 });
                const chorus = new ToneLib.Chorus({ frequency: 0.5, delayTime: 6, depth: 0.6 }).start();
                const reverb = new ToneLib.Reverb({ decay: 6, wet: 0.6 });

                // Connect LFO to first formant filter for movement
                lfo.connect(formantBank.filters[0].frequency);
                lfo.start();

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 1.5, decay: 0.5, sustain: 0.65, release: 2 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(chorus);
                chorus.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, lfo, chorus, reverb];
                break;
            }

            case 'Ethereal Voice': {
                // Ghostly, otherworldly vocal
                const filter = new ToneLib.Filter({ frequency: 2000, type: 'bandpass', Q: 5 });
                const vibrato = new ToneLib.Vibrato({ frequency: 7, depth: 0.15 });
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.4, feedback: 0.4, wet: 0.35 });
                const reverb = new ToneLib.Reverb({ decay: 8, wet: 0.7 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sine' },
                    envelope: { attack: 1, decay: 0.5, sustain: 0.5, release: 3 }
                });

                synth.connect(filter);
                filter.connect(vibrato);
                vibrato.connect(delay);
                delay.connect(reverb);
                reverb.connect(dest);
                effects = [filter, vibrato, delay, reverb];
                break;
            }

            case 'Vocoder': {
                // Robotic vocoder-style synthesis
                // Create multiple narrow bandpass filters
                const bands: any[] = [];
                const bandFreqs = [200, 400, 800, 1200, 2000, 3000, 4500];

                const merge = new ToneLib.Gain(0.4);

                for (const freq of bandFreqs) {
                    const filter = new ToneLib.Filter({ frequency: freq, type: 'bandpass', Q: 15 });
                    const gain = new ToneLib.Gain(1 / bandFreqs.length);
                    filter.connect(gain);
                    gain.connect(merge);
                    bands.push(filter, gain);
                }

                const distortion = new ToneLib.Distortion({ distortion: 0.15 });
                const reverb = new ToneLib.Reverb({ decay: 1.5, wet: 0.2 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }
                });

                // Connect synth to all band filters
                for (let i = 0; i < bands.length; i += 2) {
                    synth.connect(bands[i]);
                }

                merge.connect(distortion);
                distortion.connect(reverb);
                reverb.connect(dest);
                effects = [...bands, merge, distortion, reverb];
                break;
            }

            case 'Gospel Choir': {
                // Full, rich gospel choir with warmth
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const vibrato = new ToneLib.Vibrato({ frequency: 5, depth: 0.12 });
                const chorus = new ToneLib.Chorus({ frequency: 0.4, delayTime: 8, depth: 0.6 }).start();
                const distortion = new ToneLib.Distortion({ distortion: 0.05 });
                const reverb = new ToneLib.Reverb({ decay: 5, wet: 0.45 });

                synth = new ToneLib.PolySynth(ToneLib.AMSynth, {
                    harmonicity: 2,
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 1 },
                    modulation: { type: 'sine' },
                    modulationEnvelope: { attack: 0.5, decay: 0.3, sustain: 0.5, release: 1 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(chorus);
                chorus.connect(distortion);
                distortion.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, chorus, distortion, reverb];
                break;
            }

            case 'Siren': {
                // Warning siren vocal effect
                const filter = new ToneLib.Filter({ frequency: 1500, type: 'bandpass', Q: 10 });
                const lfo = new ToneLib.LFO({ frequency: 2, min: 800, max: 2500 });
                const distortion = new ToneLib.Distortion({ distortion: 0.2 });

                lfo.connect(filter.frequency);
                lfo.start();

                synth = new ToneLib.Synth({
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 1, release: 0.3 }
                });

                synth.connect(filter);
                filter.connect(distortion);
                distortion.connect(dest);
                effects = [filter, lfo, distortion];
                break;
            }

            case 'Ooh': {
                // Soft "Ooh" vowel - solo voice, not choir
                const formantBank = await this.createFormantFilters(ToneLib, 'O');
                const vibrato = new ToneLib.Vibrato({ frequency: 5, depth: 0.05 });
                const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.3 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.8 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, reverb];
                break;
            }

            case 'Aah': {
                // Open "Aah" vowel - solo voice
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const vibrato = new ToneLib.Vibrato({ frequency: 5.5, depth: 0.06 });
                const reverb = new ToneLib.Reverb({ decay: 2.5, wet: 0.35 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.25, decay: 0.2, sustain: 0.75, release: 0.7 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, reverb];
                break;
            }

            case 'Vocal Chop': {
                // Short, staccato vocal hit for chop samples
                const formantBank = await this.createFormantFilters(ToneLib, 'E');
                const filter = new ToneLib.Filter({ frequency: 3000, type: 'lowpass' });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(filter);
                filter.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, filter];
                break;
            }

            case 'Adlib': {
                // Quick ad-lib style vocal - bright, punchy
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const filter = new ToneLib.Filter({ frequency: 4000, type: 'highpass' });
                const delay = new ToneLib.PingPongDelay({ delayTime: '8n', feedback: 0.2, wet: 0.15 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(filter);
                filter.connect(delay);
                delay.connect(dest);
                filter.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, filter, delay];
                break;
            }

            case 'Harmony': {
                // Stacked vocal harmony pad
                const formantBank = await this.createFormantFilters(ToneLib, 'O');
                const chorus = new ToneLib.Chorus({ frequency: 0.5, delayTime: 5, depth: 0.6 }).start();
                const reverb = new ToneLib.Reverb({ decay: 4, wet: 0.45 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.2 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(chorus);
                chorus.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, chorus, reverb];
                break;
            }

            case 'Vox Lead':
            case 'Vocal': {
                // General purpose vocal synth lead
                const formantBank = await this.createFormantFilters(ToneLib, 'A');
                const vibrato = new ToneLib.Vibrato({ frequency: 5, depth: 0.07 });
                const delay = new ToneLib.FeedbackDelay({ delayTime: 0.3, feedback: 0.15, wet: 0.2 });
                const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.25 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(vibrato);
                vibrato.connect(delay);
                delay.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, vibrato, delay, reverb];
                break;
            }

            case 'Talkbox': {
                // Talkbox/vocoder style - robotic vocal
                const filter = new ToneLib.AutoWah({ baseFrequency: 200, octaves: 4, sensitivity: -20, Q: 3 });
                const distortion = new ToneLib.Distortion({ distortion: 0.15 });
                const chorus = new ToneLib.Chorus({ frequency: 2, delayTime: 3, depth: 0.3 }).start();

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.2 }
                });

                synth.connect(filter);
                filter.connect(distortion);
                distortion.connect(chorus);
                chorus.connect(dest);
                effects = [filter, distortion, chorus];
                break;
            }

            default: {
                // Default vocal pad fallback
                const formantBank = await this.createFormantFilters(ToneLib, 'O');
                const reverb = new ToneLib.Reverb({ decay: 3, wet: 0.4 });

                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.4, decay: 0.3, sustain: 0.7, release: 1 }
                });

                formantBank.connect(synth);
                formantBank.output.connect(reverb);
                reverb.connect(dest);
                effects = [...formantBank.filters, ...formantBank.gains, formantBank.output, reverb];
            }
        }

        const synthBundle = { synth, effects };
        this.trackSynths.set(key, synthBundle);
        return synthBundle;
    }

    async playVocal(trackId: number, note: number, type: string, time?: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, type);
        const ToneLib = await ensureTone() as ToneLibType;
        const n = (ToneLib as any).Frequency(note, 'midi').toNote();
        bundle.synth.triggerAttackRelease?.(n, '4n', time ?? (ToneLib as any).now());
    }

    async playNote(trackId: number, note: number | string, duration: string | number, velocity: number, preset: string, time?: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, preset);
        const ToneLib = await ensureTone() as ToneLibType;
        const n = typeof note === 'number' ? (ToneLib as any).Frequency(note, 'midi').toNote() : note;
        bundle.synth.triggerAttackRelease?.(n, duration, time ?? (ToneLib as any).now(), velocity);
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
            } catch (_e) { }
        }

        // FAST PATH: If synth is already cached, play immediately
        const cachedBundle = this.trackSynths.get(key);
        if (cachedBundle) {
            ensureTone().then((ToneLib: any) => {
                const n = typeof note === 'number' ? ToneLib.Frequency(note, 'midi').toNote() : note;
                try {
                    cachedBundle.synth.triggerAttackRelease?.(n, '8n', undefined, velocity);
                    this.lastPreviewNote = { key, note: n };
                } catch (_e) {
                    console.error("Error in previewNote (cached):", _e);
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
            } catch (_e) {
                console.error("Error in previewNote (async):", _e);
            }
        }).catch(e => console.error("Error getting synth for preview:", e));
    }

    async playChord(trackId: number, preset: string, notes: (number | string)[], duration: string | number, velocity: number) {
        if (!this.initialized) await this.initialize();
        const bundle = await this.getSynth(trackId, preset);
        const ToneLib = await ensureTone() as ToneLibType;
        const n = notes.map(x => typeof x === 'number' ? ToneLib.Frequency(x, 'midi').toNote() : x);
        bundle.synth.triggerAttackRelease?.(n, duration, ToneLib.now(), velocity);
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

export const toneVocalEngine = new ToneVocalEngine();
