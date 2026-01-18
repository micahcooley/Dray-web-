import { ensureTone } from '../toneWrapper';

class GlobalReverbManager {
    private reverbs: { short: any; medium: any; long: any } | null = null;
    private initialized = false;

    async initialize() {
        if (this.initialized) return;
        const ToneLib = await ensureTone();

        this.reverbs = {
            short: new ToneLib.Reverb({ decay: 1.5, preDelay: 0.01 }).toDestination(),
            medium: new ToneLib.Reverb({ decay: 3.0, preDelay: 0.05 }).toDestination(),
            long: new ToneLib.Reverb({ decay: 6.0, preDelay: 0.1 }).toDestination(),
        };

        await Promise.all([
            this.reverbs.short.generate(),
            this.reverbs.medium.generate(),
            this.reverbs.long.generate(),
        ]);

        this.reverbs.short.wet.value = 1.0;
        this.reverbs.medium.wet.value = 1.0;
        this.reverbs.long.wet.value = 1.0;

        this.initialized = true;
    }

    getReverb(type: 'short' | 'medium' | 'long') {
        return this.reverbs ? this.reverbs[type] : null;
    }
}

export const globalReverbs = new GlobalReverbManager();
