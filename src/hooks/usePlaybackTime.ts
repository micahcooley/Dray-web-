'use client';

import { useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { audioScheduler } from '../lib/scheduler';

// This is the time value that updates 60fps - NOT in React state
let currentPlaybackTime = 0;
let currentPlaybackBeat = 0;
const listeners = new Set<() => void>();

// Subscribe to audioScheduler to update local state and notify listeners
// This replaces the circular dependency where scheduler called updatePlaybackTime
// We assume audioScheduler is a singleton that persists
if (typeof window !== 'undefined') {
    audioScheduler.subscribe((time, step) => {
        currentPlaybackTime = time;
        // step is 16th notes. Convert to beats (quarter notes)
        currentPlaybackBeat = step / 4;
        listeners.forEach(listener => listener());
    });
}

// Subscribe function for useSyncExternalStore
function subscribe(callback: () => void) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

// Getter functions
export function getPlaybackTime() {
    return currentPlaybackTime;
}

export function getPlaybackBeat() {
    return currentPlaybackBeat;
}

/**
 * Hook for components that need the current playback time.
 * Uses useSyncExternalStore for proper React 18 concurrent rendering support.
 * 
 * IMPORTANT: Only use this in components that NEED to re-render on every frame
 * (like playhead position). For other components, use refs instead.
 */
export function usePlaybackTime() {
    const time = useSyncExternalStore(subscribe, getPlaybackTime, getPlaybackTime);
    return time;
}

/**
 * Hook for the current beat position.
 */
export function usePlaybackBeat() {
    const beat = useSyncExternalStore(subscribe, getPlaybackBeat, getPlaybackBeat);
    return beat;
}

/**
 * Hook that provides a ref to the current time - does NOT cause re-renders.
 * Use this when you need to READ the time but don't need to re-render on every frame.
 */
export function usePlaybackTimeRef() {
    const timeRef = useRef(0);

    useEffect(() => {
        const unsubscribe = audioScheduler.subscribe((time) => {
            timeRef.current = time;
        });
        return () => { unsubscribe(); };
    }, []);

    return timeRef;
}

/**
 * Hook that calls a callback on each frame during playback.
 * The callback receives (time, beat) but does NOT cause the component to re-render.
 */
export function usePlaybackCallback(callback: (time: number, beat: number) => void) {
    const callbackRef = useRef(callback);

    // Use useLayoutEffect to update the ref synchronously before paint
    // This ensures the latest callback is always used without triggering re-renders
    useLayoutEffect(() => {
        callbackRef.current = callback;
    });

    useEffect(() => {
        const unsubscribe = audioScheduler.subscribe((time, step) => {
            // step is 16th notes, convert to beats (quarter notes)
            callbackRef.current(time, step / 4);
        });
        return () => { unsubscribe(); };
    }, []);
}
