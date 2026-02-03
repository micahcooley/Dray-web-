'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, Split, Download, Play, Pause, X, Music, Drum, Mic2, Waves } from 'lucide-react';
import { stemSeparator, StemType } from '../../lib/stemSeparator';
import { audioEngine } from '../../lib/audioEngine';
import styles from './stemseparator.module.css';

interface StemSeparatorProps {
    onClose: () => void;
}

interface StemData {
    type: StemType;
    buffer: AudioBuffer | null;
    blob: Blob | null;
    isPlaying: boolean;
}

const STEM_CONFIG: Record<StemType, { icon: React.ReactNode; color: string; label: string }> = {
    bass: { icon: <Waves size={18} />, color: '#f04438', label: 'Bass' },
    drums: { icon: <Drum size={18} />, color: '#f79009', label: 'Drums' },
    vocals: { icon: <Mic2 size={18} />, color: '#17b169', label: 'Vocals' },
    other: { icon: <Music size={18} />, color: '#6366f1', label: 'Other' }
};

export default function StemSeparatorUI({ onClose }: StemSeparatorProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ stage: '', progress: 0 });
    const [stems, setStems] = useState<Record<StemType, StemData>>({
        bass: { type: 'bass', buffer: null, blob: null, isPlaying: false },
        drums: { type: 'drums', buffer: null, blob: null, isPlaying: false },
        vocals: { type: 'vocals', buffer: null, blob: null, isPlaying: false },
        other: { type: 'other', buffer: null, blob: null, isPlaying: false }
    });
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioSourcesRef = useRef<Record<StemType, AudioBufferSourceNode | null>>({
        bass: null, drums: null, vocals: null, other: null
    });

    // Handle file selection
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.type.startsWith('audio/')) {
                setError('Please select an audio file (MP3, WAV, etc.)');
                return;
            }
            setFile(selectedFile);
            setError(null);
            // Reset stems
            setStems({
                bass: { type: 'bass', buffer: null, blob: null, isPlaying: false },
                drums: { type: 'drums', buffer: null, blob: null, isPlaying: false },
                vocals: { type: 'vocals', buffer: null, blob: null, isPlaying: false },
                other: { type: 'other', buffer: null, blob: null, isPlaying: false }
            });
        }
    }, []);

    // Process the audio file
    const handleSeparate = useCallback(async () => {
        if (!file) return;

        setIsProcessing(true);
        setError(null);

        try {
            const result = await stemSeparator.separate(file, setProgress);

            // Convert buffers to blobs for download
            const [bassBlob, drumsBlob, vocalsBlob, otherBlob] = await Promise.all([
                stemSeparator.audioBufferToWav(result.bass),
                stemSeparator.audioBufferToWav(result.drums),
                stemSeparator.audioBufferToWav(result.vocals),
                stemSeparator.audioBufferToWav(result.other)
            ]);

            setStems({
                bass: {
                    type: 'bass',
                    buffer: result.bass,
                    blob: bassBlob,
                    isPlaying: false
                },
                drums: {
                    type: 'drums',
                    buffer: result.drums,
                    blob: drumsBlob,
                    isPlaying: false
                },
                vocals: {
                    type: 'vocals',
                    buffer: result.vocals,
                    blob: vocalsBlob,
                    isPlaying: false
                },
                other: {
                    type: 'other',
                    buffer: result.other,
                    blob: otherBlob,
                    isPlaying: false
                }
            });
        } catch (err) {
            console.error('Separation failed:', err);
            setError('Failed to process audio. Please try a different file.');
        } finally {
            setIsProcessing(false);
        }
    }, [file]);

    // Play/stop a stem
    const togglePlayStem = useCallback(async (stemType: StemType) => {
        const stem = stems[stemType];

        // Stop if playing
        if (stem.isPlaying) {
            const source = audioSourcesRef.current[stemType];
            if (source) {
                source.stop();
                audioSourcesRef.current[stemType] = null;
            }
            setStems(prev => ({
                ...prev,
                [stemType]: { ...prev[stemType], isPlaying: false }
            }));
            return;
        }

        // Start playing
        if (stem.buffer) {
            await audioEngine.initialize();
            const ctx = audioEngine.getContext();

            const source = ctx.createBufferSource();
            source.buffer = stem.buffer;
            // Connect to native AudioContext destination for native Web Audio nodes
            source.connect(ctx.destination);

            source.onended = () => {
                setStems(prev => ({
                    ...prev,
                    [stemType]: { ...prev[stemType], isPlaying: false }
                }));
                audioSourcesRef.current[stemType] = null;
            };

            source.start();
            audioSourcesRef.current[stemType] = source;

            setStems(prev => ({
                ...prev,
                [stemType]: { ...prev[stemType], isPlaying: true }
            }));
        }
    }, [stems]);

    // Download a stem
    const downloadStem = useCallback((stemType: StemType) => {
        const stem = stems[stemType];
        if (!stem.blob || !file) return;

        const fileName = file.name.replace(/\.[^/.]+$/, '');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(stem.blob);
        link.download = `${fileName}_${stemType}.wav`;
        link.click();
        URL.revokeObjectURL(link.href);
    }, [stems, file]);

    const hasSeparated = stems.bass.buffer !== null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <Split size={18} className={styles.icon} />
                        <h2>Stem Separator</h2>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.content}>
                    {/* File Upload */}
                    <div
                        className={styles.dropzone}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                        {file ? (
                            <div className={styles.fileInfo}>
                                <Music size={24} />
                                <span className={styles.fileName}>{file.name}</span>
                                <span className={styles.fileSize}>
                                    {(file.size / 1024 / 1024).toFixed(1)} MB
                                </span>
                            </div>
                        ) : (
                            <>
                                <Upload size={32} className={styles.uploadIcon} />
                                <p>Drop an audio file here or click to browse</p>
                                <span className={styles.hint}>MP3, WAV, FLAC supported</span>
                            </>
                        )}
                    </div>

                    {/* Process Button */}
                    {file && !hasSeparated && !isProcessing && (
                        <button className={styles.processBtn} onClick={handleSeparate}>
                            <Split size={18} />
                            Separate Stems
                        </button>
                    )}

                    {/* Progress */}
                    {isProcessing && (
                        <div className={styles.progressSection}>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressFill}
                                    style={{ width: `${progress.progress}%` }}
                                />
                            </div>
                            <span className={styles.progressText}>{progress.stage}</span>
                        </div>
                    )}

                    {/* Stems Grid */}
                    {hasSeparated && (
                        <div className={styles.stemsGrid}>
                            {(Object.keys(stems) as StemType[]).map(stemType => {
                                const stem = stems[stemType];
                                const config = STEM_CONFIG[stemType];

                                return (
                                    <div
                                        key={stemType}
                                        className={styles.stemCard}
                                        style={{ '--stem-color': config.color } as React.CSSProperties}
                                    >
                                        <div className={styles.stemHeader}>
                                            <span className={styles.stemIcon}>{config.icon}</span>
                                            <span className={styles.stemLabel}>{config.label}</span>
                                        </div>
                                        <div className={styles.stemActions}>
                                            <button
                                                className={styles.playBtn}
                                                onClick={() => togglePlayStem(stemType)}
                                            >
                                                {stem.isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                            </button>
                                            <button
                                                className={styles.downloadBtn}
                                                onClick={() => downloadStem(stemType)}
                                            >
                                                <Download size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p className={styles.disclaimer}>
                        * Uses frequency-based separation. For professional results, consider AI-based tools like Spleeter.
                    </p>
                </div>
            </div>
        </div>
    );
}
