const { performance } = require('perf_hooks');

// Original implementation
function originalExtractPeaks(buffer, length = 100) {
    const data = buffer.getChannelData(0); // Use left channel
    const step = Math.floor(data.length / length);
    const peaks = [];

    for (let i = 0; i < length; i++) {
        let max = 0;
        // Scan window for peak amplitude
        const start = i * step;
        const end = Math.min(start + step, data.length);

        for (let j = start; j < end; j++) {
            const val = Math.abs(data[j]);
            if (val > max) max = val;
        }
        peaks.push(max);
    }
    return peaks;
}

// Optimized implementation
function optimizedExtractPeaks(buffer, length = 100) {
    const data = buffer.getChannelData(0); // Use left channel
    const windowSize = Math.floor(data.length / length);
    const peaks = [];

    // Adaptive step: scan fewer samples for large windows
    // If window is small (<= 64), check every sample.
    // If window is large, check every Nth sample.
    const scanStep = Math.max(1, Math.floor(windowSize / 64));

    for (let i = 0; i < length; i++) {
        let max = 0;
        const start = i * windowSize;
        const end = Math.min(start + windowSize, data.length);

        // Optimization: Step through the window
        for (let j = start; j < end; j += scanStep) {
            const val = Math.abs(data[j]);
            if (val > max) max = val;
        }
        peaks.push(max);
    }
    return peaks;
}

// Mock AudioBuffer
class MockAudioBuffer {
    constructor(length, sampleRate) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.numberOfChannels = 1;
        this.data = new Float32Array(length);
        // Fill with random data
        for (let i = 0; i < length; i++) {
            this.data[i] = Math.sin(i * 0.01) * 0.5 + (Math.random() * 2 - 1) * 0.5;
        }
    }

    getChannelData(channel) {
        return this.data;
    }
}

// Benchmark
function runBenchmark() {
    const minutes = 5;
    const sampleRate = 44100;
    const length = minutes * 60 * sampleRate;
    console.log(`Generating mock audio buffer: ${minutes} minutes (${length} samples)...`);
    const buffer = new MockAudioBuffer(length, sampleRate);
    const peaksLength = 2000; // Typical UI width

    console.log('Running benchmark...');
    console.log(`Peaks array length: ${peaksLength}`);

    // Warmup
    originalExtractPeaks(buffer, 100);
    optimizedExtractPeaks(buffer, 100);

    // Measure Original
    const startOrig = performance.now();
    const origPeaks = originalExtractPeaks(buffer, peaksLength);
    const endOrig = performance.now();
    const timeOrig = endOrig - startOrig;

    // Measure Optimized
    const startOpt = performance.now();
    const optPeaks = optimizedExtractPeaks(buffer, peaksLength);
    const endOpt = performance.now();
    const timeOpt = endOpt - startOpt;

    console.log(`Original: ${timeOrig.toFixed(2)}ms`);
    console.log(`Optimized: ${timeOpt.toFixed(2)}ms`);
    console.log(`Improvement: ${(timeOrig / timeOpt).toFixed(2)}x`);

    // Accuracy check
    let totalDiff = 0;
    let maxDiff = 0;
    for (let i = 0; i < peaksLength; i++) {
        const diff = Math.abs(origPeaks[i] - optPeaks[i]);
        totalDiff += diff;
        if (diff > maxDiff) maxDiff = diff;
    }
    const avgDiff = totalDiff / peaksLength;
    console.log(`Average Difference: ${avgDiff.toFixed(6)}`);
    console.log(`Max Difference: ${maxDiff.toFixed(6)}`);
}

runBenchmark();
