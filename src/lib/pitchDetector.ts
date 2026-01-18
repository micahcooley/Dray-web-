'use client';

import { audioEngine } from './audioEngine';

/**
 * Pitch Detection Service - Converts microphone input to MIDI notes
 * Uses autocorrelation algorithm for pitch detection
 */

export interface PitchResult {
    frequency: number;      // Hz
    midiNote: number;       // MIDI note number (0-127)
    noteName: string;       // e.g., "C4", "A#3"
    confidence: number;     // 0-1 confidence level
    cents: number;          // Cents off from perfect pitch (-50 to +50)
}

export interface MIDINoteEvent {
    pitch: number;
    start: number;          // Timestamp in seconds
    duration: number;       // Duration in seconds
    velocity: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class PitchDetector {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private mediaStream: MediaStream | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private buffer: Float32Array | null = null;
    private isRunning = false;
    private animationFrameId: number | null = null;

    // Callbacks
    private onPitchCallback: ((result: PitchResult | null) => void) | null = null;
    private onNoteCallback: ((note: MIDINoteEvent) => void) | null = null;

    // Note tracking
    private currentNote: number | null = null;
    private noteStartTime: number = 0;
    private noteBuffer: number[] = [];
    private minNoteDuration = 0.1; // Minimum 100ms to register a note
    private confidenceThreshold = 0.85;

    // Recording state
    private recordedNotes: MIDINoteEvent[] = [];
    private recordingStartTime: number = 0;
    private isRecording = false;

    async initialize(): Promise<boolean> {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            await audioEngine.initialize();
            this.audioContext = audioEngine.getContext();

            // Create analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.85;

            // Connect microphone to analyser
            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);

            // Create buffer for audio data
            this.buffer = new Float32Array(this.analyser.fftSize);

            console.log('Pitch detector initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize pitch detector:', error);
            return false;
        }
    }

    start(onPitch?: (result: PitchResult | null) => void, onNote?: (note: MIDINoteEvent) => void) {
        if (!this.analyser || !this.buffer) {
            console.error('Pitch detector not initialized');
            return;
        }

        this.onPitchCallback = onPitch || null;
        this.onNoteCallback = onNote || null;
        this.isRunning = true;
        this.detect();
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Complete any pending note
        this.endCurrentNote();
    }

    startRecording() {
        this.recordedNotes = [];
        this.recordingStartTime = this.audioContext?.currentTime || 0;
        this.isRecording = true;
    }

    stopRecording(): MIDINoteEvent[] {
        this.isRecording = false;
        this.endCurrentNote();
        return [...this.recordedNotes];
    }

    private detect() {
        if (!this.isRunning || !this.analyser || !this.buffer) return;

        // Get time domain data - cast needed for TS5.x compatibility with Web Audio types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.analyser.getFloatTimeDomainData(this.buffer as any);

        // Calculate RMS to check if there's enough signal
        const rms = this.calculateRMS(this.buffer as any);

        if (rms > 0.01) { // Threshold for silence
            const pitch = this.detectPitch(this.buffer as any, this.audioContext!.sampleRate);

            if (pitch && pitch.confidence > this.confidenceThreshold) {
                // Smooth the pitch using a buffer
                this.noteBuffer.push(pitch.midiNote);
                if (this.noteBuffer.length > 5) {
                    this.noteBuffer.shift();
                }

                // Get median note from buffer for stability
                const stableNote = this.getMedianNote(this.noteBuffer);

                this.onPitchCallback?.(pitch);
                // Use confidence as velocity proxy
                this.processNote(stableNote, Math.min(1, pitch.confidence * 0.9 + 0.1));
            } else {
                this.onPitchCallback?.(null);
                this.noteBuffer = [];
                this.endCurrentNote();
            }
        } else {
            this.onPitchCallback?.(null);
            this.noteBuffer = [];
            this.endCurrentNote();
        }

        this.animationFrameId = requestAnimationFrame(() => this.detect());
    }

    private processNote(midiNote: number, _velocity: number) {
        const now = this.audioContext?.currentTime || 0;

        if (this.currentNote === null) {
            // Start new note
            this.currentNote = midiNote;
            this.noteStartTime = now;
        } else if (Math.abs(this.currentNote - midiNote) > 1) {
            // Note changed significantly
            this.endCurrentNote();
            this.currentNote = midiNote;
            this.noteStartTime = now;
        }
    }

    private endCurrentNote() {
        if (this.currentNote !== null && this.audioContext) {
            const now = this.audioContext.currentTime;
            const duration = now - this.noteStartTime;

            if (duration >= this.minNoteDuration) {
                const noteEvent: MIDINoteEvent = {
                    pitch: this.currentNote,
                    start: this.noteStartTime - this.recordingStartTime,
                    duration,
                    velocity: 0.8
                };

                this.onNoteCallback?.(noteEvent);

                if (this.isRecording) {
                    this.recordedNotes.push(noteEvent);
                }
            }
        }

        this.currentNote = null;
    }

    private getMedianNote(notes: number[]): number {
        const sorted = [...notes].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }

    private calculateRMS(buffer: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * Autocorrelation-based pitch detection
     * Similar to the YIN algorithm
     */
    private detectPitch(buffer: Float32Array, sampleRate: number): PitchResult | null {
        const SIZE = buffer.length;
        const maxSamples = Math.floor(SIZE / 2);
        let bestOffset = -1;
        let bestCorrelation = 0;
        let foundGoodCorrelation = false;

        // Autocorrelation
        const correlations = new Float32Array(maxSamples);

        for (let offset = 0; offset < maxSamples; offset++) {
            let correlation = 0;

            for (let i = 0; i < maxSamples; i++) {
                correlation += Math.abs(buffer[i] - buffer[i + offset]);
            }

            correlation = 1 - (correlation / maxSamples);
            correlations[offset] = correlation;

            if (correlation > 0.9 && !foundGoodCorrelation) {
                foundGoodCorrelation = true;
            }

            if (foundGoodCorrelation) {
                if (correlation > bestCorrelation) {
                    bestCorrelation = correlation;
                    bestOffset = offset;
                } else if (correlation < bestCorrelation - 0.01) {
                    // Correlation dropped, we've passed the peak
                    break;
                }
            }
        }

        if (bestCorrelation < 0.85 || bestOffset === -1 || bestOffset < 10) {
            return null;
        }

        // Parabolic interpolation for more precise frequency
        let shift = 0;
        if (bestOffset > 0 && bestOffset < maxSamples - 1) {
            const y1 = correlations[bestOffset - 1];
            const y2 = correlations[bestOffset];
            const y3 = correlations[bestOffset + 1];
            shift = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
        }

        const period = bestOffset + shift;
        const frequency = sampleRate / period;

        // Frequency sanity check (human voice range: 80Hz - 1000Hz)
        if (frequency < 60 || frequency > 1200) {
            return null;
        }

        // Convert to MIDI
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        const perfectFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const cents = Math.round(1200 * Math.log2(frequency / perfectFreq));

        // Note name
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        const noteName = `${NOTE_NAMES[noteIndex]}${octave}`;

        return {
            frequency,
            midiNote,
            noteName,
            confidence: bestCorrelation,
            cents
        };
    }

    cleanup() {
        this.stop();

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.audioContext = null;
    }
}

export const pitchDetector = new PitchDetector();
