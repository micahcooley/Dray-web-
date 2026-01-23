
import { FFT } from '../../lib/fft';

// --- OLD IMPLEMENTATIONS ---

export function detectPitchAutocorrelationOld(
    buffer: Float32Array,
    sampleRate: number
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;   // ~B1
    const maxFreq = 1200; // ~D6
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    // Calculate normalized difference function
    const yinBuffer = new Float32Array(maxPeriod);

    // O(N^2) LOOP HERE
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
        let sum = 0;
        for (let j = 0; j < buffer.length - tau; j++) {
            const diff = buffer[j] - buffer[j + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
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
            // Fix: Stop at the first minimum below threshold to avoid octave errors
            break;
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

export function computeFFTOld(buffer: Float32Array): Float32Array {
    const N = buffer.length;
    const result = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            real += buffer[n] * Math.cos(angle);
            imag -= buffer[n] * Math.sin(angle);
        }
        result[k] = Math.sqrt(real * real + imag * imag);
    }

    return result;
}

// --- NEW IMPLEMENTATIONS ---

export function detectPitchAutocorrelationNew(
    buffer: Float32Array,
    sampleRate: number,
    debug: boolean = false
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    const W = buffer.length;
    // Calculate FFT size (next power of 2 >= W + maxPeriod)
    let N = 1;
    while (N < W + maxPeriod) N *= 2;

    const fft = new FFT(N);
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // Copy input
    real.set(buffer);

    // Forward FFT
    fft.process(real, imag, real, imag);

    // Compute Power Spectrum
    for (let i = 0; i < N; i++) {
        real[i] = real[i] * real[i] + imag[i] * imag[i];
        imag[i] = 0;
    }

    // Inverse FFT -> Autocorrelation
    fft.process(real, imag, real, imag, true);

    // Compute Difference Function
    const yinBuffer = new Float32Array(maxPeriod);

    if (debug) {
        console.log(`Debug: FFT R[0] (Energy) = ${real[0]}`);
    }

    // Energy terms using prefix sums
    const prefixSq = new Float32Array(W + 1);
    prefixSq[0] = 0;
    for(let i=0; i<W; i++) {
        prefixSq[i+1] = prefixSq[i] + buffer[i]*buffer[i];
    }

    for (let tau = minPeriod; tau < maxPeriod; tau++) {
        const term1 = prefixSq[W - tau];
        const term2 = prefixSq[W] - prefixSq[tau];
        const term3 = real[tau]; // r(tau)

        // YIN difference: d(tau) = term1 + term2 - 2 * term3
        // Note: term3 might have small float errors, term1+term2 should be >= 2*term3 ideally for perfect correlation.
        // Difference should be >= 0.
        yinBuffer[tau] = term1 + term2 - 2 * term3;

        if (debug && tau >= 99 && tau <= 101) {
            console.log(`Debug tau=${tau}: term1=${term1.toFixed(2)}, term2=${term2.toFixed(2)}, term3=${term3.toFixed(2)}, yin=${yinBuffer[tau].toFixed(5)}`);
        }
    }

    // YIN Normalization
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < maxPeriod; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
    }

    // Peak Picking
    const threshold = 0.15;
    let bestPeriod = -1;
    let bestValue = 1;

    for (let tau = minPeriod; tau < maxPeriod - 1; tau++) {
        if (yinBuffer[tau] < threshold && yinBuffer[tau] < yinBuffer[tau - 1] && yinBuffer[tau] < yinBuffer[tau + 1]) {
            if (yinBuffer[tau] < bestValue) {
                bestValue = yinBuffer[tau];
                bestPeriod = tau;
            }
            break;
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

export function computeFFTNew(buffer: Float32Array): Float32Array {
    let N = 1;
    while (N < buffer.length) N *= 2;

    const fft = new FFT(N);
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    real.set(buffer);

    fft.process(real, imag, real, imag);

    // Compute magnitude for first half
    const result = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
        result[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return result;
}

// --- BENCHMARK ---

function generateSineWave(freq: number, sampleRate: number, durationSec: number): Float32Array {
    const length = Math.floor(sampleRate * durationSec);
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
    }
    return buffer;
}

function getPerformanceNow(): number {
    if (typeof performance !== 'undefined') {
        return performance.now();
    }
    try {
        // @ts-ignore
        const hooks = require('perf_hooks');
        return hooks.performance.now();
    } catch (e) {
        return Date.now();
    }
}

function runBenchmark() {
    const sampleRate = 44100;
    const bufferSize = 2048;
    const buffer = generateSineWave(440, sampleRate, bufferSize / sampleRate);

    console.log("Running Benchmark...");
    console.log(`Buffer Size: ${bufferSize}, Sample Rate: ${sampleRate}`);

    // --- BASELINE ---

    // Correctness Old
    const resultOld = detectPitchAutocorrelationOld(buffer, sampleRate);
    const expectedFreq = 440;

    // Performance Old
    const iterations = 50;
    const start = getPerformanceNow();
    for (let i = 0; i < iterations; i++) {
        detectPitchAutocorrelationOld(buffer, sampleRate);
    }
    const end = getPerformanceNow();
    const avgOld = (end - start) / iterations;
    console.log(`\nAutocorrelation (Old): ${(end-start).toFixed(2)} ms / ${iterations} ops`);
    console.log(`Avg per op: ${avgOld.toFixed(2)} ms`);
    console.log(`Ops/sec: ${(1000 / avgOld).toFixed(2)}`);

    // --- NEW ---

    // Correctness New
    const resultNew = detectPitchAutocorrelationNew(buffer, sampleRate, true);
    console.log(`\nVerification New (440Hz): Detected ${resultNew?.frequency.toFixed(2)} Hz, Note ${resultNew?.midiNote}, Confidence ${resultNew?.confidence.toFixed(2)}`);

    if (!resultNew || Math.abs(resultNew.frequency - expectedFreq) > 2) {
         console.error("❌ CORRECTNESS FAILURE: New implementation did not detect 440Hz correctly.");
         console.log("Old result was:", resultOld?.frequency);
    } else {
         console.log("✅ New Correctness Verified.");
    }

    // Performance New
    const iterationsNew = 200;
    const startNew = getPerformanceNow();
    for (let i = 0; i < iterationsNew; i++) {
        detectPitchAutocorrelationNew(buffer, sampleRate);
    }
    const endNew = getPerformanceNow();
    const avgNew = (endNew - startNew) / iterationsNew;
    console.log(`Autocorrelation (New): ${(endNew-startNew).toFixed(2)} ms / ${iterationsNew} ops`);
    console.log(`Avg per op: ${avgNew.toFixed(2)} ms`);
    console.log(`Ops/sec: ${(1000 / avgNew).toFixed(2)}`);

    console.log(`🚀 Speedup: ${(avgOld / avgNew).toFixed(2)}x`);

    // --- FFT ---

    // DFT Old
    const fftBufferSize = 1024;
    const fftBuffer = buffer.slice(0, fftBufferSize);

    console.log(`\nDFT (Old) with size ${fftBufferSize}:`);
    const startFFT = getPerformanceNow();
    const fftIterations = 10;
    for(let i=0; i<fftIterations; i++) {
        computeFFTOld(fftBuffer);
    }
    const endFFT = getPerformanceNow();
    const avgFFTOld = (endFFT - startFFT) / fftIterations;
    console.log(`DFT (Old): ${(endFFT - startFFT).toFixed(2)} ms / ${fftIterations} ops`);
    console.log(`Avg per op: ${avgFFTOld.toFixed(2)} ms`);

    // FFT New
    console.log(`\nFFT (New) with size ${fftBufferSize}:`);
    const startFFTNew = getPerformanceNow();
    const fftIterationsNew = 1000;
    for(let i=0; i<fftIterationsNew; i++) {
        computeFFTNew(fftBuffer);
    }
    const endFFTNew = getPerformanceNow();
    const avgFFTNew = (endFFTNew - startFFTNew) / fftIterationsNew;
    console.log(`FFT (New): ${(endFFTNew - startFFTNew).toFixed(2)} ms / ${fftIterationsNew} ops`);
    console.log(`Avg per op: ${avgFFTNew.toFixed(2)} ms`);

    console.log(`🚀 FFT Speedup: ${(avgFFTOld / avgFFTNew).toFixed(2)}x`);
}

runBenchmark();
