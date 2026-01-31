'use client';

import React, { useRef, useEffect } from 'react';
import { usePlaybackCallback, getPlaybackTime } from '../../hooks/usePlaybackTime';

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
};

export default function TimeDisplay() {
    const timeRef = useRef<HTMLSpanElement>(null);

    // Optimize: Update DOM directly to avoid 60fps React re-renders
    usePlaybackCallback((time) => {
        if (timeRef.current) {
            timeRef.current.textContent = formatTime(time);
        }
    });

    // Set initial value on mount
    useEffect(() => {
        if (timeRef.current) {
            timeRef.current.textContent = formatTime(getPlaybackTime());
        }
    }, []);

    return <span className="time" ref={timeRef}>00:00:000</span>;
}
