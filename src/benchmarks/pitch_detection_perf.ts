
import { performance } from 'perf_hooks';
import { FFT } from '../lib/fft';

// Optimized FFT-based implementation
function detectPitchAutocorrelationOptimized(
    buffer: Float32Array,
    sampleRate: number
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    const n = buffer.length;
    // FFT size must be power of 2 and >= 2*n for linear correlation
    // actually we need size >= n + maxPeriod to cover the lags we care about?
    // The loop goes up to maxPeriod. The correlation is computed for all lags.
    // To avoid aliasing for lag L, we need size >= n + L.
    // Since we want lags up to maxPeriod (~735) and n=2048, 4096 is sufficient.
    let fftSize = 1;
    while (fftSize < n + maxPeriod) {
        fftSize <<= 1;
    }

    // 1. Compute Energy Terms using Cumulative Sum of Squares
    const prefixSumSq = new Float32Array(n + 1);
    prefixSumSq[0] = 0;
    for (let i = 0; i < n; i++) {
        prefixSumSq[i + 1] = prefixSumSq[i] + buffer[i] * buffer[i];
    }

    // 2. Compute Correlation via FFT
    const fft = new FFT(fftSize);
    const real = new Float32Array(fftSize); // Padded with zeros
    const imag = new Float32Array(fftSize);

    // Copy buffer
    for (let i = 0; i < n; i++) {
        real[i] = buffer[i];
    }

    fft.forward(real, imag);

    // Compute Power Spectrum (Real * Real + Imag * Imag)
    // We want Convolution of x and x (Autocorrelation).
    // Autocorrelation(x) = IFFT(|FFT(x)|^2)
    for (let i = 0; i < fftSize; i++) {
        const r = real[i];
        const im = imag[i];
        real[i] = r * r + im * im;
        imag[i] = 0;
    }

    fft.inverse(real, imag);

    // 3. Compute Difference Function
    const yinBuffer = new Float32Array(maxPeriod);

    for (let tau = minPeriod; tau < maxPeriod; tau++) {
        // Term 1: Sum of squares of x[0...n-tau-1]
        // = S[n-tau] - S[0]
        const term1 = prefixSumSq[n - tau];

        // Term 2: Sum of squares of x[tau...n-1]
        // = S[n] - S[tau]
        const term2 = prefixSumSq[n] - prefixSumSq[tau];

        // Term 3: 2 * Correlation[tau]
        // The IFFT result is the correlation.
        // Note: FFT based convolution usually outputs in [0, N-1].
        // Verify index: if we correlate x with itself, index 0 is lag 0.
        const term3 = 2 * real[tau];

        yinBuffer[tau] = term1 + term2 - term3;
    }

    // --- Original Post-Processing Logic ---

    // Cumulative mean normalized difference
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < maxPeriod; tau++) {
        runningSum += yinBuffer[tau];
        // Handle division by zero or very small numbers
        if (runningSum === 0) {
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


// Baseline implementation of O(N^2) Autocorrelation (from audioToMidiConverter.ts)
function detectPitchAutocorrelationBaseline(
    buffer: Float32Array,
    sampleRate: number
): { frequency: number; midiNote: number; confidence: number } | null {
    const minFreq = 60;   // ~B1
    const maxFreq = 1200; // ~D6
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    // Calculate normalized difference function
    const yinBuffer = new Float32Array(maxPeriod);

    // This is the bottleneck loop
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
    // Frame size used in convertMelody is 2048
    const frameSize = 2048;

    console.log(`Setting up benchmark: SampleRate=${sampleRate}, FrameSize=${frameSize}`);

    // Create a buffer with a known frequency (e.g., A4 = 440Hz)
    const buffer = generateSineWave(440, sampleRate, frameSize / sampleRate);

    // Warmup Baseline
    for (let i = 0; i < 10; i++) detectPitchAutocorrelationBaseline(buffer, sampleRate);

    // Warmup Optimized
    for (let i = 0; i < 10; i++) detectPitchAutocorrelationOptimized(buffer, sampleRate);

    const iterations = 100;

    // Measure Baseline
    const startBase = performance.now();
    for (let i = 0; i < iterations; i++) detectPitchAutocorrelationBaseline(buffer, sampleRate);
    const endBase = performance.now();
    const timeBase = endBase - startBase;

    // Measure Optimized
    const startOpt = performance.now();
    for (let i = 0; i < iterations; i++) detectPitchAutocorrelationOptimized(buffer, sampleRate);
    const endOpt = performance.now();
    const timeOpt = endOpt - startOpt;

    // Measure Optimized (Cached FFT)
    // We simulate this by reusing the same FFT instance
    // Since we can't easily inject it into the function above without changing signature,
    // we'll just implement a quick loop here that mimics the internal logic with cached FFT.

    const n = buffer.length;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / 60);
    let fftSize = 1;
    while (fftSize < n + maxPeriod) fftSize <<= 1;
    const cachedFFT = new FFT(fftSize);

    // Modified function that takes cached FFT
    const runOptimizedCached = () => {
         // 1. Compute Energy Terms
        const prefixSumSq = new Float32Array(n + 1);
        prefixSumSq[0] = 0;
        for (let i = 0; i < n; i++) {
            prefixSumSq[i + 1] = prefixSumSq[i] + buffer[i] * buffer[i];
        }

        // 2. Compute Correlation via FFT
        // In real app, we might also cache these buffers if we are careful
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);

        for (let i = 0; i < n; i++) real[i] = buffer[i];

        cachedFFT.forward(real, imag);

        for (let i = 0; i < fftSize; i++) {
            const r = real[i];
            const im = imag[i];
            real[i] = r * r + im * im;
            imag[i] = 0;
        }

        cachedFFT.inverse(real, imag);

        const yinBuffer = new Float32Array(maxPeriod);
        for (let tau = minPeriod; tau < maxPeriod; tau++) {
            const term1 = prefixSumSq[n - tau];
            const term2 = prefixSumSq[n] - prefixSumSq[tau];
            const term3 = 2 * real[tau];
            yinBuffer[tau] = term1 + term2 - term3;
        }
        // ... Post processing omitted for speed check (it's O(tau) ~ 700 ops, negligible compared to FFT)
        // actually post processing IS part of the baseline, so we should include it to be fair.
        // Copy-paste post processing:
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < maxPeriod; tau++) {
            runningSum += yinBuffer[tau];
            if (runningSum === 0) yinBuffer[tau] = 1;
            else yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
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
    };

    const startOptCached = performance.now();
    for (let i = 0; i < iterations; i++) runOptimizedCached();
    const endOptCached = performance.now();
    const timeOptCached = endOptCached - startOptCached;


    console.log(`\nPerformance Comparison (${iterations} iterations):`);
    console.log(`Baseline O(N^2):       ${timeBase.toFixed(2)}ms (${(timeBase/iterations).toFixed(3)}ms/iter)`);
    console.log(`Optimized FFT (New):   ${timeOpt.toFixed(2)}ms (${(timeOpt/iterations).toFixed(3)}ms/iter)`);
    console.log(`Optimized FFT (Cache): ${timeOptCached.toFixed(2)}ms (${(timeOptCached/iterations).toFixed(3)}ms/iter)`);
    console.log(`Speedup (vs Cache):    ${(timeBase/timeOptCached).toFixed(2)}x`);

    // Verify correctness
    const resultBase = detectPitchAutocorrelationBaseline(buffer, sampleRate);
    const resultOpt = detectPitchAutocorrelationOptimized(buffer, sampleRate);

    console.log(`\nCorrectness Verification:`);
    console.log(`Baseline:  Freq=${resultBase?.frequency.toFixed(2)}, Note=${resultBase?.midiNote}, Conf=${resultBase?.confidence.toFixed(4)}`);
    console.log(`Optimized: Freq=${resultOpt?.frequency.toFixed(2)}, Note=${resultOpt?.midiNote}, Conf=${resultOpt?.confidence.toFixed(4)}`);

    if (resultBase && resultOpt && Math.abs(resultBase.frequency - resultOpt.frequency) < 0.1) {
        console.log("✅ Results match!");
    } else {
        console.log("❌ Results differ!");
    }
}

runBenchmark();
