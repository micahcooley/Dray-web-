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
    const timeRef = useRef<HTMLSpanElement>(null);

    // Optimized: direct DOM update to avoid 60fps React re-renders
    usePlaybackCallback((time) => {
        if (timeRef.current) {
            timeRef.current.textContent = formatTime(time);
        }
    });

    // Initialize with current scheduler time to handle hydration/mounting state
    return <span ref={timeRef} className="time">{formatTime(getPlaybackTime())}</span>;
}
