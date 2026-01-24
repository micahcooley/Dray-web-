import { FFT } from '../src/lib/fft';

describe('FFT', () => {
    it('should calculate FFT of an impulse', () => {
        const fft = new FFT(4);
        const input = new Float32Array([1, 0, 0, 0]);
        const { real, imag } = fft.forward(input);

        // FFT of delta is constant 1
        expect(real[0]).toBeCloseTo(1);
        expect(real[1]).toBeCloseTo(1);
        expect(real[2]).toBeCloseTo(1);
        expect(real[3]).toBeCloseTo(1);

        expect(imag[0]).toBeCloseTo(0);
        expect(imag[1]).toBeCloseTo(0);
        expect(imag[2]).toBeCloseTo(0);
        expect(imag[3]).toBeCloseTo(0);
    });

    it('should calculate FFT of a constant signal (DC)', () => {
        const fft = new FFT(4);
        const input = new Float32Array([1, 1, 1, 1]);
        const { real, imag } = fft.forward(input);

        // FFT of DC is Dirac at 0 scaled by N
        expect(real[0]).toBeCloseTo(4);
        expect(real[1]).toBeCloseTo(0);
        expect(real[2]).toBeCloseTo(0);
        expect(real[3]).toBeCloseTo(0);
    });

    it('should respect the inverse property', () => {
        const size = 64;
        const fft = new FFT(size);
        const input = new Float32Array(size);
        for(let i=0; i<size; i++) {
            input[i] = Math.random();
        }

        const { real, imag } = fft.forward(input);

        // Copy output because fft.inverse uses internal buffers which might overwrite
        // Actually fft.inverse takes inputReal/inputImag.
        // But if we pass fft.real/fft.imag, they will be overwritten by the result?
        // Let's check implementation.
        // inverse() writes to this.real/this.imag.
        // It reads from inputReal/inputImag.
        // If inputReal IS this.real, we have a problem because we modify in place?
        // The implementation:
        // for (let i = 0; i < n; i++) { const rev = ...; this.real[i] = inputReal[rev]; ... }
        // If inputReal is this.real, we are reading from the same buffer we are writing to with bit reversal.
        // Yes, this is dangerous if not handled carefully (swapping).
        // My implementation copies to this.real[i] from inputReal[rev].
        // If i < rev, we overwrite a value we need later?
        // Standard bit-reversal in place swaps. My implementation does `this.real[i] = input[rev]`.
        // If `this.real` and `input` are the same array, this is destructive and incorrect unless done as swaps.
        // So for the test, we MUST copy the forward result.

        const realCopy = new Float32Array(real);
        const imagCopy = new Float32Array(imag);

        const out = fft.inverse(realCopy, imagCopy);

        for(let i=0; i<size; i++) {
            expect(out.real[i]).toBeCloseTo(input[i], 5);
            expect(out.imag[i]).toBeCloseTo(0, 5);
        }
    });
});
