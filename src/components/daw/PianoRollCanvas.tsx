'use client';

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { NOTE_HEIGHT, BLACK_KEY_INDICES } from '../../lib/constants';
import type { MidiNote } from '../../lib/types';
import { getPlaybackBeat } from '../../hooks/usePlaybackTime';

export interface PianoRollCanvasHandle {
    render: (notesOverride?: MidiNote[]) => void;
}

interface PianoRollCanvasProps {
    width: number; // Total world width
    height: number; // Total world height
    visiblePitches: number[];
    notes: MidiNote[];
    pixelsPerBeat: number;
    gridSize: number;
    trackColor: string;
    selectedNoteIds: Set<string>;
    isPlaying: boolean;
    selectionBox: { x1: number, y1: number, x2: number, y2: number } | null;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
}

const PianoRollCanvas = forwardRef<PianoRollCanvasHandle, PianoRollCanvasProps>(({
    width,
    height,
    visiblePitches,
    notes,
    pixelsPerBeat,
    gridSize,
    trackColor,
    selectedNoteIds,
    isPlaying,
    selectionBox,
    scrollContainerRef,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Observe viewport size changes
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setViewportSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        ro.observe(scrollContainerRef.current);
        // Initial size
        setViewportSize({
            width: scrollContainerRef.current.clientWidth,
            height: scrollContainerRef.current.clientHeight
        });

        return () => ro.disconnect();
    }, [scrollContainerRef]);


    // Main Render Logic
    const renderFrame = useCallback((notesOverride?: MidiNote[]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const vWidth = viewportSize.width;
        const vHeight = viewportSize.height;

        if (vWidth === 0 || vHeight === 0) return;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== vWidth * dpr || canvas.height !== vHeight * dpr) {
            canvas.width = vWidth * dpr;
            canvas.height = vHeight * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = vWidth + 'px';
            canvas.style.height = vHeight + 'px';
        }

        // Get current scroll position from the shared container ref
        const scrollX = scrollContainerRef.current?.scrollLeft || 0;
        const scrollY = scrollContainerRef.current?.scrollTop || 0;

        // 1. Clear Viewport
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Reset transform to screen space
        ctx.fillStyle = '#101014'; // Match Theme bg
        ctx.fillRect(0, 0, vWidth, vHeight);

        // Translate context to "World Space" relative to scroll
        ctx.translate(-scrollX, -scrollY);

        // CULLING BOUNDS (World Space)
        const startX = scrollX;
        const endX = scrollX + vWidth;
        const startY = scrollY;
        const endY = scrollY + vHeight;

        // 2. Draw Rows (Alternating colors for keys)
        const startIndex = Math.floor(startY / NOTE_HEIGHT);
        const endIndex = Math.min(visiblePitches.length - 1, Math.ceil(endY / NOTE_HEIGHT));

        // Batch horizontal lines to minimize draw calls
        ctx.strokeStyle = '#1e1e2d';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Pre-set fill style for black keys
        ctx.fillStyle = '#0a0a0e';

        for (let i = Math.max(0, startIndex); i <= endIndex; i++) {
            const pitch = visiblePitches[i];
            const y = i * NOTE_HEIGHT;
            const noteIndex = pitch % 12;
            const isBlack = (BLACK_KEY_INDICES as readonly number[]).includes(noteIndex);

            if (isBlack) {
                ctx.fillRect(startX, y, vWidth, NOTE_HEIGHT);
            }

            // Add horizontal line to batch
            ctx.moveTo(startX, y + NOTE_HEIGHT);
            ctx.lineTo(endX, y + NOTE_HEIGHT);
        }

        // Draw all lines at once
        ctx.stroke();

        // 3. Draw Vertical Grid Lines
        const beatWidth = pixelsPerBeat;
        const subBeatWidth = beatWidth * gridSize;
        const startGridX = Math.floor(startX / subBeatWidth) * subBeatWidth;

        // Sub-beats
        ctx.strokeStyle = '#1a1a24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startGridX; x <= endX; x += subBeatWidth) {
            if (x % beatWidth < 1) continue; // Skip beats (drawn later)
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        ctx.stroke();

        // Beats
        const startBeatX = Math.floor(startX / beatWidth) * beatWidth;
        ctx.strokeStyle = '#2a2a3e';
        ctx.beginPath();
        for (let x = startBeatX; x <= endX; x += beatWidth) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        ctx.stroke();

        // 4. Draw Notes
        const notesToDraw = notesOverride || notes;

        notesToDraw.forEach(note => {
            const rowIndex = visiblePitches.indexOf(note.pitch);
            if (rowIndex === -1) return;

            const y = rowIndex * NOTE_HEIGHT;
            if (y > endY || y + NOTE_HEIGHT < startY) return;

            const x = note.start * pixelsPerBeat;
            const w = Math.max(2, note.duration * pixelsPerBeat - 1);
            if (x > endX || x + w < startX) return;

            const isSelected = selectedNoteIds.has(note.id);

            // Shadow for selection
            if (isSelected) {
                ctx.shadowColor = 'rgba(255,255,255,0.3)';
                ctx.shadowBlur = 8;
            } else {
                ctx.shadowBlur = 0;
            }

            ctx.fillStyle = isSelected ? '#ffffff' : trackColor;
            ctx.fillRect(x, y, w, NOTE_HEIGHT - 1);
            ctx.shadowBlur = 0;

            // Label (if wide enough)
            if (w > 24) {
                ctx.fillStyle = isSelected ? 'black' : 'rgba(0,0,0,0.6)';
                ctx.font = 'bold 9px Inter, sans-serif';
                // ctx.fillText(...)
            }
        });

        // 5. Draw Selection Box
        if (selectionBox) {
            const { x1, y1, x2, y2 } = selectionBox;
            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1);
            const rh = Math.abs(y2 - y1);

            ctx.fillStyle = 'rgba(88, 101, 242, 0.15)';
            ctx.strokeStyle = '#5865f2';
            ctx.lineWidth = 1;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
        }

        // 6. Draw Playhead
        const currentBeat = getPlaybackBeat();
        if (isPlaying || currentBeat > 0) {
            const headX = currentBeat * pixelsPerBeat;
            if (headX >= startX && headX <= endX) {
                ctx.strokeStyle = '#ff4d4d';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(headX, startY);
                ctx.lineTo(headX, endY);
                ctx.stroke();

                // Cap
                ctx.fillStyle = '#ff4d4d';
                ctx.beginPath();
                ctx.moveTo(headX - 6, startY);
                ctx.lineTo(headX + 6, startY);
                ctx.lineTo(headX, startY + 10);
                ctx.fill();
            }
        }
    }, [width, height, visiblePitches, notes, pixelsPerBeat, gridSize, trackColor, selectedNoteIds, isPlaying, selectionBox, viewportSize, scrollContainerRef]);

    // SCROLL SYNCHRONIZATION:
    // We MUST listen to scroll events on the container to trigger repaints.
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let rafId: number;
        const handleScroll = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                renderFrame();
            });
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', handleScroll);
            cancelAnimationFrame(rafId);
        };
    }, [scrollContainerRef, renderFrame]);

    // PLAYBACK ANIMATION LOOP:
    // When playing, we must aggressively re-render to animate the playhead smoothly at 60fps.
    useEffect(() => {
        if (!isPlaying) return;

        let rafId: number;
        const loop = () => {
            renderFrame();
            rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, renderFrame]);

    // Expose Imperative Draw
    useImperativeHandle(ref, () => ({
        render: (notesOverride) => renderFrame(notesOverride)
    }));

    // Auto-render on prop updates
    useEffect(() => {
        renderFrame();
    }, [renderFrame]);

    return (
        <div
            ref={wrapperRef}
            style={{
                width: width + 'px',
                height: height + 'px',
                position: 'relative',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none'
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onDoubleClick={onDoubleClick}
            onDragStart={(e) => e.preventDefault()}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    cursor: 'pointer',
                    position: 'sticky',
                    top: 0,
                    left: 0,
                    width: viewportSize.width + 'px',
                    height: viewportSize.height + 'px'
                }}
            />
        </div>
    );
});

export default PianoRollCanvas;
