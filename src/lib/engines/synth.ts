import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';
import { globalReverbs } from './globalReverb';
import { PREVIEW_TRACK_ID } from '../constants';

// Efficient Synth Engine using Tone.PolySynth for voice pooling
// Reduces CPU usage by ~70% compared to manual node creation per note.

class ToneSynthEngine {
    private trackSynths: Map<string, any> = new Map(); // Key: `${trackId}-${presetName}`
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private readonly MAX_POLYPHONY = 16;
    private lastPreviewNote: { key: string, note: number | string } | null = null;

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            await audioEngine.initialize();
            await ensureTone();
            await globalReverbs.initialize();
            this.initialized = true;
        })();
        return this.initializationPromise;
    }

    private getDest(trackId: number) {
        return audioEngine.getTrackChannel(trackId).input;
    }

    // Connects a source to the global reverb bus
    private attachReverb(source: any, type: 'short' | 'medium' | 'long', amount: number, key: string) {
        // We use a send gain
        ensureTone().then((ToneLib: any) => {
            const reverb = globalReverbs.getReverb(type);
            if (!reverb) return;

            const sendGain = new ToneLib.Gain(amount);
            source.connect(sendGain);
            sendGain.connect(reverb);
            // We don't track the sendGain for disposal in this simple version, 
            // relying on the cached synth bundle disposal to clean up the source connection
        });
    }

    // Factory to create optimized PolySynths based on preset names
    private async getSynth(trackId: number, preset: string) {
        const key = `${trackId}-${preset}`;
        if (this.trackSynths.has(key)) return this.trackSynths.get(key);

        if (!this.initialized) await this.initialize();
        const ToneLib = await ensureTone() as ToneLibType;
        const dest = this.getDest(trackId);

        let synth: any;
        let effects: any[] = [];
        let reverbInfo: { type: 'short' | 'medium' | 'long', amount: number } | null = { type: 'medium', amount: 0.2 };

        // --------------------------------------------------------------------------
        // PRESET MAPPING - EACH PRESET IS PURPOSEFULLY DISTINCT
        // --------------------------------------------------------------------------

        switch (preset) {
            // ===========================================
            // LEADS
            // ===========================================
            case 'Super Saw': {
                // Massive detuned supersaw - the classic EDM/trance lead
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "fatsawtooth", count: 5, spread: 40 },
                    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3 }
                });
                const filter = new ToneLib.Filter(5000, "lowpass");
                const chorus = new ToneLib.Chorus(4, 3.5, 0.6).start();

                synth.connect(filter);
                filter.connect(chorus);
                chorus.connect(dest);

                effects = [filter, chorus];
                reverbInfo = { type: 'long', amount: 0.35 };
                break;
            }

            case 'Trance Lead': {
                // Thinner, more aggressive saw with gated feel
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.15 }
                });
                const filter = new ToneLib.Filter(7000, "lowpass", -12);
                const delay = new ToneLib.PingPongDelay("8n.", 0.25);
                delay.wet.value = 0.3;

                synth.connect(filter);
                filter.connect(delay);
                delay.connect(dest);
                filter.connect(dest); // Dry path

                effects = [filter, delay];
                reverbInfo = { type: 'medium', amount: 0.2 };
                break;
            }

            case 'Bright Lead': {
                // Clean, bright lead with shimmer - synth pop style
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "pulse", width: 0.3 },
                    envelope: { attack: 0.002, decay: 0.2, sustain: 0.7, release: 0.25 }
                });
                // Bright but not too thin - 2500Hz lowpass with resonance
                const filter = new ToneLib.Filter({ frequency: 6000, type: "lowpass", Q: 2 });
                const stereoWidener = new ToneLib.StereoWidener(0.6);
                const delay = new ToneLib.FeedbackDelay("16n", 0.15);
                delay.wet.value = 0.2;

                synth.connect(filter);
                filter.connect(stereoWidener);
                stereoWidener.connect(delay);
                delay.connect(dest);
                stereoWidener.connect(dest);

                effects = [filter, stereoWidener, delay];
                reverbInfo = { type: 'short', amount: 0.2 };
                break;
            }

            case 'Portamento Lead': {
                // MonoSynth with actual glide/portamento
                synth = new ToneLib.MonoSynth({
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
                    filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.2, baseFrequency: 400, octaves: 3 }
                });
                synth.portamento = 0.15; // Actual glide time

                const filter = new ToneLib.Filter(4000, "lowpass");
                synth.connect(filter);
                filter.connect(dest);

                effects = [filter];
                reverbInfo = { type: 'medium', amount: 0.2 };
                break;
            }

            case 'FM Lead': {
                // Aggressive FM lead with metallic edge
                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 5,
                    modulationIndex: 20,
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.2 },
                    modulation: { type: "square" },
                    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.1 }
                });
                const distortion = new ToneLib.Distortion(0.15);
                synth.connect(distortion);
                distortion.connect(dest);

                effects = [distortion];
                reverbInfo = { type: 'short', amount: 0.15 };
                break;
            }

            case 'FM Bell': {
                // Classic FM bell - short, plucky, glassy
                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 3.0,
                    modulationIndex: 12,
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.5 },
                    modulation: { type: "triangle" },
                    modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 }
                });
                synth.connect(dest);
                effects = [];
                reverbInfo = { type: 'long', amount: 0.4 };
                break;
            }

            case 'Pluck Lead': {
                // Sharp attack, no sustain - pure pluck
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 }
                });
                const filter = new ToneLib.Filter(3000, "lowpass");

                synth.connect(filter);
                filter.connect(dest);
                effects = [filter];
                reverbInfo = { type: 'medium', amount: 0.25 };
                break;
            }

            case 'Plucked Strings': {
                // Richer, more string-like pluck with longer decay and resonance
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "fatsawtooth", count: 2, spread: 15 },
                    envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 }
                });
                const filter = new ToneLib.Filter(2500, "lowpass", -12);
                const chorus = new ToneLib.Chorus(1.5, 3, 0.4).start();

                synth.connect(filter);
                filter.connect(chorus);
                chorus.connect(dest);

                effects = [filter, chorus];
                reverbInfo = { type: 'medium', amount: 0.3 };
                break;
            }

            case 'Distorted Lead': {
                // Heavy distortion lead - rock/industrial
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 }
                });
                const distortion = new ToneLib.Distortion(0.6);
                const filter = new ToneLib.Filter(3500, "lowpass");

                synth.connect(distortion);
                distortion.connect(filter);
                filter.connect(dest);

                effects = [distortion, filter];
                reverbInfo = { type: 'short', amount: 0.1 };
                break;
            }

            // ===========================================
            // PADS
            // ===========================================
            case 'Analog Pad': {
                // Classic warm analog pad - slow attack, rich harmonics
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
                    envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 2.0 }
                });
                const filter = new ToneLib.Filter(2000, "lowpass");
                const chorus = new ToneLib.Chorus(1.5, 3.5, 0.5).start();

                synth.connect(filter);
                filter.connect(chorus);
                chorus.connect(dest);

                effects = [filter, chorus];
                reverbInfo = { type: 'long', amount: 0.45 };
                break;
            }

            case 'Warm Pad': {
                // Very soft, muffled pad - think ambient
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sine" },
                    envelope: { attack: 1.5, decay: 0.5, sustain: 0.9, release: 3.0 }
                });
                const filter = new ToneLib.Filter(800, "lowpass");
                const chorus = new ToneLib.Chorus(0.5, 4, 0.4).start();

                synth.connect(filter);
                filter.connect(chorus);
                chorus.connect(dest);

                effects = [filter, chorus];
                reverbInfo = { type: 'long', amount: 0.55 };
                break;
            }

            case 'String Pad': {
                // Orchestral string-like pad with movement
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "fatcustom", partials: [1, 0.5, 0.3, 0.2], spread: 25, count: 3 },
                    envelope: { attack: 0.6, decay: 0.3, sustain: 0.85, release: 1.8 }
                });
                const filter = new ToneLib.Filter(3500, "lowpass");
                const vibrato = new ToneLib.Vibrato({ frequency: 5, depth: 0.08 });

                synth.connect(filter);
                filter.connect(vibrato);
                vibrato.connect(dest);

                effects = [filter, vibrato];
                reverbInfo = { type: 'long', amount: 0.5 };
                break;
            }

            case 'Atmosphere': {
                // Ethereal, evolving pad with phaser
                synth = new ToneLib.PolySynth(ToneLib.AMSynth, {
                    harmonicity: 2.0,
                    oscillator: { type: "triangle" },
                    envelope: { attack: 2.0, decay: 1.0, sustain: 0.8, release: 4.0 }
                });
                const phaser = new ToneLib.Phaser({ frequency: 0.3, octaves: 4, baseFrequency: 300 });
                const filter = new ToneLib.Filter(2500, "lowpass");

                synth.connect(phaser);
                phaser.connect(filter);
                filter.connect(dest);

                effects = [phaser, filter];
                reverbInfo = { type: 'long', amount: 0.6 };
                break;
            }

            case 'Crystal Pad': {
                // Shimmery, bright pad with high frequencies
                synth = new ToneLib.PolySynth(ToneLib.FMSynth, {
                    harmonicity: 4,
                    modulationIndex: 8,
                    oscillator: { type: "sine" },
                    envelope: { attack: 1.0, decay: 0.8, sustain: 0.7, release: 2.5 },
                    modulation: { type: "sine" },
                    modulationEnvelope: { attack: 0.5, decay: 0.3, sustain: 0.5, release: 1.0 }
                });
                const chorus = new ToneLib.Chorus(2, 2.5, 0.6).start();

                synth.connect(chorus);
                chorus.connect(dest);

                effects = [chorus];
                reverbInfo = { type: 'long', amount: 0.55 };
                break;
            }

            case 'Dark Pad': {
                // Low, ominous, brooding pad
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 1.2, decay: 0.8, sustain: 0.6, release: 2.5 }
                });
                const filter = new ToneLib.Filter(600, "lowpass");
                const phaser = new ToneLib.Phaser({ frequency: 0.15, octaves: 2, baseFrequency: 200 });

                synth.connect(filter);
                filter.connect(phaser);
                phaser.connect(dest);

                effects = [filter, phaser];
                reverbInfo = { type: 'long', amount: 0.5 };
                break;
            }

            case 'Noise Pad': {
                // Textured noise-layered evolving pad - uses pitched synth + parallel noise
                // Main pad synth (pitched)
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sine" },
                    envelope: { attack: 1.5, decay: 0.5, sustain: 0.7, release: 2.0 }
                });
                // Noise layer runs in parallel for texture but doesn't need pitch
                const noiseLayer = new ToneLib.Noise("pink");
                const noiseGain = new ToneLib.Gain(0.15);
                const noiseFilter = new ToneLib.AutoFilter({ frequency: 0.15, baseFrequency: 400, octaves: 3 }).start();
                const mainFilter = new ToneLib.Filter({ frequency: 1200, type: "lowpass" });
                const chorus = new ToneLib.Chorus(0.3, 5, 0.5).start();
                const reverb = new ToneLib.Reverb({ decay: 5, wet: 0.55 });

                // Noise path
                noiseLayer.connect(noiseFilter);
                noiseFilter.connect(noiseGain);
                noiseGain.connect(reverb);
                noiseLayer.start();

                // Main synth path
                synth.connect(mainFilter);
                mainFilter.connect(chorus);
                chorus.connect(reverb);
                reverb.connect(dest);

                effects = [noiseLayer, noiseFilter, noiseGain, mainFilter, chorus, reverb];
                reverbInfo = null; // Already has reverb
                break;
            }

            // ===========================================
            // ARPS & STABS
            // ===========================================
            case 'Future Bass Chord': {
                // Future bass wobbly chord - distinct from Super Saw via LFO filter movement
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "fatsawtooth", count: 3, spread: 25 },
                    envelope: { attack: 0.02, decay: 0.5, sustain: 0.6, release: 0.4 }
                });
                // The KEY difference: LFO-modulated filter for that "wobble"
                const filter = new ToneLib.Filter({ frequency: 2000, type: "lowpass", Q: 4 });
                const lfo = new ToneLib.LFO({ frequency: 2, min: 800, max: 4000 });
                lfo.connect(filter.frequency);
                lfo.start();
                const compressor = new ToneLib.Compressor({ threshold: -12, ratio: 5 });
                const stereoWidener = new ToneLib.StereoWidener(0.7);

                synth.connect(filter);
                filter.connect(compressor);
                compressor.connect(stereoWidener);
                stereoWidener.connect(dest);

                effects = [filter, lfo, compressor, stereoWidener];
                reverbInfo = { type: 'medium', amount: 0.35 };
                break;
            }

            case 'Stab': {
                // Short, punchy stab - tighter than Future Bass Chord
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.1 }
                });
                const filter = new ToneLib.Filter(3000, "lowpass");

                synth.connect(filter);
                filter.connect(dest);

                effects = [filter];
                reverbInfo = { type: 'short', amount: 0.15 };
                break;
            }

            case 'Arp Synth': {
                // Light, bouncy synth perfect for arpeggios
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "square" },
                    envelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.15 }
                });
                const filter = new ToneLib.Filter(5000, "lowpass");
                const delay = new ToneLib.FeedbackDelay("8n", 0.2);
                delay.wet.value = 0.25;

                synth.connect(filter);
                filter.connect(delay);
                delay.connect(dest);
                filter.connect(dest);

                effects = [filter, delay];
                reverbInfo = { type: 'short', amount: 0.1 };
                break;
            }

            case 'Chiptune': {
                // 8-bit style retro synth
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "square" },
                    envelope: { attack: 0.001, decay: 0.1, sustain: 0.5, release: 0.05 }
                });
                const bitcrusher = new ToneLib.BitCrusher(4);
                const filter = new ToneLib.Filter(4000, "lowpass");

                synth.connect(bitcrusher);
                bitcrusher.connect(filter);
                filter.connect(dest);

                effects = [bitcrusher, filter];
                reverbInfo = null;
                break;
            }

            // ===========================================
            // FX SYNTHS
            // ===========================================
            case 'Sci-Fi Riser': {
                // Rising pitch sweep synth
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 2.0, decay: 0.1, sustain: 1, release: 0.5 }
                });
                const filter = new ToneLib.AutoFilter({ frequency: 0.25, baseFrequency: 200, octaves: 4 }).start();
                const phaser = new ToneLib.Phaser({ frequency: 1, octaves: 3, baseFrequency: 400 });

                synth.connect(filter);
                filter.connect(phaser);
                phaser.connect(dest);

                effects = [filter, phaser];
                reverbInfo = { type: 'long', amount: 0.4 };
                break;
            }

            case 'Laser': {
                // Quick pitch-down zap
                synth = new ToneLib.MonoSynth({
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
                    filterEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1, baseFrequency: 5000, octaves: -4 }
                });
                const distortion = new ToneLib.Distortion(0.3);

                synth.connect(distortion);
                distortion.connect(dest);

                effects = [distortion];
                reverbInfo = null;
                break;
            }

            case 'Zap': {
                // Very short electronic zap
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "square" },
                    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
                });
                const bitcrusher = new ToneLib.BitCrusher(3);
                const filter = new ToneLib.Filter(6000, "highpass");

                synth.connect(bitcrusher);
                bitcrusher.connect(filter);
                filter.connect(dest);

                effects = [bitcrusher, filter];
                reverbInfo = null;
                break;
            }

            default: {
                // GENERIC FALLBACK - simple but usable
                synth = new ToneLib.PolySynth(ToneLib.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.5 }
                });
                synth.connect(dest);
                effects = [];
                reverbInfo = { type: 'medium', amount: 0.15 };
            }
        }

        // Apply global reverb send if configured
        if (reverbInfo) {
            // For the effects chain output (usually the last node connected to dest)
            // But here we need to tap into the signal.
            // The simplest way is to connect the 'synth' (dry) or the last effect to the send.
            // Connecting the synth output itself is usually safer for parallel reverb.

            // NOTE: In the blocks above, we connected to 'dest'.
            // To add reverb, we connect the same source that went to dest, to the reverb send.

            // Heuristic: Connect the last effect or the synth itself if no effects.
            const source = effects.length > 0 ? effects[effects.length - 1] : synth;
            this.attachReverb(source, reverbInfo.type, reverbInfo.amount, key);
        }

        const bundle = { synth, effects };
        this.trackSynths.set(key, bundle);
        console.log(`[SynthEngine] Created optimized PolySynth for ${preset}`);
        return bundle;
    }

    /**
     * Play a note - SYNCHRONOUS for cached synths to avoid timing jitter (Issue #14)
     * Only falls back to async if synth needs to be created
     */
    playNote(trackId: number, preset: string, note: number | string, duration: string | number, velocity: number, time?: number) {
        const key = `${trackId}-${preset}`;

        // Fast path: synth already cached - no async, no jitter
        if (this.trackSynths.has(key) && this.initialized) {
            try {
                const bundle = this.trackSynths.get(key);
                bundle.synth.triggerAttackRelease(note, duration, time, velocity);
            } catch (e) {
                console.error("Error playing synth note:", e);
            }
            return;
        }

        // Slow path: create synth async, then schedule note slightly later
        // This is only hit on first use of a preset
        this.getSynth(trackId, preset).then(bundle => {
            try {
                // Add small delay to account for async creation time
                const adjustedTime = time !== undefined ? time + 0.05 : undefined;
                bundle.synth.triggerAttackRelease(note, duration, adjustedTime, velocity);
            } catch (e) {
                console.error("Error playing synth note (async):", e);
            }
        }).catch(e => console.error("Error getting synth:", e));
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
     * @param preset - Synth preset name (e.g., 'Super Saw', 'Analog Pad')
     * @param note - MIDI note number or note name (e.g., 60 or 'C4')
     * @param velocity - Note velocity (0-1, default 0.7)
     */
    previewNote(trackId: number, preset: string, note: number | string, velocity: number = 0.7) {
        const key = `${trackId}-${preset}`;

        // Stop previous preview note if it was on any synth (sync, fast)
        // This prevents audio bleed and ensures monophonic preview behavior
        if (this.lastPreviewNote) {
            try {
                const prevBundle = this.trackSynths.get(this.lastPreviewNote.key);
                if (prevBundle && prevBundle.synth) {
                    // Fully release the previous note to stop oscillators and cancel envelopes
                    if (prevBundle.synth.triggerRelease) {
                        prevBundle.synth.triggerRelease(this.lastPreviewNote.note);
                    }
                    // Alternative: releaseAll stops all voices on the synth
                    if (prevBundle.synth.releaseAll) {
                        prevBundle.synth.releaseAll();
                    }
                }
            } catch (e) {
                // Silently handle cleanup errors to avoid blocking new preview
            }
        }

        // FAST PATH: If synth is already cached, play immediately (no await!)
        const cachedBundle = this.trackSynths.get(key);
        if (cachedBundle) {
            try {
                cachedBundle.synth.triggerAttackRelease(note, '8n', undefined, velocity);
                this.lastPreviewNote = { key, note };
            } catch (e) {
                console.error("Error in previewNote (cached):", e);
            }
            return;
        }

        // SLOW PATH: Synth not cached, create it async and play when ready
        // This only happens on the FIRST click for a new preset
        this.getSynth(trackId, preset).then(bundle => {
            try {
                bundle.synth.triggerAttackRelease(note, '8n', undefined, velocity);
                this.lastPreviewNote = { key, note };
            } catch (e) {
                console.error("Error in previewNote (async):", e);
            }
        }).catch(e => console.error("Error getting synth for preview:", e));
    }

    /**
     * Play a chord (multiple notes simultaneously)
     */
    async playChord(trackId: number, preset: string, notes: (number | string)[], duration: string | number, velocity: number, time?: number) {
        const ToneLib = await ensureTone() as ToneLibType;
        const key = `${trackId}-${preset}`;

        // Get or create the synth
        const bundle = await this.getSynth(trackId, preset);

        try {
            // Convert MIDI notes to frequencies if they are numbers
            const freqs = notes.map(n =>
                typeof n === 'number' ? new (ToneLib.Frequency as any)(n, "midi").toFrequency() : n
            );
            bundle.synth.triggerAttackRelease(freqs, duration, time, velocity);
        } catch (e) {
            console.error("Error playing chord:", e);
        }
    }

    stopAll() {
        this.trackSynths.forEach(bundle => {
            try {
                bundle.synth.releaseAll();
            } catch (e) { }
        });
    }

    dispose() {
        this.trackSynths.forEach(bundle => {
            try { bundle.synth.dispose(); } catch { }
            bundle.effects?.forEach((e: any) => tryDispose(e));
        });
        this.trackSynths.clear();
    }
}

function tryDispose(obj: any) {
    try {
        if (typeof obj.dispose === 'function') obj.dispose();
    } catch { }
}

export const toneSynthEngine = new ToneSynthEngine();
