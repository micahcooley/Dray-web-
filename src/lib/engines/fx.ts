import { ensureTone } from '../toneWrapper';
import type { ToneLibType } from '../toneWrapper';
import { audioEngine } from '../audioEngine';
import type { FXEngineInterface } from '../engineTypes';

/**
 * ToneFXEngine - Sound effects synthesis
 * Creates risers, impacts, sweeps, transitions and other production FX
 */
class ToneFXEngine implements FXEngineInterface {
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private activeNodes: any[] = [];
    private lastPreviewNode: any = null;

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            await audioEngine.initialize();
            const ToneLib = await ensureTone() as ToneLibType;
            await ToneLib.start();
            this.initialized = true;
        })();

        return this.initializationPromise;
    }

    private getDest(trackId: number) {
        try {
            return audioEngine.getTrackChannel(trackId).input;
        } catch {
            return null;
        }
    }

    /**
     * Play an FX sound with the specified type
     */
    async playFX(trackId: number, type: string, velocity: number = 0.8, duration: number = 2) {
        if (!this.initialized) await this.initialize();
        const ToneLib = await ensureTone() as ToneLibType;
        const dest = this.getDest(trackId) || ToneLib.getDestination();
        const now = ToneLib.now();

        switch (type) {
            case 'Riser':
            case 'Rise':
            case 'Build Up': {
                // Rising noise sweep for build-ups
                await this.createRiser(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Downlifter':
            case 'Down':
            case 'Drop': {
                // Falling noise sweep for drops
                await this.createDownlifter(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Impact':
            case 'Hit':
            case 'Boom': {
                // Punchy transient with reverb tail
                await this.createImpact(ToneLib, dest, velocity, now);
                break;
            }

            case 'Sweep':
            case 'White Noise Sweep': {
                // Filtered noise sweep
                await this.createSweep(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Laser':
            case 'Zap':
            case 'Sci-Fi': {
                // Pitch-bending laser zap
                await this.createLaser(ToneLib, dest, velocity, now);
                break;
            }

            case 'Vinyl Crackle':
            case 'Crackle':
            case 'Lo-Fi': {
                // Continuous vinyl texture
                await this.createVinylCrackle(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Reverse Cymbal':
            case 'Reverse': {
                // Reverse cymbal simulation
                await this.createReverseCymbal(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Sub Drop':
            case 'Bass Drop': {
                // Low frequency drop impact
                await this.createSubDrop(ToneLib, dest, velocity, now);
                break;
            }

            case 'Tension':
            case 'Suspense': {
                // Dissonant tension builder
                await this.createTension(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Whoosh':
            case 'Pass By': {
                // Quick whooshing transition
                await this.createWhoosh(ToneLib, dest, velocity, now);
                break;
            }

            case 'Swell':
            case 'Pad Swell': {
                // Gentle volume swell
                await this.createSwell(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'White Noise': {
                // Continuous white noise texture
                await this.createWhiteNoise(ToneLib, dest, velocity, duration, now);
                break;
            }

            case 'Release': {
                // Tension release / drop hit
                await this.createRelease(ToneLib, dest, velocity, now);
                break;
            }

            default: {
                // Default: simple filtered noise burst
                await this.createNoiseBurst(ToneLib, dest, velocity, now);
            }
        }
    }

    /**
     * Preview an FX - monophonic (stops previous preview before starting new one)
     * Signature: (trackId, preset, note, velocity) - standardized across all engines
     * For FX, 'preset' is the FX type and 'note' is ignored.
     */
    async previewNote(trackId: number, preset: string, _note: number | string = 60, velocity: number = 0.8) {
        if (!this.initialized) await this.initialize();

        // Stop previous preview node immediately
        if (this.lastPreviewNode) {
            try {
                if (this.lastPreviewNode.stop) this.lastPreviewNode.stop();
                if (this.lastPreviewNode.dispose) this.lastPreviewNode.dispose();
            } catch (_e) { }
            this.lastPreviewNode = null;
        }

        // For FX, we just call playFX. 
        // Note: FX often have their own internal cleanup logic.
        await this.playFX(trackId, preset, velocity, 1);
    }

    /**
     * Rising filtered noise for build-ups
     */
    private async createRiser(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('white');
        const filter = new ToneLib.Filter({ frequency: 100, type: 'bandpass', Q: 2 });
        const gain = new ToneLib.Gain(0);
        const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.4 });

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(reverb);
        reverb.connect(dest);

        // Ramp filter and volume up
        filter.frequency.setValueAtTime(100, time);
        filter.frequency.exponentialRampToValueAtTime(8000, time + duration);
        filter.Q.setValueAtTime(2, time);
        filter.Q.linearRampToValueAtTime(8, time + duration);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.5, time + duration * 0.8);
        gain.gain.linearRampToValueAtTime(velocity * 0.7, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + 0.1);

        noise.start(time);
        noise.stop(time + duration + 0.2);

        this.scheduleCleanup([noise, filter, gain, reverb], duration + 1);
    }

    /**
     * Falling filtered noise for drops
     */
    private async createDownlifter(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('pink');
        const filter = new ToneLib.Filter({ frequency: 6000, type: 'lowpass', Q: 3 });
        const gain = new ToneLib.Gain(velocity * 0.5);
        const reverb = new ToneLib.Reverb({ decay: 1.5, wet: 0.3 });

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(reverb);
        reverb.connect(dest);

        // Ramp filter down
        filter.frequency.setValueAtTime(6000, time);
        filter.frequency.exponentialRampToValueAtTime(50, time + duration);

        gain.gain.setValueAtTime(velocity * 0.5, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.3, time + duration * 0.7);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        noise.start(time);
        noise.stop(time + duration + 0.1);

        this.scheduleCleanup([noise, filter, gain, reverb], duration + 1);
    }

    /**
     * Punchy impact transient
     */
    private async createImpact(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        // Low frequency thump
        const kick = new ToneLib.MembraneSynth({
            pitchDecay: 0.1,
            octaves: 6,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 }
        });

        // Noise layer for attack
        const noise = new ToneLib.Noise('white');
        const noiseFilter = new ToneLib.Filter({ frequency: 2000, type: 'lowpass' });
        const noiseEnv = new ToneLib.AmplitudeEnvelope({ attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 });

        // Heavy reverb tail
        const reverb = new ToneLib.Reverb({ decay: 3, wet: 0.6 });
        const compressor = new ToneLib.Compressor({ threshold: -15, ratio: 8 });

        kick.connect(compressor);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseEnv);
        noiseEnv.connect(compressor);
        compressor.connect(reverb);
        reverb.connect(dest);

        kick.triggerAttackRelease('C1', '4n', time, velocity);
        noise.start(time);
        noiseEnv.triggerAttackRelease('16n', time);
        noise.stop(time + 0.2);

        this.scheduleCleanup([kick, noise, noiseFilter, noiseEnv, reverb, compressor], 4);
    }

    /**
     * Filtered noise sweep
     */
    private async createSweep(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('white');
        const filter = new ToneLib.Filter({ frequency: 500, type: 'bandpass', Q: 5 });
        const gain = new ToneLib.Gain(velocity * 0.4);
        const delay = new ToneLib.FeedbackDelay({ delayTime: 0.1, feedback: 0.3, wet: 0.2 });

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(delay);
        delay.connect(dest);

        // Sweep filter up and down
        const halfDur = duration / 2;
        filter.frequency.setValueAtTime(200, time);
        filter.frequency.exponentialRampToValueAtTime(4000, time + halfDur);
        filter.frequency.exponentialRampToValueAtTime(200, time + duration);

        noise.start(time);
        noise.stop(time + duration + 0.1);

        this.scheduleCleanup([noise, filter, gain, delay], duration + 1);
    }

    /**
     * Sci-fi laser zap
     */
    private async createLaser(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        const osc = new ToneLib.Oscillator({ type: 'sawtooth', frequency: 2000 });
        const filter = new ToneLib.Filter({ frequency: 4000, type: 'lowpass', Q: 8 });
        const gain = new ToneLib.Gain(velocity * 0.4);
        const distortion = new ToneLib.Distortion({ distortion: 0.3 });

        osc.connect(filter);
        filter.connect(distortion);
        distortion.connect(gain);
        gain.connect(dest);

        // Pitch bend down rapidly
        osc.frequency.setValueAtTime(4000, time);
        osc.frequency.exponentialRampToValueAtTime(100, time + 0.3);

        // Volume envelope
        gain.gain.setValueAtTime(velocity * 0.4, time);
        gain.gain.linearRampToValueAtTime(0, time + 0.35);

        osc.start(time);
        osc.stop(time + 0.4);

        this.scheduleCleanup([osc, filter, gain, distortion], 1);
    }

    /**
     * Vinyl crackle texture
     */
    private async createVinylCrackle(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('brown');
        const filter1 = new ToneLib.Filter({ frequency: 800, type: 'highpass' });
        const filter2 = new ToneLib.Filter({ frequency: 4000, type: 'lowpass' });
        const bitcrusher = new ToneLib.BitCrusher({ bits: 6 });
        const gain = new ToneLib.Gain(velocity * 0.15);

        noise.connect(filter1);
        filter1.connect(filter2);
        filter2.connect(bitcrusher);
        bitcrusher.connect(gain);
        gain.connect(dest);

        noise.start(time);
        noise.stop(time + duration);

        this.scheduleCleanup([noise, filter1, filter2, bitcrusher, gain], duration + 0.5);
    }

    /**
     * Reverse cymbal simulation
     */
    private async createReverseCymbal(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('white');
        const filter = new ToneLib.Filter({ frequency: 8000, type: 'highpass', Q: 1 });
        const gain = new ToneLib.Gain(0);
        const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.5 });

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(reverb);
        reverb.connect(dest);

        // Exponential volume rise (reverse envelope)
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.exponentialRampToValueAtTime(velocity * 0.6, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + 0.05);

        noise.start(time);
        noise.stop(time + duration + 0.1);

        this.scheduleCleanup([noise, filter, gain, reverb], duration + 2);
    }

    /**
     * Sub frequency drop
     */
    private async createSubDrop(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        const osc = new ToneLib.Oscillator({ type: 'sine', frequency: 80 });
        const filter = new ToneLib.Filter({ frequency: 150, type: 'lowpass' });
        const gain = new ToneLib.Gain(velocity * 0.8);
        const compressor = new ToneLib.Compressor({ threshold: -10, ratio: 10 });

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(compressor);
        compressor.connect(dest);

        // Pitch drops then fades
        osc.frequency.setValueAtTime(120, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 1);

        gain.gain.setValueAtTime(velocity * 0.8, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.5, time + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);

        osc.start(time);
        osc.stop(time + 1.6);

        this.scheduleCleanup([osc, filter, gain, compressor], 2);
    }

    /**
     * Dissonant tension builder
     */
    private async createTension(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        // Dissonant cluster of oscillators
        const freqs = [220, 233, 247, 262]; // Minor 2nd intervals
        const oscs: any[] = [];
        const merger = new ToneLib.Gain(0);
        const filter = new ToneLib.Filter({ frequency: 1000, type: 'lowpass', Q: 3 });
        const reverb = new ToneLib.Reverb({ decay: 4, wet: 0.5 });
        const vibrato = new ToneLib.Vibrato({ frequency: 6, depth: 0.1 });

        for (const freq of freqs) {
            const osc = new ToneLib.Oscillator({ type: 'sawtooth', frequency: freq });
            const oscGain = new ToneLib.Gain(velocity * 0.15);
            osc.connect(oscGain);
            oscGain.connect(merger);
            oscs.push(osc, oscGain);
        }

        merger.connect(filter);
        filter.connect(vibrato);
        vibrato.connect(reverb);
        reverb.connect(dest);

        // Build volume and filter
        merger.gain.setValueAtTime(0, time);
        merger.gain.linearRampToValueAtTime(1, time + duration * 0.8);
        merger.gain.linearRampToValueAtTime(0, time + duration);

        filter.frequency.setValueAtTime(300, time);
        filter.frequency.exponentialRampToValueAtTime(3000, time + duration);

        oscs.forEach((node, i) => {
            if (i % 2 === 0) { // oscillators only
                node.start(time);
                node.stop(time + duration + 0.1);
            }
        });

        this.scheduleCleanup([...oscs, merger, filter, reverb, vibrato], duration + 2);
    }

    /**
     * Quick whoosh transition
     */
    private async createWhoosh(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        const noise = new ToneLib.Noise('pink');
        const filter = new ToneLib.Filter({ frequency: 500, type: 'bandpass', Q: 2 });
        const panner = new ToneLib.Panner(0);
        const gain = new ToneLib.Gain(velocity * 0.4);

        noise.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(dest);

        // Quick filter and pan sweep
        filter.frequency.setValueAtTime(200, time);
        filter.frequency.exponentialRampToValueAtTime(4000, time + 0.15);
        filter.frequency.exponentialRampToValueAtTime(200, time + 0.3);

        panner.pan.setValueAtTime(-1, time);
        panner.pan.linearRampToValueAtTime(1, time + 0.3);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.4, time + 0.1);
        gain.gain.linearRampToValueAtTime(0, time + 0.35);

        noise.start(time);
        noise.stop(time + 0.4);

        this.scheduleCleanup([noise, filter, panner, gain], 1);
    }

    /**
     * Gentle volume swell
     */
    private async createSwell(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const osc1 = new ToneLib.Oscillator({ type: 'sine', frequency: 220 });
        const osc2 = new ToneLib.Oscillator({ type: 'triangle', frequency: 220.5 }); // Slight detune
        const merge = new ToneLib.Gain(0);
        const filter = new ToneLib.Filter({ frequency: 2000, type: 'lowpass' });
        const reverb = new ToneLib.Reverb({ decay: 4, wet: 0.6 });

        osc1.connect(merge);
        osc2.connect(merge);
        merge.connect(filter);
        filter.connect(reverb);
        reverb.connect(dest);

        // Slow fade in, then out
        merge.gain.setValueAtTime(0, time);
        merge.gain.linearRampToValueAtTime(velocity * 0.4, time + duration * 0.6);
        merge.gain.linearRampToValueAtTime(0, time + duration);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration + 0.1);
        osc2.stop(time + duration + 0.1);

        this.scheduleCleanup([osc1, osc2, merge, filter, reverb], duration + 2);
    }

    /**
     * Simple noise burst fallback
     */
    private async createNoiseBurst(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        const noise = new ToneLib.Noise('white');
        const filter = new ToneLib.Filter({ frequency: 2000, type: 'lowpass' });
        const env = new ToneLib.AmplitudeEnvelope({ attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 });

        noise.connect(filter);
        filter.connect(env);
        env.connect(dest);

        noise.start(time);
        env.triggerAttackRelease('8n', time, velocity * 0.5);
        noise.stop(time + 0.5);

        this.scheduleCleanup([noise, filter, env], 1);
    }

    /**
     * Continuous white noise texture
     */
    private async createWhiteNoise(ToneLib: ToneLibType, dest: any, velocity: number, duration: number, time: number) {
        const noise = new ToneLib.Noise('white');
        const filter = new ToneLib.Filter({ frequency: 3000, type: 'lowpass' });
        const gain = new ToneLib.Gain(0);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        // Fade in and out
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.3, time + 0.1);
        gain.gain.setValueAtTime(velocity * 0.3, time + duration - 0.1);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        noise.start(time);
        noise.stop(time + duration + 0.1);

        this.scheduleCleanup([noise, filter, gain], duration + 1);
    }

    /**
     * Tension release / drop hit - the moment after the build
     */
    private async createRelease(ToneLib: ToneLibType, dest: any, velocity: number, time: number) {
        // Low thump
        const kick = new ToneLib.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 8,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 }
        });

        // Falling noise
        const noise = new ToneLib.Noise('white');
        const noiseFilter = new ToneLib.Filter({ frequency: 4000, type: 'lowpass' });
        const noiseGain = new ToneLib.Gain(velocity * 0.4);

        // Heavy reverb
        const reverb = new ToneLib.Reverb({ decay: 2, wet: 0.5 });

        kick.connect(reverb);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(reverb);
        reverb.connect(dest);

        // Falling filter
        noiseFilter.frequency.setValueAtTime(4000, time);
        noiseFilter.frequency.exponentialRampToValueAtTime(100, time + 0.5);
        noiseGain.gain.setValueAtTime(velocity * 0.4, time);
        noiseGain.gain.linearRampToValueAtTime(0, time + 0.5);

        kick.triggerAttackRelease('C1', '8n', time, velocity);
        noise.start(time);
        noise.stop(time + 0.6);

        this.scheduleCleanup([kick, noise, noiseFilter, noiseGain, reverb], 3);
    }

    /**
     * Schedule node cleanup after duration
     */
    private scheduleCleanup(nodes: any[], delaySeconds: number) {
        this.activeNodes.push(...nodes);
        setTimeout(() => {
            nodes.forEach(node => {
                try { node?.dispose?.(); } catch { }
            });
            this.activeNodes = this.activeNodes.filter(n => !nodes.includes(n));
        }, delaySeconds * 1000);
    }

    stopAll() {
        this.activeNodes.forEach(node => {
            try { node?.stop?.(); } catch { }
            try { node?.dispose?.(); } catch { }
        });
        this.activeNodes = [];
    }

    dispose() {
        this.stopAll();
        this.initialized = false;
    }
}

export const toneFXEngine = new ToneFXEngine();
