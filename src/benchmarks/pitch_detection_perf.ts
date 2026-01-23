
import { performance } from 'perf_hooks';
import { FFT } from '../lib/fft';

// Baseline O(N^2)
function detectPitchAutocorrelationBaseline(
    buffer: Float32Array,
    sampleRate: number
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    // Allocate extra space to avoid out-of-bounds access
    const yinBuffer = new Float32Array(maxPeriod + 1);

    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        let sum = 0;
        for (let j = 0; j < buffer.length - tau; j++) {
            const diff = buffer[j] - buffer[j + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
    }

    // Post-processing
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxPeriod; tau++) {
        runningSum += yinBuffer[tau];
        if (runningSum > 0) {
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
        } else {
            yinBuffer[tau] = 1;
        }
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
    const denominator = 2 * (prev - 2 * curr + next);
    const offset = Math.abs(denominator) > 1e-10 ? (prev - next) / denominator : 0;
    const refinedPeriod = bestPeriod + offset;

    const frequency = sampleRate / refinedPeriod;
    const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
    const confidence = 1 - bestValue;

    return { frequency, midiNote, confidence };
}

// Optimized FFT-based
// Note: We accept pre-allocated buffers/fft to demonstrate potential
function detectPitchOptimized(
    buffer: Float32Array,
    sampleRate: number,
    fft: FFT,
    realBuffer: Float32Array,
    imagBuffer: Float32Array,
    powerTerms: Float32Array
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);
    const n = buffer.length;

    // 1. Calculate Power Terms (Prefix Sums)
    let currentSum = 0;
    powerTerms[0] = 0;
    for (let i = 0; i < n; i++) {
        const val = buffer[i];
        currentSum += val * val;
        powerTerms[i + 1] = currentSum;
    }

    // 2. FFT Convolution for Autocorrelation
    // Zero out buffers first (important as we reuse them)
    // Actually, setting real from buffer does it partially, but we need zero padding
    realBuffer.fill(0);
    imagBuffer.fill(0);
    realBuffer.set(buffer);

    fft.forward(realBuffer, imagBuffer);

    // Compute Power Spectrum
    const fftSize = realBuffer.length;
    for (let i = 0; i < fftSize; i++) {
        const r = realBuffer[i];
        const im = imagBuffer[i];
        realBuffer[i] = r * r + im * im;
        imagBuffer[i] = 0;
    }

    fft.inverse(realBuffer, imagBuffer);

    // 3. Compute Difference Function
    // Allocate extra space to avoid out-of-bounds access
    const yinBuffer = new Float32Array(maxPeriod + 1);

    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        // d(tau) = sum(x[j]^2) + sum(x[j+tau]^2) - 2 * autocorr[tau]
        // Term 1: P[N-tau]
        const term1 = powerTerms[n - tau];
        // Term 2: P[N] - P[tau]
        const term2 = powerTerms[n] - powerTerms[tau];
        // Term 3: 2 * real[tau]
        const term3 = 2 * realBuffer[tau];

        yinBuffer[tau] = term1 + term2 - term3;
    }

    // Post-processing (Same as baseline)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxPeriod; tau++) {
        runningSum += yinBuffer[tau];
        if (runningSum > 0) {
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
        } else {
            yinBuffer[tau] = 1;
        }
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
    const denominator = 2 * (prev - 2 * curr + next);
    const offset = Math.abs(denominator) > 1e-10 ? (prev - next) / denominator : 0;
    const refinedPeriod = bestPeriod + offset;

    const frequency = sampleRate / refinedPeriod;
    const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
    const confidence = 1 - bestValue;

    return { frequency, midiNote, confidence };
}

function generateSineWave(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
    const length = Math.floor(sampleRate * durationSeconds);
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    return buffer;
}

function runBenchmark() {
    const sampleRate = 44100;
    const frameSize = 2048;
    console.log(`Setting up benchmark: SampleRate=${sampleRate}, FrameSize=${frameSize}`);

    const buffer = generateSineWave(440, sampleRate, frameSize / sampleRate);

    // --- Baseline ---
    // Warmup
    for (let i = 0; i < 10; i++) detectPitchAutocorrelationBaseline(buffer, sampleRate);

    const iterations = 100;
    const startBase = performance.now();
    for (let i = 0; i < iterations; i++) {
        detectPitchAutocorrelationBaseline(buffer, sampleRate);
    }
    const endBase = performance.now();
    const timeBase = endBase - startBase;

    console.log(`\nBaseline O(N^2) Performance:`);
    console.log(`Total: ${timeBase.toFixed(2)}ms`);
    console.log(`Avg: ${(timeBase / iterations).toFixed(4)}ms`);

    // --- Optimized ---
    // Setup (One-time allocations)
    const fftSize = 4096; // Next power of 2 > 2048 + 735
    const fft = new FFT(fftSize);
    const { real, imag } = fft.createComplexArray();
    const powerTerms = new Float32Array(frameSize + 1);

    // Warmup
    for (let i = 0; i < 10; i++) detectPitchOptimized(buffer, sampleRate, fft, real, imag, powerTerms);

    const startOpt = performance.now();
    for (let i = 0; i < iterations; i++) {
        detectPitchOptimized(buffer, sampleRate, fft, real, imag, powerTerms);
    }
    const endOpt = performance.now();
    const timeOpt = endOpt - startOpt;

    console.log(`\nOptimized FFT Performance:`);
    console.log(`Total: ${timeOpt.toFixed(2)}ms`);
    console.log(`Avg: ${(timeOpt / iterations).toFixed(4)}ms`);

    const speedup = timeBase / timeOpt;
    console.log(`\nSpeedup: ${speedup.toFixed(2)}x`);

    // --- Verification ---
    const resultBase = detectPitchAutocorrelationBaseline(buffer, sampleRate);
    const resultOpt = detectPitchOptimized(buffer, sampleRate, fft, real, imag, powerTerms);

    console.log(`\nVerification:`);
    console.log(`Baseline: ${resultBase?.frequency.toFixed(2)}Hz, Note: ${resultBase?.midiNote}, Conf: ${resultBase?.confidence.toFixed(4)}`);
    console.log(`Optimized: ${resultOpt?.frequency.toFixed(2)}Hz, Note: ${resultOpt?.midiNote}, Conf: ${resultOpt?.confidence.toFixed(4)}`);

    if (resultBase && resultOpt) {
        const freqDiff = Math.abs(resultBase.frequency - resultOpt.frequency);
        if (freqDiff < 0.1) {
            console.log('PASS: Results match.');
        } else {
            console.log('FAIL: Results diverge.');
        }
    }
}

runBenchmark();
