import { FFT } from '../src/lib/fft';

describe('FFT and Pitch Detection Performance', () => {
    // Legacy DFT implementation for comparison
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

    // Legacy O(N^2) Autocorrelation for comparison
    function autocorrelation_Legacy(buffer: Float32Array, minPeriod: number, maxPeriod: number): Float32Array {
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

    // Helper to generate random audio buffer
    function createBuffer(size: number): Float32Array {
        const buffer = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            buffer[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    test('FFT Correctness', () => {
        const size = 1024; // Small size for correctness check to avoid timeout
        const buffer = createBuffer(size);

        // Compute Legacy
        const legacyMag = computeFFT_Legacy(buffer);

        // Compute Optimized
        const fft = new FFT(size);
        fft.forward(buffer);

        // Verify Magnitude matches (roughly)
        // Note: computeFFT_Legacy only returns N/2 magnitudes.
        // FFT returns N real/imag. Mag = sqrt(r^2 + i^2)
        for (let i = 0; i < size / 2; i++) {
            const mag = Math.sqrt(fft.real[i] ** 2 + fft.imag[i] ** 2);
            // Allow some floating point drift, legacy uses naive sum which can drift differently
            // but they should be close.
            const diff = Math.abs(mag - legacyMag[i]);
            // Legacy DFT isn't scaled, FFT isn't scaled.
            // Check absolute difference.
            expect(diff).toBeLessThan(1e-1);
        }
    });

    test('FFT Performance Benchmark', () => {
        const size = 2048;
        const buffer = createBuffer(size);
        const fft = new FFT(size);
        const iterations = 10; // Keep low for CI, but enough to measure

        const startLegacy = performance.now();
        for (let i = 0; i < iterations; i++) {
            computeFFT_Legacy(buffer);
        }
        const timeLegacy = performance.now() - startLegacy;

        const startOptimized = performance.now();
        for (let i = 0; i < iterations; i++) {
            fft.forward(buffer);
        }
        const timeOptimized = performance.now() - startOptimized;

        console.log(`FFT Benchmark (N=${size}, ${iterations} iter):`);
        console.log(`Legacy: ${timeLegacy.toFixed(2)}ms`);
        console.log(`Optimized: ${timeOptimized.toFixed(2)}ms`);
        console.log(`Speedup: ${(timeLegacy / timeOptimized).toFixed(2)}x`);

        // Expect significant speedup
        expect(timeOptimized).toBeLessThan(timeLegacy);
    });

    test('Autocorrelation Performance Benchmark', () => {
        const size = 2048;
        const buffer = createBuffer(size);
        // Standard YIN parameters
        const minFreq = 60;
        const maxFreq = 1200;
        const sampleRate = 44100;
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);

        // FFT Based Autocorrelation Implementation (simulated for benchmark)
        const fftSize = 4096; // Pad to at least 2*N for linear convolution
        const fft = new FFT(fftSize);
        const paddedBuffer = new Float32Array(fftSize);

        const iterations = 10;

        const startLegacy = performance.now();
        for (let i = 0; i < iterations; i++) {
            autocorrelation_Legacy(buffer, minPeriod, maxPeriod);
        }
        const timeLegacy = performance.now() - startLegacy;

        const startOptimized = performance.now();
        for (let i = 0; i < iterations; i++) {
            // 1. Pad input
            paddedBuffer.fill(0);
            paddedBuffer.set(buffer);

            // 2. FFT
            fft.forward(paddedBuffer);

            // 3. Power Spectrum
            for (let j = 0; j < fftSize; j++) {
                const r = fft.real[j];
                const im = fft.imag[j];
                fft.real[j] = r * r + im * im;
                fft.imag[j] = 0;
            }

            // 4. IFFT (Autocorrelation)
            fft.inverseFromInternal();

            // Note: In real implementation we'd also compute the energy terms
            // but the heavy lifting is the correlation.
            // Let's assume energy term calculation is O(N) and negligible compared to O(N^2).
        }
        const timeOptimized = performance.now() - startOptimized;

        console.log(`Autocorrelation Benchmark (N=${size}, ${iterations} iter):`);
        console.log(`Legacy (O(N^2)): ${timeLegacy.toFixed(2)}ms`);
        console.log(`Optimized (FFT): ${timeOptimized.toFixed(2)}ms`);
        console.log(`Speedup: ${(timeLegacy / timeOptimized).toFixed(2)}x`);

        expect(timeOptimized).toBeLessThan(timeLegacy);
    });
});
