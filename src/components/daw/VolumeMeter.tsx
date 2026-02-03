'use client';

import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../lib/audioEngine';

interface VolumeMeterProps {
    trackId: number;
    volume: number; // 0-1 slider value
    onVolumeChange: (volume: number) => void;
    isPlaying: boolean;
    isMuted: boolean;
}

export default function VolumeMeter({
    trackId,
    volume,
    onVolumeChange,
    isPlaying,
    isMuted
}: VolumeMeterProps) {
    const meterFillRef = useRef<HTMLDivElement>(null);

    // Sync volume with audio engine on mount/update
    useEffect(() => {
        // Ensure the engine knows the track's volume (e.g. initial load)
        audioEngine.updateTrackVolume(trackId, volume);
    }, [trackId, volume]);

    // Animate audio level during playback (throttled to 30fps for performance)
    useEffect(() => {
        if (!isPlaying || isMuted) {
            if (meterFillRef.current) {
                meterFillRef.current.style.width = '0%';
            }
            return;
        }

        let animId: number;
        let lastTime = 0;
        const FRAME_TIME = 33; // ~30fps for performance

        const animate = (currentTime: number) => {
            if (currentTime - lastTime >= FRAME_TIME) {
                // Get REAL audio level from engine
                const levels = audioEngine.getTrackLevels();
                // Default to 0 if track not initializing yet
                const level = levels[trackId] || 0;

                if (meterFillRef.current) {
                    const meterWidthPercent = Math.max(0, Math.min(100, level * 100));
                    meterFillRef.current.style.width = `${meterWidthPercent}%`;
                }

                lastTime = currentTime;
            }

            if (isPlaying && !isMuted) {
                animId = requestAnimationFrame(animate);
            }
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, [isPlaying, isMuted, trackId]);

    const handleVolumeChange = (newVal: number) => {
        // Update Audio Engine immediately for responsive audio
        audioEngine.updateTrackVolume(trackId, newVal);
        // Call parent handler to update store/state
        onVolumeChange(newVal);
    };

    // Convert linear 0-1 to dB approximation for display
    const getDbValue = (val: number) => {
        if (val <= 0.01) return '-∞';
        const db = 20 * Math.log10(val);
        return db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
    };

    return (
        <div
            className="volume-meter-component"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '130px',
                height: '18px',
                position: 'relative',
                cursor: 'default',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Container for Fader + Meter */}
            <div style={{
                position: 'relative',
                flex: 1,
                height: '100%',
                background: 'var(--border-subtle)',
                borderRadius: '2px',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
                overflow: 'hidden',
            }}>

                {/* Smooth Gradient Meter Bar (Behind the thumb) */}
                <div
                    ref={meterFillRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        // width is controlled by ref to prevent React thrashing
                        background: 'linear-gradient(90deg, #4caf50 0%, #8bc34a 60%, #ffeb3b 80%, #f44336 100%)',
                        opacity: 0.8,
                        transition: isPlaying ? 'width 0.04s' : 'width 0.2s',
                    }}
                />

                {/* The Slider Input */}
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume * 100}
                    onChange={e => handleVolumeChange(parseInt(e.target.value) / 100)}
                    onDoubleClick={() => handleVolumeChange(0.8)} // Reset default
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        padding: 0,
                        opacity: 1,
                        background: 'transparent',
                        WebkitAppearance: 'none',
                        cursor: 'pointer',
                        zIndex: 10,
                    }}
                    draggable={true}
                    onDragStart={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                />
            </div>

            {/* dB Display Side Label */}
            <div style={{
                width: '42px',
                textAlign: 'right',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-dim)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.5px'
            }}>
                <span style={{ color: volume > 0.9 ? '#ff6666' : 'var(--text-main)' }}>
                    {getDbValue(volume)} <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>dB</span>
                </span>
            </div>

            <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px; 
          width: 10px;  
          border-radius: 1px;
          background: linear-gradient(to bottom, #dcdcdc 0%, #a8a8a8 100%); 
          border: 1px solid #555;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5); 
          cursor: ew-resize; 
          pointer-events: auto;
        }
        
        input[type="range"]::-webkit-slider-thumb:hover {
           background: linear-gradient(to bottom, #ffffff 0%, #c0c0c0 100%);
        }
      `}</style>
        </div>
    );
}
