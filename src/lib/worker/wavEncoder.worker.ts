import { encodeWav } from '../wavEncoder';

self.onmessage = (e: MessageEvent) => {
    const { channels, sampleRate } = e.data;

    try {
        const wavBuffer = encodeWav(channels, sampleRate);

        // Transfer the result buffer back to main thread
        self.postMessage({ wavBuffer }, { transfer: [wavBuffer] });
    } catch (err) {
        console.error('WAV Encoder Worker Error:', err);
        self.postMessage({ error: String(err) });
    }
};
