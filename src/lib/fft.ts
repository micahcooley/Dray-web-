
/**
 * Fast Fourier Transform (FFT) Implementation
 * Non-recursive Radix-2 Cooley-Tukey algorithm (O(N log N))
 */
export class FFT {
    private size: number;
    private reverseTable: Uint32Array;

    // Pre-allocated buffers to minimize GC
    private real: Float32Array;
    private imag: Float32Array;
    private output: Float32Array;

    constructor(size: number) {
        if (!this.isPowerOfTwo(size)) {
            throw new Error(`FFT size must be a power of two. Got ${size}`);
        }

        this.size = size;
        this.reverseTable = new Uint32Array(size);

        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
        this.output = new Float32Array(size / 2);

        this.initializeTables();
    }

    private isPowerOfTwo(n: number): boolean {
        return (n & (n - 1)) === 0 && n > 0;
    }

    private initializeTables() {
        // Precompute bit reversal table
        const limit = 1;
        let bit = this.size >> 1;
        let i = 0;
        let j = 0;

        while (i < this.size) {
            this.reverseTable[i] = j;
            let mask = bit;
            while (mask <= j) {
                j -= mask;
                mask >>= 1;
            }
            j += mask;
            i++;
        }
    }

    /**
     * Performs forward FFT on real input data
     * Returns magnitude spectrum (first N/2 bins)
     * NOTE: Returns a reference to an internal buffer. Copy if you need to persist it.
     */
    public forward(input: Float32Array): Float32Array {
        const n = this.size;

        // Use pre-allocated buffers
        const real = this.real;
        const imag = this.imag;

        // Bit-reverse copy
        for (let i = 0; i < n; i++) {
            const rev = this.reverseTable[i];
            // Handle input smaller than FFT size by zero-padding
            real[i] = i < input.length ? input[rev] : 0;
            imag[i] = 0;
        }

        // Cooley-Tukey butterfly operations
        let halfSize = 1;
        while (halfSize < n) {
            // Recurrence relation for trigonometric values
            const theta = -Math.PI / halfSize;
            const phaseShiftStepReal = Math.cos(theta);
            const phaseShiftStepImag = Math.sin(theta);

            let currentPhaseShiftReal = 1.0;
            let currentPhaseShiftImag = 0.0;

            for (let fftStep = 0; fftStep < halfSize; fftStep++) {
                for (let i = fftStep; i < n; i += 2 * halfSize) {
                    const j = i + halfSize;

                    const tr = currentPhaseShiftReal * real[j] - currentPhaseShiftImag * imag[j];
                    const ti = currentPhaseShiftReal * imag[j] + currentPhaseShiftImag * real[j];

                    real[j] = real[i] - tr;
                    imag[j] = imag[i] - ti;
                    real[i] += tr;
                    imag[i] += ti;
                }

                // Update phase shift
                const tmpReal = currentPhaseShiftReal;
                currentPhaseShiftReal = tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
                currentPhaseShiftImag = tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
            }

            halfSize <<= 1;
        }

        // Calculate magnitude
        const result = this.output;
        for (let i = 0; i < n / 2; i++) {
            result[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        return result;
    }
}
