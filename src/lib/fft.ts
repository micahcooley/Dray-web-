/**
 * Fast Fourier Transform (FFT) Implementation
 * Algorithm: Iterative Radix-2 Cooley-Tukey
 *
 * Provides static methods for forward and inverse FFT operations.
 * Input arrays must be powers of two in length.
 */

export class FFT {
    /**
     * Reverse bits of a number (used for bit-reversal permutation)
     */
    private static reverseBits(x: number, bits: number): number {
        let y = 0;
        for (let i = 0; i < bits; i++) {
            y = (y << 1) | (x & 1);
            x >>>= 1;
        }
        return y;
    }

    /**
     * Helper to find the next power of two
     */
    static ensurePowerOfTwo(n: number): number {
        return Math.pow(2, Math.ceil(Math.log2(n)));
    }

    /**
     * Compute FFT in-place.
     * @param real Real parts of the input/output
     * @param imag Imaginary parts of the input/output
     */
    static fft(real: Float32Array, imag: Float32Array): void {
        const n = real.length;
        if (n !== imag.length) throw new Error("Real and imaginary arrays must have the same length");
        if ((n & (n - 1)) !== 0) throw new Error("Array length must be a power of two");

        // Bit-reversal permutation
        const bits = Math.log2(n);
        for (let i = 0; i < n; i++) {
            const rev = FFT.reverseBits(i, bits);
            if (i < rev) {
                [real[i], real[rev]] = [real[rev], real[i]];
                [imag[i], imag[rev]] = [imag[rev], imag[i]];
            }
        }

        // Cooley-Tukey butterfly operations
        for (let len = 2; len <= n; len <<= 1) {
            const halfLen = len >> 1;
            const angle = -2 * Math.PI / len;
            const wLenReal = Math.cos(angle);
            const wLenImag = Math.sin(angle);

            for (let i = 0; i < n; i += len) {
                let wReal = 1;
                let wImag = 0;

                for (let j = 0; j < halfLen; j++) {
                    const uReal = real[i + j];
                    const uImag = imag[i + j];

                    const vIndex = i + j + halfLen;
                    const vRealRaw = real[vIndex];
                    const vImagRaw = imag[vIndex];

                    // Complex multiplication: w * v
                    const tReal = wReal * vRealRaw - wImag * vImagRaw;
                    const tImag = wReal * vImagRaw + wImag * vRealRaw;

                    real[i + j] = uReal + tReal;
                    imag[i + j] = uImag + tImag;
                    real[vIndex] = uReal - tReal;
                    imag[vIndex] = uImag - tImag;

                    // Update w (rotate)
                    const wRealNext = wReal * wLenReal - wImag * wLenImag;
                    const wImagNext = wReal * wLenImag + wImag * wLenReal;
                    wReal = wRealNext;
                    wImag = wImagNext;
                }
            }
        }
    }

    /**
     * Compute Inverse FFT in-place.
     * Scale factor (1/N) is applied.
     */
    static ifft(real: Float32Array, imag: Float32Array): void {
        const n = real.length;

        // Conjugate input
        for (let i = 0; i < n; i++) {
            imag[i] = -imag[i];
        }

        // Forward FFT
        FFT.fft(real, imag);

        // Conjugate output and scale
        for (let i = 0; i < n; i++) {
            imag[i] = -imag[i];
            real[i] /= n;
            imag[i] /= n;
        }
    }
}
