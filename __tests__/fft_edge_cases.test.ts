import { FFT } from '../src/lib/fft';

describe('FFT Edge Cases and Correctness', () => {
    test('Division by zero in parabolic interpolation', () => {
        // If prev - 2*curr + next = 0, we get division by zero
        // This can happen if three consecutive points are collinear
        // The parabolic interpolation formula is: offset = (prev - next) / (2 * (prev - 2*curr + next))
        
        // Simulate the scenario
        const prev = 1.0;
        const curr = 1.0;
        const next = 1.0;
        const denominator = 2 * (prev - 2 * curr + next);
        
        console.log('Denominator when all equal:', denominator);
        expect(denominator).toBe(0); // This WILL be zero!
    });

    test('FFT with size 2', () => {
        const fft = new FFT(2);
        const input = new Float32Array([1, -1]);
        fft.forward(input);
        
        // Manual DFT for size 2:
        // X[0] = x[0] + x[1] = 1 + (-1) = 0
        // X[1] = x[0] - x[1] = 1 - (-1) = 2
        
        expect(fft.real[0]).toBeCloseTo(0, 5);
        expect(fft.real[1]).toBeCloseTo(2, 5);
        expect(fft.imag[0]).toBeCloseTo(0, 5);
        expect(fft.imag[1]).toBeCloseTo(0, 5);
    });

    test('FFT roundtrip without scaling', () => {
        const size = 8;
        const fft = new FFT(size);
        const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const original = new Float32Array(input);
        
        fft.forward(input);
        const realCopy = new Float32Array(fft.real);
        const imagCopy = new Float32Array(fft.imag);
        fft.inverse(realCopy, imagCopy);
        
        // IFFT without scaling should give N * original
        for (let i = 0; i < size; i++) {
            expect(fft.real[i]).toBeCloseTo(original[i] * size, 3);
        }
    });

    test('Zero input produces valid output', () => {
        const fft = new FFT(1024);
        const zeros = new Float32Array(1024);
        fft.forward(zeros);
        
        // All should be zero, no NaN or Infinity
        for (let i = 0; i < 1024; i++) {
            expect(isFinite(fft.real[i])).toBe(true);
            expect(isFinite(fft.imag[i])).toBe(true);
            expect(fft.real[i]).toBeCloseTo(0, 5);
            expect(fft.imag[i]).toBeCloseTo(0, 5);
        }
    });

    test('Bit reversal correctness for size 8', () => {
        const fft = new FFT(8);
        // @ts-ignore - accessing private field for testing
        const reverseTable = fft['reverseTable'];
        
        // Expected bit reversal for size 8:
        // 0 (000) -> 0 (000)
        // 1 (001) -> 4 (100)
        // 2 (010) -> 2 (010)
        // 3 (011) -> 6 (110)
        // 4 (100) -> 1 (001)
        // 5 (101) -> 5 (101)
        // 6 (110) -> 3 (011)
        // 7 (111) -> 7 (111)
        const expected = [0, 4, 2, 6, 1, 5, 3, 7];
        
        for (let i = 0; i < 8; i++) {
            expect(reverseTable[i]).toBe(expected[i]);
        }
    });

    test('Check for potential integer overflow in twiddle factor indexing', () => {
        // In compute(), we have: const tableIdx = i * (halfSize / k);
        // If k=1, halfSize/k could be very large
        // For size=4096, halfSize=2048, when k=1, tableIdx = i * 2048
        // This could cause index out of bounds if not careful
        
        const size = 4096;
        const fft = new FFT(size);
        const input = new Float32Array(size);
        input[100] = 1; // Non-zero somewhere
        
        expect(() => fft.forward(input)).not.toThrow();
    });

    test('inverseFromInternal with already bit-reversed data', () => {
        const fft = new FFT(16);
        const input = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        
        fft.forward(input);
        
        // Now fft.real and fft.imag contain frequency domain data (NOT bit-reversed)
        // inverseFromInternal should bit-reverse them first
        
        const realBefore = new Float32Array(fft.real);
        const imagBefore = new Float32Array(fft.imag);
        
        fft.inverseFromInternal();
        
        // Result should be close to 16 * [1, 0, 0, ...] (no scaling)
        expect(fft.real[0]).toBeCloseTo(16, 3);
        for (let i = 1; i < 16; i++) {
            expect(Math.abs(fft.real[i])).toBeLessThan(1e-6);
        }
    });
});
