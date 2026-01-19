'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { X, Play, Square, Trash2, Grid3X3 } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import {
    toneSynthEngine,
    toneDrumMachine,
    toneBassEngine,
    toneKeysEngine,
    toneFXEngine,
    toneVocalEngine
} from '../../lib/toneEngine';
import { useProjectStore } from '../../store/useProjectStore';
import PianoRollCanvas, { PianoRollCanvasHandle } from './PianoRollCanvas';
import { usePianoRollInteraction } from './usePianoRollInteraction';
import {
    NOTE_HEIGHT,
    BEATS_VISIBLE,
    SIDEBAR_WIDTH,
    GRID_OPTIONS,
    DEFAULT_GRID_SIZE,
    DEFAULT_ZOOM,
    MIN_ZOOM,
    MAX_ZOOM,
    DRUM_MAP,
    NOTE_NAMES,
    BLACK_KEY_INDICES,
    getEngineForInstrument
} from '../../lib/constants';
import type { MidiNote } from '../../lib/types';
import styles from './pianoroll.module.css';

export type Note = MidiNote;

const getNoteName = (pitch: number) => {
    const note = NOTE_NAMES[pitch % 12];
    const octave = Math.floor(pitch / 12) - 1;
    return `${note}${octave}`;
};

const isBlackKey = (pitch: number) => {
    return BLACK_KEY_INDICES.includes((pitch % 12) as any);
};

interface PianoRollProps {
    trackId: number;
    trackName: string;
    trackColor: string;
    trackType?: 'audio' | 'midi' | 'drums';
    instrument?: string;
    notes: MidiNote[];
    onNotesChange: (notes: MidiNote[]) => void;
    onClose: () => void;
}

