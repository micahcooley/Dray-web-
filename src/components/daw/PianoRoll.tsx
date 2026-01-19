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
import PianoRollCanvas, { PianoRollCanvasHandle } from './PianoRollCanvas';
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

  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; notes: MidiNote[] } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [mouseDownStart, setMouseDownStart] = useState<{ x: number; y: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPreviewPitch = useRef<number | null>(null);

  // High-Performance Drag State
  const canvasRef = useRef<PianoRollCanvasHandle>(null);
  // Stores the "temporary" notes during a drag operation to avoid React State thrashing
  const interactionNotesRef = useRef<MidiNote[] | null>(null);

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

    // Verify engine is ready
    await audioEngine.initialize();
    await audioEngine.resume();

    // Always reset time to 0
    setCurrentTime(0);

    // If not playing (or if double click race condition toggled it off), force play
    // We check the store state directly via hook dependency
    if (!isPlaying) {
      storeTogglePlay();
    }
  }, [setCurrentTime, isPlaying, storeTogglePlay]);

  // Grid Snap Helper
  const snap = useCallback((val: number) => {
    return Math.round(val / gridSize) * gridSize;
  }, [gridSize]);

  const playNotePreview = useCallback((pitch: number) => {
    if (lastPreviewPitch.current === pitch) return;
    lastPreviewPitch.current = pitch;

    // Fire and forget - don't await to avoid blocking UI
    // Engine is already initialized by useEffect on mount
    const preview = async () => {
      // Ensure engine is ready (fast check)
      if (!audioEngine.isReady()) await audioEngine.initialize();

      if (trackType === 'drums') {
        const sound = DRUM_MAP[pitch];
        if (sound) await toneDrumMachine.playKick(-1, sound, 0.8);
      } else {
        const targetInstrument = instrument || 'Grand Piano';
        const engineName = getEngineForInstrument(targetInstrument);
        if (engineName === 'bass') {
          toneBassEngine.playNote(-1, pitch, '8n', 0.8, targetInstrument); // Sync trigger
        } else if (engineName === 'keys') {
          toneKeysEngine.playChord(-1, targetInstrument, [pitch], '8n', 0.8); // Sync trigger
        } else {
          toneSynthEngine.previewNote(-1, targetInstrument, pitch, 0.8); // Optimized preview
        }
      }
    };

    preview().catch(console.error);
    setTimeout(() => { lastPreviewPitch.current = null; }, 100);
  }, [trackType, instrument]);

  // Mouse Handlers
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent native drag/select
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // VIRTUALIZATION FIX: Logic uses wrapper-relative coordinate 'x'/'y' which are already World Coordinates.
    const worldX = x;
    const worldY = y;

    // Hit Testing using World Coords
    const pitch = getPitchFromY(worldY);

    const resizeMargin = 8; // pixels
    let hitNote: MidiNote | undefined;
    let mode: 'move' | 'resize-left' | 'resize-right' | null = null;

    // Search for clicked note (reverse to hit top notes first)
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.pitch === pitch) {
        const startX = note.start * pixelsPerBeat;
        const endX = (note.start + note.duration) * pixelsPerBeat;

        // Check collision in world space
        if (worldX >= startX && worldX <= endX) {
          hitNote = note;
          // Check resize zones
          if (worldX <= startX + resizeMargin) mode = 'resize-left';
          else if (worldX >= endX - resizeMargin) mode = 'resize-right';
          else mode = 'move';
          break;
        }
      }
    }

    if (hitNote) {
      setDragMode(mode);

      // Selection Logic
      let newSelected = new Set(selectedNotes);
      if (e.shiftKey) {
        if (newSelected.has(hitNote.id)) newSelected.delete(hitNote.id);
        else newSelected.add(hitNote.id);
      } else {
        if (!newSelected.has(hitNote.id)) {
          newSelected = new Set([hitNote.id]);
        }
      }
      setSelectedNotes(newSelected);

      const draggedNotes = notes.filter(n => newSelected.has(n.id));
      setDragStart({ x: e.clientX, y: e.clientY, notes: draggedNotes });
      setMouseDownStart(null); // Clear pending empty click

      if (!isPlaying) playNotePreview(hitNote.pitch);
    } else {
      // EMPTY CLICK -> Ambiguous (Create vs Select)
      if (e.shiftKey) {
        // Shift always starts selection immediately (classic behavior)
        setSelectionBox({ x1: worldX, y1: worldY, x2: worldX, y2: worldY });
        setMouseDownStart(null);
      } else {
        // Defer until move or up
        setMouseDownStart({ x: e.clientX, y: e.clientY }); // Store screen coords for drag threshold
        // Deselect on empty down
        setSelectedNotes(new Set());
      }
    }
  }, [notes, pixelsPerBeat, getPitchFromY, gridSize, selectedNotes, isPlaying, playNotePreview, onNotesChange]);

  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for drag-select threshold from empty click
    if (mouseDownStart && !selectionBox && !dragMode) {
      const dist = Math.hypot(e.clientX - mouseDownStart.x, e.clientY - mouseDownStart.y);
      if (dist > 5) {
        const startWorldX = mouseDownStart.x - rect.left;
        const startWorldY = mouseDownStart.y - rect.top;
        setSelectionBox({ x1: startWorldX, y1: startWorldY, x2: x, y2: y });
        setMouseDownStart(null); // Consumed
        return;
      }
    }

    if (!dragMode && !selectionBox && !mouseDownStart) {
      // Handle Hover Cursor Feedback
      const worldX = x; // Already relative
      const worldY = y;
      const pitch = getPitchFromY(worldY);

      let cursor = 'default';
      const resizeMargin = 8;

      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        if (note.pitch === pitch) {
          const startX = note.start * pixelsPerBeat;
          const endX = (note.start + note.duration) * pixelsPerBeat;
          if (worldX >= startX && worldX <= endX) {
            if (worldX <= startX + resizeMargin) cursor = 'w-resize';
            else if (worldX >= endX - resizeMargin) cursor = 'e-resize';
            else cursor = 'move';
            break;
          }
        }
      }
      (canvas as HTMLElement).style.cursor = cursor;
    }

    if (selectionBox) { // Selection Box Logic
      setSelectionBox(prev => prev ? ({ ...prev, x2: x, y2: y }) : null);

      // Collision Detection (O(N) but just math)
      const boxX = Math.min(selectionBox.x1, x);
      const boxY = Math.min(selectionBox.y1, y);
      const boxW = Math.abs(x - selectionBox.x1);
      const boxH = Math.abs(y - selectionBox.y1);

      const newSelected = new Set<string>();
      if (e.shiftKey) selectedNotes.forEach(id => newSelected.add(id));

      notes.forEach(note => {
        const noteX = note.start * pixelsPerBeat;
        const noteY = getYFromPitch(note.pitch);
        const noteW = note.duration * pixelsPerBeat;
        const noteH = NOTE_HEIGHT;

        if (noteX < boxX + boxW && noteX + noteW > boxX && noteY < boxY + boxH && noteH + noteY > boxY) {
          newSelected.add(note.id);
        }
      });
      setSelectedNotes(newSelected);
      return;
    }

    if (!dragMode || !dragStart) return;

    // Calculate Deltas for Drag
    const deltaX = (e.clientX - dragStart.x) / pixelsPerBeat;
    const pixelDeltaY = e.clientY - dragStart.y;
    const pitchDelta = -Math.round(pixelDeltaY / NOTE_HEIGHT);

    // Calculate new state but DO NOT COMMIT to store yet
    const updatedNotes = notes.map(note => {
      const original = dragStart.notes.find(n => n.id === note.id);
      if (!original) return note;

      if (dragMode === 'move') {
        const newStart = Math.max(0, snap(original.start + deltaX));
        const newPitch = Math.min(108, Math.max(21, original.pitch + pitchDelta));
        return { ...note, start: newStart, pitch: newPitch };
      } else if (dragMode === 'resize-right') {
        const newDuration = Math.max(gridSize, snap(original.duration + deltaX));
        return { ...note, duration: newDuration };
      } else if (dragMode === 'resize-left') {
        const newStart = Math.max(0, snap(original.start + deltaX));
        const newDuration = Math.max(gridSize, original.duration + (original.start - newStart));
        return { ...note, start: newStart, duration: newDuration };
      }
      return note;
    });

    // OPTIMIZATION: Update ref and force draw. NO STATE UPDATE.
    interactionNotesRef.current = updatedNotes;
    if (canvasRef.current) {
      canvasRef.current.render(updatedNotes);
    }

  }, [dragMode, dragStart, selectionBox, notes, pixelsPerBeat, gridSize, snap, getYFromPitch, selectedNotes]);

  const handleGridMouseUp = useCallback((e: React.MouseEvent) => {
    // Commit logic for Drag
    if (interactionNotesRef.current && dragMode) {
      onNotesChange(interactionNotesRef.current);
    }

    // Deferred Creation Logic (Single Click handling)
    if (mouseDownStart) {
      // We released without dragging far enough -> Treat as Click
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();

      // Use original down coordinates for accuracy
      const worldX = mouseDownStart.x - rect.left;
      const worldY = mouseDownStart.y - rect.top;

      const pitch = getPitchFromY(worldY);
      const start = Math.floor(worldX / pixelsPerBeat / gridSize) * gridSize;

      if (pitch !== null && pitch >= 0 && pitch < 128) {
        const newNote: Note = {
          id: Math.random().toString(36).substr(2, 9),
          pitch,
          start,
          duration: gridSize,
          velocity: 0.8
        };

        playNotePreview(pitch);
        onNotesChange([...notes, newNote]);
        setSelectedNotes(new Set([newNote.id]));
      }
      setMouseDownStart(null);
    }

    interactionNotesRef.current = null;
    // Force one last render to clear any drag artifacts if we missed an update, 
    // although onNotesChange trigger will likely cause a prop update soon.
    if (canvasRef.current) {
      canvasRef.current.render(undefined); // Reset to props.notes (which will be old notes until parent updates)
    }

    setDragMode(null);
    setDragStart(null);
    setSelectionBox(null);
  }, [dragMode, onNotesChange, mouseDownStart, pixelsPerBeat, gridSize, getPitchFromY, notes, playNotePreview]);


  // Sync sidebar scroll with grid scroll
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const sidebarScroll = document.querySelector(`.sidebarScroll`) as HTMLElement;
      if (sidebarScroll) {
        sidebarScroll.style.transform = `translateY(${-scrollContainer.scrollTop}px)`;
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Initialize audio engine - DEFERRED to unblock main thread on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      // Audio Scope
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
        // Initialize async but don't await blocking the effect
        if (engine && engine.getSynth) {
          engine.getSynth(trackId, targetInstrument).catch(() => { });
        } else if (engine && engine.initialize) {
          engine.initialize().catch(() => { });
        }
      } else {
        toneDrumMachine.initialize?.().catch(() => { });
      }

      // Scroll Position (Moved here to happen after paint)
      if (scrollContainerRef.current) {
        const containerHeight = scrollContainerRef.current.clientHeight;
        let targetY = 0;
        if (notes && notes.length > 0) {
          let sumY = 0;
          let count = 0;
          // Sample first 20 notes only for speed
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

    }, 10); // Short delay to allow paint

    return () => clearTimeout(timer);
  }, [instrument, trackType, trackId, visiblePitches, getYFromPitch, notes, isPlaying]);

  // Keyboard Shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Zoom
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setSelectedNotes(new Set(notes.map(n => n.id)));
        return;
      }
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(z => Math.min(MAX_ZOOM, z + 10));
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(MIN_ZOOM, z - 10));
        return;
      }
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNotes.size > 0) {
        onNotesChange(notes.filter(n => !selectedNotes.has(n.id)));
        setSelectedNotes(new Set());
      }
      return;
    }

    // Arrows (Move/Transpose)
    if (selectedNotes.size > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();

      const isShift = e.shiftKey;
      const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';

      // Pitch Logic (Vertical)
      let pitchChange = 0;
      if (isVertical) {
        const base = e.key === 'ArrowUp' ? 1 : -1;
        pitchChange = base * (isShift ? 12 : 1);
      }

      // Time Logic (Horizontal)
      let startChange = 0;
      let durationChange = 0;

      if (!isVertical) {
        const delta = e.key === 'ArrowRight' ? gridSize : -gridSize;
        if (isShift) {
          // Shift + Horizontal = Resize Duration
          durationChange = delta;
        } else {
          // Plain Horizontal = Move
          startChange = delta;
        }
      }

      const newNotes = notes.map(n => {
        if (!selectedNotes.has(n.id)) return n;

        let newPitch = n.pitch + pitchChange;
        let newStart = n.start + startChange;
        let newDuration = n.duration + durationChange;

        // Clamp
        newPitch = Math.max(0, Math.min(108, newPitch)); // Cap at C8 (108) to prevent aliasing
        newStart = Math.max(0, newStart);
        newDuration = Math.max(gridSize, newDuration);

        return { ...n, pitch: newPitch, start: newStart, duration: newDuration };
      });

      onNotesChange(newNotes);

      // Play preview of first selected note if transposing
      // Play preview if transposing
      if (pitchChange !== 0 && !isPlaying && selectedNotes.size === 1) {
        const firstId = Array.from(selectedNotes)[0];
        const note = newNotes.find(n => n.id === firstId);
        if (note) playNotePreview(note.pitch);
      }
    }
  }, [selectedNotes, notes, gridSize, onNotesChange, isPlaying, playNotePreview]);

  // Autofocus component for keyboard shortcuts
  useEffect(() => {
    containerRef.current?.focus();
    return () => {
      // If we are closing, ensure we clear the scoped mode
      audioScheduler.clearScopedMode();
    };
  }, []);

  // Sync notes to scheduler if playing in scoped mode
  useEffect(() => {
    if (isPlaying) {
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
    <div className="prOverlay" ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown} onMouseDown={() => containerRef.current?.focus()} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', outline: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div className="prWindow" style={{ width: '95vw', height: '85vh', background: '#0c0c14', border: '1px solid #1e1e2d', borderRadius: '12px', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.8)', overflow: 'hidden', transform: 'translateZ(0)' }}>
        <div className="prHeader" style={{ height: '56px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e1e2d', background: '#10101a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: trackColor }}></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>{trackName}</div>
              <div style={{ fontSize: '11px', color: '#7171a1' }}>{instrument || 'Midi Instrument'}</div>
            </div>
            {trackType === 'drums' && <div style={{ fontSize: '9px', padding: '2px 6px', background: '#eb459e', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}>DRUM VIEW</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1a1a24', padding: '4px', borderRadius: '8px' }}>
              <div style={{ position: 'relative' }}>
                <button style={{ height: '32px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#a4a4d1', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setShowGridMenu(!showGridMenu)}>
                  <Grid3X3 size={14} />
                  <span>{GRID_OPTIONS.find(g => g.value === gridSize)?.label}</span>
                </button>
                {showGridMenu && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#1a1a24', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '4px', zIndex: 1100, minWidth: '80px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)' }}>
                    {GRID_OPTIONS.map(opt => (
                      <button key={opt.label} style={{ width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: gridSize === opt.value ? '#fff' : '#a4a4d1', background: gridSize === opt.value ? '#2a2a3e' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { setGridSize(opt.value); setShowGridMenu(false); }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ width: '1px', height: '16px', background: '#2a2a3e' }}></div>
              <button style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: selectedNotes.size === 0 ? '#58587a' : '#ed4245', background: 'transparent', border: 'none', cursor: selectedNotes.size === 0 ? 'default' : 'pointer' }} onClick={() => onNotesChange(notes.filter(n => !selectedNotes.has(n.id)))} disabled={selectedNotes.size === 0}>
                <Trash2 size={14} />
              </button>
            </div>

            <button style={{ width: '40px', height: '40px', borderRadius: '50%', background: isPlaying ? '#ed4245' : '#5865f2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(88, 101, 242, 0.4)' }} onClick={handleTogglePlay} onDoubleClick={handlePlayDoubleClick}>
              {isPlaying ? <Square size={16} fill="white" /> : <Play size={16} fill="white" />}
            </button>

            <button style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#58587a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Key Sidebar - Keeping sidebar as DOM for simple styling of labels */}
          <div style={{ width: SIDEBAR_WIDTH, background: '#10101a', borderRight: '1px solid #1e1e2d', position: 'relative' }}>
            <div className="sidebarScroll" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
              {visiblePitches.map((pitch) => {
                const name = getNoteName(pitch);
                const isC = name.startsWith('C') && !name.includes('#');
                return (
                  <div key={pitch} style={{ height: NOTE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', fontSize: '9px', fontWeight: isC ? 'bold' : 'normal', color: isC ? '#fff' : '#58587a', background: isBlackKey(pitch) ? '#0a0a0e' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }} onMouseDown={() => playNotePreview(pitch)}>
                    {name}
                  </div>
                );
              })}
            </div>
          </div>

          <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', background: '#0c0c14', position: 'relative' }} onScroll={(e) => {
            const sidebarScroll = document.querySelector('.sidebarScroll') as HTMLElement;
            if (sidebarScroll) sidebarScroll.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
          }}>
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

        <div style={{ height: '32px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0c0c14', borderTop: '1px solid #1e1e2d', fontSize: '10px', color: '#58587a' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
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
