
export class FFT {
    size: number;
    reverseTable: Uint32Array;
    sinTable: Float32Array;
    cosTable: Float32Array;

    constructor(size: number) {
        if (!Number.isInteger(Math.log2(size))) {
            throw new Error("FFT size must be a power of 2");
        }

        this.size = size;
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float32Array(size);
        this.cosTable = new Float32Array(size);

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
        for (let i = 0; i < size; i++) {
            this.sinTable[i] = Math.sin(-2 * Math.PI * i / size);
            this.cosTable[i] = Math.cos(-2 * Math.PI * i / size);
        }
    }

    forward(real: Float32Array, imag: Float32Array) {
        if (real.length !== this.size || imag.length !== this.size) {
            throw new Error(`FFT arrays must be of length ${this.size}`);
        }

        const size = this.size;
        const reverseTable = this.reverseTable;
        const sinTable = this.sinTable;
        const cosTable = this.cosTable;

        // Bit-reverse permutation
        for (let i = 0; i < size; i++) {
            const rev = reverseTable[i];
            if (i < rev) {
                const tempReal = real[i];
                const tempImag = imag[i];
                real[i] = real[rev];
                imag[i] = imag[rev];
                real[rev] = tempReal;
                imag[rev] = tempImag;
            }
        }

        // Butterfly operations
        let halfSize = 1;
        while (halfSize < size) {
            const phaseStep = Math.floor(size / (halfSize * 2)); // step in trig tables

            for (let i = 0; i < size; i += halfSize * 2) {
                for (let j = 0, phase = 0; j < halfSize; j++, phase += phaseStep) {
                    // Optimization: Look up cos/sin instead of computing
                    // Note: We used full size table, so we step through it
                    const cos = cosTable[phase];
                    const sin = sinTable[phase];

                    const k = i + j;
                    const l = k + halfSize;

                    // Complex multiplication: (a+bi) * (c+di) = (ac - bd) + (ad + bc)i
                    // Here (real[l] + imag[l]i) * (cos + sin i)
                    const tempReal = real[l] * cos - imag[l] * sin;
                    const tempImag = real[l] * sin + imag[l] * cos;

                    real[l] = real[k] - tempReal;
                    imag[l] = imag[k] - tempImag;
                    real[k] = real[k] + tempReal;
                    imag[k] = imag[k] + tempImag;
                }
            }
            halfSize <<= 1;
        }
    }

    inverse(real: Float32Array, imag: Float32Array) {
        // Conjugate input
        for (let i = 0; i < this.size; i++) {
            imag[i] = -imag[i];
        }

        // Forward FFT
        this.forward(real, imag);

        // Conjugate output and scale
        const scale = 1 / this.size;
        for (let i = 0; i < this.size; i++) {
            imag[i] = -imag[i] * scale;
            real[i] = real[i] * scale;
        }
    }
}
