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

    async initialize() {
        await audioEngine.initialize();
    }

    private getContext(): AudioContext {
        return audioEngine.getContext();
    }

    private getFFT(size: number): FFT {
        if (!this.fftCache.has(size)) {
            this.fftCache.set(size, new FFT(size));
        }
        return this.fftCache.get(size)!;
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
     * Autocorrelation-based pitch detection (YIN-like) optimized with FFT
     */
    private detectPitchAutocorrelation(
        buffer: Float32Array,
        sampleRate: number
    ): { frequency: number; midiNote: number; confidence: number } | null {
        const minFreq = 60;   // ~B1
        const maxFreq = 1200; // ~D6
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);

        const N = buffer.length;
        // Pad to next power of 2 >= 2*N to avoid circular convolution artifacts
        const fftSize = 1 << Math.ceil(Math.log2(2 * N));
        const fft = this.getFFT(fftSize);

        // 1. Calculate Autocorrelation via FFT
        // Input buffer needs to be padded with zeros
        const paddedBuffer = new Float32Array(fftSize);
        paddedBuffer.set(buffer);

        // Forward FFT
        fft.forward(paddedBuffer);

        // Compute Power Spectrum in-place (Real^2 + Imag^2)
        // Store in real part, set imag to 0
        for (let i = 0; i < fftSize; i++) {
            const r = fft.real[i];
            const im = fft.imag[i];
            fft.real[i] = r * r + im * im;
            fft.imag[i] = 0;
        }

        // Inverse FFT to get Autocorrelation
        fft.inverseFromInternal();

        // The autocorrelation result is in fft.real
        // Note: FFT.inverseFromInternal does not scale by 1/N.
        // YIN's difference function uses these terms relative to each other,
        // but we need to match the scale of the energy terms.
        // Standard IFFT result is Sum(X_k * e^...), so it's scaled by N compared to IDFT definition usually.
        // But our implementation does not divide by N.
        // The convolution sum \sum x[j]x[j+tau] should be consistent.
        // Let's rely on the fact that if we use the same scale for energy terms, it's fine.
        // BUT: The energy terms are computed in time domain sum. The FFT convolution result is N times larger?
        // Actually, our IFFT implementation calculates \sum X[k] ..., so it's N times the IDFT.
        // And standard convolution (linear) is just sum of products.
        // The FFT method gives exactly that sum (with floating point error) IF NOT normalized.
        // Wait, standard Parseval/Convolution theorem:
        // x * y <-> X . Y
        // IFFT(X.Y) gives the convolution.
        // If IFFT implementation is \sum, then we might need to be careful.
        // Usually, IFFT = (1/N) * \sum. Our code does just \sum.
        // So we need to divide by fftSize to get the true convolution sum.
        const rScale = 1 / fftSize;
        const autocorr = fft.real; // Reference to internal buffer

        // 2. Calculate Energy Terms (Sum of squares)
        // We need cumulative sum of squares for fast range queries
        // prefixSumSq[k] = sum(x[0]^2 ... x[k-1]^2)
        const prefixSumSq = new Float32Array(N + 1);
        prefixSumSq[0] = 0;
        for (let i = 0; i < N; i++) {
            prefixSumSq[i+1] = prefixSumSq[i] + buffer[i] * buffer[i];
        }

        // 3. Compute Difference Function
        // d(tau) = sum(x[j]^2) + sum(x[j+tau]^2) - 2 * autocorr(tau)
        // summation range j=0 to N-1-tau
        const yinBuffer = new Float32Array(maxPeriod);

        for (let tau = minPeriod; tau < maxPeriod; tau++) {
            // sum(x[j]^2) for j=0 to N-1-tau => prefixSumSq[N-tau] - prefixSumSq[0]
            const term1 = prefixSumSq[N - tau];

            // sum(x[j+tau]^2) for j=0 to N-1-tau => indices tau to N-1 => prefixSumSq[N] - prefixSumSq[tau]
            const term2 = prefixSumSq[N] - prefixSumSq[tau];

            // Autocorrelation at lag tau
            // We need to access index tau.
            const corr = autocorr[tau] * rScale;

            yinBuffer[tau] = term1 + term2 - 2 * corr;
        }

        // Cumulative mean normalized difference (Same as before)
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < maxPeriod; tau++) {
            runningSum += yinBuffer[tau];
            if (runningSum === 0) {
                yinBuffer[tau] = 1;
            } else {
                yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
            }
        }

        // Find first minimum below threshold (Same as before)
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
        // Use optimized FFT
        const magnitudeSpectrum = this.computeMagnitudeSpectrum(buffer);
        const peaks = this.findSpectralPeaks(magnitudeSpectrum, sampleRate);

        // Convert frequencies to MIDI notes
        const midiNotes = peaks
            .filter(f => f > 60 && f < 2000)
            .map(f => Math.round(12 * Math.log2(f / 440) + 69))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique
            .slice(0, 4); // Max 4 notes per chord

        return midiNotes;
    }

    /**
     * Compute Magnitude Spectrum using optimized FFT
     */
    private computeMagnitudeSpectrum(buffer: Float32Array): Float32Array {
        // Find next power of 2
        let size = 1;
        while (size < buffer.length) size <<= 1;

        const fft = this.getFFT(size);

        // Prepare input (pad if necessary, though buffer.length usually is power of 2 in callers)
        // If buffer is smaller, we need to pad.
        let input = buffer;
        if (buffer.length !== size) {
            input = new Float32Array(size);
            input.set(buffer);
        }

        fft.forward(input);

        // Compute magnitude: sqrt(real^2 + imag^2)
        // Result only needed for first N/2 bins (Nyquist)
        const result = new Float32Array(size / 2);
        for (let i = 0; i < size / 2; i++) {
            result[i] = Math.sqrt(fft.real[i] ** 2 + fft.imag[i] ** 2);
        }

        return result;
    }

    /**
     * Find peaks in spectrum
     */
    private findSpectralPeaks(spectrum: Float32Array, sampleRate: number): number[] {
        const peaks: number[] = [];
        // spectrum length is N/2. binWidth = SampleRate / N
        // spectrum.length corresponds to Nyquist (SampleRate/2)
        // So binWidth = (SampleRate / 2) / spectrum.length = SampleRate / (2 * spectrum.length) ?
        // If N=2048, spectrum len=1024.
        // Bin 0 = 0Hz. Bin 1024 = 22050Hz.
        // Width = 22050 / 1024 = 21.5Hz.
        // SampleRate / N = 44100 / 2048 = 21.5Hz. Correct.
        // Original code: binWidth = sampleRate / (spectrum.length * 2);
        // If spectrum.length is N/2, then spectrum.length*2 is N. Correct.
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
        // Wait, original code didn't actually sort, just sliced.
        // The array order is by frequency.
        // To return "top peaks", we should probably sort by magnitude.
        // But original code: return peaks.slice(0, 10); (Lowest frequencies first).
        // I will preserve original behavior unless obviously broken.
        // Actually, detecting harmony usually wants strongest peaks.
        // But let's stick to preserving functionality.
        return peaks.slice(0, 10);
    }

    /**
     * Calculate spectral centroid for drum classification
     */
    private calculateSpectralCentroid(buffer: Float32Array, sampleRate: number): number {
        const fft = this.computeMagnitudeSpectrum(buffer);
        // Note: computeMagnitudeSpectrum returns N/2 bins.
        // Original computeFFT returned N/2 bins.

        const binWidth = sampleRate / (buffer.length);
        // Warning: buffer.length might be different if we padded in computeMagnitudeSpectrum?
        // But here we passed `buffer`.
        // If `buffer` was 1024, fft size is 1024. binWidth = SR/1024.

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
