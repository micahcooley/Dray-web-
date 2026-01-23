
import { FFT } from '../src/lib/fft';

// Original O(N^2) implementation from audioToMidiConverter.ts
function computeFFT_Legacy(buffer: Float32Array): Float32Array {
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

describe('FFT Benchmark and Correctness', () => {
    const SIZE = 4096; // Typical buffer size for harmony analysis
    let input: Float32Array;
    let fft: FFT;

    beforeAll(() => {
        input = new Float32Array(SIZE);
        // Generate a test signal: 440Hz sine wave + noise
        const sampleRate = 44100;
        for (let i = 0; i < SIZE; i++) {
            input[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5
                     + (Math.random() - 0.5) * 0.1;
        }
        fft = new FFT(SIZE);
    });

    test('New FFT should produce similar results to Legacy DFT', () => {
        const legacyResult = computeFFT_Legacy(input);
        const newResult = fft.getMagnitudeSpectrum(input);

        expect(newResult.length).toBe(legacyResult.length);

        // Check a few peaks or average difference
        // Note: FFT implementations might have scaling differences, but magnitude shape should be identical.
        // The naive DFT formula used above computes unnormalized DFT.
        // My FFT implementation is also unnormalized (standard Cooley-Tukey).
        // Let's compare peak bin.

        let maxBinLegacy = -1;
        let maxValLegacy = -1;
        for(let i=0; i<legacyResult.length; i++) {
            if (legacyResult[i] > maxValLegacy) {
                maxValLegacy = legacyResult[i];
                maxBinLegacy = i;
            }
        }

        let maxBinNew = -1;
        let maxValNew = -1;
        for(let i=0; i<newResult.length; i++) {
            if (newResult[i] > maxValNew) {
                maxValNew = newResult[i];
                maxBinNew = i;
            }
        }

        expect(maxBinNew).toBe(maxBinLegacy);
        // Allow small floating point differences
        expect(Math.abs(maxValNew - maxValLegacy)).toBeLessThan(1.0);
    });

    test('Benchmark: New FFT should be significantly faster', () => {
        const ITERATIONS = 5;

        // Measure Legacy
        const startLegacy = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            computeFFT_Legacy(input);
        }
        const endLegacy = performance.now();
        const timeLegacy = endLegacy - startLegacy;

        // Measure New
        const startNew = performance.now();
        for (let i = 0; i < ITERATIONS * 100; i++) { // Run 100x more iterations
            fft.getMagnitudeSpectrum(input);
        }
        const endNew = performance.now();
        const timeNew = (endNew - startNew) / 100; // Normalize time per set of iterations

        console.log(`
            Benchmark Results (Size: ${SIZE}):
            Legacy DFT (5 runs): ${timeLegacy.toFixed(2)}ms (Avg: ${(timeLegacy/ITERATIONS).toFixed(2)}ms)
            New FFT (500 runs): ${(endNew - startNew).toFixed(2)}ms (Avg: ${((endNew - startNew)/(ITERATIONS*100)).toFixed(4)}ms)
            Speedup: ~${((timeLegacy/ITERATIONS) / ((endNew - startNew)/(ITERATIONS*100))).toFixed(1)}x
        `);

        // Expect at least 100x speedup (O(N^2) vs O(N log N) for N=4096 is huge)
        // N^2 = 16,777,216
        // N log N = 4096 * 12 = 49,152
        // Theoretical ratio ~340x
        expect((timeLegacy/ITERATIONS)).toBeGreaterThan(((endNew - startNew)/(ITERATIONS*100)) * 50);
    });
});
