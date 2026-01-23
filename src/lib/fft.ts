/**
 * Optimized FFT implementation using Radix-2 Cooley-Tukey algorithm.
 * Non-recursive implementation with pre-calculated lookup tables.
 *
 * Optimized for performance:
 * - Pre-allocated buffers
 * - Pre-calculated sine/cosine tables
 * - Bit-reversal permutation lookup
 */
export class FFT {
    size: number;
    private real: Float32Array;
    private imag: Float32Array;
    private sinTable: Float32Array;
    private cosTable: Float32Array;
    private reverseTable: Uint32Array;

    constructor(size: number) {
        if (!this.isPowerOfTwo(size)) {
            throw new Error(`FFT size must be a power of two. Got ${size}`);
        }

        this.size = size;
        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
        this.sinTable = new Float32Array(size / 2);
        this.cosTable = new Float32Array(size / 2);
        this.reverseTable = new Uint32Array(size);

        this.initializeTables();
    }

    private isPowerOfTwo(n: number): boolean {
        return n > 0 && (n & (n - 1)) === 0;
    }

    private initializeTables() {
        // Precompute sine/cosine tables
        const halfSize = this.size / 2;
        for (let i = 0; i < halfSize; i++) {
            this.cosTable[i] = Math.cos(-2 * Math.PI * i / this.size);
            this.sinTable[i] = Math.sin(-2 * Math.PI * i / this.size);
        }

        // Precompute bit reversal table
        const bit = this.size >> 1;
        let i = 0;
        let j = 0;

        while (i < this.size) {
            this.reverseTable[i] = j;
            let m = bit;
            while (m >= 1 && j >= m) {
                j -= m;
                m >>= 1;
            }
            j += m;
            i++;
        }
    }

    /**
     * Compute the magnitude spectrum of a real-valued input.
     * @param input Real-valued input array (length must match FFT size)
     * @returns Float32Array containing magnitude spectrum (size/2)
     */
    public getMagnitudeSpectrum(input: Float32Array): Float32Array {
        if (input.length !== this.size) {
            throw new Error(`Input size ${input.length} does not match FFT size ${this.size}`);
        }

        // Copy input to real buffer and clear imag buffer
        for (let i = 0; i < this.size; i++) {
            this.real[i] = input[i];
            this.imag[i] = 0;
        }

        this.transform();

        // Calculate magnitude
        // Only return first N/2 bins (Nyquist)
        const outputSize = this.size / 2;
        const magnitudes = new Float32Array(outputSize);

        for (let i = 0; i < outputSize; i++) {
            magnitudes[i] = Math.sqrt(
                this.real[i] * this.real[i] +
                this.imag[i] * this.imag[i]
            );
        }

        return magnitudes;
    }

    /**
     * Perform the FFT transformation in-place on this.real and this.imag
     */
    private transform() {
        // Bit-reversal permutation
        for (let i = 0; i < this.size; i++) {
            const j = this.reverseTable[i];
            if (j > i) {
                const tempReal = this.real[i];
                const tempImag = this.imag[i];
                this.real[i] = this.real[j];
                this.imag[i] = this.imag[j];
                this.real[j] = tempReal;
                this.imag[j] = tempImag;
            }
        }

        // Butterfly operations
        let halfSize = 1;
        while (halfSize < this.size) {
            // We can iterate through the precomputed table with a stride
            const tableStride = (this.size / 2) / halfSize;

            for (let i = 0; i < halfSize; i++) {
                const currentPhaseShiftReal = this.cosTable[i * tableStride];
                const currentPhaseShiftImag = this.sinTable[i * tableStride];

                for (let j = i; j < this.size; j += halfSize * 2) {
                    const k = j + halfSize;

                    const tr = currentPhaseShiftReal * this.real[k] - currentPhaseShiftImag * this.imag[k];
                    const ti = currentPhaseShiftReal * this.imag[k] + currentPhaseShiftImag * this.real[k];

                    this.real[k] = this.real[j] - tr;
                    this.imag[k] = this.imag[j] - ti;
                    this.real[j] += tr;
                    this.imag[j] += ti;
                }
            }
            halfSize <<= 1;
        }
    }
}
