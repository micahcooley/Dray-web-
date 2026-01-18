'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { X, Play, Square, Trash2, Grid3X3 } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import { audioScheduler } from '../../lib/scheduler';
import {
  toneSynthEngine,
  toneDrumMachine,
  toneBassEngine,
  toneKeysEngine,
  toneFXEngine,
  toneVocalEngine
} from '../../lib/toneEngine';
import { useProjectStore } from '../../store/useProjectStore';
import PianoGrid from './PianoGrid';
import PianoRollPlayhead from './PianoRollPlayhead';
import styles from './pianoroll.module.css';
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
  getEngineForInstrument
} from '../../lib/constants';
import type { MidiNote } from '../../lib/types';

// Re-export Note type for backwards compatibility
export type Note = MidiNote;

interface PianoRollProps {
  trackId: number;
  trackName: string;
  trackColor: string;
  trackType?: 'audio' | 'midi' | 'drums';
  instrument?: string;
  notes: Note[];
  onNotesChange: (notes: Note[]) => void;
  onClose: () => void;
}

export default function PianoRoll({
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

  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; notes: Note[] } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [mouseDownStart, setMouseDownStart] = useState<{ x: number; y: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Coordinate Helpers
  const getYFromPitch = useCallback((pitch: number) => {
    const index = visiblePitches.indexOf(pitch);
    return index !== -1 ? index * NOTE_HEIGHT : -1;
  }, [visiblePitches]);

  const getPitchFromY = useCallback((y: number) => {
    const index = Math.floor(y / NOTE_HEIGHT);
    if (index >= 0 && index < visiblePitches.length) {
      return visiblePitches[index];
    }
    return null;
  }, [visiblePitches]);

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

  // Initialize audio engine ONLY ON MOUNT
  useEffect(() => {
    // Auto-scroll to notes only on initial mount
    if (scrollContainerRef.current) {
      const containerHeight = scrollContainerRef.current.clientHeight;
      let targetY = 0;

      if (notes && notes.length > 0) {
        let sumY = 0;
        let count = 0;
        notes.forEach(n => {
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

    // PRECACHE: Warm up the synth for this track so the first note plays instantly
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
      // Fire-and-forget precache: getSynth internally caches the synth
      if (engine && engine.getSynth) {
        engine.getSynth(trackId, targetInstrument).catch(() => { });
      } else if (engine && engine.initialize) {
        engine.initialize().catch(() => { });
      }
    } else {
      // For drums, just ensure drum machine is initialized
      toneDrumMachine.initialize?.().catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, trackType]); // Removed notes and other deps - only scroll on mount

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat) return;

    // IMPORTANT: Ignore keyboard shortcuts when user is typing in an input
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement as HTMLElement).isContentEditable
    )) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(prev => Math.min(MAX_ZOOM, prev + 20));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(prev => Math.max(MIN_ZOOM, prev - 20));
      }
    }

    // Handle Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNotes.size > 0) {
        e.preventDefault();
        onNotesChange(notes.filter(n => !selectedNotes.has(n.id)));
        setSelectedNotes(new Set());
      }
    }

    // Handle Note Movement with Arrows
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedNotes.size > 0) {
      e.preventDefault();

      const movePitch = (currentPitch: number, direction: 'up' | 'down', amount: number = 1) => {
        const currentIndex = visiblePitches.indexOf(currentPitch);
        if (currentIndex === -1) return currentPitch;
        let newIndex = direction === 'up' ? currentIndex - amount : currentIndex + amount;
        newIndex = Math.max(0, Math.min(visiblePitches.length - 1, newIndex));
        return visiblePitches[newIndex];
      };

      const moveAmount = e.shiftKey ? 12 : 1;
      const timeAmount = gridSize;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onNotesChange(notes.map(n => {
            if (!selectedNotes.has(n.id)) return n;
            return { ...n, pitch: trackType === 'drums' ? movePitch(n.pitch, 'up', 1) : Math.min(127, n.pitch + moveAmount) };
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNotesChange(notes.map(n => {
            if (!selectedNotes.has(n.id)) return n;
            return { ...n, pitch: trackType === 'drums' ? movePitch(n.pitch, 'down', 1) : Math.max(0, n.pitch - moveAmount) };
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            onNotesChange(notes.map(n => selectedNotes.has(n.id) ? { ...n, duration: Math.max(gridSize, n.duration - gridSize) } : n));
          } else {
            onNotesChange(notes.map(n => selectedNotes.has(n.id) ? { ...n, start: Math.max(0, n.start - timeAmount) } : n));
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            onNotesChange(notes.map(n => selectedNotes.has(n.id) ? { ...n, duration: n.duration + gridSize } : n));
          } else {
            onNotesChange(notes.map(n => selectedNotes.has(n.id) ? { ...n, start: n.start + timeAmount } : n));
          }
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onNotesChange(notes.filter(n => !selectedNotes.has(n.id)));
          setSelectedNotes(new Set());
          break;
        case 'Escape':
          setSelectedNotes(new Set());
          setShowGridMenu(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNotes, notes, gridSize, trackType, visiblePitches, onNotesChange]);

  const getNoteName = (midiNote: number) => {
    if (trackType === 'drums') return DRUM_MAP[midiNote] || `Pitch ${midiNote}`;
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
  };

  const isBlackKey = (midiNote: number) => {
    if (trackType === 'drums') return false;
    return [1, 3, 6, 8, 10].includes(midiNote % 12);
  };

  const playNotePreview = (pitch: number) => {
    const targetInstrument = instrument || 'Grand Piano';

    if (trackType === 'drums') {
      // Drums: (trackId, pitch, velocity)
      (toneDrumMachine as any).previewNote(trackId, pitch, 0.7);
    } else {
      const engineName = getEngineForInstrument(targetInstrument);
      let engine: any;

      switch (engineName) {
        case 'bass': engine = toneBassEngine; break;
        case 'keys': engine = toneKeysEngine; break;
        case 'fx': engine = toneFXEngine; break;
        case 'vocal': engine = toneVocalEngine; break;
        default: engine = toneSynthEngine;
      }

      if (engine && engine.previewNote) {
        // Standardized: (trackId, preset, note, velocity)
        engine.previewNote(trackId, targetInstrument, pitch, 0.7);
      } else if (engine && engine.playNote) {
        // Fallback if previewNote missing
        engine.playNote(trackId, targetInstrument, pitch, '8n', 0.7);
      }
    }
  };

  const snapToGrid = (value: number) => Math.round(value / gridSize) * gridSize;

  const handleGridMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMouseDownStart({ x, y });
    setSelectionBox({ x1: x, y1: y, x2: x, y2: y });
    if (!e.shiftKey) setSelectedNotes(new Set());
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (selectionBox && mouseDownStart) {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionBox({ ...selectionBox, x2: x, y2: y });
      return;
    }

    if (!dragStart || !dragMode) return;

    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - dragStart.x;
    const beatDelta = snapToGrid(dx / pixelsPerBeat);

    const startPitch = getPitchFromY(dragStart.y);
    const currentPitch = getPitchFromY(y);

    onNotesChange(notes.map(n => {
      if (!selectedNotes.has(n.id)) return n;
      const original = dragStart.notes.find(on => on.id === n.id);
      if (!original) return n;

      if (dragMode === 'move') {
        let newPitch = original.pitch;
        if (startPitch !== null && currentPitch !== null) {
          const startIndex = visiblePitches.indexOf(startPitch);
          const currentIndex = visiblePitches.indexOf(currentPitch);
          const indexDelta = currentIndex - startIndex;
          const originalIndex = visiblePitches.indexOf(original.pitch);
          if (originalIndex !== -1) {
            const targetIndex = Math.max(0, Math.min(visiblePitches.length - 1, originalIndex + indexDelta));
            newPitch = visiblePitches[targetIndex];
          }
        }
        if (newPitch !== original.pitch && newPitch !== lastPreviewPitch.current) {
          playNotePreview(newPitch);
          lastPreviewPitch.current = newPitch;
        }
        return { ...n, start: Math.max(0, original.start + beatDelta), pitch: newPitch };
      } else if (dragMode === 'resize-right') {
        // Extend/shrink from right edge
        return { ...n, duration: Math.max(gridSize, original.duration + beatDelta) };
      } else if (dragMode === 'resize-left') {
        // Resize from left: move start and adjust duration inversely
        const newStart = Math.max(0, original.start + beatDelta);
        const startDiff = newStart - original.start;
        const newDuration = Math.max(gridSize, original.duration - startDiff);
        // Don't let start go past original end
        if (newStart >= original.start + original.duration - gridSize) {
          return n;
        }
        return { ...n, start: newStart, duration: newDuration };
      }
      return n;
    }));
  };

  const handleGridMouseUp = (e: React.MouseEvent) => {
    if (selectionBox) {
      const x1 = Math.min(selectionBox.x1, selectionBox.x2);
      const x2 = Math.max(selectionBox.x1, selectionBox.x2);
      const y1 = Math.min(selectionBox.y1, selectionBox.y2);
      const y2 = Math.max(selectionBox.y1, selectionBox.y2);

      const newlySelected = notes.filter(n => {
        const noteY = getYFromPitch(n.pitch);
        if (noteY === -1) return false;
        const noteX = n.start * pixelsPerBeat;
        const noteRight = noteX + n.duration * pixelsPerBeat;
        return noteX < x2 && noteRight > x1 && noteY < y2 && noteY + NOTE_HEIGHT > y1;
      });

      if (e.shiftKey) {
        setSelectedNotes(prev => new Set([...prev, ...newlySelected.map(n => n.id)]));
      } else if (newlySelected.length > 0 || Math.abs(selectionBox.x2 - selectionBox.x1) > 5) {
        setSelectedNotes(new Set(newlySelected.map(n => n.id)));
      } else if (mouseDownStart && !dragStart) {
        // Single click to add note
        const beat = snapToGrid(mouseDownStart.x / pixelsPerBeat);
        const pitch = getPitchFromY(mouseDownStart.y);
        if (pitch !== null) {
          const newNote: Note = { id: `n-${Date.now()}`, pitch, start: beat, duration: gridSize, velocity: 0.8 };
          onNotesChange([...notes, newNote]);
          setSelectedNotes(new Set([newNote.id]));
          playNotePreview(pitch);
        }
      }
      setSelectionBox(null);
    }
    setDragMode(null);
    setDragStart(null);
    setMouseDownStart(null);
    lastPreviewPitch.current = null;
  };

  // Cleanup scoped mode on unmount
  useEffect(() => {
    return () => {
      // If we are closing, ensure we clear the scoped mode
      audioScheduler.clearScopedMode();
    };
  }, []);

  // Sync notes to scheduler if playing in scoped mode
  useEffect(() => {
    if (isPlaying && audioScheduler.scopedTrackId === trackId) {
      audioScheduler.setScopedMode(notes, trackId, instrument || '', trackType);
    }
  }, [notes, isPlaying, trackId, instrument, trackType]);

  // Calculate loop length as nearest whole bar count
  const getLoopLengthBars = useCallback(() => {
    if (notes.length === 0) return 4; // Default 4 bars
    const maxEnd = Math.max(...notes.map(n => n.start + n.duration));
    const bars = maxEnd / 4; // 4 beats per bar
    // Round to nearest power of 2 or multiple of 4 (1, 2, 4, 8, 16, etc.)
    if (bars <= 1) return 1;
    if (bars <= 2) return 2;
    if (bars <= 4) return 4;
    if (bars <= 8) return 8;
    return Math.ceil(bars / 4) * 4; // Round up to next 4
  }, [notes]);

  const handleTogglePlay = async () => {
    if (!isPlaying) {
      await audioEngine.initialize();
      await audioEngine.resume();

      // Calculate loop bounds based on notes content
      const loopBars = getLoopLengthBars();
      const loopBeats = loopBars * 4;

      // ENTER SCOPED MODE with loop bounds
      audioScheduler.setScopedMode(notes, trackId, instrument || '', trackType, 0, loopBeats);
    } else {
      // EXIT SCOPED MODE
      audioScheduler.clearScopedMode();
    }
    storeTogglePlay();
  };

  // Double-click: restart from beginning
  const handlePlayDoubleClick = async () => {
    // Reset playhead to beginning
    setCurrentTime(0);

    if (!isPlaying) {
      await audioEngine.initialize();
      await audioEngine.resume();
      const loopBars = getLoopLengthBars();
      audioScheduler.setScopedMode(notes, trackId, instrument || '', trackType, 0, loopBars * 4);
      storeTogglePlay();
    }
  };

  return (
    <div className={styles.prOverlay} ref={containerRef} tabIndex={0}>
      <div className={styles.prWindow}>
        {/* Header */}
        <div className={styles.prHeader}>
          <div className={styles.trackInfo}>
            <div className={styles.trackColorPill} style={{ backgroundColor: trackColor }}></div>
            <div className={styles.trackText}>
              <span className={styles.trackName}>{trackName}</span>
              <span className={styles.trackInst}>{instrument || 'Midi Instrument'}</span>
            </div>
            {trackType === 'drums' && <div className={styles.drumTag}>DRUM VIEW</div>}
          </div>

          <div className={styles.prControls}>
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
                        className={gridSize === opt.value ? styles.gridDropdownActive : ''}
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
                className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
                onClick={() => onNotesChange(notes.filter(n => !selectedNotes.has(n.id)))}
                disabled={selectedNotes.size === 0}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className={styles.transportCtrl}>
              <button
                className={`${styles.playBtn} ${isPlaying ? styles.playBtnPlaying : ''}`}
                onClick={handleTogglePlay}
                onDoubleClick={handlePlayDoubleClick}
                title="Click to play/stop, Double-click to restart"
              >
                {isPlaying ? <Square size={16} fill="white" /> : <Play size={16} fill="white" />}
              </button>
            </div>

            <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className={styles.prMain}>
          {/* Key Sidebar */}
          <div className={styles.prSidebar} style={{ width: SIDEBAR_WIDTH }}>
            <div className={styles.sidebarScroll}>
              {visiblePitches.map((pitch) => {
                const name = getNoteName(pitch);
                const black = isBlackKey(pitch);
                const isC = name.startsWith('C') && !name.includes('#');

                return (
                  <div
                    key={pitch}
                    className={`${styles.sidebarKey} ${black ? styles.blackKey : styles.whiteKey} ${isC ? styles.isC : ''}`}
                    style={{ height: NOTE_HEIGHT }}
                    onMouseDown={() => playNotePreview(pitch)}
                  >
                    <span className={styles.keyLabel}>{name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.prViewport} ref={scrollContainerRef}>
            <div
              className={styles.prGridCanvas}
              ref={gridRef}
              onMouseDown={handleGridMouseDown}
              onMouseMove={handleGridMouseMove}
              onMouseUp={handleGridMouseUp}
              onMouseLeave={handleGridMouseUp}
              style={{ width: BEATS_VISIBLE * pixelsPerBeat, height: visiblePitches.length * NOTE_HEIGHT }}
            >
              <PianoGrid
                width={BEATS_VISIBLE * pixelsPerBeat}
                height={visiblePitches.length * NOTE_HEIGHT}
                pixelsPerBeat={pixelsPerBeat}
                beatCount={BEATS_VISIBLE}
                visiblePitches={visiblePitches}
                noteHeight={NOTE_HEIGHT}
                trackType={trackType}
                gridSize={gridSize}
              />

              {/* Selection Marquee */}
              {selectionBox && (
                <div className={styles.marquee} style={{
                  left: Math.min(selectionBox.x1, selectionBox.x2),
                  top: Math.min(selectionBox.y1, selectionBox.y2),
                  width: Math.abs(selectionBox.x2 - selectionBox.x1),
                  height: Math.abs(selectionBox.y2 - selectionBox.y1)
                }} />
              )}

              {/* Notes */}
              {notes.map(note => {
                const y = getYFromPitch(note.pitch);
                if (y === -1) return null;
                const selected = selectedNotes.has(note.id);
                const noteWidth = note.duration * pixelsPerBeat;
                return (
                  <div
                    key={note.id}
                    className={`${styles.noteBlock} ${selected ? styles.noteBlockSelected : ''}`}
                    style={{
                      left: note.start * pixelsPerBeat,
                      top: y,
                      width: Math.max(4, noteWidth - 1),
                      height: NOTE_HEIGHT - 1,
                      backgroundColor: selected ? '#fff' : trackColor
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      const relX = e.clientX - rect.left;

                      // Determine if resizing from edges
                      let mode: 'move' | 'resize-left' | 'resize-right' = 'move';
                      if (relX <= 6 && noteWidth > 12) {
                        mode = 'resize-left';
                      } else if (relX >= rect.width - 6) {
                        mode = 'resize-right';
                      }

                      setDragStart({ x: e.clientX, y: e.clientY, notes });
                      setDragMode(mode);

                      if (!selectedNotes.has(note.id)) {
                        setSelectedNotes(e.shiftKey ? new Set([...selectedNotes, note.id]) : new Set([note.id]));
                      }
                      playNotePreview(note.pitch);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onNotesChange(notes.filter(n => n.id !== note.id));
                      setSelectedNotes(prev => {
                        const s = new Set(prev);
                        s.delete(note.id);
                        return s;
                      });
                    }}
                  >
                    {/* Left resize handle */}
                    <div className={styles.resizeHandleLeft} />
                    {/* Right resize handle */}
                    <div className={styles.resizeHandleRight} />
                  </div>
                );
              })}

              {/* Playhead */}
              {isPlaying && (
                <PianoRollPlayhead
                  pixelsPerBeat={pixelsPerBeat}
                  beatsVisible={BEATS_VISIBLE}
                />
              )}
            </div>
          </div>
        </div>

        <div className={styles.prFooter}>
          <div className={styles.shortcuts}>
            <span><b>DRAG</b> Draw/Move</span>
            <span><b>DBL CLICK</b> Delete</span>
            <span><b>SHIFT+DRAG</b> Select</span>
            <span><b>CTRL±</b> Zoom</span>
          </div>
          <div className={styles.zoomInfo}>ZOOM {Math.round(zoom)}%</div>
        </div>
      </div>
    </div>
  );
}
