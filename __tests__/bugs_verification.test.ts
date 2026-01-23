/**
 * Tests to verify the bugs found in code review
 */

describe('Bug Verification Tests', () => {
    test('Bug 1: Division by zero in parabolic interpolation', () => {
        // When yinBuffer has three consecutive equal values at the minimum,
        // the parabolic interpolation hits division by zero
        
        const prev = 0.1;
        const curr = 0.1;
        const next = 0.1;
        
        const denominator = 2 * (prev - 2 * curr + next);
        expect(denominator).toBe(0);
        
        const numerator = prev - next;
        const offset = numerator / denominator; // 0/0
        expect(isNaN(offset)).toBe(true);
        
        const bestPeriod = 100;
        const refinedPeriod = bestPeriod + offset;
        expect(isNaN(refinedPeriod)).toBe(true);
        
        const sampleRate = 44100;
        const frequency = sampleRate / refinedPeriod;
        expect(isNaN(frequency)).toBe(true);
        
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        expect(isNaN(midiNote)).toBe(true);
        
        // This NaN will propagate into the MIDI notes array!
    });
    
    test('Bug 2: Incorrect binWidth in calculateSpectralCentroid', () => {
        const sampleRate = 44100;
        const bufferLength = 1000; // Not a power of 2
        
        // computeMagnitudeSpectrum pads to next power of 2
        let fftSize = 1;
        while (fftSize < bufferLength) fftSize <<= 1;
        expect(fftSize).toBe(1024);
        
        // The function should use fftSize, not bufferLength
        const wrongBinWidth = sampleRate / bufferLength;
        const correctBinWidth = sampleRate / fftSize;
        
        console.log('Wrong binWidth:', wrongBinWidth);
        console.log('Correct binWidth:', correctBinWidth);
        
        // Error is about 2.4% in this case
        const errorPercent = Math.abs(wrongBinWidth - correctBinWidth) / correctBinWidth * 100;
        expect(errorPercent).toBeGreaterThan(2);
        expect(errorPercent).toBeLessThan(3);
    });
    
    test('Bug 3: NaN propagates through groupPitchesToNotes', () => {
        const pitchWithNaN = NaN;
        const normalPitch = 60;
        
        // Math.abs(NaN - 60) = NaN
        const diff = Math.abs(pitchWithNaN - normalPitch);
        expect(isNaN(diff)).toBe(true);
        
        // NaN <= 1 is false
        expect(diff <= 1).toBe(false);
        
        // So a note with pitch=NaN will be created as a "different" note
        // This will result in invalid MIDI data
    });
});
