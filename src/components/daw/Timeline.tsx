'use client';

import React from 'react';

interface TimelineProps {
    pixelsPerBeat: number;
    tempo: number;
    onSetTime: (time: number) => void;
}

export default function Timeline({ pixelsPerBeat, tempo, onSetTime }: TimelineProps) {
    const handleRulerClick = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const headerWidth = 170;
        if (x > headerWidth) {
            const pixels = x - headerWidth;
            const beat = pixels / pixelsPerBeat;
            const time = beat * (60 / tempo);
            onSetTime(time);
        }
    };

    return (
        <div
            className="timeline-ruler"
            onClick={handleRulerClick}
            style={{
                height: '24px',
                display: 'flex',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer'
            }}
        >
            <div className="ruler-track-space" style={{
                width: '170px',
                flexShrink: 0,
                borderRight: '1px solid var(--border-subtle)'
            }}></div>
            {Array.from({ length: 17 }, (_, i) => (
                <div key={i} className="ruler-mark" style={{
                    width: pixelsPerBeat,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '4px',
                    fontSize: '0.5rem',
                    color: 'var(--text-dim)',
                    borderLeft: '1px solid var(--border-subtle)'
                }}>
                    <span>{i + 1}</span>
                </div>
            ))}
        </div>
    );
}
