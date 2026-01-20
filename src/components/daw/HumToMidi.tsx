'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, CircleDot, Square, Music, Download, X } from 'lucide-react';
import { pitchDetector, PitchResult, MIDINoteEvent } from '../../lib/pitchDetector';
import { audioEngine } from '../../lib/audioEngine';
import { toneSynthEngine } from '../../lib/toneEngine';
import { PREVIEW_TRACK_ID } from '../../lib/constants';
import type { MidiNote } from '../../lib/types';
import styles from './humtomidi.module.css';

interface HumToMidiProps {
    onNotesRecorded: (notes: MidiNote[]) => void;
    onClose: () => void;
    trackColor?: string;
}

export default function HumToMidi({ onNotesRecorded, onClose, trackColor = '#5865f2' }: HumToMidiProps) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [currentPitch, setCurrentPitch] = useState<PitchResult | null>(null);
    const [recordedNotes, setRecordedNotes] = useState<MIDINoteEvent[]>([]);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pitchHistoryRef = useRef<number[]>([]);

    // Initialize pitch detector
    const handleInit = useCallback(async () => {
        try {
            setError(null);
            const success = await pitchDetector.initialize();
            if (success) {
                setIsInitialized(true);
                await audioEngine.initialize();
            } else {
                setError('Could not access microphone. Please allow microphone access.');
            }
        } catch (err) {
            setError('Failed to initialize. Check microphone permissions.');
            console.error(err);
        }
    }, []);

    // Start listening
    const handleStartListening = useCallback(() => {
        setIsListening(true);
        pitchDetector.start(
            (result) => {
                setCurrentPitch(result);
                if (result) {
                    pitchHistoryRef.current.push(result.midiNote);
                    if (pitchHistoryRef.current.length > 100) {
                        pitchHistoryRef.current.shift();
                    }
                }
            },
            (note) => {
                if (isRecording) {
                    setRecordedNotes(prev => [...prev, note]);
                }
                // Play the detected note (uses PREVIEW_TRACK_ID for UI preview)
                toneSynthEngine.playNote(PREVIEW_TRACK_ID, 'Grand Piano', note.pitch, '8n', 0.5);
            }
        );
    }, [isRecording]);

    // Stop listening
    const handleStopListening = useCallback(() => {
        setIsListening(false);
        pitchDetector.stop();
        setCurrentPitch(null);
        pitchHistoryRef.current = [];
    }, []);

    // Start recording
    const handleStartRecording = useCallback(() => {
        setRecordedNotes([]);
        setIsRecording(true);
        pitchDetector.startRecording();
    }, []);

    // Stop recording
    const handleStopRecording = useCallback(() => {
        setIsRecording(false);
        const notes = pitchDetector.stopRecording();
        setRecordedNotes(notes);
    }, []);

    // Use recorded notes
    const handleUseNotes = useCallback(() => {
        // Convert to MidiNote format with IDs
        const midiNotes: MidiNote[] = recordedNotes.map((note, idx) => ({
            id: `hum-${Date.now()}-${idx}`,
            pitch: note.pitch,
            start: note.start,
            duration: Math.max(0.125, note.duration), // Minimum 1/8th note
            velocity: note.velocity
        }));

        onNotesRecorded(midiNotes);
        onClose();
    }, [recordedNotes, onNotesRecorded, onClose]);

    // Draw pitch visualization
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;

            ctx.fillStyle = '#0c0c14';
            ctx.fillRect(0, 0, w, h);

            // Draw grid lines for octaves
            ctx.strokeStyle = '#1e1e2d';
            ctx.lineWidth = 1;
            for (let octave = 2; octave <= 6; octave++) {
                const midiNote = octave * 12;
                const y = h - ((midiNote - 36) / 60) * h;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();

                ctx.fillStyle = '#58587a';
                ctx.font = '10px Inter';
                ctx.fillText(`C${octave}`, 5, y - 5);
            }

            // Draw pitch history
            const history = pitchHistoryRef.current;
            if (history.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = trackColor;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let i = 0; i < history.length; i++) {
                    const x = (i / 100) * w;
                    const note = history[i];
                    const y = h - ((note - 36) / 60) * h;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }

            // Draw current pitch indicator
            if (currentPitch) {
                const y = h - ((currentPitch.midiNote - 36) / 60) * h;

                // Glow circle
                ctx.beginPath();
                ctx.arc(w - 30, y, 15, 0, Math.PI * 2);
                ctx.fillStyle = trackColor + '40';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(w - 30, y, 8, 0, Math.PI * 2);
                ctx.fillStyle = trackColor;
                ctx.fill();
            }

            if (isListening) {
                requestAnimationFrame(draw);
            }
        };

        if (isListening) {
            draw();
        }
    }, [isListening, currentPitch, trackColor]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            pitchDetector.cleanup();
        };
    }, []);

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <Music size={18} style={{ color: trackColor }} />
                        <h2>Hum to MIDI</h2>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.content}>
                    {!isInitialized ? (
                        <div className={styles.initSection}>
                            <Mic size={48} className={styles.micIcon} />
                            <p>Record a melody by humming, singing, or whistling.</p>
                            <button className={styles.primaryBtn} onClick={handleInit}>
                                <Mic size={18} />
                                Enable Microphone
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className={styles.visualizer}>
                                <canvas
                                    ref={canvasRef}
                                    width={400}
                                    height={200}
                                    className={styles.canvas}
                                />
                                {currentPitch && (
                                    <div className={styles.pitchDisplay}>
                                        <span className={styles.noteName}>{currentPitch.noteName}</span>
                                        <span className={styles.cents}>
                                            {currentPitch.cents > 0 ? '+' : ''}{currentPitch.cents}¢
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className={styles.controls}>
                                {!isListening ? (
                                    <button
                                        className={styles.primaryBtn}
                                        onClick={handleStartListening}
                                    >
                                        <Mic size={18} />
                                        Start Listening
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className={styles.stopBtn}
                                            onClick={handleStopListening}
                                        >
                                            <MicOff size={18} />
                                            Stop
                                        </button>

                                        {!isRecording ? (
                                            <button
                                                className={styles.recordBtn}
                                                onClick={handleStartRecording}
                                            >
                                                <CircleDot size={18} />
                                                Record
                                            </button>
                                        ) : (
                                            <button
                                                className={styles.recordingBtn}
                                                onClick={handleStopRecording}
                                            >
                                                <Square size={18} />
                                                Stop Recording
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            {recordedNotes.length > 0 && (
                                <div className={styles.results}>
                                    <div className={styles.noteCount}>
                                        <strong>{recordedNotes.length}</strong> notes recorded
                                    </div>
                                    <div className={styles.noteList}>
                                        {recordedNotes.slice(0, 20).map((note, i) => {
                                            const octave = Math.floor(note.pitch / 12) - 1;
                                            const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][note.pitch % 12];
                                            return (
                                                <span key={i} className={styles.noteTag}>
                                                    {noteName}{octave}
                                                </span>
                                            );
                                        })}
                                        {recordedNotes.length > 20 && <span className={styles.noteTag}>...</span>}
                                    </div>
                                    <button
                                        className={styles.useBtn}
                                        onClick={handleUseNotes}
                                    >
                                        <Download size={18} />
                                        Add to Track
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
