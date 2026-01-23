import { FFT } from '../src/lib/fft';

describe('FFT Mathematical Correctness', () => {
    test('FFT of DC signal (all ones)', () => {
        const fft = new FFT(8);
        const input = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
        fft.forward(input);
        
        // FFT of DC signal should have all energy in bin 0
        expect(fft.real[0]).toBeCloseTo(8, 5);
        for (let i = 1; i < 8; i++) {
            expect(Math.abs(fft.real[i])).toBeLessThan(1e-10);
            expect(Math.abs(fft.imag[i])).toBeLessThan(1e-10);
        }
    });
    
    test('FFT of Nyquist signal (alternating ±1)', () => {
        const fft = new FFT(8);
        const input = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1]);
        fft.forward(input);
        
        // FFT of Nyquist should have all energy in bin N/2
        expect(fft.real[4]).toBeCloseTo(8, 5);
        for (let i = 0; i < 8; i++) {
            if (i !== 4) {
                expect(Math.abs(fft.real[i])).toBeLessThan(1e-10);
            }
            expect(Math.abs(fft.imag[i])).toBeLessThan(1e-10);
        }
    });
    
    test('FFT of single frequency (cosine wave)', () => {
        const N = 16;
        const fft = new FFT(N);
        const k = 3; // 3 cycles in N samples
        
        const input = new Float32Array(N);
        for (let n = 0; n < N; n++) {
            input[n] = Math.cos(2 * Math.PI * k * n / N);
        }
        
        fft.forward(input);
        
        // Energy should be at bin k and N-k (symmetric for real input)
        const mag = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            mag[i] = Math.sqrt(fft.real[i] ** 2 + fft.imag[i] ** 2);
        }
        
        // Bin k should have magnitude N/2
        expect(mag[k]).toBeCloseTo(N / 2, 3);
        expect(mag[N - k]).toBeCloseTo(N / 2, 3);
        
        // Other bins should be near zero
        for (let i = 0; i < N; i++) {
            if (i !== k && i !== N - k) {
                expect(mag[i]).toBeLessThan(0.01);
            }
        }
    });
});
