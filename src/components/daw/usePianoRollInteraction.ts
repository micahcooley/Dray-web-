import { useState, useRef, useCallback } from 'react';
import type { MidiNote } from '../../lib/types';
import { NOTE_HEIGHT } from '../../lib/constants';
import { PianoRollCanvasHandle } from './PianoRollCanvas';

interface UsePianoRollInteractionProps {
    notes: MidiNote[];
    onNotesChange: (notes: MidiNote[]) => void;
    pixelsPerBeat: number;
    gridSize: number;
    visiblePitches: number[];
    isPlaying: boolean;
    playNotePreview: (pitch: number) => void;
    canvasRef: React.RefObject<PianoRollCanvasHandle | null>;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    MAX_ZOOM: number;
    MIN_ZOOM: number;
}

export function usePianoRollInteraction({
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
}: UsePianoRollInteractionProps) {
    const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
    const [dragMode, setDragMode] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
    const [dragStart, setDragStart] = useState<{ worldX: number; worldY: number; notes: MidiNote[] } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [mouseDownStart, setMouseDownStart] = useState<{ screenX: number; screenY: number; worldX: number; worldY: number } | null>(null);

    // Stores the "temporary" notes during a drag operation to avoid React State thrashing
    const interactionNotesRef = useRef<MidiNote[] | null>(null);

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

    // Hit-test helper
    const findHitNote = useCallback((worldX: number, worldY: number, resizeMargin: number = 8): { note: MidiNote; mode: 'move' | 'resize-left' | 'resize-right' } | null => {
        const pitch = getPitchFromY(worldY);
        if (pitch === null) return null;

        // Search for clicked note (reverse to hit top notes first)
        for (let i = notes.length - 1; i >= 0; i--) {
            const note = notes[i];
            if (note.pitch === pitch) {
                const startX = note.start * pixelsPerBeat;
                const endX = (note.start + note.duration) * pixelsPerBeat;

                // Check collision in world space
                if (worldX >= startX && worldX <= endX) {
                    let mode: 'move' | 'resize-left' | 'resize-right';
                    // Check resize zones
                    if (worldX <= startX + resizeMargin) mode = 'resize-left';
                    else if (worldX >= endX - resizeMargin) mode = 'resize-right';
                    else mode = 'move';
                    return { note, mode };
                }
            }
        }
        return null;
    }, [notes, pixelsPerBeat, getPitchFromY]);

    // Grid Snap Helper
    const snap = useCallback((val: number) => {
        return Math.round(val / gridSize) * gridSize;
    }, [gridSize]);

    // Mouse Handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); // Prevent native drag/select
        const worldWrapper = e.currentTarget;
        const rect = worldWrapper.getBoundingClientRect();

        // COORDINATE SYSTEM:
        // The 'worldWrapper' is the scrollable container.
        // rect.left shifts as we scroll.
        // Therefore, (clientX - rect.left) provides the World X coordinate directly.
        // No explicit scrollLeft addition is needed.
        const worldX = e.clientX - rect.left;
        const worldY = e.clientY - rect.top;

        // Hit Testing using World Coords
        const hitResult = findHitNote(worldX, worldY);

        if (hitResult) {
            const { note: hitNote, mode } = hitResult;
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
            setDragStart({ worldX, worldY, notes: draggedNotes });
            setMouseDownStart(null); // Clear pending empty click

            if (!isPlaying && hitNote) playNotePreview(hitNote.pitch);
        } else {
            // EMPTY CLICK -> Ambiguous (Create vs Select)
            if (e.shiftKey) {
                // Shift always starts selection immediately (classic behavior)
                setSelectionBox({ x1: worldX, y1: worldY, x2: worldX, y2: worldY });
                setMouseDownStart(null);
            } else {
                // Defer until move or up
                // Store both Screen Coords (for threshold) and World Coords (for anchor)
                setMouseDownStart({
                    screenX: e.clientX,
                    screenY: e.clientY,
                    worldX,
                    worldY
                });
                // Deselect on empty down
                setSelectedNotes(new Set());
            }
        }
    }, [notes, selectedNotes, isPlaying, playNotePreview, findHitNote]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const worldWrapper = e.currentTarget;
        const rect = worldWrapper.getBoundingClientRect();

        // Current World Coordinates (robust to scrolling during drag)
        const currentWorldX = e.clientX - rect.left;
        const currentWorldY = e.clientY - rect.top;

        // Check for drag-select threshold from empty click
        if (mouseDownStart && !selectionBox && !dragMode) {
            // Use SCREEN coordinates for threshold check (user intention)
            const dist = Math.hypot(e.clientX - mouseDownStart.screenX, e.clientY - mouseDownStart.screenY);
            if (dist > 5) {
                // Start Selection Box anchored at ORIGINAL World Coordinate
                setSelectionBox({
                    x1: mouseDownStart.worldX,
                    y1: mouseDownStart.worldY,
                    x2: currentWorldX,
                    y2: currentWorldY
                });
                setMouseDownStart(null); // Consumed
                return;
            }
        }

        if (!dragMode && !selectionBox && !mouseDownStart) {
            // Handle Hover Cursor Feedback
            const hitResult = findHitNote(currentWorldX, currentWorldY);
            let cursor = 'default';
            
            if (hitResult) {
                if (hitResult.mode === 'resize-left') cursor = 'w-resize';
                else if (hitResult.mode === 'resize-right') cursor = 'e-resize';
                else cursor = 'move';
            }
            
            (worldWrapper as HTMLElement).style.cursor = cursor;
        }

        if (selectionBox) { // Selection Box Logic
            // Update only the end point (x2, y2)
            setSelectionBox(prev => prev ? ({ ...prev, x2: currentWorldX, y2: currentWorldY }) : null);

            // Collision Detection (O(N) but just math)
            const boxX = Math.min(selectionBox.x1, currentWorldX);
            const boxY = Math.min(selectionBox.y1, currentWorldY);
            const boxW = Math.abs(currentWorldX - selectionBox.x1);
            const boxH = Math.abs(currentWorldY - selectionBox.y1);

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

        // Calculate Deltas using WORLD coordinates
        // This ensures dragging works even if the view scrolls
        const deltaX = (currentWorldX - dragStart.worldX) / pixelsPerBeat;
        const pixelDeltaY = currentWorldY - dragStart.worldY;
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

    }, [dragMode, dragStart, selectionBox, notes, pixelsPerBeat, gridSize, snap, getYFromPitch, selectedNotes, mouseDownStart, canvasRef, findHitNote]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        // Commit logic for Drag
        if (interactionNotesRef.current && dragMode) {
            onNotesChange(interactionNotesRef.current);
        }

        // Deferred Creation Logic (Single Click handling)
        if (mouseDownStart) {
            // We released without dragging far enough -> Treat as Click
            // We use the 'Current World' position to ensure note is created under cursor
            const worldWrapper = e.currentTarget;
            const rect = worldWrapper.getBoundingClientRect();

            const worldX = e.clientX - rect.left;
            const worldY = e.clientY - rect.top;

            const pitch = getPitchFromY(worldY);
            const start = Math.floor(worldX / pixelsPerBeat / gridSize) * gridSize;

            if (pitch !== null && pitch >= 0 && pitch < 128) {
                const newNote: MidiNote = {
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
    }, [dragMode, onNotesChange, mouseDownStart, pixelsPerBeat, gridSize, getPitchFromY, notes, playNotePreview, canvasRef]);


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

            // Play preview if transposing
            if (pitchChange !== 0 && !isPlaying && selectedNotes.size === 1) {
                const firstId = Array.from(selectedNotes)[0];
                const note = newNotes.find(n => n.id === firstId);
                if (note) playNotePreview(note.pitch);
            }
        }
    }, [selectedNotes, notes, gridSize, onNotesChange, isPlaying, playNotePreview, setZoom, MAX_ZOOM, MIN_ZOOM, snap]);

    return {
        selectedNotes,
        dragMode,
        dragStart,
        selectionBox,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleKeyDown,
        getYFromPitch
    };
}
