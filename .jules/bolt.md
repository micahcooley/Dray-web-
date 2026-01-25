## 2024-05-22 - Optimizing FFT with Cooley-Tukey
**Learning:** Hand-rolling a standard iterative Cooley-Tukey FFT in TypeScript (using TypedArrays and precomputed tables) is drastically faster (over 600x) than a naive O(N^2) DFT implementation for N=4096. Even in a high-level language like JS/TS, algorithmic complexity dominates.
**Action:** Always prefer O(N log N) FFT over naive DFT for spectral analysis, even if "simple" code is desired. Isolate the math in a dedicated class (`src/lib/fft.ts`) to keep it reusable and testable.
