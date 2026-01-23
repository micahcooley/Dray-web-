
import { performance } from 'perf_hooks';
import { FFT } from '../lib/fft';

// Old O(N^2) Implementation (reproduced from original source)
function computeFFT_Old(buffer: Float32Array): Float32Array {
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

function runBenchmark() {
    console.log("=== FFT Performance Benchmark ===");
    console.log("Comparing Old O(N^2) DFT vs New Optimized O(N log N) FFT");

    // We use a moderate size to show the difference without hanging the CI environment
    const size = 2048;
    console.log(`\nBuffer Size: ${size} samples`);

    // Generate input signal (composite sine wave)
    const input = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        input[i] = Math.sin(i * 0.1) + 0.5 * Math.sin(i * 0.3) + Math.random() * 0.1;
    }

    // --- Test Old DFT ---
    console.log("Running Old DFT...");
    const startOld = performance.now();
    // Run just once because it's very slow (~100ms for 2048, ~400ms for 4096)
    const iterationsOld = 1;
    for (let i = 0; i < iterationsOld; i++) {
        computeFFT_Old(input);
    }
    const endOld = performance.now();
    const timeOld = (endOld - startOld) / iterationsOld;
    console.log(`[Old O(N^2)] Time: ${timeOld.toFixed(4)} ms / op`);

    // --- Test New FFT ---
    console.log("Running New FFT...");
    const fft = new FFT(size);
    fft.forward(input); // Warmup

    const startNew = performance.now();
    const iterationsNew = 50;
    for (let i = 0; i < iterationsNew; i++) {
        fft.forward(input);
    }
    const endNew = performance.now();
    const timeNew = (endNew - startNew) / iterationsNew;
    console.log(`[New O(N log N)] Time: ${timeNew.toFixed(4)} ms / op`);

    // --- Result ---
    const speedup = timeOld / timeNew;
    console.log(`\n🚀 Speedup: ${speedup.toFixed(2)}x`);

    if (speedup > 10) {
        console.log("SUCCESS: Significant performance improvement verified.");
    } else {
        console.warn("WARNING: Performance improvement less than expected.");
    }
}

runBenchmark();
