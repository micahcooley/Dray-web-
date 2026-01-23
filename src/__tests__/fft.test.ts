
import { FFT } from '../lib/fft';

describe('FFT', () => {
    it('should throw error for non-power-of-two size', () => {
        expect(() => new FFT(100)).toThrow();
        expect(() => new FFT(0)).toThrow();
    });

    it('should correctly transform a DC signal', () => {
        const size = 16;
        const fft = new FFT(size);
        const { real, imag } = fft.createComplexArray();

        // DC signal (all 1s)
        for (let i = 0; i < size; i++) real[i] = 1;

        fft.forward(real, imag);

        // Expected: Bin 0 (DC) should be N (16), others 0
        expect(real[0]).toBeCloseTo(size, 4);
        expect(imag[0]).toBeCloseTo(0, 4);
        for (let i = 1; i < size; i++) {
            expect(real[i]).toBeCloseTo(0, 4);
            expect(imag[i]).toBeCloseTo(0, 4);
        }
    });

    it('should be reversible (Inverse FFT)', () => {
        const size = 32;
        const fft = new FFT(size);
        const { real, imag } = fft.createComplexArray();

        // Random signal
        const original = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            original[i] = Math.random();
            real[i] = original[i];
        }

        fft.forward(real, imag);
        fft.inverse(real, imag);

        for (let i = 0; i < size; i++) {
            expect(real[i]).toBeCloseTo(original[i], 4);
            expect(imag[i]).toBeCloseTo(0, 4);
        }
    });

    it('should correctly detect a sine wave frequency', () => {
        const size = 64;
        const fft = new FFT(size);
        const { real, imag } = fft.createComplexArray();

        // Sine wave at frequency that matches a bin center
        // freq = 4 * (SampleRate / Size) => 4 cycles in the window
        for (let i = 0; i < size; i++) {
            real[i] = Math.cos(2 * Math.PI * 4 * i / size);
        }

        fft.forward(real, imag);

        // Expect peak at bin 4 and bin 60 (64-4)
        // Magnitude at bin 4 should be approx Size/2 for real input
        expect(Math.abs(real[4])).toBeGreaterThan(1);
        expect(Math.abs(real[60])).toBeGreaterThan(1);

        // Other bins should be low
        expect(Math.abs(real[10])).toBeLessThan(0.001);
    });
});
