'use client';

import React, { useRef } from 'react';
import { usePlaybackCallback } from '../../hooks/usePlaybackTime';

interface MasterPlayheadProps {
    pixelsPerBeat: number;
    height: number;
}

export default function MasterPlayhead({ pixelsPerBeat, height }: MasterPlayheadProps) {
    const playheadRef = useRef<HTMLDivElement>(null);

    // High-performance direct update
    usePlaybackCallback((time, step) => {
        if (playheadRef.current) {
            // step is 16th notes. Convert to beats (quarter notes)
            const beats = step / 4;
            const leftPosition = beats * pixelsPerBeat;
            playheadRef.current.style.transform = `translateX(${leftPosition}px)`;
        }
    });

    return (
        <div
            ref={playheadRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '2px',
                height: height,
                backgroundColor: 'var(--accent-primary, #ff4d4d)',
                transform: `translateX(0px)`, // Initial position
                zIndex: 100,
                pointerEvents: 'none',
                boxShadow: '0 0 4px rgba(255, 77, 77, 0.5)',
                willChange: 'transform' // Hint to browser for optimization
            }}
        />
    );
}
