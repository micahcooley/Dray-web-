import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';

/**
 * Kit-specific sound parameters
 */
interface KitParams {
    kick: {
        pitchDecay: number;
        octaves: number;
        frequency: string;
        decay: number;
        distortion: number;
    };
    snare: {
        frequency: string;
        decay: number;
        noiseType: 'white' | 'pink' | 'brown';
        noiseDecay: number;
        toneRatio: number;
    };
    hihat: {
        frequency: number;
        harmonicity: number;
        decay: number;
        resonance: number;
    };
    clap: {
        noiseType: 'white' | 'pink';
        filterFreq: number;
        decay: number;
        count: number;
    };
    tom: {
        pitchDecay: number;
        octaves: number;
        baseFreq: number;
    };
}

// ... COPYING EXISTING DRUM_KITS ...
const DRUM_KITS: Record<string, KitParams> = {
    '808': {
        kick: { pitchDecay: 0.08, octaves: 4, frequency: 'C1', decay: 0.8, distortion: 0.1 },
        snare: { frequency: 'D2', decay: 0.2, noiseType: 'white', noiseDecay: 0.15, toneRatio: 0.6 },
        hihat: { frequency: 8000, harmonicity: 5.1, decay: 0.08, resonance: 4000 },
        clap: { noiseType: 'white', filterFreq: 1500, decay: 0.15, count: 3 },
        tom: { pitchDecay: 0.05, octaves: 3, baseFreq: 100 }
    },
    '909': {
        kick: { pitchDecay: 0.05, octaves: 6, frequency: 'D1', decay: 0.5, distortion: 0.2 },
        snare: { frequency: 'E2', decay: 0.15, noiseType: 'white', noiseDecay: 0.2, toneRatio: 0.5 },
        hihat: { frequency: 10000, harmonicity: 6, decay: 0.05, resonance: 5000 },
        clap: { noiseType: 'white', filterFreq: 2000, decay: 0.12, count: 4 },
        tom: { pitchDecay: 0.04, octaves: 4, baseFreq: 120 }
    },
    'Trap': {
        kick: { pitchDecay: 0.12, octaves: 5, frequency: 'B0', decay: 1.0, distortion: 0.25 },
        snare: { frequency: 'C#2', decay: 0.25, noiseType: 'white', noiseDecay: 0.18, toneRatio: 0.4 },
        hihat: { frequency: 12000, harmonicity: 7, decay: 0.03, resonance: 6000 },
        clap: { noiseType: 'white', filterFreq: 2500, decay: 0.2, count: 2 },
        tom: { pitchDecay: 0.08, octaves: 4, baseFreq: 80 }
    },
    'Acoustic': {
        kick: { pitchDecay: 0.03, octaves: 2, frequency: 'E1', decay: 0.4, distortion: 0.02 },
        snare: { frequency: 'G2', decay: 0.3, noiseType: 'pink', noiseDecay: 0.25, toneRatio: 0.3 },
        hihat: { frequency: 6000, harmonicity: 4, decay: 0.12, resonance: 3000 },
        clap: { noiseType: 'pink', filterFreq: 1200, decay: 0.25, count: 5 },
        tom: { pitchDecay: 0.02, octaves: 2, baseFreq: 150 }
    },
    'Lo-Fi': {
        kick: { pitchDecay: 0.1, octaves: 3, frequency: 'C#1', decay: 0.6, distortion: 0.15 },
        snare: { frequency: 'D#2', decay: 0.22, noiseType: 'brown', noiseDecay: 0.2, toneRatio: 0.5 },
        hihat: { frequency: 5000, harmonicity: 3.5, decay: 0.1, resonance: 2000 },
        clap: { noiseType: 'pink', filterFreq: 1000, decay: 0.18, count: 3 },
        tom: { pitchDecay: 0.06, octaves: 2.5, baseFreq: 110 }
    },
    'Phonk': {
        kick: { pitchDecay: 0.15, octaves: 5, frequency: 'A0', decay: 0.9, distortion: 0.35 },
        snare: { frequency: 'C2', decay: 0.2, noiseType: 'white', noiseDecay: 0.15, toneRatio: 0.55 },
        hihat: { frequency: 9000, harmonicity: 5.5, decay: 0.06, resonance: 4500 },
        clap: { noiseType: 'white', filterFreq: 1800, decay: 0.14, count: 4 },
        tom: { pitchDecay: 0.1, octaves: 4, baseFreq: 90 }
    },
    'Boom Bap': {
        kick: { pitchDecay: 0.06, octaves: 3.5, frequency: 'D1', decay: 0.55, distortion: 0.12 },
        snare: { frequency: 'F2', decay: 0.28, noiseType: 'pink', noiseDecay: 0.22, toneRatio: 0.45 },
        hihat: { frequency: 7000, harmonicity: 4.5, decay: 0.09, resonance: 3500 },
        clap: { noiseType: 'pink', filterFreq: 1400, decay: 0.2, count: 3 },
        tom: { pitchDecay: 0.04, octaves: 2.8, baseFreq: 130 }
    },
    'EDM': {
        kick: { pitchDecay: 0.04, octaves: 5.5, frequency: 'C#1', decay: 0.45, distortion: 0.18 },
        snare: { frequency: 'F#2', decay: 0.18, noiseType: 'white', noiseDecay: 0.16, toneRatio: 0.5 },
        hihat: { frequency: 11000, harmonicity: 6.5, decay: 0.04, resonance: 5500 },
        clap: { noiseType: 'white', filterFreq: 2200, decay: 0.13, count: 4 },
        tom: { pitchDecay: 0.035, octaves: 4.5, baseFreq: 115 }
    }
};

