/**
 * Optimized Fast Fourier Transform (FFT) implementation.
 * Uses Iterative Radix-2 Cooley-Tukey algorithm.
 *
 * Features:
 * - Pre-allocated buffers to minimize GC
 * - Pre-computed bit-reversal tables and twiddle factors
 * - Optimized for Float32Array
 */
export class FFT {
    public readonly size: number;
    public readonly real: Float32Array;
    public readonly imag: Float32Array;

    private readonly reverseTable: Uint32Array;
    private readonly sinTable: Float32Array;
    private readonly cosTable: Float32Array;

    constructor(size: number) {
        if (!size || (size & (size - 1)) !== 0) {
            throw new Error(`FFT size must be a power of 2. Got ${size}`);
        }

        this.size = size;
        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float32Array(size);
        this.cosTable = new Float32Array(size);

        this.initTables();
    }

    private initTables(): void {
        const size = this.size;

        // Pre-compute bit reversal table
        let limit = 1;
        let bit = size >> 1;

        while (limit < size) {
            for (let i = 0; i < limit; i++) {
                this.reverseTable[i + limit] = this.reverseTable[i] + bit;
            }
            limit <<= 1;
            bit >>= 1;
        }

        // Pre-compute twiddle factors
        // We only need size/2 factors, but allocating full size simplifies indexing logic in some variations.
        // Standard Cooley-Tukey loops often use factors up to size/2.
        for (let i = 0; i < size; i++) {
            const angle = -2 * Math.PI * i / size;
            this.sinTable[i] = Math.sin(angle);
            this.cosTable[i] = Math.cos(angle);
        }
    }

    /**
     * Performs forward FFT.
     * Input: Real values in the provided buffer (or internal buffer if copied).
     * Output: Results stored in this.real and this.imag.
     */
    public forward(input: Float32Array): void {
        if (input.length !== this.size) {
            throw new Error(`Input length ${input.length} does not match FFT size ${this.size}`);
        }

        // Bit-reverse copy to internal buffers
        for (let i = 0; i < this.size; i++) {
            const rev = this.reverseTable[i];
            this.real[i] = input[rev];
            this.imag[i] = 0; // Assuming real input
        }

        this.compute();
    }

    /**
     * Performs inverse FFT.
     * Input: Real and Imaginary arrays.
     * Output: Results stored in this.real and this.imag.
     * Note: The result is NOT scaled by 1/N. Caller must scale if needed.
     */
    public inverse(realInput: Float32Array, imagInput: Float32Array): void {
        if (realInput.length !== this.size || imagInput.length !== this.size) {
            throw new Error(`Input length does not match FFT size ${this.size}`);
        }

        // Conjugate input + Bit-reverse copy
        for (let i = 0; i < this.size; i++) {
            const rev = this.reverseTable[i];
            this.real[i] = realInput[rev];
            this.imag[i] = -imagInput[rev]; // Conjugate for IFFT trick
        }

        this.compute();

        // Conjugate output to complete IFFT
        // And optionally scale here, but standard is often to leave scaling to caller or do it once.
        // For convenience in audio, we usually just need the real part scaled, but let's correct both.
        for (let i = 0; i < this.size; i++) {
            this.imag[i] = -this.imag[i];
        }
    }

    /**
     * Performs inverse FFT directly from internal buffers.
     * Assumes this.real and this.imag already hold the frequency domain data.
     * Useful for chain operations (AutoCorr: FFT -> MagSq -> IFFT).
     */
    public inverseFromInternal(): void {
        // We need to shuffle current internal state.
        // This is tricky because we can't do in-place bit-reversal easily without swapping.
        // Easier to copy to temp or assume caller handles data flow.

        // Strategy: Create temp buffers or do a swap-based bit reversal.
        // For performance, let's implement a swap-based bit-reversal on the internal buffers directly first.

        for (let i = 0; i < this.size; i++) {
            const rev = this.reverseTable[i];
            if (i < rev) {
                const tr = this.real[i];
                const ti = this.imag[i];
                this.real[i] = this.real[rev];
                this.imag[i] = this.imag[rev];
                this.real[rev] = tr;
                this.imag[rev] = ti;
            }
        }

        // Conjugate inputs
        for (let i = 0; i < this.size; i++) {
            this.imag[i] = -this.imag[i];
        }

        this.compute();

        // Conjugate outputs
        for (let i = 0; i < this.size; i++) {
            this.imag[i] = -this.imag[i];
        }
    }

    /**
     * Computes the butterfly operations.
     */
    private compute(): void {
        const size = this.size;
        const halfSize = size >> 1;

        for (let k = 1; k < size; k <<= 1) {
            const step = k << 1;
            // For each butterfly width
            for (let i = 0; i < k; i++) {
                // Compute twiddle factor index
                // The angle is -2*PI * i / (2*k) = -PI * i / k
                // Our table is for -2*PI * j / size.
                // We want j such that j/size = i/(2*k) => j = i * size / (2*k)
                const tableIdx = i * (halfSize / k);
                const wr = this.cosTable[tableIdx];
                const wi = this.sinTable[tableIdx];

                for (let j = i; j < size; j += step) {
                    const j2 = j + k;
                    const tr = wr * this.real[j2] - wi * this.imag[j2];
                    const ti = wr * this.imag[j2] + wi * this.real[j2];

                    this.real[j2] = this.real[j] - tr;
                    this.imag[j2] = this.imag[j] - ti;
                    this.real[j] += tr;
                    this.imag[j] += ti;
                }
            }
        }
    }
}
