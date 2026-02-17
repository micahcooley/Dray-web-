'use client';

import React, { useRef } from 'react';
import { usePlaybackCallback, getPlaybackTime } from '../../hooks/usePlaybackTime';
import { formatTime } from '../../lib/formatUtils';

interface TimeDisplayProps {
    className?: string;
}

/**
 * Optimized time display component that updates via direct DOM manipulation
 * during playback to avoid React re-renders for the entire component tree.
 */
export default function TimeDisplay({ className = "time" }: TimeDisplayProps) {
    const timeRef = useRef<HTMLSpanElement>(null);

    usePlaybackCallback((time) => {
        if (timeRef.current) {
            timeRef.current.textContent = formatTime(time);
        }
    });

    return (
        <span ref={timeRef} className={className}>
            {formatTime(getPlaybackTime())}
        </span>
    );
}
