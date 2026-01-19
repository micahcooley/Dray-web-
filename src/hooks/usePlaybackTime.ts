'use client';

import { useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { audioScheduler } from '../lib/scheduler';

// This is the time value that updates 60fps - NOT in React state
let currentPlaybackTime = 0;
let currentPlaybackBeat = 0;
const listeners = new Set<() => void>();

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

// External update function called by scheduler
export function updatePlaybackTime(time: number, beat: number) {
    currentPlaybackTime = time;
    currentPlaybackBeat = beat;
    // Notify all subscribers (triggers re-render only for components using this hook)
    listeners.forEach(listener => listener());
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
        const unsubscribe = audioScheduler.subscribe((time, step) => {
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
    callbackRef.current = callback;

    useEffect(() => {
        const unsubscribe = audioScheduler.subscribe((time, step) => {
            callbackRef.current(time, step);
        });
        return () => { unsubscribe(); };
    }, []);
}

