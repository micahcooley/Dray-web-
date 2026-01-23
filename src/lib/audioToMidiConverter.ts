'use client';

import { audioEngine } from './audioEngine';
import type { MidiNote } from './types';

/**
 * Audio to MIDI Converter Service
 * Analyzes audio files/buffers and extracts pitch information to create MIDI notes.
 * 
 * Supports three conversion modes (like Ableton):
 * - Melody: Monophonic pitch detection for single-note melodies
 * - Harmony: Polyphonic detection for chords (simplified)
 * - Drums: Transient detection for percussive content
 *
 * Performance Note:
 * Heavy processing is offloaded to a Web Worker (src/lib/worker/audioToMidi.worker.ts)
 * and uses an optimized O(N log N) FFT implementation.
 */

interface ConversionProgress {
    stage: string;
    progress: number;
}

interface ConversionResult {
    notes: MidiNote[];
    tempo?: number;
    key?: string;
}

type ConversionMode = 'melody' | 'harmony' | 'drums';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let requestIdCounter = 0;

class AudioToMidiConverter {
    async initialize() {
        await audioEngine.initialize();
    }

    private getContext(): AudioContext {
        return audioEngine.getContext();
    }

    /**
     * Convert an audio file to MIDI notes
     */
    async convert(
        audioFile: File | Blob | AudioBuffer,
        mode: ConversionMode = 'melody',
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        await this.initialize();

        onProgress?.({ stage: 'Loading audio...', progress: 0 });

        let audioBuffer: AudioBuffer;
        if (audioFile instanceof AudioBuffer) {
            audioBuffer = audioFile;
        } else {
            const arrayBuffer = await audioFile.arrayBuffer();
            audioBuffer = await this.getContext().decodeAudioData(arrayBuffer);
        }

        onProgress?.({ stage: 'Analyzing...', progress: 20 });

        // Extract channel data to send to worker
        // We use a copy to avoid detachment issues if the buffer is being used elsewhere
        const channelData = new Float32Array(audioBuffer.getChannelData(0));

        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./worker/audioToMidi.worker.ts', import.meta.url));
            const requestId = ++requestIdCounter;

            worker.onmessage = (e) => {
                const { id, type, data, error } = e.data;
                if (id !== requestId) return;

                if (type === 'progress') {
                    onProgress?.(data);
                } else if (type === 'result') {
                    worker.terminate();
                    resolve(data);
                } else if (type === 'error') {
                    worker.terminate();
                    reject(new Error(error));
                }
            };

            worker.onerror = (e) => {
                worker.terminate();
                reject(e);
            };

            // Send data to worker
            // Transfer the buffer to avoid copying again
            worker.postMessage({
                id: requestId,
                type: 'convert',
                mode,
                buffer: channelData,
                sampleRate: audioBuffer.sampleRate
            }, [channelData.buffer]);
        });
    }

    /**
     * Get note name from MIDI number
     */
    getNoteName(midiNote: number): string {
        const octave = Math.floor(midiNote / 12) - 1;
        const note = NOTE_NAMES[midiNote % 12];
        return `${note}${octave}`;
    }
}

export const audioToMidiConverter = new AudioToMidiConverter();
export type { ConversionMode, ConversionProgress, ConversionResult };