function PianoRollBase({
    trackId,
    trackName,
    trackColor,
    trackType = 'midi',
    instrument,
    notes,
    onNotesChange,
    onClose
}: PianoRollProps) {
    const { isPlaying, togglePlay: storeTogglePlay, setCurrentTime } = useProjectStore();
    const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [showGridMenu, setShowGridMenu] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<PianoRollCanvasHandle>(null);
    const lastPreviewPitch = useRef<number | null>(null);

    const pixelsPerBeat = zoom;

    // Derive visible pitches based on track type
    const visiblePitches = useMemo(() => {
        if (trackType === 'drums') {
            return Object.keys(DRUM_MAP).map(Number).sort((a, b) => b - a);
        } else {
            return Array.from({ length: 96 }, (_, i) => 108 - i);
        }
    }, [trackType]);

    // Audio Preview Logic
    const playNotePreview = useCallback((pitch: number) => {
        if (lastPreviewPitch.current === pitch) return;
        lastPreviewPitch.current = pitch;

        const preview = async () => {
            if (!audioEngine.isReady()) await audioEngine.initialize();

            if (trackType === 'drums') {
                const sound = DRUM_MAP[pitch];
                if (sound) await toneDrumMachine.playKick(-1, sound, 0.8);
            } else {
                const targetInstrument = instrument || 'Grand Piano';
                const engineName = getEngineForInstrument(targetInstrument);
                if (engineName === 'bass') {
                    toneBassEngine.playNote(-1, pitch, '8n', 0.8, targetInstrument);
                } else if (engineName === 'keys') {
                    toneKeysEngine.playChord(-1, targetInstrument, [pitch], '8n', 0.8);
                } else {
                    toneSynthEngine.previewNote(-1, targetInstrument, pitch, 0.8);
                }
            }
        };

        preview().catch(console.error);
        setTimeout(() => { lastPreviewPitch.current = null; }, 100);
    }, [trackType, instrument]);

    // Interaction Hook
    const {
        selectedNotes,
        dragMode,
        dragStart,
        selectionBox,
        handleCanvasMouseDown,
        handleGridMouseMove,
        handleGridMouseUp,
        handleKeyDown,
        getYFromPitch
    } = usePianoRollInteraction({
        notes,
        onNotesChange,
        pixelsPerBeat,
        gridSize,
        visiblePitches,
        isPlaying,
        playNotePreview,
        canvasRef,
        setZoom,
        MAX_ZOOM,
        MIN_ZOOM
    });

    // Playback Controls
    const handleTogglePlay = useCallback(async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!isPlaying) {
            await audioEngine.initialize();
            await audioEngine.resume();
        }
        storeTogglePlay();
    }, [isPlaying, storeTogglePlay]);

    const handlePlayDoubleClick = useCallback(async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        await audioEngine.initialize();
        await audioEngine.resume();
        setCurrentTime(0);
        if (!isPlaying) {
            storeTogglePlay();
        }
    }, [setCurrentTime, isPlaying, storeTogglePlay]);

    // Sync sidebar scroll with grid scroll
    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const handleScroll = () => {
            const sidebarScroll = document.querySelector(`.${styles.sidebarScroll}`) as HTMLElement;
            if (sidebarScroll) {
                sidebarScroll.style.transform = `translateY(${-scrollContainer.scrollTop}px)`;
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    // Initialize audio engine
    useEffect(() => {
        const timer = setTimeout(() => {
            const { audioScheduler } = require('../../lib/scheduler');
            if (isPlaying && audioScheduler.scopedTrackId === trackId) {
                audioScheduler.setScopedMode(notes, trackId, instrument || '', trackType);
            }

            // Synth Initialization
            const targetInstrument = instrument || 'Grand Piano';
            if (trackType !== 'drums') {
                const engineName = getEngineForInstrument(targetInstrument);
                let engine: any;
                switch (engineName) {
                    case 'bass': engine = toneBassEngine; break;
                    case 'keys': engine = toneKeysEngine; break;
                    case 'fx': engine = toneFXEngine; break;
                    case 'vocal': engine = toneVocalEngine; break;
                    default: engine = toneSynthEngine;
                }
                if (engine && engine.getSynth) {
                    engine.getSynth(trackId, targetInstrument).catch(() => { });
                } else if (engine && engine.initialize) {
                    engine.initialize().catch(() => { });
                }
            } else {
                toneDrumMachine.initialize?.().catch(() => { });
            }

            // Scroll Position
            if (scrollContainerRef.current) {
                const containerHeight = scrollContainerRef.current.clientHeight;
                let targetY = 0;
                if (notes && notes.length > 0) {
                    let sumY = 0;
                    let count = 0;
                    const sample = notes.slice(0, 20);
                    sample.forEach(n => {
                        const y = getYFromPitch(n.pitch);
                        if (y !== -1) {
                            sumY += y;
                            count++;
                        }
                    });
                    if (count > 0) targetY = sumY / count;
                } else {
                    targetY = (visiblePitches.length * NOTE_HEIGHT) / 2;
                }
                scrollContainerRef.current.scrollTop = Math.max(0, targetY - containerHeight / 2);
            }

        }, 10);

        return () => clearTimeout(timer);
    }, [instrument, trackType, trackId, visiblePitches, getYFromPitch, notes, isPlaying]);

    // Autofocus
    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    return (
        <div
            className={styles.prOverlay}
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onMouseDown={() => containerRef.current?.focus()}
        >
            <div className={styles.prWindow}>
                {/* HEADER */}
                <div className={styles.prHeader}>
                    <div className={styles.trackInfo}>
                        <div className={styles.trackColorPill} style={{ backgroundColor: trackColor }}></div>
                        <div className={styles.trackText}>
                            <div className={styles.trackName}>{trackName}</div>
                            <div className={styles.trackInst}>{instrument || 'Midi Instrument'}</div>
                        </div>
                        {trackType === 'drums' && <div className={styles.drumTag}>DRUM VIEW</div>}
                    </div>

                    <div className={styles.controlsRight}>
                        <div className={styles.toolGroup}>
                            <div className={styles.gridSelectorWrap}>
                                <button className={styles.toolBtn} onClick={() => setShowGridMenu(!showGridMenu)}>
                                    <Grid3X3 size={14} />
                                    <span>{GRID_OPTIONS.find(g => g.value === gridSize)?.label}</span>
                                </button>
                                {showGridMenu && (
                                    <div className={styles.gridDropdown}>
                                        {GRID_OPTIONS.map(opt => (
                                            <button
                                                key={opt.label}
                                                className={`${styles.gridOption} ${gridSize === opt.value ? styles.gridOptionActive : ''}`}
                                                onClick={() => { setGridSize(opt.value); setShowGridMenu(false); }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className={styles.divider}></div>
                            <button
                                className={styles.deleteBtn}
                                style={{ color: selectedNotes.size === 0 ? '#58587a' : '#ed4245', cursor: selectedNotes.size === 0 ? 'default' : 'pointer' }}
                                onClick={() => onNotesChange(notes.filter(n => !selectedNotes.has(n.id)))}
                                disabled={selectedNotes.size === 0}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        <button
                            className={styles.playBtn}
                            style={{ background: isPlaying ? '#ed4245' : '#5865f2' }}
                            onClick={handleTogglePlay}
                            onDoubleClick={handlePlayDoubleClick}
                        >
                            {isPlaying ? <Square size={16} fill="white" /> : <Play size={16} fill="white" />}
                        </button>

                        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
                    </div>
                </div>

                <div className={styles.prMain}>
                    {/* Key Sidebar */}
                    <div className={styles.prSidebar} style={{ width: SIDEBAR_WIDTH }}>
                        <div className={styles.sidebarScroll}>
                            {visiblePitches.map((pitch) => {
                                const name = getNoteName(pitch);
                                const isC = name.startsWith('C') && !name.includes('#');
                                const isBlack = isBlackKey(pitch);
                                return (
                                    <div
                                        key={pitch}
                                        className={styles.sidebarKey}
                                        style={{
                                            height: NOTE_HEIGHT,
                                            fontWeight: isC ? 'bold' : 'normal',
                                            color: isC ? '#fff' : '#58587a',
                                            background: isBlack ? '#0a0a0e' : 'transparent',
                                        }}
                                        onMouseDown={() => playNotePreview(pitch)}
                                    >
                                        {name}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div
                        ref={scrollContainerRef}
                        className={styles.prViewport}
                        onScroll={(e) => {
                            const sidebarScroll = document.querySelector(`.${styles.sidebarScroll}`) as HTMLElement;
                            if (sidebarScroll) sidebarScroll.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
                        }}
                    >
                        <PianoRollCanvas
                            ref={canvasRef}
                            width={BEATS_VISIBLE * pixelsPerBeat}
                            height={visiblePitches.length * NOTE_HEIGHT}
                            scrollContainerRef={scrollContainerRef}
                            visiblePitches={visiblePitches}
                            notes={notes}
                            pixelsPerBeat={pixelsPerBeat}
                            gridSize={gridSize}
                            trackColor={trackColor}
                            selectedNoteIds={selectedNotes}
                            isPlaying={isPlaying}
                            selectionBox={selectionBox}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleGridMouseMove}
                            onMouseUp={handleGridMouseUp}
                        />
                    </div>
                </div>

                <div className={styles.prFooter}>
                    <div className={styles.shortcuts}>
                        <span><b>DRAG</b> Draw/Move</span>
                        <span><b>DBL CLICK</b> Delete</span>
                        <span><b>SHIFT+DRAG</b> Select</span>
                        <span><b>CTRL±</b> Zoom</span>
                    </div>
                    <div>ZOOM {Math.round(zoom)}%</div>
                </div>
            </div>
        </div>
    );
}

const PianoRoll = React.memo(PianoRollBase);
export default PianoRoll;
