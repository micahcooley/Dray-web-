import { FFT } from '../lib/fft';

// Naive implementation
function naiveDifferenceFunction(buffer: Float32Array, sampleRate: number): Float32Array {
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
    return yinBuffer;
}

// Optimized implementation with Buffer Reuse
const fftCache = new Map<number, FFT>();
function getFFT(size: number): FFT {
    if (!fftCache.has(size)) {
        fftCache.set(size, new FFT(size));
    }
    return fftCache.get(size)!;
}

// Global reuse buffers for benchmark
let globalPaddedBuffer: Float32Array | null = null;
let globalXCum: Float32Array | null = null;
let globalYinBuffer: Float32Array | null = null;

function optimizedDifferenceFunction(buffer: Float32Array, sampleRate: number): Float32Array {
    const minFreq = 60;
    const maxFreq = 1200;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    const N = buffer.length;
    let fftSize = 1;
    while (fftSize < 2 * N) fftSize <<= 1;

    const fft = getFFT(fftSize);

    // Reuse buffers
    if (!globalPaddedBuffer || globalPaddedBuffer.length !== fftSize) {
        globalPaddedBuffer = new Float32Array(fftSize);
    }
    if (!globalXCum || globalXCum.length !== N + 1) {
        globalXCum = new Float32Array(N + 1);
    }
    if (!globalYinBuffer || globalYinBuffer.length !== maxPeriod) {
        globalYinBuffer = new Float32Array(maxPeriod);
    }

    // 1. Autocorrelation
    // Zero out padding area if needed, but we overwrite first N
    // We must zero out the rest
    globalPaddedBuffer.fill(0);
    globalPaddedBuffer.set(buffer);

    // Forward FFT
    // fft.forward copies from input.
    const { real: X_real, imag: X_imag } = fft.forward(globalPaddedBuffer);

    for (let i = 0; i < fftSize; i++) {
        const magSquared = X_real[i] * X_real[i] + X_imag[i] * X_imag[i];
        X_real[i] = magSquared;
        X_imag[i] = 0;
    }

    const { real: R } = fft.inverse(X_real, X_imag);

    // 2. Energy
    const x_cum = globalXCum;
    x_cum[0] = 0;
    for (let i = 0; i < N; i++) {
        x_cum[i + 1] = x_cum[i] + buffer[i] * buffer[i];
    }

    const yinBuffer = globalYinBuffer;

    for (let tau = minPeriod; tau < maxPeriod; tau++) {
        const term1 = x_cum[N - tau];
        const term2 = x_cum[N] - x_cum[tau];
        const autocorr = R[tau];

        yinBuffer[tau] = term1 + term2 - 2 * autocorr;
    }

    return yinBuffer;
}

function generateSignal(size: number, frequency: number, sampleRate: number): Float32Array {
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    return buffer;
}

function runBenchmark() {
    const sampleRate = 44100;
    const bufferSize = 2048;
    const largeBufferSize = 4096;
    const iterations = 100;

    const buffer2048 = generateSignal(bufferSize, 440, sampleRate);
    const buffer4096 = generateSignal(largeBufferSize, 440, sampleRate);

    console.log('Running Performance Benchmark (With Buffer Reuse)...');
    console.log('--------------------------------');

    // Warmup
    naiveDifferenceFunction(buffer2048, sampleRate);
    optimizedDifferenceFunction(buffer2048, sampleRate);

    // --- Naive 2048 ---
    const startNaive2048 = globalThis.performance.now();
    for (let i = 0; i < iterations; i++) {
        naiveDifferenceFunction(buffer2048, sampleRate);
    }
    const endNaive2048 = globalThis.performance.now();
    const avgNaive2048 = (endNaive2048 - startNaive2048) / iterations;

    // --- Optimized 2048 ---
    const startOpt2048 = globalThis.performance.now();
    for (let i = 0; i < iterations; i++) {
        optimizedDifferenceFunction(buffer2048, sampleRate);
    }
    const endOpt2048 = globalThis.performance.now();
    const avgOpt2048 = (endOpt2048 - startOpt2048) / iterations;

    console.log(`N=${bufferSize}:`);
    console.log(`  Naive:     ${avgNaive2048.toFixed(3)} ms/op`);
    console.log(`  Optimized: ${avgOpt2048.toFixed(3)} ms/op`);
    console.log(`  Speedup:   ${(avgNaive2048 / avgOpt2048).toFixed(1)}x`);

    // Reset globals for next size
    globalPaddedBuffer = null;
    globalXCum = null;
    globalYinBuffer = null;

    // --- Naive 4096 ---
    const startNaive4096 = globalThis.performance.now();
    for (let i = 0; i < iterations; i++) {
        naiveDifferenceFunction(buffer4096, sampleRate);
    }
    const endNaive4096 = globalThis.performance.now();
    const avgNaive4096 = (endNaive4096 - startNaive4096) / iterations;

    // --- Optimized 4096 ---
    const startOpt4096 = globalThis.performance.now();
    for (let i = 0; i < iterations; i++) {
        optimizedDifferenceFunction(buffer4096, sampleRate);
    }
    const endOpt4096 = globalThis.performance.now();
    const avgOpt4096 = (endOpt4096 - startOpt4096) / iterations;

    console.log(`N=${largeBufferSize}:`);
    console.log(`  Naive:     ${avgNaive4096.toFixed(3)} ms/op`);
    console.log(`  Optimized: ${avgOpt4096.toFixed(3)} ms/op`);
    console.log(`  Speedup:   ${(avgNaive4096 / avgOpt4096).toFixed(1)}x`);
}

runBenchmark();
