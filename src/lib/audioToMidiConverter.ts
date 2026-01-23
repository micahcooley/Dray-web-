'use client';

import { audioEngine } from './audioEngine';
import type { MidiNote } from './types';
import type { WorkerRequest, WorkerResponse } from './worker/audioToMidi.worker';

/**
 * Audio to MIDI Converter Service
 * Analyzes audio files/buffers and extracts pitch information to create MIDI notes.
 * 
 * Supports three conversion modes (like Ableton):
 * - Melody: Monophonic pitch detection for single-note melodies
 * - Harmony: Polyphonic detection for chords
 * - Drums: Transient detection for percussive content
 *
 * PERFORMANCE NOTE:
 * Computation is offloaded to a Web Worker to prevent blocking the main thread.
 * Spectral analysis uses an optimized Radix-2 FFT (O(N log N)).
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

        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        onProgress?.({ stage: 'Starting analysis worker...', progress: 10 });

        return this.runInWorker(channelData, sampleRate, mode, onProgress);
    }

    /**
     * Offload processing to Web Worker
     */
    private runInWorker(
        channelData: Float32Array,
        sampleRate: number,
        mode: ConversionMode,
        onProgress?: (progress: ConversionProgress) => void
    ): Promise<ConversionResult> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./worker/audioToMidi.worker.ts', import.meta.url));
            const id = Math.floor(Math.random() * 1000000);

            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const { type, data, progress, error, id: responseId } = event.data;
                if (responseId !== id) return;

                if (type === 'progress' && progress) {
                    onProgress?.({
                        stage: progress.stage,
                        progress: progress.value
                    });
                } else if (type === 'result' && data) {
                    worker.terminate();
                    resolve(data);
                } else if (type === 'error') {
                    worker.terminate();
                    reject(new Error(error || 'Unknown worker error'));
                }
            };

            worker.onerror = (e) => {
                try {
                    worker.terminate();
                } catch (err) {
                    // Worker may already be terminated
                }
                reject(e);
            };

            const request: WorkerRequest = {
                id,
                type: 'convert',
                buffer: channelData,
                sampleRate,
                mode
            };

            // Post message with buffer transfer if supported?
            // channelData is a view on the buffer. We should likely slice it or ensure we don't need it here anymore.
            // But Float32Array itself isn't transferable, its buffer is.
            // However, copying is fine for typical audio clips (a few MBs).
            worker.postMessage(request);
        });
    }

    /**
     * Get note name from MIDI number
     */
    getNoteName(midiNote: number): string {
        const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const note = NOTE_NAMES[midiNote % 12];
        return `${note}${octave}`;
    }
}

export const audioToMidiConverter = new AudioToMidiConverter();
export type { ConversionMode, ConversionProgress, ConversionResult };
