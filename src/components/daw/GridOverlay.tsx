import React, { useMemo } from 'react';

interface GridOverlayProps {
  pixelsPerBeat: number;
  gridDivision: number;
  totalBeats: number;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({
  pixelsPerBeat,
  gridDivision,
  totalBeats
}) => {
  const background = useMemo(() => {
    const stops: string[] = [];
    const step = pixelsPerBeat / gridDivision;
    const majorColor = 'rgba(255, 255, 255, 0.08)';
    const minorColor = 'rgba(255, 255, 255, 0.03)';

    for (let i = 0; i < gridDivision; i++) {
      const position = i * step;
      const color = i === 0 ? majorColor : minorColor;

      // Line start
      stops.push(`${color} ${position}px`);
      // Line end (1px width)
      stops.push(`${color} ${position + 1}px`);
      // Transparent start
      stops.push(`transparent ${position + 1}px`);

      // Transparent end
      if (i < gridDivision - 1) {
        const nextPos = (i + 1) * step;
        stops.push(`transparent ${nextPos}px`);
      } else {
        stops.push(`transparent ${pixelsPerBeat}px`);
      }
    }

    return `repeating-linear-gradient(90deg, ${stops.join(', ')})`;
  }, [pixelsPerBeat, gridDivision]);

  return (
    <div
      className="grid-lines"
      style={{
        left: '170px',
        position: 'absolute',
        top: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1,
        width: `${totalBeats * pixelsPerBeat}px`,
        backgroundImage: background
      }}
    />
  );
};
