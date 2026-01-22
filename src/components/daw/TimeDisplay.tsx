'use client';

import React, { useRef } from 'react';
import { usePlaybackCallback, getPlaybackTime } from '../../hooks/usePlaybackTime';

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
};

interface TimeDisplayProps {
    className?: string;
}

export default function TimeDisplay({ className = "time" }: TimeDisplayProps) {
    const spanRef = useRef<HTMLSpanElement>(null);

    // Update text directly via ref to avoid 60fps React re-renders
    // Using textContent is faster than innerText as it doesn't trigger reflow
    usePlaybackCallback((time) => {
        if (spanRef.current) {
            spanRef.current.textContent = formatTime(time);
        }
    });

    // Initial render uses getPlaybackTime() but subsequent updates happen via ref
    return <span ref={spanRef} className={className}>{formatTime(getPlaybackTime())}</span>;
}
