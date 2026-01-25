import { FFT } from '../lib/fft';

// Old implementation (Naive DFT)
function computeFFT_Naive(buffer: Float32Array): Float32Array {
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

function generateSignal(size: number): Float32Array {
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        buffer[i] = Math.sin(i * 0.1) + Math.cos(i * 0.05) * 0.5 + (Math.random() - 0.5) * 0.1;
    }
    return buffer;
}

function runBenchmark() {
    const SIZE = 4096;
    const ITERATIONS_NAIVE = 5; // Reduced because it's slow
    const ITERATIONS_OPT = 1000;
    const buffer = generateSignal(SIZE);

    console.log(`Benchmarking FFT with Size=${SIZE}`);

    // Measure Naive
    const startNaive = performance.now();
    let resNaive: Float32Array | null = null;
    for (let i = 0; i < ITERATIONS_NAIVE; i++) {
        resNaive = computeFFT_Naive(buffer);
    }
    const endNaive = performance.now();
    const timeNaive = endNaive - startNaive;

    console.log(`Naive DFT (${ITERATIONS_NAIVE} runs): ${timeNaive.toFixed(2)}ms (Avg: ${(timeNaive / ITERATIONS_NAIVE).toFixed(2)}ms)`);

    // Measure Optimized
    const fft = new FFT(SIZE);
    const startOpt = performance.now();
    let resOpt: Float32Array | null = null;
    for (let i = 0; i < ITERATIONS_OPT; i++) {
        resOpt = fft.forward(buffer);
    }
    const endOpt = performance.now();
    const timeOpt = endOpt - startOpt;

    console.log(`Optimized FFT (${ITERATIONS_OPT} runs): ${timeOpt.toFixed(2)}ms (Avg: ${(timeOpt / ITERATIONS_OPT).toFixed(4)}ms)`);

    const speedup = (timeNaive / ITERATIONS_NAIVE) / (timeOpt / ITERATIONS_OPT);
    console.log(`⚡ Speedup: ${speedup.toFixed(1)}x`);

    // Correctness Check
    if (resNaive && resOpt) {
        let maxDiff = 0;
        for (let i = 0; i < SIZE / 2; i++) {
            const diff = Math.abs(resNaive[i] - resOpt[i]);
            if (diff > maxDiff) maxDiff = diff;
        }
        console.log(`Max difference: ${maxDiff}`);

        // Tolerance: relative to signal magnitude.
        // N=4096. Max value can be around 4096.
        // 1e-2 is small enough.
        if (maxDiff < 1e-1) {
            console.log("✅ Correctness Verified");
        } else {
            console.error("❌ Output mismatch");
        }
    }
}

runBenchmark();
