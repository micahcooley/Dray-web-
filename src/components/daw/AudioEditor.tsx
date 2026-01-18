'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { X, Play, Square, ZoomIn, ZoomOut, Check, Sliders } from 'lucide-react';
import styles from './audioeditor.module.css';
import { useProjectStore } from '../../store/useProjectStore';
import type { Clip, Track } from '../../lib/types';
import { audioEngine } from '../../lib/audioEngine';

interface AudioEditorProps {
    track: Track;
    onTrackChange: (track: Track) => void;
    onClose: () => void;
}

const PIXELS_PER_BEAT = 40; // Base zoom

export default function AudioEditor({ track, onTrackChange, onClose }: AudioEditorProps) {
    const { isPlaying, togglePlay: storeTogglePlay } = useProjectStore();
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [scrollX, setScrollX] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Preview playback state
    const [isPreviewing, setIsPreviewing] = useState(false);
    const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const selectedClip = useMemo(() =>
        track.clips.find(c => (c as any).id === selectedClipId) || track.clips[0],
        [track.clips, selectedClipId]
    );

    // Calculate max duration of all clips for zoom limits
    const maxDuration = useMemo(() => {
        if (track.clips.length === 0) return 8;
        return Math.max(...track.clips.map(c => c.start + c.duration));
    }, [track.clips]);

    // Auto-fit zoom on mount to fit content perfectly
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const canvasWidth = canvas.width;
        const contentBeats = maxDuration;

        if (contentBeats > 0) {
            // Calculate zoom to fit all content within canvas
            const idealZoom = canvasWidth / (contentBeats * PIXELS_PER_BEAT);
            // Clamp to reasonable bounds (0.5x to 4x)
            const fitZoom = Math.min(Math.max(idealZoom, 0.5), 4);
            setZoom(Math.round(fitZoom * 10) / 10); // Round to 1 decimal
            setScrollX(0); // Reset scroll to start
        }
    }, [maxDuration]);

    useEffect(() => {
        if (!selectedClipId && track.clips.length > 0) {
            // Select first clip by default if none selected
        }
    }, [track.clips, selectedClipId]);

    const handleClipParamChange = (param: string, value: any) => {
        if (!selectedClip) return;

        const newClips = track.clips.map(c => {
            if (c === selectedClip) {
                return { ...c, [param]: value };
            }
            return c;
        });

        onTrackChange({ ...track, clips: newClips });
    };

    // Preview playback - play the selected clip's audio
    const handlePreviewPlay = async () => {
        if (!selectedClip || !(selectedClip as any).url) return;

        // Stop any existing preview
        handlePreviewStop();

        const url = (selectedClip as any).url;
        let retryCount = 0;
        const maxRetries = 2;

        const attemptPlay = async (): Promise<void> => {
            try {
                await audioEngine.initialize();
                const ctx = audioEngine.getContext();

                // Fetch and decode the audio with retry logic
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

                // Create source and play
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);

                // Apply pitch shift if specified
                const pitch = (selectedClip as any).pitch ?? 0;
                if (pitch !== 0) {
                    source.playbackRate.value = Math.pow(2, pitch / 12);
                }

                source.onended = () => {
                    setIsPreviewing(false);
                    previewSourceRef.current = null;
                };

                source.start();
                previewSourceRef.current = source;
                setIsPreviewing(true);
            } catch (e) {
                console.error(`Failed to play audio preview (attempt ${retryCount + 1}/${maxRetries + 1}):`, e);
                
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Retrying preview playback (${retryCount}/${maxRetries})...`);
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                    return attemptPlay();
                } else {
                    // Permanently failed
                    setIsPreviewing(false);
                    alert(`Failed to play audio preview after ${maxRetries + 1} attempts. The audio file may be corrupted or unavailable.`);
                }
            }
        };

        await attemptPlay();
    };

    const handlePreviewStop = () => {
        if (previewSourceRef.current) {
            try {
                previewSourceRef.current.stop();
            } catch (e) { /* already stopped */ }
            previewSourceRef.current = null;
        }
        setIsPreviewing(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            handlePreviewStop();
        };
    }, []);

    // Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = '#08080c';
        ctx.fillRect(0, 0, width, height);

        // Draw Grid
        const beatWidth = PIXELS_PER_BEAT * zoom;
        ctx.strokeStyle = '#1e1e2d';
        ctx.lineWidth = 1;

        const startBeat = scrollX / beatWidth;
        const endBeat = (scrollX + width) / beatWidth;

        for (let b = Math.floor(startBeat); b <= Math.ceil(endBeat); b++) {
            const x = (b * beatWidth) - scrollX;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Draw Clips
        track.clips.forEach(clip => {
            const clipX = (clip.start * beatWidth) - scrollX;
            const clipW = clip.duration * beatWidth;

            // Background
            const isSelected = clip === selectedClip;
            ctx.fillStyle = isSelected ? '#1a1a24' : '#14141d';
            ctx.fillRect(clipX, 0, clipW, height);

            ctx.strokeStyle = isSelected ? '#5865f2' : '#2a2a3e';
            ctx.lineWidth = 1;
            ctx.strokeRect(clipX, 0, clipW, height);

            // Draw Waveform
            if (clip.waveform && clip.waveform.peaks) {
                const peaks = clip.waveform.peaks;
                const peakWidth = clipW / peaks.length;

                ctx.beginPath();
                ctx.strokeStyle = track.color || '#4ec9b0';
                ctx.lineWidth = 1; // Make it thin and sharp

                const midY = height / 2;
                const scaleY = (height / 2) * 0.9;

                for (let i = 0; i < peaks.length; i++) {
                    const peak = peaks[i];
                    const px = clipX + (i * peakWidth);

                    // Draw mirror
                    ctx.moveTo(px, midY - peak * scaleY);
                    ctx.lineTo(px, midY + peak * scaleY);
                }
                ctx.stroke();
            }

            // Label
            ctx.fillStyle = '#fff';
            ctx.font = '10px Inter';
            ctx.fillText(clip.name, clipX + 4, 12);
        });

    }, [track, zoom, scrollX, selectedClip]);

    return (
        <div className={styles.overlay}>
            <div className={styles.window}>
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <div className={styles.title}>
                            <Sliders size={18} />
                            <span>Audio Editor</span>
                        </div>
                        <div className={styles.label}>{track.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            className={styles.closeBtn}
                            onClick={isPreviewing ? handlePreviewStop : handlePreviewPlay}
                            title={isPreviewing ? 'Stop Preview' : 'Play Preview'}
                            style={{ background: isPreviewing ? '#ed4245' : '#57f287', color: '#000', borderRadius: 6 }}
                        >
                            {isPreviewing ? <Square size={16} /> : <Play size={16} />}
                        </button>
                        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                {/* Editor Controls */}
                <div className={styles.controls}>
                    <div className={styles.controlGroup}>
                        <div className={styles.label}>Gain</div>
                        <input
                            type="range" min="0" max="2" step="0.1"
                            className={styles.range}
                            value={(selectedClip as any)?.gain ?? 1}
                            onChange={(e) => handleClipParamChange('gain', parseFloat(e.target.value))}
                        />
                        <div className={styles.value}>{Math.round(((selectedClip as any)?.gain ?? 1) * 100)}%</div>
                    </div>

                    <div className={styles.controlGroup}>
                        <div className={styles.label}>Pitch (Semitones)</div>
                        <div className={styles.inputRow}>
                            <input
                                type="range" min="-12" max="12" step="1"
                                className={styles.range}
                                value={(selectedClip as any)?.pitch ?? 0}
                                onChange={(e) => handleClipParamChange('pitch', parseInt(e.target.value))}
                            />
                            <div className={styles.value}>{(selectedClip as any)?.pitch > 0 ? '+' : ''}{(selectedClip as any)?.pitch ?? 0}</div>
                        </div>
                    </div>

                    <div className={styles.controlGroup}>
                        <div className={styles.label}>Reverse</div>
                        <label className={styles.inputRow} style={{ cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={(selectedClip as any)?.reverse ?? false}
                                onChange={(e) => handleClipParamChange('reverse', e.target.checked)}
                            />
                            <span style={{ fontSize: '0.8rem', color: '#ccc' }}>Enabled</span>
                        </label>
                    </div>

                    <div style={{ flex: 1 }}></div>

                    <div className={styles.controlGroup}>
                        <div className={styles.label}>Zoom</div>
                        <div className={styles.inputRow}>
                            <button className={styles.closeBtn} onClick={() => {
                                // Calculate minimum zoom to fit content exactly
                                const minZoom = 1200 / (maxDuration * PIXELS_PER_BEAT);
                                setZoom(Math.max(Math.round(minZoom * 10) / 10, zoom - 0.5));
                            }}><ZoomOut size={16} /></button>
                            <div className={styles.value}>{zoom}x</div>
                            <button className={styles.closeBtn} onClick={() => setZoom(Math.min(4, zoom + 0.5))}><ZoomIn size={16} /></button>
                        </div>
                    </div>
                </div>

                <div className={styles.mainArea}>
                    <canvas
                        ref={canvasRef}
                        width={1200}
                        height={400}
                        className={styles.waveformCanvas}
                        onMouseDown={(e) => {
                            // Basic click detection to select clips
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const beatWidth = PIXELS_PER_BEAT * zoom;
                            const clickedBeat = (x + scrollX) / beatWidth;

                            const clicked = track.clips.find(c => {
                                const end = c.start + c.duration;
                                return clickedBeat >= c.start && clickedBeat < end;
                            });

                            if (clicked) setSelectedClipId((clicked as any).id);
                            // Need to ensure clip has ID in types or generate one.
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
