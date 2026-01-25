export class FFT {
    private size: number;
    private reverseTable: Uint32Array;
    private sinTable: Float32Array;
    private cosTable: Float32Array;

    constructor(size: number) {
        if (!Number.isInteger(Math.log2(size))) {
            throw new Error("FFT size must be a power of two.");
        }
        this.size = size;
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float32Array(size);
        this.cosTable = new Float32Array(size);

        this.precomputeTables();
    }

    private precomputeTables() {
        const levels = Math.log2(this.size);
        for (let i = 0; i < this.size; i++) {
            let rev = 0;
            let n = i;
            for (let j = 0; j < levels; j++) {
                rev = (rev << 1) | (n & 1);
                n >>= 1;
            }
            this.reverseTable[i] = rev;
        }

        for (let i = 0; i < this.size; i++) {
            const angle = (2 * Math.PI * i) / this.size;
            this.sinTable[i] = Math.sin(angle);
            this.cosTable[i] = Math.cos(angle);
        }
    }

    public forward(input: Float32Array): Float32Array {
        if (input.length !== this.size) {
            throw new Error(`Input buffer size must be ${this.size}`);
        }

        const real = new Float32Array(this.size);
        const imag = new Float32Array(this.size);

        // Bit-reversal permutation
        for (let i = 0; i < this.size; i++) {
            real[i] = input[this.reverseTable[i]];
            // imag[i] is already 0
        }

        // Cooley-Tukey butterfly operations
        for (let size = 2; size <= this.size; size *= 2) {
            const halfSize = size / 2;
            const tableStep = this.size / size;

            for (let i = 0; i < this.size; i += size) {
                for (let j = 0; j < halfSize; j++) {
                    const k = j * tableStep;
                    const cos = this.cosTable[k];
                    const sin = this.sinTable[k]; // Positive sine from table

                    const next = i + j + halfSize;

                    // Complex multiplication: (real[next] + i*imag[next]) * (cos - i*sin)
                    // = (real[next]*cos + imag[next]*sin) + i(imag[next]*cos - real[next]*sin)
                    const tReal = real[next] * cos + imag[next] * sin;
                    const tImag = imag[next] * cos - real[next] * sin;

                    real[next] = real[i + j] - tReal;
                    imag[next] = imag[i + j] - tImag;
                    real[i + j] += tReal;
                    imag[i + j] += tImag;
                }
            }
        }

        // Compute magnitude spectrum for the first N/2 bins
        const outputSize = this.size / 2;
        const magnitudes = new Float32Array(outputSize);
        for (let i = 0; i < outputSize; i++) {
            magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        return magnitudes;
    }
}
