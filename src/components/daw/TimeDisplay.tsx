'use client';

import React, { useRef } from 'react';
import { usePlaybackCallback, getPlaybackTime } from '../../hooks/usePlaybackTime';

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
};

export default function TimeDisplay() {
    const spanRef = useRef<HTMLSpanElement>(null);

    // Optimize performance by avoiding React state updates every frame (60fps)
    usePlaybackCallback((time) => {
        if (spanRef.current) {
            spanRef.current.textContent = formatTime(time);
        }
    });

    return <span ref={spanRef} className="time">{formatTime(getPlaybackTime())}</span>;
}
