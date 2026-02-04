'use client';

import React, { useRef } from 'react';
import { usePlaybackCallback, getPlaybackTime } from '../../hooks/usePlaybackTime';

const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
};

export default function TimeDisplay() {
    const timeRef = useRef<HTMLSpanElement>(null);

    usePlaybackCallback((time) => {
        if (timeRef.current) {
            timeRef.current.textContent = formatTime(time);
        }
    });

    return <span ref={timeRef} className="time">{formatTime(getPlaybackTime())}</span>;
}
