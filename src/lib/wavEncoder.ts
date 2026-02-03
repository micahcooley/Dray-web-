
/**
 * Encodes Float32Array channel data into a WAV ArrayBuffer.
 * Optimized for performance using Int16Array views where possible.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
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
        // Slow path: System is Big Endian, must use DataView to enforce LE
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

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
