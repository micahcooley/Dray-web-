'use client';

import React, { useState, useRef } from 'react';

interface PanKnobProps {
    value: number; // -100 to 100
    onChange: (value: number) => void;
    size?: number;
}

export default function PanKnob({ value, onChange, size = 24 }: PanKnobProps) {
    const knobRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Convert value (-100 to 100) to rotation (-135° to 135°)
    const rotation = (value / 100) * 135;

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);

        const startY = e.clientY;
        const startValue = value;

        const handleMouseMove = (evt: MouseEvent) => {
            const deltaY = startY - evt.clientY;
            const newValue = Math.max(-100, Math.min(100, startValue + deltaY * 2));
            onChange(Math.round(newValue));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Double-click to reset to center
    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(0);
    };

    return (
        <div
            ref={knobRef}
            style={{
                width: size,
                height: size,
                cursor: 'ns-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title={`Pan: ${value > 0 ? `R${value}` : value < 0 ? `L${Math.abs(value)}` : 'C'}`}
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                style={{ overflow: 'visible' }}
            >
                {/* Outer ring */}
                <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="#1a1a24"
                    stroke="#333"
                    strokeWidth="1"
                />

                {/* Track arc - background */}
                <path
                    d="M 4.5 17 A 9 9 0 1 1 19.5 17"
                    fill="none"
                    stroke="#2a2a3a"
                    strokeWidth="2"
                    strokeLinecap="round"
                />

                {/* Track arc - active (based on value) */}
                <path
                    d={value >= 0
                        ? `M 12 3 A 9 9 0 0 1 ${12 + 9 * Math.sin(rotation * Math.PI / 180)} ${12 - 9 * Math.cos(rotation * Math.PI / 180)}`
                        : `M ${12 + 9 * Math.sin(rotation * Math.PI / 180)} ${12 - 9 * Math.cos(rotation * Math.PI / 180)} A 9 9 0 0 1 12 3`
                    }
                    fill="none"
                    stroke={value === 0 ? '#555' : '#5865f2'}
                    strokeWidth="2"
                    strokeLinecap="round"
                />

                {/* Center indicator */}
                <circle
                    cx="12"
                    cy="12"
                    r="4"
                    fill={isDragging ? '#5865f2' : '#444'}
                />

                {/* Pointer line */}
                <line
                    x1="12"
                    y1="12"
                    x2={12 + 7 * Math.sin(rotation * Math.PI / 180)}
                    y2={12 - 7 * Math.cos(rotation * Math.PI / 180)}
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}
