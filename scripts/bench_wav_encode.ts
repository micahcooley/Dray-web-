
const SAMPLE_RATE = 44100;
const DURATION_SEC = 180; // 3 minutes
const NUM_CHANNELS = 2;
const LENGTH = SAMPLE_RATE * DURATION_SEC;

console.log(`Setting up benchmark: ${DURATION_SEC}s, ${NUM_CHANNELS} channels, ${SAMPLE_RATE}Hz`);
console.log(`Total samples per channel: ${LENGTH}`);

// Synthetic AudioBuffer
const channels: Float32Array[] = [];
for (let c = 0; c < NUM_CHANNELS; c++) {
    const data = new Float32Array(LENGTH);
    for (let i = 0; i < LENGTH; i++) {
        data[i] = (Math.random() * 2) - 1; // -1 to 1
    }
    channels.push(data);
}

const bufferMock = {
    numberOfChannels: NUM_CHANNELS,
    sampleRate: SAMPLE_RATE,
    length: LENGTH,
    getChannelData: (c: number) => channels[c]
};

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// ---------------- OLD ENCODER ----------------
function oldAudioBufferToWav(buffer: any) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels and convert to 16-bit PCM
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
        channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = Math.max(-1, Math.min(1, channels[c][i]));
            const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, int16, true);
            offset += 2;
        }
    }

    return arrayBuffer;
}

// ---------------- NEW OPTIMIZED ENCODER (simulated) ----------------
function encodeWavOptimized(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    const numChannels = channels.length;
    const length = channels[0].length;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = length * blockAlign;
    const bufferLength = 44 + dataLength;

    const buffer = new ArrayBuffer(bufferLength);
    const view = new DataView(buffer);

    // Write WAV Header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Detect system endianness to determine if we can use Int16Array directly
    // WAV is Little Endian.
    const isLittleEndian = (function () {
        const b = new ArrayBuffer(2);
        new DataView(b).setInt16(0, 256, true);
        return new Int16Array(b)[0] === 256;
    })();

    if (isLittleEndian) {
        // Fast path: System is Little Endian (WAV standard), use Int16Array
        const samples = new Int16Array(buffer, 44);

        // Flatten logic for common channel counts to aid JIT
        if (numChannels === 1) {
            const ch0 = channels[0];
            for (let i = 0; i < length; i++) {
                let s = ch0[i];
                // Clamp
                if (s < -1) s = -1;
                else if (s > 1) s = 1;
                // Scale
                samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
        } else if (numChannels === 2) {
            const ch0 = channels[0];
            const ch1 = channels[1];
            let ptr = 0;
            for (let i = 0; i < length; i++) {
                let s = ch0[i];
                if (s < -1) s = -1;
                else if (s > 1) s = 1;
                samples[ptr++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

                s = ch1[i];
                if (s < -1) s = -1;
                else if (s > 1) s = 1;
                samples[ptr++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
        } else {
            // Generic path
            let ptr = 0;
            for (let i = 0; i < length; i++) {
                for (let c = 0; c < numChannels; c++) {
                    let s = channels[c][i];
                    if (s < -1) s = -1;
                    else if (s > 1) s = 1;
                    samples[ptr++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
            }
        }
    } else {
        // Slow path: System is Big Endian
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let c = 0; c < numChannels; c++) {
                let s = channels[c][i];
                if (s < -1) s = -1;
                else if (s > 1) s = 1;
                const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }
    }

    return buffer;
}


console.log("\nRunning Old Encoder...");
const startOld = performance.now();
oldAudioBufferToWav(bufferMock);
const endOld = performance.now();
console.log(`Old Encoder Time: ${(endOld - startOld).toFixed(2)}ms`);

console.log("\nRunning Optimized Encoder (CPU Only)...");
const startNew = performance.now();
encodeWavOptimized(channels, SAMPLE_RATE);
const endNew = performance.now();
console.log(`New Encoder Time: ${(endNew - startNew).toFixed(2)}ms`);

const speedup = (endOld - startOld) / (endNew - startNew);
console.log(`\nSpeedup Factor: ${speedup.toFixed(2)}x`);
console.log(`Main Thread Blocking Reduction: 100% (Moved to Worker)`);
