'use client';

import { audioEngine } from './audioEngine';
import type { MidiNote } from './types';
import { FFT } from './fft';

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

interface FFTContext {
    fft: FFT;
    real: Float32Array;
    imag: Float32Array;
}

class AudioToMidiConverter {
    private fftCache: Map<number, FFTContext> = new Map();

    async initialize() {
        await audioEngine.initialize();
    }

    private getContext(): AudioContext {
        return audioEngine.getContext();
    }

    private getFFTContext(size: number): FFTContext {
        let context = this.fftCache.get(size);
        if (!context) {
            const fft = new FFT(size);
            const { real, imag } = fft.createComplexArray();
            context = { fft, real, imag };
            this.fftCache.set(size, context);
        }
        return context;
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

        // Pre-allocate buffer for power terms in YIN algorithm
        // frameSize is 2048. We need Float32Array(frameSize + 1)
        const powerTerms = new Float32Array(frameSize + 1);

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

            const pitch = this.detectPitchAutocorrelation(frame, sampleRate, powerTerms);
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
     * Optimized Autocorrelation-based pitch detection (Fast YIN)
     */
    private detectPitchAutocorrelation(
        buffer: Float32Array,
        sampleRate: number,
        powerTerms?: Float32Array // Optional reusable buffer
    ): { frequency: number; midiNote: number; confidence: number } | null {
        const minFreq = 60;   // ~B1
        const maxFreq = 1200; // ~D6
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);
        const n = buffer.length;

        // FFT size must be power of 2 and >= n + maxPeriod
        // For n=2048, maxPeriod~735, we need 4096
        const fftSize = 4096;
        // Ensure buffer length + maxPeriod fits in fftSize?
        // If buffer is larger than expected (e.g. if params change), logic might break.
        // But frameSize is hardcoded to 2048 in convertMelody.

        const { fft, real, imag } = this.getFFTContext(fftSize);

        // 1. Calculate Power Terms (Prefix Sums)
        const pTerms = powerTerms || new Float32Array(n + 1);
        let currentSum = 0;
        pTerms[0] = 0;
        for (let i = 0; i < n; i++) {
            const val = buffer[i];
            currentSum += val * val;
            pTerms[i + 1] = currentSum;
        }

        // 2. FFT Convolution for Autocorrelation
        // Zero out buffers
        real.fill(0);
        imag.fill(0);

        // Copy buffer into real part (padded with zeros naturally by fill/set)
        real.set(buffer);

        fft.forward(real, imag);

        // Compute Power Spectrum
        for (let i = 0; i < fftSize; i++) {
            const r = real[i];
            const im = imag[i];
            real[i] = r * r + im * im;
            imag[i] = 0;
        }

        fft.inverse(real, imag);

        // 3. Difference Function
        const yinBuffer = new Float32Array(maxPeriod);

        for (let tau = minPeriod; tau < maxPeriod; tau++) {
            // Term 1: P[N-tau]
            const term1 = pTerms[n - tau];
            // Term 2: P[N] - P[tau]
            const term2 = pTerms[n] - pTerms[tau];
            // Term 3: 2 * Autocorr[tau]
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
        // FFT-based approach
        const spectrum = this.getMagnitudeSpectrum(buffer);
        const peaks = this.findSpectralPeaks(spectrum, sampleRate);

        // Convert frequencies to MIDI notes
        const midiNotes = peaks
            .filter(f => f > 60 && f < 2000)
            .map(f => Math.round(12 * Math.log2(f / 440) + 69))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique
            .slice(0, 4); // Max 4 notes per chord

        return midiNotes;
    }

    /**
     * Computes Magnitude Spectrum using optimized FFT
     */
    private getMagnitudeSpectrum(buffer: Float32Array): Float32Array {
        const size = buffer.length;
        const { fft, real, imag } = this.getFFTContext(size);

        // Copy buffer
        real.set(buffer);
        imag.fill(0);

        fft.forward(real, imag);

        // Calculate magnitude for first N/2 bins
        const result = new Float32Array(size / 2);
        for (let k = 0; k < size / 2; k++) {
            result[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
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
        const spectrum = this.getMagnitudeSpectrum(buffer);
        const binWidth = sampleRate / (buffer.length);

        let weightedSum = 0;
        let sum = 0;

        for (let i = 0; i < spectrum.length; i++) {
            weightedSum += i * binWidth * spectrum[i];
            sum += spectrum[i];
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
