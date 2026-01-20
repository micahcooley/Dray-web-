
import { FFT } from '../fft';

describe('FFT Library', () => {
    test('ensurePowerOfTwo', () => {
        expect(FFT.ensurePowerOfTwo(3)).toBe(4);
        expect(FFT.ensurePowerOfTwo(4)).toBe(4);
        expect(FFT.ensurePowerOfTwo(100)).toBe(128);
    });

    test('FFT of Impulse (Delta Function)', () => {
        const n = 8;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);

        real[0] = 1; // Impulse at t=0

        FFT.fft(real, imag);

        // FFT of delta is constant 1 in all freq bins
        for (let i = 0; i < n; i++) {
            expect(real[i]).toBeCloseTo(1);
            expect(imag[i]).toBeCloseTo(0);
        }
    });

    test('FFT of DC Signal', () => {
        const n = 8;
        const real = new Float32Array(n).fill(1); // Constant DC 1
        const imag = new Float32Array(n).fill(0);

        FFT.fft(real, imag);

        // Bin 0 should be N (8), others 0
        expect(real[0]).toBeCloseTo(n);
        expect(imag[0]).toBeCloseTo(0);
        for (let i = 1; i < n; i++) {
            expect(real[i]).toBeCloseTo(0);
            expect(imag[i]).toBeCloseTo(0);
        }
    });

    test('IFFT Round Trip', () => {
        const n = 128;
        const original = new Float32Array(n);
        for (let i = 0; i < n; i++) original[i] = Math.random();

        const real = new Float32Array(original); // copy
        const imag = new Float32Array(n);

        FFT.fft(real, imag);
        FFT.ifft(real, imag);

        for (let i = 0; i < n; i++) {
            expect(real[i]).toBeCloseTo(original[i]);
            expect(imag[i]).toBeCloseTo(0);
        }
    });
});
