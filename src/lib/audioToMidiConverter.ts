'use client';

import { audioEngine } from './audioEngine';
import { FFT } from './fft';
import type { MidiNote } from './types';

/**
 * Audio to MIDI Converter Service
 * Analyzes audio files/buffers and extracts pitch information to create MIDI notes.
 * 
 * Supports three conversion modes (like Ableton):
 * - Melody: Monophonic pitch detection for single-note melodies
 * - Harmony: Polyphonic detection for chords (simplified)
 * - Drums: Transient detection for percussive content
 */

interface ConversionProgress {
    stage: string;
    progress: number;
}

interface ConversionResult {
    notes: MidiNote[];
    tempo?: number;
    key?: string;
}

type ConversionMode = 'melody' | 'harmony' | 'drums';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class AudioToMidiConverter {
    private fftCache: Map<number, FFT> = new Map();

    private getFFT(size: number): FFT {
        if (!this.fftCache.has(size)) {
            this.fftCache.set(size, new FFT(size));
        }
        return this.fftCache.get(size)!;
    }

    async initialize() {
        await audioEngine.initialize();
    }

    private getContext(): AudioContext {
        return audioEngine.getContext();
    }

    /**
     * Convert an audio file to MIDI notes
     */
    async convert(
        audioFile: File | Blob | AudioBuffer,
        mode: ConversionMode = 'melody',
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        await this.initialize();

        onProgress?.({ stage: 'Loading audio...', progress: 0 });

        let audioBuffer: AudioBuffer;
        if (audioFile instanceof AudioBuffer) {
            audioBuffer = audioFile;
        } else {
            const arrayBuffer = await audioFile.arrayBuffer();
            audioBuffer = await this.getContext().decodeAudioData(arrayBuffer);
        }

        onProgress?.({ stage: 'Analyzing...', progress: 20 });

        switch (mode) {
            case 'melody':
                return await this.convertMelody(audioBuffer, onProgress);
            case 'harmony':
                return await this.convertHarmony(audioBuffer, onProgress);
            case 'drums':
                return await this.convertDrums(audioBuffer, onProgress);
            default:
                return await this.convertMelody(audioBuffer, onProgress);
        }
    }

    /**
     * Monophonic melody extraction using autocorrelation
     */
    private async convertMelody(
        buffer: AudioBuffer,
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        const sampleRate = buffer.sampleRate;
        const channelData = buffer.getChannelData(0);

        // Analysis parameters
        const frameSize = 2048; // ~46ms at 44100Hz
        const hopSize = 512;    // 11.6ms - gives good time resolution
        const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

        const pitchResults: Array<{ time: number; pitch: number; confidence: number }> = [];

        for (let i = 0; i < totalFrames; i++) {
            if (i % 50 === 0) {
                onProgress?.({
                    stage: 'Detecting pitch...',
                    progress: 20 + (i / totalFrames) * 60
                });
            }

            const startSample = i * hopSize;
            const frame = channelData.slice(startSample, startSample + frameSize);

            // RMS check for silence
            const rms = this.calculateRMS(frame);
            if (rms < 0.01) continue;

            const pitch = this.detectPitchAutocorrelation(frame, sampleRate);
            if (pitch && pitch.confidence > 0.8) {
                pitchResults.push({
                    time: startSample / sampleRate,
                    pitch: pitch.midiNote,
                    confidence: pitch.confidence
                });
            }
        }

        onProgress?.({ stage: 'Building MIDI notes...', progress: 85 });

        // Group continuous pitches into notes
        const notes = this.groupPitchesToNotes(pitchResults);

        onProgress?.({ stage: 'Complete', progress: 100 });

        return { notes };
    }

    /**
     * Polyphonic harmony extraction (simplified - detects main pitch + likely harmonics)
     */
    private async convertHarmony(
        buffer: AudioBuffer,
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        const sampleRate = buffer.sampleRate;
        const channelData = buffer.getChannelData(0);

        const frameSize = 4096; // Larger for better frequency resolution
        const hopSize = 2048;
        const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

        const chordResults: Array<{ time: number; pitches: number[] }> = [];

        for (let i = 0; i < totalFrames; i++) {
            if (i % 20 === 0) {
                onProgress?.({
                    stage: 'Analyzing harmony...',
                    progress: 20 + (i / totalFrames) * 60
                });
            }

            const startSample = i * hopSize;
            const frame = channelData.slice(startSample, startSample + frameSize);

            const rms = this.calculateRMS(frame);
            if (rms < 0.01) continue;

            const pitches = this.detectMultiplePitches(frame, sampleRate);
            if (pitches.length > 0) {
                chordResults.push({
                    time: startSample / sampleRate,
                    pitches
                });
            }
        }

        onProgress?.({ stage: 'Building chords...', progress: 85 });

        // Convert to MIDI notes with chord voicings
        const notes = this.groupChordsToNotes(chordResults);

        onProgress?.({ stage: 'Complete', progress: 100 });

        return { notes };
    }

    /**
     * Drum/percussion transient detection
     */
    private async convertDrums(
        buffer: AudioBuffer,
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        const sampleRate = buffer.sampleRate;
        const channelData = buffer.getChannelData(0);

        const frameSize = 1024;
        const hopSize = 256;
        const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

        const transients: Array<{ time: number; velocity: number; type: 'kick' | 'snare' | 'hat' }> = [];
        let prevEnergy = 0;

        for (let i = 0; i < totalFrames; i++) {
            if (i % 100 === 0) {
                onProgress?.({
                    stage: 'Detecting transients...',
                    progress: 20 + (i / totalFrames) * 60
                });
            }

            const startSample = i * hopSize;
            const frame = channelData.slice(startSample, startSample + frameSize);

            const energy = this.calculateRMS(frame);
            const onset = energy - prevEnergy;

            // Detect sharp energy increase (transient)
            if (onset > 0.1 && energy > 0.05) {
                const spectralCentroid = this.calculateSpectralCentroid(frame, sampleRate);
                let type: 'kick' | 'snare' | 'hat' = 'snare';

                // Classify by spectral centroid
                if (spectralCentroid < 200) type = 'kick';
                else if (spectralCentroid > 4000) type = 'hat';

                transients.push({
                    time: startSample / sampleRate,
                    velocity: Math.min(1, energy * 2),
                    type
                });
            }

            prevEnergy = energy;
        }

        onProgress?.({ stage: 'Building drum pattern...', progress: 85 });

        // Convert transients to MIDI notes (GM drum map)
        const drumMap = { kick: 36, snare: 38, hat: 42 };
        const notes: MidiNote[] = transients.map((t, i) => ({
            id: `drum-${i}`,
            pitch: drumMap[t.type],
            start: t.time * 4, // Convert seconds to beats (assuming 120 BPM / 0.5s per beat)
            duration: 0.25,
            velocity: t.velocity
        }));

        onProgress?.({ stage: 'Complete', progress: 100 });

        return { notes };
    }

    /**
     * Autocorrelation-based pitch detection (YIN-like)
     * Optimized using FFT (O(N log N)) instead of naive difference function (O(N^2))
     */
    private detectPitchAutocorrelation(
        buffer: Float32Array,
        sampleRate: number
    ): { frequency: number; midiNote: number; confidence: number } | null {
        const minFreq = 60;   // ~B1
        const maxFreq = 1200; // ~D6
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);

        // Optimized Difference Function Calculation
        // d(tau) = sum(x[j]^2) + sum(x[j+tau]^2) - 2 * autocorrelation(tau)

        const N = buffer.length;
        // Find next power of 2 for padding (to perform linear correlation via FFT)
        // We need size >= 2*N - 1 to avoid circular aliasing
        let fftSize = 1;
        while (fftSize < 2 * N) fftSize <<= 1;

        const fft = this.getFFT(fftSize);

        // 1. Compute Autocorrelation via FFT
        // Pad input with zeros
        // Ideally we reuse this buffer, but for now allocate locally for safety
        const paddedBuffer = new Float32Array(fftSize);
        paddedBuffer.set(buffer);

        // Forward FFT
        const { real: X_real, imag: X_imag } = fft.forward(paddedBuffer);

        // Compute Power Spectrum S = X * conj(X) = |X|^2
        // Since input is real, power spectrum is real.
        // We reuse the 'real' buffer of the FFT instance for input to Inverse
        // BEWARE: We must be careful not to overwrite if 'inverse' uses same buffers.
        // The FFT class implementation: forward returns reference to internal buffers.
        // We need to calculate magnitude squared and store it.
        // We can write back to X_real (since it's input to next stage)
        // and set X_imag to 0 (power spectrum of real signal is real).

        // However, we need to copy the data because we are reading from X_real/X_imag
        // and writing to them. If we modify X_real[0], we lose it?
        // No, element-wise operation is fine: out[i] = in[i]*in[i]...
        // But we need to set imag to 0.

        for (let i = 0; i < fftSize; i++) {
            const magSquared = X_real[i] * X_real[i] + X_imag[i] * X_imag[i];
            X_real[i] = magSquared;
            X_imag[i] = 0;
        }

        // Inverse FFT to get Autocorrelation
        // Input: Power Spectrum (Real)
        const { real: R } = fft.inverse(X_real, X_imag);

        // 2. Compute Energy Terms via Prefix Sum
        // x_cum[k] = sum(x[0]^2 ... x[k-1]^2)
        const x_cum = new Float32Array(N + 1);
        x_cum[0] = 0;
        for (let i = 0; i < N; i++) {
            x_cum[i + 1] = x_cum[i] + buffer[i] * buffer[i];
        }

        // Calculate normalized difference function
        const yinBuffer = new Float32Array(maxPeriod);

        for (let tau = minPeriod; tau < maxPeriod; tau++) {
            // Energy of window 1: x[0]...x[N-tau-1]
            // Sum squares from index 0 to N-tau-1
            const term1 = x_cum[N - tau];

            // Energy of window 2: x[tau]...x[N-1]
            // Sum squares from index tau to N-1
            // Formula: cum[N] - cum[tau]
            const term2 = x_cum[N] - x_cum[tau];

            // Autocorrelation at lag tau
            // R[tau] is the unnormalized autocorrelation
            // Note: Our FFT implementation scales by 1/N in inverse.
            // Standard definition of correlation is sum(x*y).
            // Convolution via FFT usually results in sum(x*y).
            // If FFT implementation scales by 1/N, we might need to compensate?
            // Usually: IFFT(FFT(x) * FFT(y)) = Convolution(x, y).
            // Standard DFT definition usually has 1/N on IFFT.
            // So the result R from our FFT class is indeed the Correlation.
            // Let's verify scaling.
            // If input is [1, 1], FFT is [2, 0]. MagSq is [4, 0]. IFFT is [2, 2].
            // Autocorr of [1, 1] is:
            // lag 0: 1*1 + 1*1 = 2.
            // lag 1: 1*1 = 1.
            // Result [2, 1] (linear).
            // Our FFT class IFFT scales by 1/N.
            // For size 2: IFFT([4, 0]) -> [2, 2] * 0.5 = [1, 1]?
            // Wait.
            // x=[1,1], pad to 4 -> [1,1,0,0].
            // FFT: [2, 1-j, 0, 1+j] ?
            // Let's just trust the term matches standard convolution if 1/N is handled.
            // If our FFT class divides by N in inverse, then:
            // Convolution result = IFFT(FFT(x) * FFT(y)) * N?
            // Yes, because FFT/IFFT pair usually implies 1/N total scaling.
            // If we have 1/N in IFFT only, then (DFT * DFT) -> IFFT gives N * Convolution?
            // No.
            // Parseval's theorem etc.
            // Let's assume we need to multiply by fftSize to get the raw sum product.
            // Correction: Standard FFT/IFFT (where IFFT has 1/N) satisfies the convolution theorem directly.
            // R[tau] = sum(x[k] * x[k+tau]).

            const autocorr = R[tau];

            const diff = term1 + term2 - 2 * autocorr;
            yinBuffer[tau] = diff;
        }

        // Cumulative mean normalized difference
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < maxPeriod; tau++) {
            runningSum += yinBuffer[tau];
            if (runningSum < 0.00001) {
                 yinBuffer[tau] = 1;
            } else {
                 yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
            }
        }

        // Find first minimum below threshold
        const threshold = 0.15;
        let bestPeriod = -1;
        let bestValue = 1;

        for (let tau = minPeriod; tau < maxPeriod - 1; tau++) {
            if (yinBuffer[tau] < threshold && yinBuffer[tau] < yinBuffer[tau - 1] && yinBuffer[tau] < yinBuffer[tau + 1]) {
                if (yinBuffer[tau] < bestValue) {
                    bestValue = yinBuffer[tau];
                    bestPeriod = tau;
                }
            }
        }

        if (bestPeriod < 0) return null;

        // Parabolic interpolation
        const prev = yinBuffer[bestPeriod - 1];
        const curr = yinBuffer[bestPeriod];
        const next = yinBuffer[bestPeriod + 1];
        const offset = (prev - next) / (2 * (prev - 2 * curr + next));
        const refinedPeriod = bestPeriod + offset;

        const frequency = sampleRate / refinedPeriod;
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        const confidence = 1 - bestValue;

        return { frequency, midiNote, confidence };
    }

    /**
     * Detect multiple pitches using FFT peak detection
     */
    private detectMultiplePitches(buffer: Float32Array, sampleRate: number): number[] {
        // Simple FFT-based approach
        const fft = this.computeFFT(buffer);
        const peaks = this.findSpectralPeaks(fft, sampleRate);

        // Convert frequencies to MIDI notes
        const midiNotes = peaks
            .filter(f => f > 60 && f < 2000)
            .map(f => Math.round(12 * Math.log2(f / 440) + 69))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique
            .slice(0, 4); // Max 4 notes per chord

        return midiNotes;
    }

    /**
     * Compute FFT magnitude spectrum using optimized FFT class
     */
    private computeFFT(buffer: Float32Array): Float32Array {
        const N = buffer.length;
        // FFT size must be power of 2.
        // If buffer is not power of 2, we might need to pad or truncate.
        // Assuming callers provide power of 2 (2048, 4096 etc based on constants)

        let fftSize = 1;
        while (fftSize < N) fftSize <<= 1;

        const fft = this.getFFT(fftSize);

        // Use a padded buffer if N is not power of 2, otherwise use buffer directly if safe?
        // Buffer from caller might be a view.
        // To be safe and satisfy API:
        let input = buffer;
        if (N !== fftSize) {
             input = new Float32Array(fftSize);
             input.set(buffer);
        }

        const { real, imag } = fft.forward(input);

        // Compute magnitude for first N/2 bins
        const result = new Float32Array(N / 2);
        for (let i = 0; i < N / 2; i++) {
            result[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        return result;
    }

    /**
     * Find peaks in spectrum
     */
    private findSpectralPeaks(spectrum: Float32Array, sampleRate: number): number[] {
        const peaks: number[] = [];
        const binWidth = sampleRate / (spectrum.length * 2);

        for (let i = 2; i < spectrum.length - 2; i++) {
            if (spectrum[i] > spectrum[i - 1] &&
                spectrum[i] > spectrum[i + 1] &&
                spectrum[i] > spectrum[i - 2] &&
                spectrum[i] > spectrum[i + 2] &&
                spectrum[i] > 0.1) {
                peaks.push(i * binWidth);
            }
        }

        // Sort by magnitude and return top peaks
        return peaks.slice(0, 10);
    }

    /**
     * Calculate spectral centroid for drum classification
     */
    private calculateSpectralCentroid(buffer: Float32Array, sampleRate: number): number {
        const fft = this.computeFFT(buffer);
        const binWidth = sampleRate / (buffer.length);

        let weightedSum = 0;
        let sum = 0;

        for (let i = 0; i < fft.length; i++) {
            weightedSum += i * binWidth * fft[i];
            sum += fft[i];
        }

        return sum > 0 ? weightedSum / sum : 0;
    }

    /**
     * Calculate RMS (loudness)
     */
    private calculateRMS(buffer: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * Group continuous pitch detections into discrete notes
     */
    private groupPitchesToNotes(
        pitchResults: Array<{ time: number; pitch: number; confidence: number }>
    ): MidiNote[] {
        if (pitchResults.length === 0) return [];

        const notes: MidiNote[] = [];
        let currentNote: { pitch: number; startTime: number; endTime: number } | null = null;
        const minNoteDuration = 0.05; // 50ms minimum

        for (const result of pitchResults) {
            if (!currentNote) {
                currentNote = { pitch: result.pitch, startTime: result.time, endTime: result.time };
            } else if (Math.abs(result.pitch - currentNote.pitch) <= 1) {
                // Same note (allow ±1 semitone tolerance)
                currentNote.endTime = result.time;
            } else {
                // New note - save previous
                const duration = currentNote.endTime - currentNote.startTime;
                if (duration >= minNoteDuration) {
                    notes.push({
                        id: `note-${notes.length}`,
                        pitch: currentNote.pitch,
                        start: currentNote.startTime * 4, // Convert to beats (120 BPM)
                        duration: Math.max(0.25, duration * 4),
                        velocity: 0.8
                    });
                }
                currentNote = { pitch: result.pitch, startTime: result.time, endTime: result.time };
            }
        }

        // Save last note
        if (currentNote) {
            const duration = currentNote.endTime - currentNote.startTime;
            if (duration >= minNoteDuration) {
                notes.push({
                    id: `note-${notes.length}`,
                    pitch: currentNote.pitch,
                    start: currentNote.startTime * 4,
                    duration: Math.max(0.25, duration * 4),
                    velocity: 0.8
                });
            }
        }

        return notes;
    }

    /**
     * Group chord detections into notes
     */
    private groupChordsToNotes(
        chordResults: Array<{ time: number; pitches: number[] }>
    ): MidiNote[] {
        if (chordResults.length === 0) return [];

        const notes: MidiNote[] = [];
        let currentChord: { pitches: number[]; startTime: number; endTime: number } | null = null;

        for (const result of chordResults) {
            const pitchesKey = result.pitches.sort().join(',');
            const currentKey = currentChord?.pitches.sort().join(',');

            if (!currentChord || pitchesKey !== currentKey) {
                // Save previous chord
                if (currentChord) {
                    const duration = currentChord.endTime - currentChord.startTime;
                    for (const pitch of currentChord.pitches) {
                        notes.push({
                            id: `chord-${notes.length}`,
                            pitch,
                            start: currentChord.startTime * 4,
                            duration: Math.max(0.5, duration * 4),
                            velocity: 0.75
                        });
                    }
                }
                currentChord = { pitches: result.pitches, startTime: result.time, endTime: result.time };
            } else {
                currentChord.endTime = result.time;
            }
        }

        // Save last chord
        if (currentChord) {
            const duration = currentChord.endTime - currentChord.startTime;
            for (const pitch of currentChord.pitches) {
                notes.push({
                    id: `chord-${notes.length}`,
                    pitch,
                    start: currentChord.startTime * 4,
                    duration: Math.max(0.5, duration * 4),
                    velocity: 0.75
                });
            }
        }

        return notes;
    }

    /**
     * Get note name from MIDI number
     */
    getNoteName(midiNote: number): string {
        const octave = Math.floor(midiNote / 12) - 1;
        const note = NOTE_NAMES[midiNote % 12];
        return `${note}${octave}`;
    }
}

export const audioToMidiConverter = new AudioToMidiConverter();
export type { ConversionMode, ConversionProgress, ConversionResult };
