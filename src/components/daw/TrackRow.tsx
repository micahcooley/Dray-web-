'use client';

import React, { memo, useRef, useEffect } from 'react';
import type { Track } from '../../lib/types';
import VolumeMeter from './VolumeMeter';
import PanKnob from './PanKnob';
import styles from './trackrow.module.css';

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  isGreyedOut: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isPlaying: boolean;
  pixelsPerBeat: number;

  onSelect: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, id: number) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;

  onMute: (id: number) => void;
  onSolo: (id: number, shiftKey: boolean) => void;
  onVolumeChange: (id: number, vol: number) => void;
  onPanChange: (id: number, pan: number) => void;
}

const TrackRow = memo(({
  track,
  isSelected,
  isGreyedOut,
  isDragging,
  isDropTarget,
  isPlaying,
  pixelsPerBeat,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMute,
  onSolo,
  onVolumeChange,
  onPanChange,
}: TrackRowProps) => {
  // --- RENDER COUNTER (DEV ONLY) ---
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[TrackRow] Rendered Track ${track.id} (${track.name}) - Count: ${renderCount.current}`);
    }
  });
  // ----------------------------------

  return (
    <div
      className={`${styles.trackLane} ${track.muted ? styles.muted : ''} ${isSelected ? styles.selected : ''} ${isGreyedOut ? styles.greyed : ''} ${isDragging ? styles.dragging : ''} ${isDropTarget ? styles.dropTarget : ''}`}
      onClick={() => onSelect(track.id)}
      onDoubleClick={() => onDoubleClick(track.id)}
      onContextMenu={(e) => onContextMenu(e, track.id)}
      draggable
      onDragStart={(e) => onDragStart(e, track.id)}
      onDragOver={(e) => onDragOver(e, track.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, track.id)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.trackHeader}>
        <div className={styles.trackColor} style={{ backgroundColor: track.color }}></div>
        <div className={styles.trackInfo}>
          <div className={styles.trackRow1}>
            <span className={styles.trackName} title={track.name}>{track.name}</span>
            <div className={styles.trackControls}>
              <button
                className={`${styles.trackBtn} ${track.muted ? styles.active : ''}`}
                onClick={e => { e.stopPropagation(); onMute(track.id); }}
              >
                M
              </button>
              <button
                className={`${styles.trackBtn} ${track.soloed ? `${styles.active} ${styles.solo}` : ''}`}
                onClick={e => { e.stopPropagation(); onSolo(track.id, e.shiftKey); }}
                title="Click to solo, Shift+click for multi-solo"
              >
                S
              </button>
            </div>
          </div>
          <div className={styles.trackRow2}>
            {/* Real-time volume meter with level display */}
            <VolumeMeter
              trackId={track.id}
              volume={track.volume}
              onVolumeChange={(vol) => onVolumeChange(track.id, vol)}
              isPlaying={isPlaying}
              isMuted={track.muted}
            />
            {/* Pan knob */}
            <PanKnob
              value={track.pan}
              size={20}
              onChange={pan => onPanChange(track.id, pan)}
            />
          </div>
          {track.instrument && <span className={styles.trackInstrument}>{track.instrument}</span>}
        </div>
      </div>
      <div className={styles.trackContent}>
        {track.clips.map((clip, idx) => {
          const clipWidth = clip.duration * pixelsPerBeat;
          // Calculate note range for this clip
          const notes = clip.notes || [];
          const minPitch = notes.length > 0 ? Math.min(...notes.map(n => n.pitch)) : 60;
          const maxPitch = notes.length > 0 ? Math.max(...notes.map(n => n.pitch)) : 72;
          const pitchRange = Math.max(12, maxPitch - minPitch + 1);

          return (
            <div key={idx} className={styles.clip} style={{
              left: `${clip.start * pixelsPerBeat}px`,
              width: `${clipWidth}px`,
              backgroundColor: track.color + '25',
              borderColor: track.color
            }}>
              <span className={styles.clipName}>{clip.name}</span>

              {/* MIDI Note Visualization */}
              {(track.type === 'midi' || track.type === 'drums') && notes.length > 0 && (
                <svg className={styles.clipNotes} viewBox="0 0 100 100" preserveAspectRatio="none">
                  {notes.map((note, noteIdx) => {
                    // Use normalized 0-100 coordinates - notes touch top and bottom
                    const x = (note.start / clip.duration) * 100;
                    const w = Math.max(1, (note.duration / clip.duration) * 100);
                    const y = ((maxPitch - note.pitch) / pitchRange) * 100;
                    const h = (1 / pitchRange) * 100; // Full height per note
                    return (
                      <rect
                        key={noteIdx}
                        x={x}
                        y={y}
                        width={w - 0.5}
                        height={h}
                        rx={0.5}
                        fill={track.color}
                        opacity={0.9}
                      />
                    );
                  })}
                </svg>
              )}

              {/* Audio Waveform Visualization */}
              {track.type === 'audio' && (
                <svg className={styles.clipWaveform} viewBox="0 0 100 100" preserveAspectRatio="none">
                  {Array.from({ length: 50 }).map((_, i) => {
                    // Generate pseudo-random but consistent waveform
                    const seed = (clip.name.charCodeAt(i % clip.name.length) + i) % 100;
                    const h = 20 + (seed / 100) * 60;
                    const y = (100 - h) / 2;
                    return (
                      <rect
                        key={i}
                        x={i * 2}
                        y={y}
                        width={1.5}
                        height={h}
                        rx={0.5}
                        fill={track.color}
                        opacity={0.6}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';

export default TrackRow;
