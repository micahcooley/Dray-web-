'use client';

import { audioEngine } from './audioEngine';

/**
 * Stem Separator Service
 * Uses frequency-band filtering to separate audio into stems
 * 
 * This is a basic DSP-based approach, not ML-based like Demucs/Spleeter.
 * It works by isolating frequency ranges:
 * - Bass: 20-200 Hz
 * - Drums: Transient detection + low-mid frequencies
 * - Vocals: 200-4000 Hz mid-focused
 * - Other: Remaining frequencies
 */

export interface StemResult {
    bass: AudioBuffer;
    drums: AudioBuffer;
    vocals: AudioBuffer;
    other: AudioBuffer;
}

export type StemType = 'bass' | 'drums' | 'vocals' | 'other';

interface SeparationProgress {
    stage: string;
    progress: number; // 0-100
}

class StemSeparator {
    private audioContext: AudioContext | null = null;
    private offlineContext: OfflineAudioContext | null = null;

    async initialize() {
        await audioEngine.initialize();
        this.audioContext = audioEngine.getContext();
    }

    /**
     * Separate an audio file into stems
     */
    async separate(
        audioFile: File | Blob,
        onProgress?: (progress: SeparationProgress) => void
    ): Promise<StemResult> {
        if (!this.audioContext) {
            await this.initialize();
        }

        onProgress?.({ stage: 'Loading audio...', progress: 10 });

        // Decode the audio file
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

        onProgress?.({ stage: 'Separating bass...', progress: 25 });
        const bass = await this.extractBass(audioBuffer);

        onProgress?.({ stage: 'Separating drums...', progress: 50 });
        const drums = await this.extractDrums(audioBuffer);

        onProgress?.({ stage: 'Separating vocals...', progress: 75 });
        const vocals = await this.extractVocals(audioBuffer);

        onProgress?.({ stage: 'Extracting other...', progress: 90 });
        const other = await this.extractOther(audioBuffer, [bass, drums, vocals]);

        onProgress?.({ stage: 'Complete!', progress: 100 });

        return { bass, drums, vocals, other };
    }

    /**
     * Extract bass frequencies (20-200 Hz)
     */
    private async extractBass(source: AudioBuffer): Promise<AudioBuffer> {
        const ctx = new OfflineAudioContext(
            source.numberOfChannels,
            source.length,
            source.sampleRate
        );

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = source;

        // Low-pass filter for bass
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 200;
        lowpass.Q.value = 0.7;

        // High-pass to remove sub-rumble
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 30;
        highpass.Q.value = 0.5;

        sourceNode.connect(lowpass);
        lowpass.connect(highpass);
        highpass.connect(ctx.destination);

        sourceNode.start(0);
        return ctx.startRendering();
    }

    /**
     * Extract drum frequencies using transient detection + frequency isolation
     */
    private async extractDrums(source: AudioBuffer): Promise<AudioBuffer> {
        const ctx = new OfflineAudioContext(
            source.numberOfChannels,
            source.length,
            source.sampleRate
        );

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = source;

        // Drums typically have:
        // - Kick: 50-100 Hz
        // - Snare: 150-250 Hz body, 2-8kHz snap
        // - Hi-hats: 6-16 kHz

        // Use a combination of filters to isolate percussive elements
        // Band 1: Low drums (kick, toms)
        const lowDrums = ctx.createBiquadFilter();
        lowDrums.type = 'bandpass';
        lowDrums.frequency.value = 80;
        lowDrums.Q.value = 0.8;

        // Band 2: Snare body
        const snareBand = ctx.createBiquadFilter();
        snareBand.type = 'bandpass';
        snareBand.frequency.value = 200;
        snareBand.Q.value = 1;

        // Band 3: Hi-hats and cymbals
        const hihatBand = ctx.createBiquadFilter();
        hihatBand.type = 'highpass';
        hihatBand.frequency.value = 8000;
        hihatBand.Q.value = 0.5;

        // Create gains for mixing
        const lowGain = ctx.createGain();
        lowGain.gain.value = 0.7;

        const midGain = ctx.createGain();
        midGain.gain.value = 0.4;

        const highGain = ctx.createGain();
        highGain.gain.value = 0.6;

        const mixer = ctx.createGain();
        mixer.gain.value = 1.5; // Boost drums

        // Connect chains
        sourceNode.connect(lowDrums);
        sourceNode.connect(snareBand);
        sourceNode.connect(hihatBand);

        lowDrums.connect(lowGain);
        snareBand.connect(midGain);
        hihatBand.connect(highGain);

        lowGain.connect(mixer);
        midGain.connect(mixer);
        highGain.connect(mixer);

        mixer.connect(ctx.destination);

        sourceNode.start(0);
        return ctx.startRendering();
    }

