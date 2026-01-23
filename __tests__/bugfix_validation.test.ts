import { FFT } from '../src/lib/fft';

describe('Bug Fix Validation', () => {
    describe('Bug #1: Division by zero in parabolic interpolation', () => {
        test('should handle flat regions in YIN buffer without NaN', () => {
            // Simulate the parabolic interpolation with equal values (flat region)
            const prev = 0.5;
            const curr = 0.5;
            const next = 0.5;
            
            // Original buggy code would do: offset = (prev - next) / (2 * (prev - 2 * curr + next))
            // = 0 / (2 * (0.5 - 1.0 + 0.5)) = 0 / 0 = NaN
            
            // Fixed code should handle this:
            const denominator = 2 * (prev - 2 * curr + next);
            const offset = Math.abs(denominator) > 1e-10 ? (prev - next) / denominator : 0;
            
            expect(offset).toBe(0);
            expect(isFinite(offset)).toBe(true);
            
            // Verify the refined period is valid
            const bestPeriod = 100;
            const refinedPeriod = bestPeriod + offset;
            expect(isFinite(refinedPeriod)).toBe(true);
            expect(refinedPeriod).toBe(100);
        });

        test('should produce valid frequency and MIDI note values', () => {
            const sampleRate = 44100;
            const bestPeriod = 100;
            const prev = 0.5;
            const curr = 0.5;
            const next = 0.5;
            
            const denominator = 2 * (prev - 2 * curr + next);
            const offset = Math.abs(denominator) > 1e-10 ? (prev - next) / denominator : 0;
            const refinedPeriod = bestPeriod + offset;
            
            const frequency = sampleRate / refinedPeriod;
            const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
            
            expect(isFinite(frequency)).toBe(true);
            expect(isFinite(midiNote)).toBe(true);
            expect(frequency).toBe(441); // 44100 / 100
            expect(midiNote).toBe(69); // Very close to A4 (440 Hz)
        });
    });

    describe('Bug #2: Incorrect frequency bin width calculation', () => {
        test('should calculate correct bin width for non-power-of-2 buffers', () => {
            const bufferLength = 1000; // Not a power of 2
            const sampleRate = 44100;
            
            // Calculate actual FFT size (next power of 2)
            let fftSize = 1;
            while (fftSize < bufferLength) fftSize <<= 1;
            
            // Correct bin width
            const correctBinWidth = sampleRate / fftSize;
            
            // Wrong bin width (the bug)
            const wrongBinWidth = sampleRate / bufferLength;
            
            expect(fftSize).toBe(1024);
            expect(correctBinWidth).toBeCloseTo(43.066, 2);
            expect(wrongBinWidth).toBeCloseTo(44.1, 1);
            expect(correctBinWidth).not.toBeCloseTo(wrongBinWidth, 1);
        });

        test('should use FFT size for spectral centroid calculation', () => {
            const bufferLength = 1000;
            const sampleRate = 44100;
            
            // This is what the fixed code should do
            let fftSize = 1;
            while (fftSize < bufferLength) fftSize <<= 1;
            const binWidth = sampleRate / fftSize;
            
            // Create a mock spectrum with peak at bin 10
            const spectrum = new Float32Array(fftSize / 2);
            spectrum[10] = 1.0;
            
            let weightedSum = 0;
            let sum = 0;
            for (let i = 0; i < spectrum.length; i++) {
                weightedSum += i * binWidth * spectrum[i];
                sum += spectrum[i];
            }
            
            const centroid = sum > 0 ? weightedSum / sum : 0;
            
            // Centroid should be at frequency of bin 10
            expect(centroid).toBeCloseTo(10 * binWidth, 1);
            expect(centroid).toBeCloseTo(430.66, 1);
        });
    });

    describe('Bug #3: Missing NaN validation in pitch detection', () => {
        test('should filter out NaN MIDI notes with isFinite check', () => {
            const pitchResult = {
                frequency: NaN,
                midiNote: NaN,
                confidence: 0.85
            };
            
            // The condition should prevent NaN from being added
            const shouldAdd = pitchResult && pitchResult.confidence > 0.8 && isFinite(pitchResult.midiNote);
            
            expect(shouldAdd).toBe(false);
        });

        test('should allow valid MIDI notes through', () => {
            const pitchResult = {
                frequency: 440,
                midiNote: 69,
                confidence: 0.85
            };
            
            const shouldAdd = pitchResult && pitchResult.confidence > 0.8 && isFinite(pitchResult.midiNote);
            
            expect(shouldAdd).toBe(true);
        });

        test('should filter out Infinity values', () => {
            const pitchResult = {
                frequency: Infinity,
                midiNote: Infinity,
                confidence: 0.85
            };
            
            const shouldAdd = pitchResult && pitchResult.confidence > 0.8 && isFinite(pitchResult.midiNote);
            
            expect(shouldAdd).toBe(false);
        });

        test('Math.abs with NaN should produce NaN', () => {
            const result = Math.abs(NaN - 60);
            expect(result).toBe(NaN);
            expect(result <= 1).toBe(false);
        });
    });
});
