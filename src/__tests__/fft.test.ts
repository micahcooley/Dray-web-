
import { FFT } from '../lib/fft';

describe('FFT', () => {
    it('should throw error for non-power-of-2 size', () => {
        expect(() => new FFT(100)).toThrow();
        expect(() => new FFT(2048)).not.toThrow();
    });

    it('should calculate FFT of an impulse', () => {
        const size = 8;
        const fft = new FFT(size);
        const real = new Float32Array(size);
        const imag = new Float32Array(size);

        // Impulse at index 0
        real[0] = 1;

        fft.forward(real, imag);

        // Expect all 1s in real, 0s in imag
        for (let i = 0; i < size; i++) {
            expect(real[i]).toBeCloseTo(1);
            expect(imag[i]).toBeCloseTo(0);
        }
    });

    it('should calculate FFT of DC signal', () => {
        const size = 8;
        const fft = new FFT(size);
        const real = new Float32Array(size).fill(1);
        const imag = new Float32Array(size).fill(0);

        fft.forward(real, imag);

        // Expect size at index 0, 0 elsewhere
        expect(real[0]).toBeCloseTo(size);
        expect(imag[0]).toBeCloseTo(0);
        for (let i = 1; i < size; i++) {
            expect(real[i]).toBeCloseTo(0);
            expect(imag[i]).toBeCloseTo(0);
        }
    });

    it('should satisfy inverse property', () => {
        const size = 32;
        const fft = new FFT(size);
        const originalReal = new Float32Array(size);
        const originalImag = new Float32Array(size);

        // Random data
        for (let i = 0; i < size; i++) {
            originalReal[i] = Math.random();
            originalImag[i] = Math.random();
        }

        const real = new Float32Array(originalReal);
        const imag = new Float32Array(originalImag);

        fft.forward(real, imag);
        fft.inverse(real, imag);

        for (let i = 0; i < size; i++) {
            expect(real[i]).toBeCloseTo(originalReal[i]);
            expect(imag[i]).toBeCloseTo(originalImag[i]);
        }
    });
});
