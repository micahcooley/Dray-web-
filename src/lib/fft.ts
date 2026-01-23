export class FFT {
    private size: number;
    private reverseTable: Uint32Array;
    private sinTable: Float32Array;
    private cosTable: Float32Array;

    constructor(size: number) {
        if (!this.isPowerOfTwo(size)) {
            throw new Error(`FFT size must be a power of two. Got ${size}.`);
        }
        this.size = size;
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float32Array(size / 2);
        this.cosTable = new Float32Array(size / 2);

        this.initializeTables();
    }

    private isPowerOfTwo(n: number): boolean {
        return (n & (n - 1)) === 0 && n > 0;
    }

    private initializeTables() {
        const size = this.size;

        // Precompute bit reversal table
        let limit = 1;
        let bit = size >> 1;

        while (limit < size) {
            for (let i = 0; i < limit; i++) {
                this.reverseTable[i + limit] = this.reverseTable[i] + bit;
            }
            limit <<= 1;
            bit >>= 1;
        }

        // Precompute twiddle factors
        // We only need size/2 twiddle factors because of symmetry
        for (let i = 0; i < size / 2; i++) {
            const angle = -2 * Math.PI * i / size;
            this.cosTable[i] = Math.cos(angle);
            this.sinTable[i] = Math.sin(angle);
        }
    }

    /**
     * Performs a forward FFT in-place.
     * @param real Real part of the input/output.
     * @param imag Imaginary part of the input/output.
     */
    forward(real: Float32Array, imag: Float32Array) {
        this.validateArrays(real, imag);
        this.process(real, imag, false);
    }

    /**
     * Performs an inverse FFT in-place.
     * Scale factor of 1/N is applied.
     * @param real Real part of the input/output.
     * @param imag Imaginary part of the input/output.
     */
    inverse(real: Float32Array, imag: Float32Array) {
        this.validateArrays(real, imag);
        this.process(real, imag, true);

        // Scale by 1/N
        const size = this.size;
        const invSize = 1.0 / size;
        for (let i = 0; i < size; i++) {
            real[i] *= invSize;
            imag[i] *= invSize;
        }
    }

    private validateArrays(real: Float32Array, imag: Float32Array) {
        if (real.length !== this.size || imag.length !== this.size) {
            throw new Error(`Input arrays must have length ${this.size}.`);
        }
    }

    /**
     * Core FFT processing (Iterative Cooley-Tukey)
     */
    private process(real: Float32Array, imag: Float32Array, inverse: boolean) {
        const size = this.size;
        const cosTable = this.cosTable;
        const sinTable = this.sinTable;
        const reverseTable = this.reverseTable;

        // Bit-reversal permutation
        for (let i = 0; i < size; i++) {
            const rev = reverseTable[i];
            if (i < rev) {
                const tr = real[i];
                const ti = imag[i];
                real[i] = real[rev];
                imag[i] = imag[rev];
                real[rev] = tr;
                imag[rev] = ti;
            }
        }

        // Butterfly operations
        let halfSize = 1;

        while (halfSize < size) {
            const phaseStep = (size / 2) / halfSize; // Step in twiddle table

            for (let i = 0; i < size; i += (halfSize << 1)) {
                let phase = 0;

                for (let j = i; j < i + halfSize; j++) {
                    const cosVal = cosTable[phase];
                    const sinVal = inverse ? -sinTable[phase] : sinTable[phase];

                    const tr = real[j + halfSize] * cosVal - imag[j + halfSize] * sinVal;
                    const ti = real[j + halfSize] * sinVal + imag[j + halfSize] * cosVal;

                    real[j + halfSize] = real[j] - tr;
                    imag[j + halfSize] = imag[j] - ti;
                    real[j] = real[j] + tr;
                    imag[j] = imag[j] + ti;

                    phase += phaseStep;
                }
            }
            halfSize <<= 1;
        }
    }

    /**
     * Creates a Complex Array (Struct of Arrays) for use with this FFT
     */
    createComplexArray(): { real: Float32Array, imag: Float32Array } {
        return {
            real: new Float32Array(this.size),
            imag: new Float32Array(this.size)
        };
    }
}