const MIDI_DRUM_MAP: Record<number, string> = {
    36: 'kick',
    38: 'snare',
    42: 'hihat-closed',
    46: 'hihat-open',
    39: 'clap',
    45: 'tom-low',
    47: 'tom-mid',
    50: 'tom-high',
    49: 'crash',
    51: 'ride',
    37: 'rimshot',
    56: 'cowbell'
} as const;

interface TrackDrumBundle {
    kick: { synth: any; distortion: any; compressor: any };
    snare: { body: any; noise: any; filter: any; bodyGain: any; noiseGain: any; compressor: any };
    hihat: { synth: any };
    clap: { noise: any; filter: any; gain: any };
    tom: { synth: any };
    cymbal: { synth: any };
    cowbell: { synth: any };
    volume: any; // Master volume for this bundle
}

class ToneDrumMachine {
    private ToneLib: ToneLibType | null = null;
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private compressor: any = null;

    // Voice Pooling: Cache synths per track & kit
    // Key: `${trackId}-${kitName}`
    private drumBundles = new Map<string, TrackDrumBundle>();

    private currentKit: string = '808';

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            await audioEngine.initialize();
            this.ToneLib = await ensureTone() as ToneLibType;

            // Global compressor for drums to glue them together
            this.compressor = new this.ToneLib.Compressor({
                threshold: -10,
                ratio: 3,
                attack: 0.003,
                release: 0.1
            }).toDestination();

