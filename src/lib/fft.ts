
/**
 * Fast Fourier Transform (FFT) Implementation
 * Uses an Iterative Radix-2 Cooley-Tukey algorithm.
 * Optimized for performance with pre-computed tables and minimal allocation.
 */
export class FFT {
    private size: number;
    private cosTable: Float32Array;
    private sinTable: Float32Array;
    private reverseTable: Uint32Array;

    constructor(size: number) {
        if ((size & (size - 1)) !== 0 || size === 0) {
            throw new Error("FFT size must be a power of 2");
        }
        this.size = size;
        this.cosTable = new Float32Array(size / 2);
        this.sinTable = new Float32Array(size / 2);
        this.reverseTable = new Uint32Array(size);

        this.initializeTables();
    }

    private initializeTables() {
        const size = this.size;

        // Trigonometric tables
        // We store cos(-theta) and sin(-theta) for forward transform
        // theta = 2 * PI * i / size
        for (let i = 0; i < size / 2; i++) {
            const angle = -2 * Math.PI * i / size;
            this.cosTable[i] = Math.cos(angle);
            this.sinTable[i] = Math.sin(angle);
        }

        // Bit reversal table
        const levels = Math.log2(size);
        for (let i = 0; i < size; i++) {
            let rev = 0;
            for (let j = 0; j < levels; j++) {
                if ((i >> j) & 1) {
                    rev |= (1 << (levels - 1 - j));
                }
            }
            this.reverseTable[i] = rev;
        }
    }

    /**
     * Perform FFT or IFFT
     * @param realInput Real part of input
     * @param imagInput Imaginary part of input
     * @param realOutput Real part of output
     * @param imagOutput Imaginary part of output
     * @param inverse If true, perform Inverse FFT
     */
    public process(
        realInput: Float32Array,
        imagInput: Float32Array,
        realOutput: Float32Array,
        imagOutput: Float32Array,
        inverse: boolean = false
    ) {
        if (realInput.length !== this.size || imagInput.length !== this.size ||
            realOutput.length !== this.size || imagOutput.length !== this.size) {
            throw new Error(`Input/Output buffers must match FFT size (${this.size})`);
        }

        const size = this.size;
        const rev = this.reverseTable;

        // Bit-reverse copy
        if (realInput === realOutput) {
            // In-place bit reversal
            for (let i = 0; i < size; i++) {
                const j = rev[i];
                if (i < j) {
                    const tempR = realOutput[i];
                    const tempI = imagOutput[i];
                    realOutput[i] = realOutput[j];
                    imagOutput[i] = imagOutput[j];
                    realOutput[j] = tempR;
                    imagOutput[j] = tempI;
                }
            }
        } else {
            // Out-of-place bit-reverse copy
            for (let i = 0; i < size; i++) {
                const j = rev[i];
                realOutput[j] = realInput[i];
                imagOutput[j] = imagInput[i];
            }
        }

        // Cooley-Tukey Butterfly Operations
        for (let halfSize = 1; halfSize < size; halfSize *= 2) {
            const phaseStep = (size / 2) / halfSize;

            for (let i = 0; i < halfSize; i++) {
                // For IFFT, we need conjugate kernel: exp(j*theta) = cos(theta) + j*sin(theta)
                // Our table has cos(-theta) and sin(-theta).
                // cos(-theta) = cos(theta)
                // sin(-theta) = -sin(theta)
                // So table stores (cos, -sin).
                // IFFT needs (cos, sin).
                // So we negate the sin part from the table if inverse is true.
                // Wait! If table has `sin(-theta)`, then `table.sin` is negative.
                // If `inverse` is true, we want positive sin. So `-table.sin`?
                // Let's check:
                // Forward: c + j*s = cos(-theta) + j*sin(-theta). Correct.
                // Inverse: c + j*s = cos(theta) + j*sin(theta).
                // My table has `s_table = sin(-theta) = -sin(theta)`.
                // So `sin(theta) = -s_table`.
                // So yes, inverse uses `-this.sinTable`.

                const tableIdx = i * phaseStep;
                const c = this.cosTable[tableIdx];
                const s = inverse ? -this.sinTable[tableIdx] : this.sinTable[tableIdx];

                for (let j = i; j < size; j += 2 * halfSize) {
                    const k = j + halfSize;

                    const tReal = realOutput[k] * c - imagOutput[k] * s;
                    const tImag = realOutput[k] * s + imagOutput[k] * c;

                    realOutput[k] = realOutput[j] - tReal;
                    imagOutput[k] = imagOutput[j] - tImag;
                    realOutput[j] += tReal;
                    imagOutput[j] += tImag;
                }
            }
        }

        // Scaling for Inverse Transform
        if (inverse) {
            const scale = 1.0 / size;
            for (let i = 0; i < size; i++) {
                realOutput[i] *= scale;
                imagOutput[i] *= scale;
            }
        }
    }
}
