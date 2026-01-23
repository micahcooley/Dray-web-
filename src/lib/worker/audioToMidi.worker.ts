import { FFT } from '../fft';
import type { MidiNote } from '../types';

interface ConversionProgress {
    stage: string;
    progress: number;
}

interface WorkerMessage {
    id: number;
    type: 'convert';
    mode: 'melody' | 'harmony' | 'drums';
    buffer: Float32Array;
    sampleRate: number;
}

interface WorkerResponse {
    id: number;
    type: 'result' | 'progress' | 'error';
    data?: any;
    error?: string;
}

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { id, type, mode, buffer, sampleRate } = e.data;

    if (type === 'convert') {
        try {
            const onProgress = (p: ConversionProgress) => {
                ctx.postMessage({
                    id,
                    type: 'progress',
                    data: p
                });
            };

            let result;
            switch (mode) {
                case 'melody':
                    result = convertMelody(buffer, sampleRate, onProgress);
                    break;
                case 'harmony':
                    result = convertHarmony(buffer, sampleRate, onProgress);
                    break;
                case 'drums':
                    result = convertDrums(buffer, sampleRate, onProgress);
                    break;
                default:
                    throw new Error(`Unknown mode: ${mode}`);
            }

            ctx.postMessage({
                id,
                type: 'result',
                data: result
            });
        } catch (err: any) {
            ctx.postMessage({
                id,
                type: 'error',
                error: err.message
            });
        }
    }
};

// --- Conversion Logic ---

function convertMelody(
    channelData: Float32Array,
    sampleRate: number,
    onProgress?: (progress: ConversionProgress) => void
) {
    // Analysis parameters
    const frameSize = 2048; // ~46ms at 44100Hz
    const hopSize = 512;    // 11.6ms
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

    onProgress?.({ stage: 'Building MIDI notes...', progress: 85 });

    const notes = groupPitchesToNotes(pitchResults);

    onProgress?.({ stage: 'Complete', progress: 100 });

    return { notes };
}

function convertHarmony(
    channelData: Float32Array,
    sampleRate: number,
    onProgress?: (progress: ConversionProgress) => void
) {
    const frameSize = 4096;
    const hopSize = 2048;
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

    const chordResults: Array<{ time: number; pitches: number[] }> = [];

    // Initialize FFT once
    const fft = new FFT(frameSize);

    for (let i = 0; i < totalFrames; i++) {
        if (i % 20 === 0) {
            onProgress?.({
                stage: 'Analyzing harmony...',
                progress: 20 + (i / totalFrames) * 60
            });
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

    onProgress?.({ stage: 'Building chords...', progress: 85 });

    const notes = groupChordsToNotes(chordResults);

    onProgress?.({ stage: 'Complete', progress: 100 });

    return { notes };
}

function convertDrums(
    channelData: Float32Array,
    sampleRate: number,
    onProgress?: (progress: ConversionProgress) => void
) {
    const frameSize = 1024;
    const hopSize = 256;
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

    const transients: Array<{ time: number; velocity: number; type: 'kick' | 'snare' | 'hat' }> = [];
    let prevEnergy = 0;

    // Initialize FFT once
    const fft = new FFT(frameSize);

    for (let i = 0; i < totalFrames; i++) {
        if (i % 100 === 0) {
            onProgress?.({
                stage: 'Detecting transients...',
                progress: 20 + (i / totalFrames) * 60
            });
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

    onProgress?.({ stage: 'Building drum pattern...', progress: 85 });

    const drumMap = { kick: 36, snare: 38, hat: 42 };
    const notes: MidiNote[] = transients.map((t, i) => ({
        id: `drum-${i}`,
        pitch: drumMap[t.type],
        start: t.time * 4,
        duration: 0.25,
        velocity: t.velocity
    }));

    onProgress?.({ stage: 'Complete', progress: 100 });

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
    // Use optimized FFT
    const spectrum = fft.getMagnitudeSpectrum(buffer);
    const peaks = findSpectralPeaks(spectrum, sampleRate, buffer.length);

    const midiNotes = peaks
        .filter(f => f > 60 && f < 2000)
        .map(f => Math.round(12 * Math.log2(f / 440) + 69))
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 4);

    return midiNotes;
}

function findSpectralPeaks(spectrum: Float32Array, sampleRate: number, fftSize: number): number[] {
    const peaks: number[] = [];
    const binWidth = sampleRate / fftSize; // fftSize is full window size (N)

    for (let i = 2; i < spectrum.length - 2; i++) {
        if (spectrum[i] > spectrum[i - 1] &&
            spectrum[i] > spectrum[i + 1] &&
            spectrum[i] > spectrum[i - 2] &&
            spectrum[i] > spectrum[i + 2] &&
            spectrum[i] > 0.1) {
            peaks.push(i * binWidth);
        }
    }

    // Sort by magnitude? Logic in original code didn't explicit sort but sliced.
    // However, finding "top peaks" implies sorting.
    // Original code: return peaks.slice(0, 10). It did not sort.
    // I should probably sort to be better, but "Precise Optimization" says preserve functionality.
    // Wait, original comment said "Sort by magnitude and return top peaks" but the code was just `return peaks.slice(0, 10)`.
    // It seems the implementation was missing the sort.
    // I will add the sort as it makes sense for "top peaks".

    // To sort, I need indices or values.
    // Let's stick to original behavior (no sort) to be safe, OR fix it if it was a bug.
    // The comment says "Sort by magnitude", so the intent was to sort.
    // I'll leave it as is to avoid changing behavior too much, unless I see it's critical.
    // Actually, `convertHarmony` works better with strongest peaks.
    // I will NOT add sort to strictly follow "Preserve existing functionality exactly" unless clearly broken.
    // But since I'm rewriting, I might as well fix obvious bugs?
    // User said "Preserve existing functionality exactly". The "bug" might be a feature (lower freq peaks first).
    // I will stick to exact logic: no sort.

    return peaks.slice(0, 10);
}

function calculateSpectralCentroid(buffer: Float32Array, sampleRate: number, fft: FFT): number {
    const spectrum = fft.getMagnitudeSpectrum(buffer);
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
