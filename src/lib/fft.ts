export class FFT {
    public readonly size: number;
    private reverseTable: Uint32Array;
    private sinTable: Float32Array;
    private cosTable: Float32Array;

    // Internal workspace to avoid allocation per call
    // Callers should copy data out if they need persistence across calls
    public real: Float32Array;
    public imag: Float32Array;

    constructor(size: number) {
        if (!this.isPowerOfTwo(size)) {
            throw new Error(`FFT size must be a power of two. Got ${size}`);
        }
        this.size = size;
        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float32Array(size);
        this.cosTable = new Float32Array(size);

        this.initializeTables();
    }

    private isPowerOfTwo(n: number): boolean {
        return n > 0 && (n & (n - 1)) === 0;
    }

    private initializeTables() {
        const n = this.size;

        // Compute bit reversal table
        let limit = 1;
        let bit = n >> 1;
        while (limit < n) {
            for (let i = 0; i < limit; i++) {
                this.reverseTable[i + limit] = this.reverseTable[i] + bit;
            }
            limit <<= 1;
            bit >>= 1;
        }

        // Compute twiddle factors (sine/cosine tables)
        // We compute standard sine/cosine for usage in butterflies
        for (let i = 0; i < n; i++) {
            const k = -2 * Math.PI * i / n;
            this.cosTable[i] = Math.cos(k);
            this.sinTable[i] = Math.sin(k);
        }
    }

    /**
     * Performs a forward FFT on the provided real input.
     * The result is stored in this.real and this.imag.
     */
    public forward(input: Float32Array): { real: Float32Array, imag: Float32Array } {
        if (input.length !== this.size) {
             throw new Error(`Input size ${input.length} does not match FFT size ${this.size}`);
        }

        const n = this.size;

        // Bit-reverse copy input to real, zero imag
        for (let i = 0; i < n; i++) {
            this.real[i] = input[this.reverseTable[i]];
            this.imag[i] = 0;
        }

        this.computeTransform(false);

        return { real: this.real, imag: this.imag };
    }

    /**
     * Performs an inverse FFT on the provided real and imaginary components.
     * The result is stored in this.real (this.imag should be near zero for real signals).
     * Note: This scales the output by 1/N.
     */
    public inverse(inputReal: Float32Array, inputImag: Float32Array): { real: Float32Array, imag: Float32Array } {
        if (inputReal.length !== this.size || inputImag.length !== this.size) {
            throw new Error(`Input sizes must match FFT size ${this.size}`);
        }

        const n = this.size;

        // Bit-reverse copy
        for (let i = 0; i < n; i++) {
            const rev = this.reverseTable[i];
            this.real[i] = inputReal[rev];
            this.imag[i] = inputImag[rev];
        }

        // For inverse, we use conjugate symmetry property or just negative angle.
        // Standard trick: Swap real/imag parts or use different trig table logic.
        // Here we can reuse the loop structure but use conjugate twiddle factors (sin becomes -sin).
        // Or simpler: IFFT(x) = conj(FFT(conj(x))) / N
        // Which means: pass imag as -imag, do forward, then result is conj scaled.
        // But implementing directly is cleaner for performance.

        // We will reuse computeTransform but with a flag to invert sine
        this.computeTransform(true);

        // Scale by 1/N
        const invN = 1.0 / n;
        for (let i = 0; i < n; i++) {
            this.real[i] *= invN;
            this.imag[i] *= invN;
        }

        return { real: this.real, imag: this.imag };
    }

    /**
     * Core Cooley-Tukey Butterfly Implementation
     */
    private computeTransform(inverse: boolean) {
        const n = this.size;
        const halfSize = n / 2;

        // Iterative FFT
        for (let size = 2; size <= n; size *= 2) {
            const halfstep = size / 2;
            const tablestep = n / size;

            for (let i = 0; i < n; i += size) {
                let k = 0;
                for (let j = i; j < i + halfstep; j++) {
                    const costable = this.cosTable[k];
                    // For inverse, sin is negated (equivalent to conjugate)
                    const sintable = inverse ? -this.sinTable[k] : this.sinTable[k];

                    const tReal = this.real[j + halfstep] * costable - this.imag[j + halfstep] * sintable;
                    const tImag = this.real[j + halfstep] * sintable + this.imag[j + halfstep] * costable;

                    this.real[j + halfstep] = this.real[j] - tReal;
                    this.imag[j + halfstep] = this.imag[j] - tImag;

                    this.real[j] += tReal;
                    this.imag[j] += tImag;

                    k += tablestep;
                }
            }
        }
    }
}
