
import { FFT } from '../fft';
import type { MidiNote } from '../types';

// Worker Message Types
export type WorkerRequest = {
    id: number;
    type: 'convert';
    buffer: Float32Array; // Channel data
    sampleRate: number;
    mode: 'melody' | 'harmony' | 'drums';
};

export type WorkerResponse = {
    id: number;
    type: 'result' | 'progress' | 'error';
    data?: any;
    progress?: { stage: string; value: number };
    error?: string;
};

const ctx: Worker = self as any;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, type, buffer, sampleRate, mode } = event.data;

    if (type !== 'convert') return;

    try {
        const result = await processAudio(buffer, sampleRate, mode, (stage, value) => {
            ctx.postMessage({
                id,
                type: 'progress',
                progress: { stage, value }
            });
        });

        ctx.postMessage({
            id,
            type: 'result',
            data: result
        });
    } catch (e: any) {
        ctx.postMessage({
            id,
            type: 'error',
            error: e.message || 'Unknown error during conversion'
        });
    }
};

interface ConversionResult {
    notes: MidiNote[];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

async function processAudio(
    channelData: Float32Array,
    sampleRate: number,
    mode: 'melody' | 'harmony' | 'drums',
    onProgress: (stage: string, progress: number) => void
): Promise<ConversionResult> {

    // We can yield to the event loop occasionally if needed, but in a worker it's less critical.
    // However, for progress updates to actually send, strictly synchronous tight loops might block posting?
    // In workers, postMessage is usually fine.

    switch (mode) {
        case 'melody':
            return convertMelody(channelData, sampleRate, onProgress);
        case 'harmony':
            return convertHarmony(channelData, sampleRate, onProgress);
        case 'drums':
            return convertDrums(channelData, sampleRate, onProgress);
        default:
            return convertMelody(channelData, sampleRate, onProgress);
    }
}

// --- Logic Ported & Optimized ---

function convertMelody(
    channelData: Float32Array,
    sampleRate: number,
    onProgress: (stage: string, progress: number) => void
): ConversionResult {
    const frameSize = 2048;
    const hopSize = 512;
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

    const pitchResults: Array<{ time: number; pitch: number; confidence: number }> = [];

    for (let i = 0; i < totalFrames; i++) {
        if (i % 50 === 0) {
            onProgress('Detecting pitch...', 20 + (i / totalFrames) * 60);
        }

        const startSample = i * hopSize;
        const frame = channelData.slice(startSample, startSample + frameSize);

        const rms = calculateRMS(frame);
        if (rms < 0.01) continue;

        const pitch = detectPitchAutocorrelation(frame, sampleRate);
        if (pitch && pitch.confidence > 0.8) {
            pitchResults.push({
                time: startSample / sampleRate,
                pitch: pitch.midiNote,
                confidence: pitch.confidence
            });
        }
    }

    onProgress('Building MIDI notes...', 85);
    const notes = groupPitchesToNotes(pitchResults);
    onProgress('Complete', 100);

    return { notes };
}

function convertHarmony(
    channelData: Float32Array,
    sampleRate: number,
    onProgress: (stage: string, progress: number) => void
): ConversionResult {
    const frameSize = 4096;
    const hopSize = 2048;
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

    const chordResults: Array<{ time: number; pitches: number[] }> = [];

    // Create FFT instance once (O(1) allocation overhead)
    const fft = new FFT(frameSize);

    for (let i = 0; i < totalFrames; i++) {
        if (i % 20 === 0) {
            onProgress('Analyzing harmony...', 20 + (i / totalFrames) * 60);
        }

        const startSample = i * hopSize;
        const frame = channelData.slice(startSample, startSample + frameSize);

        const rms = calculateRMS(frame);
        if (rms < 0.01) continue;

        const pitches = detectMultiplePitches(frame, sampleRate, fft);
        if (pitches.length > 0) {
            chordResults.push({
                time: startSample / sampleRate,
                pitches
            });
        }
    }

    onProgress('Building chords...', 85);
    const notes = groupChordsToNotes(chordResults);
    onProgress('Complete', 100);

    return { notes };
}

function convertDrums(
    channelData: Float32Array,
    sampleRate: number,
    onProgress: (stage: string, progress: number) => void
): ConversionResult {
    const frameSize = 1024;
    const hopSize = 256;
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

    const transients: Array<{ time: number; velocity: number; type: 'kick' | 'snare' | 'hat' }> = [];
    let prevEnergy = 0;

    // Create FFT instance
    const fft = new FFT(frameSize);

    for (let i = 0; i < totalFrames; i++) {
        if (i % 100 === 0) {
            onProgress('Detecting transients...', 20 + (i / totalFrames) * 60);
        }

        const startSample = i * hopSize;
        const frame = channelData.slice(startSample, startSample + frameSize);

        const energy = calculateRMS(frame);
        const onset = energy - prevEnergy;

        if (onset > 0.1 && energy > 0.05) {
            const spectralCentroid = calculateSpectralCentroid(frame, sampleRate, fft);
            let type: 'kick' | 'snare' | 'hat' = 'snare';

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

    onProgress('Building drum pattern...', 85);
    const drumMap = { kick: 36, snare: 38, hat: 42 };
    const notes: MidiNote[] = transients.map((t, i) => ({
        id: `drum-${i}`,
        pitch: drumMap[t.type],
        start: t.time * 4,
        duration: 0.25,
        velocity: t.velocity
    }));
    onProgress('Complete', 100);

    return { notes };
}

// --- Helpers ---

function calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
}

function detectPitchAutocorrelation(
    buffer: Float32Array,
    sampleRate: number
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    const yinBuffer = new Float32Array(maxPeriod);

    for (let tau = minPeriod; tau < maxPeriod; tau++) {
        let sum = 0;
        for (let j = 0; j < buffer.length - tau; j++) {
            const diff = buffer[j] - buffer[j + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
    }

    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < maxPeriod; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
    }

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

function detectMultiplePitches(buffer: Float32Array, sampleRate: number, fft: FFT): number[] {
    // Use Optimized FFT
    const spectrum = fft.forward(buffer);
    const peaks = findSpectralPeaks(spectrum, sampleRate, buffer.length);

    return peaks
        .filter(f => f > 60 && f < 2000)
        .map(f => Math.round(12 * Math.log2(f / 440) + 69))
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 4);
}

function findSpectralPeaks(spectrum: Float32Array, sampleRate: number, bufferSize: number): number[] {
    const peaks: number[] = [];
    const binWidth = sampleRate / bufferSize; // N, not N/2, because FFT size is N

    for (let i = 2; i < spectrum.length - 2; i++) {
        if (spectrum[i] > spectrum[i - 1] &&
            spectrum[i] > spectrum[i + 1] &&
            spectrum[i] > spectrum[i - 2] &&
            spectrum[i] > spectrum[i + 2] &&
            spectrum[i] > 0.1) {
            peaks.push(i * binWidth);
        }
    }

    return peaks.slice(0, 10);
}

function calculateSpectralCentroid(buffer: Float32Array, sampleRate: number, fft: FFT): number {
    const spectrum = fft.forward(buffer);
    const binWidth = sampleRate / buffer.length;

    let weightedSum = 0;
    let sum = 0;

    for (let i = 0; i < spectrum.length; i++) {
        weightedSum += i * binWidth * spectrum[i];
        sum += spectrum[i];
    }

    return sum > 0 ? weightedSum / sum : 0;
}

function groupPitchesToNotes(
    pitchResults: Array<{ time: number; pitch: number; confidence: number }>
): MidiNote[] {
    if (pitchResults.length === 0) return [];

    const notes: MidiNote[] = [];
    let currentNote: { pitch: number; startTime: number; endTime: number } | null = null;
    const minNoteDuration = 0.05;

    for (const result of pitchResults) {
        if (!currentNote) {
            currentNote = { pitch: result.pitch, startTime: result.time, endTime: result.time };
        } else if (Math.abs(result.pitch - currentNote.pitch) <= 1) {
            currentNote.endTime = result.time;
        } else {
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
            currentNote = { pitch: result.pitch, startTime: result.time, endTime: result.time };
        }
    }

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

function groupChordsToNotes(
    chordResults: Array<{ time: number; pitches: number[] }>
): MidiNote[] {
    if (chordResults.length === 0) return [];

    const notes: MidiNote[] = [];
    let currentChord: { pitches: number[]; startTime: number; endTime: number } | null = null;

    for (const result of chordResults) {
        const pitchesKey = result.pitches.sort().join(',');
        const currentKey = currentChord?.pitches.sort().join(',');

        if (!currentChord || pitchesKey !== currentKey) {
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