            this.initialized = true;
        })();
        return this.initializationPromise;
    }

    setKit(kit: string) {
        if (DRUM_KITS[kit]) {
            this.currentKit = kit;
        } else {
            this.currentKit = '808';
        }
    }

    getAvailableKits(): string[] {
        return Object.keys(DRUM_KITS);
    }

    private async getDrumBundle(trackId: number, kit: string): Promise<TrackDrumBundle> {
        const key = `${trackId}-${kit}`;
        if (this.drumBundles.has(key)) return this.drumBundles.get(key)!;

        // Initialize Tone if needed
        if (!this.initialized) await this.initialize();
        const ToneLib = this.ToneLib!;
        const dest = audioEngine.getTrackChannel(trackId).input;

        // --- KICK (Membrane + Distortion) ---
        const kickSynth = new ToneLib.MembraneSynth({ oscillator: { type: 'sine' } });
        const kickDist = new ToneLib.Distortion(0);
        // Each track has its own compressor or channel strip?
        // Using the global engine track channel handles volume/pan.
        // We might want a dedicated drum bus compressor per track.
        const kickComp = new ToneLib.Compressor({ threshold: -20, ratio: 2 });
        kickSynth.chain(kickDist, kickComp, dest);

        // --- SNARE (Membrane + Noise) ---
        const snareBody = new ToneLib.MembraneSynth({ oscillator: { type: 'triangle' } });
        const snareNoise = new ToneLib.NoiseSynth();
        const snareFilter = new ToneLib.Filter({ type: 'highpass' });
        const snareBodyGain = new ToneLib.Gain(1);
        const snareNoiseGain = new ToneLib.Gain(1);
        const snareComp = new ToneLib.Compressor({ threshold: -15, ratio: 4 });

        snareBody.connect(snareBodyGain);
        snareNoise.connect(snareFilter);
        snareFilter.connect(snareNoiseGain);
        snareBodyGain.connect(snareComp);
        snareNoiseGain.connect(snareComp);
        snareComp.connect(dest);

        // --- HIHATS (MetalSynth) ---
        // MetalSynth is perfect for 808/909 hats
        const hihatSynth = new ToneLib.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).connect(dest);
        hihatSynth.volume.value = -6; // Hats are usually too loud

        // --- CLAP (Noise + Filter) ---
        const clapNoise = new ToneLib.NoiseSynth();
        const clapFilter = new ToneLib.Filter({ type: 'bandpass', Q: 1 });
        const clapGain = new ToneLib.Gain(1).connect(dest);
        clapNoise.connect(clapFilter);
        clapFilter.connect(clapGain);

        // --- TOMS (PolySynth of Membrane) ---
        const tomSynth = new ToneLib.PolySynth(ToneLib.MembraneSynth, {
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: 'sine' }
        }).connect(dest);

        // --- CYMBALS/RIDE (MetalSynth) ---
        const cymbalSynth = new ToneLib.MetalSynth({
            envelope: { attack: 0.001, decay: 1.0, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).connect(dest);
        cymbalSynth.frequency.value = 200;
        cymbalSynth.volume.value = -4;

        // --- COWBELL (MetalSynth) ---
        const cowbellSynth = new ToneLib.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.1 },
            harmonicity: 12,
            modulationIndex: 20,
            resonance: 3000,
            octaves: 0.5
        }).connect(dest);
        cowbellSynth.frequency.value = 800;

        const bundle: TrackDrumBundle = {
            kick: { synth: kickSynth, distortion: kickDist, compressor: kickComp },
            snare: { body: snareBody, noise: snareNoise, filter: snareFilter, bodyGain: snareBodyGain, noiseGain: snareNoiseGain, compressor: snareComp },
            hihat: { synth: hihatSynth },
            clap: { noise: clapNoise, filter: clapFilter, gain: clapGain },
            tom: { synth: tomSynth },
            cymbal: { synth: cymbalSynth },
            cowbell: { synth: cowbellSynth },
            volume: dest // This isn't quite right for volume control but dest handles it
        };

        this.drumBundles.set(key, bundle);
        return bundle;
    }

    /**
     * Play a drum hit by MIDI note number - Optimised for Voice Pooling
     */
    async playNote(trackId: number, pitch: number, velocity: number = 0.9, time?: number) {
        if (!this.initialized) await this.initialize();

        const drumType = MIDI_DRUM_MAP[pitch];
        if (!drumType) return;

        const kit = this.currentKit;
        const bundle = await this.getDrumBundle(trackId, kit);
        const ToneLib = this.ToneLib!;
        const t = time ?? ToneLib.now();
        const params = DRUM_KITS[kit] || DRUM_KITS['808'];

        // --- KICK ---
        if (drumType === 'kick') {
            const p = params.kick;
            bundle.kick.distortion.distortion = p.distortion;
            bundle.kick.synth.pitchDecay = p.pitchDecay;
            bundle.kick.synth.octaves = p.octaves;
            bundle.kick.synth.envelope.decay = p.decay;
            bundle.kick.synth.envelope.release = p.decay;

            bundle.kick.synth.triggerAttackRelease(p.frequency, '8n', t, velocity);
        }

        // --- SNARE ---
        else if (drumType === 'snare') {
            const p = params.snare;
            bundle.snare.body.pitchDecay = 0.05;
            bundle.snare.body.envelope.decay = p.decay;

            bundle.snare.noise.noise.type = p.noiseType;
            bundle.snare.noise.envelope.decay = p.noiseDecay;

            // Can't set highpass directly on Filter object in some Tone versions without rampTo, 
            // but setting .value on frequency should work
            if (typeof bundle.snare.filter.frequency.value !== 'undefined') {
                bundle.snare.filter.frequency.value = parseFloat(p.frequency) > 200 ? 3000 : 2000; // Simplified
            }

            bundle.snare.bodyGain.gain.value = p.toneRatio;
            bundle.snare.noiseGain.gain.value = 1 - p.toneRatio;

            bundle.snare.body.triggerAttackRelease(p.frequency, '16n', t, velocity);
            bundle.snare.noise.triggerAttackRelease('16n', t, velocity);
        }

        // --- HIHATS ---
        else if (drumType === 'hihat-closed' || drumType === 'hihat-open') {
            const p = params.hihat;
            const isOpen = drumType === 'hihat-open';
            // MetalSynth params
            bundle.hihat.synth.frequency.value = p.frequency;
            bundle.hihat.synth.harmonicity = p.harmonicity;
            bundle.hihat.synth.resonance = p.resonance;
            bundle.hihat.synth.envelope.decay = isOpen ? 0.3 : p.decay; // Open hat longer
            bundle.hihat.synth.envelope.release = isOpen ? 0.3 : p.decay;

            // Trigger with different durations
            bundle.hihat.synth.triggerAttackRelease(isOpen ? '8n' : '32n', t, velocity);
        }

        // --- CLAP ---
        else if (drumType === 'clap') {
            const p = params.clap;
            bundle.clap.noise.noise.type = p.noiseType;
            bundle.clap.filter.frequency.value = p.filterFreq;
            bundle.clap.noise.envelope.decay = p.decay;

            // Simulate multiple claps? Harder with single synth instance without retriggering fast
            // Just single trigger for now for performance, or use Tone.Part for micro-delays
            // To prevent glitching, we just do one fat clap
            bundle.clap.noise.triggerAttackRelease('16n', t, velocity);

            // If we really want the "multi-clap" effect, we can schedule future hits
            if (p.count > 1) {
                const spacing = 0.01; // 10ms
                for (let i = 1; i < p.count; i++) {
                    bundle.clap.noise.triggerAttackRelease('16n', t + (i * spacing), velocity * 0.7);
                }
            }
        }

        // --- TOMS ---
        else if (drumType.startsWith('tom')) {
            const p = params.tom;
            let note = p.baseFreq;
            if (drumType === 'tom-low') note = p.baseFreq;
            if (drumType === 'tom-mid') note = p.baseFreq * 1.5;
            if (drumType === 'tom-high') note = p.baseFreq * 2;

            // PolySynth handles multiple toms fine
            // We set attributes on the PolySynth prototype essentially? No, PolySynth shares settings.
            // We'll just assume average settings for the kit
            bundle.tom.synth.set({
                pitchDecay: p.pitchDecay,
                octaves: p.octaves
            });

            bundle.tom.synth.triggerAttackRelease(note, '8n', t, velocity);
        }

        // --- CYMBALS ---
        else if (drumType === 'crash' || drumType === 'ride') {
            bundle.cymbal.synth.harmonicity = 5.1;
            bundle.cymbal.synth.envelope.decay = drumType === 'crash' ? 1.5 : 0.8;
            bundle.cymbal.synth.triggerAttackRelease(drumType === 'crash' ? '16n' : '32n', t, velocity);
        }

        // --- COWBELL ---
        else if (drumType === 'cowbell') {
            bundle.cowbell.synth.triggerAttackRelease('16n', t, velocity);
        }
    }

    /**
     * Preview a drum note
     */
    async previewNote(trackId: number, pitch: number, velocity: number = 0.8) {
        // Just call playNote, it handles instantiation/pooling
        await this.playNote(trackId, pitch, velocity);
    }

    // Helper methods for direct call compatibility if needed, though playNote is preferred
    async playKick(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        // Map to playNote
        this.currentKit = kit;
        await this.playNote(trackId, 36, velocity, time);
    }

    async playSnare(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, 38, velocity, time);
    }

    async playHiHat(trackId: number, kit: string, velocity: number = 0.9, open: boolean, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, open ? 46 : 42, velocity, time);
    }

    async playClap(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, 39, velocity, time);
    }

    async playTom(trackId: number, kit: string, type: 'low' | 'mid' | 'high', velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        const note = type === 'low' ? 45 : type === 'mid' ? 47 : 50;
        await this.playNote(trackId, note, velocity, time);
    }

    async playCrash(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, 49, velocity, time);
    }

    async playRide(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, 51, velocity, time);
    }

    async playRimshot(trackId: number, kit: string, velocity: number = 0.9, time?: number) {
        this.currentKit = kit;
        await this.playNote(trackId, 37, velocity, time);
    }

    async playCowbell(trackId: number, velocity: number = 0.9, time?: number) {
        await this.playNote(trackId, 56, velocity, time);
    }

    stopAll() {
        // Can't really stop drums naturally, but we could release all envelopes
        this.drumBundles.forEach(_bundle => {
            // Optional: silence them
        });
    }

    dispose() {
        this.drumBundles.forEach((bundle) => {
            bundle.kick.synth.dispose();
            bundle.kick.distortion.dispose();
            bundle.kick.compressor.dispose();
            bundle.snare.body.dispose();
            bundle.snare.noise.dispose();
            bundle.snare.filter.dispose();
            bundle.snare.bodyGain.dispose();
            bundle.snare.noiseGain.dispose();
            bundle.snare.compressor.dispose();
            bundle.hihat.synth.dispose();
            bundle.clap.noise.dispose();
            bundle.clap.filter.dispose();
            bundle.clap.gain.dispose();
            bundle.tom.synth.dispose();
            bundle.cymbal.synth.dispose();
            bundle.cowbell.synth.dispose();
        });
        this.drumBundles.clear();
        if (this.compressor) this.compressor.dispose();
    }
}

export const toneDrumMachine = new ToneDrumMachine();