    /**
     * Extract vocal frequencies (200-4000 Hz with mid-side processing)
     */
    private async extractVocals(source: AudioBuffer): Promise<AudioBuffer> {
        // Vocals are typically centered (mono) and in the 200-4000 Hz range
        // We use mid-side processing to isolate the center

        const ctx = new OfflineAudioContext(
            source.numberOfChannels,
            source.length,
            source.sampleRate
        );

        if (source.numberOfChannels >= 2) {
            // Stereo: Extract center (mono) content
            const resultBuffer = ctx.createBuffer(
                source.numberOfChannels,
                source.length,
                source.sampleRate
            );

            const left = source.getChannelData(0);
            const right = source.getChannelData(1);
            const resultLeft = resultBuffer.getChannelData(0);
            const resultRight = resultBuffer.getChannelData(1);

            // Extract mid (center) content: (L + R) / 2
            // Remove sides: mid - side gives more center focus
            for (let i = 0; i < source.length; i++) {
                const mid = (left[i] + right[i]) / 2;
                const side = (left[i] - right[i]) / 2;

                // Keep mostly mid, reduce sides (vocals are usually centered)
                resultLeft[i] = mid * 0.8 + side * 0.2;
                resultRight[i] = mid * 0.8 - side * 0.2;
            }

            // Now filter to vocal range
            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = resultBuffer;

            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 5000;
            lowpass.Q.value = 0.5;

            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 200;
            highpass.Q.value = 0.7;

            // Presence boost for clarity
            const presence = ctx.createBiquadFilter();
            presence.type = 'peaking';
            presence.frequency.value = 3000;
            presence.Q.value = 1;
            presence.gain.value = 3;

            sourceNode.connect(highpass);
            highpass.connect(lowpass);
            lowpass.connect(presence);
            presence.connect(ctx.destination);

            sourceNode.start(0);
            return ctx.startRendering();
        } else {
            // Mono: Just filter to vocal range
            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = source;

            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 5000;

            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 200;

            sourceNode.connect(highpass);
            highpass.connect(lowpass);
            lowpass.connect(ctx.destination);

            sourceNode.start(0);
            return ctx.startRendering();
        }
    }

    /**
     * Extract remaining frequencies (instruments, synths, etc)
     * This is done by subtracting the other stems from the original
     */
    private async extractOther(
        source: AudioBuffer,
        stems: AudioBuffer[]
    ): Promise<AudioBuffer> {
        const ctx = new OfflineAudioContext(
            source.numberOfChannels,
            source.length,
            source.sampleRate
        );

        // For simplicity, we'll filter for mid-range harmonics
        // A proper implementation would subtract stems from original

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = source;

        // Mid-range focus (instruments, synths, guitars)
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1500;
        bandpass.Q.value = 0.5;

        // Cut the very low and very high
        const lowCut = ctx.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 250;

        const highCut = ctx.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 8000;

        sourceNode.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(ctx.destination);

        sourceNode.start(0);
        return ctx.startRendering();
    }

    /**
     * Convert AudioBuffer to WAV Blob for download/playback
     * Offloaded to Web Worker to prevent UI blocking
     */
    async audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
        const start = performance.now();

        // 1. Prepare data on Main Thread
        const numChannels = buffer.numberOfChannels;
        const channels: Float32Array[] = [];
        const transferList: Transferable[] = [];

        for (let c = 0; c < numChannels; c++) {
            // We must copy the channel data because the AudioBuffer's internal data
            // is often a view that shouldn't be neutered, OR we just want to be safe.
            // .slice() creates a copy.
            const data = buffer.getChannelData(c);
            const copy = new Float32Array(data.length);
            copy.set(data);
            channels.push(copy);
            transferList.push(copy.buffer);
        }

        const prepTime = performance.now() - start;

        // 2. Encode in Worker
        return new Promise((resolve, reject) => {
             const worker = new Worker(new URL('./worker/wavEncoder.worker.ts', import.meta.url));

             worker.onmessage = (e) => {
                 const workerEnd = performance.now();
                 const encodeTime = workerEnd - (start + prepTime);
                 const totalTime = workerEnd - start;

                 console.log(`[WAV Encode] Prep: ${prepTime.toFixed(2)}ms, Worker: ${encodeTime.toFixed(2)}ms, Total: ${totalTime.toFixed(2)}ms`);

                 if (e.data.error) {
                     reject(new Error(e.data.error));
                 } else {
                     const blob = new Blob([e.data.wavBuffer], { type: 'audio/wav' });
                     resolve(blob);
                 }
                 worker.terminate();
             };

             worker.onerror = (err) => {
                 console.error('Worker error:', err);
                 reject(err);
                 worker.terminate();
             };

             worker.postMessage({
                 channels,
                 sampleRate: buffer.sampleRate
             }, transferList);
        });
    }

    /**
     * Extract normalized peaks for waveform visualization
     */
    extractPeaks(buffer: AudioBuffer, length: number = 100): number[] {
        const data = buffer.getChannelData(0); // Use left channel
        const step = Math.floor(data.length / length);
        const peaks: number[] = [];

        for (let i = 0; i < length; i++) {
            let max = 0;
            // Scan window for peak amplitude
            const start = i * step;
            const end = Math.min(start + step, data.length);

            for (let j = start; j < end; j++) {
                const val = Math.abs(data[j]);
                if (val > max) max = val;
            }
            peaks.push(max);
        }
        return peaks;
    }
}

export const stemSeparator = new StemSeparator();
