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

    private getFFT(size: number): FFT {
        let fft = this.fftCache.get(size);
        if (!fft) {
            // Find next power of 2 if not already
            if (!Number.isInteger(Math.log2(size))) {
                let p2 = 1;
                while (p2 < size) p2 <<= 1;
                size = p2;
                // If we resized, check cache again?
                // No, the caller expects an FFT that can handle 'size'.
                // My FFT class requires size to be power of 2.
                // If the input buffer size isn't power of 2, the caller should pad it or we handle it.
                // However, the helper 'computeFFTMagnitude' handles copying.
                // But for caching, we should use the power-of-2 size as key.
            }
            fft = this.fftCache.get(size);
            if (!fft) {
                fft = new FFT(size);
                this.fftCache.set(size, fft);
            }
        }
        return fft;
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
     * Autocorrelation-based pitch detection (YIN-like) - Optimized with FFT
     */
    private detectPitchAutocorrelation(
        buffer: Float32Array,
        sampleRate: number
    ): { frequency: number; midiNote: number; confidence: number } | null {
        const minFreq = 60;   // ~B1
        const maxFreq = 1200; // ~D6
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);

        const n = buffer.length;

        // 1. Calculate Difference Function using FFT (Fast YIN)
        // d(tau) = sum(x[j]^2) + sum(x[j+tau]^2) - 2 * sum(x[j]*x[j+tau])

        // Determine FFT size (power of 2 >= n + maxPeriod)
        let fftSize = 1;
        while (fftSize < n + maxPeriod) fftSize <<= 1;

        const fft = this.getFFT(fftSize);

        // Precompute energy terms (prefix sum of squares)
        const prefixSumSq = new Float32Array(n + 1);
        prefixSumSq[0] = 0;
        for (let i = 0; i < n; i++) {
            prefixSumSq[i + 1] = prefixSumSq[i] + buffer[i] * buffer[i];
        }

        // Compute Correlation via FFT
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);

        // Copy buffer into real part (padded with zeros)
        real.set(buffer);

        fft.forward(real, imag);

        // Compute Power Spectrum for Autocorrelation
        for (let i = 0; i < fftSize; i++) {
            const r = real[i];
            const im = imag[i];
            real[i] = r * r + im * im;
            imag[i] = 0;
        }

        fft.inverse(real, imag);

        // Assemble difference function
        const yinBuffer = new Float32Array(maxPeriod);

        for (let tau = minPeriod; tau < maxPeriod; tau++) {
            // Term 1: Sum of squares of x[0...n-tau-1]
            const term1 = prefixSumSq[n - tau];

            // Term 2: Sum of squares of x[tau...n-1]
            const term2 = prefixSumSq[n] - prefixSumSq[tau];

            // Term 3: 2 * Correlation[tau]
            const term3 = 2 * real[tau];

            yinBuffer[tau] = term1 + term2 - term3;
        }

        // Cumulative mean normalized difference
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < maxPeriod; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
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
        const fft = this.computeFFTMagnitude(buffer);
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
     * Compute FFT Magnitude spectrum using optimized FFT
     */
    private computeFFTMagnitude(buffer: Float32Array): Float32Array {
        // Determine size (next power of 2)
        let size = 1;
        while (size < buffer.length) size <<= 1;

        const fft = this.getFFT(size);

        const real = new Float32Array(size);
        const imag = new Float32Array(size);

        // Copy buffer (zero-padded)
        real.set(buffer);

        fft.forward(real, imag);

        // Return first half (magnitude)
        // Note: Using size/2 or buffer.length/2?
        // Original code returned buffer.length / 2.
        // If we padded, the bins resolution changes.
        // Original code did a DFT of size N (buffer.length).
        // If we pad to next power of 2, say 1024 to 2048, bins are closer.
        // We should probably return the full useful spectrum up to Nyquist relative to 'size'.
        // But downstream expects bins corresponding to original size?
        // Actually, findSpectralPeaks uses binWidth = sampleRate / (spectrum.length * 2).
        // If spectrum.length changes, binWidth changes.
        // So we just need to return consistent spectrum.
        const outputSize = size / 2;
        const result = new Float32Array(outputSize);

        for (let i = 0; i < outputSize; i++) {
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
        const fft = this.computeFFTMagnitude(buffer);
        // computeFFTMagnitude returns size/2 bins.
        // If buffer was 1024, fft size is 512.
        // Original computeFFT returned 512.
        // But if buffer was not power of 2, we padded.
        // Here buffer is 1024 (frameSize in convertDrums). So no padding.
        // Bin width: sampleRate / FFT_SIZE.
        // FFT_SIZE is 2 * fft.length.
        const binWidth = sampleRate / (fft.length * 2);

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
