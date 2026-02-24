'use client';

import React, { memo } from 'react';
import { Track } from '../../lib/types';
import VolumeMeter from './VolumeMeter';
import PanKnob from './PanKnob';
import styles from './TrackLane.module.css';

interface TrackLaneProps {
  track: Track;
  selectedTrackId: number | null;
  isAnyTrackSoloed: boolean;
  draggedTrackId: number | null;
  dropTargetId: number | null;
  isPlaying: boolean;
  pixelsPerBeat: number;
  onSelectTrack: (id: number) => void;
  onEditTrack: (id: number) => void;
  onTrackContextMenu: (e: React.MouseEvent, id: number) => void;
  onTrackMute: (id: number) => void;
  onTrackSolo: (id: number, shiftKey: boolean) => void;
  onTrackVolumeChange: (id: number, volume: number) => void;
  onTrackPanChange: (id: number, pan: number) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
}

const TrackLane = memo(({
  track,
  selectedTrackId,
  isAnyTrackSoloed,
  draggedTrackId,
  dropTargetId,
  isPlaying,
  pixelsPerBeat,
  onSelectTrack,
  onEditTrack,
  onTrackContextMenu,
  onTrackMute,
  onTrackSolo,
  onTrackVolumeChange,
  onTrackPanChange,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: TrackLaneProps) => {
  const isSelected = selectedTrackId === track.id;
  const isGreyed = isAnyTrackSoloed && !track.soloed;
  const isDragging = draggedTrackId === track.id;
  const isDropTarget = dropTargetId === track.id;

  return (
    <div
      className={`${styles.trackLane} ${track.muted ? styles.muted : ''} ${isSelected ? styles.selected : ''} ${isGreyed ? styles.greyed : ''} ${isDragging ? styles.dragging : ''} ${isDropTarget ? styles.dropTarget : ''}`}
      onClick={() => onSelectTrack(track.id)}
      onDoubleClick={() => onEditTrack(track.id)}
      onContextMenu={(e) => onTrackContextMenu(e, track.id)}
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
          <div className={styles.trackRow1} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span className={styles.trackName} title={track.name}>{track.name}</span>
            <div className={styles.trackControls}>
              <button className={`${styles.trackBtn} ${track.muted ? styles.active : ''}`} onClick={e => { e.stopPropagation(); onTrackMute(track.id); }}>M</button>
              <button className={`${styles.trackBtn} ${track.soloed ? `${styles.active} ${styles.solo}` : ''}`} onClick={e => { e.stopPropagation(); onTrackSolo(track.id, e.shiftKey); }} title="Click to solo, Shift+click for multi-solo">S</button>
            </div>
          </div>
          <div className={styles.trackRow2} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <VolumeMeter
              trackId={track.id}
              volume={track.volume}
              onVolumeChange={(vol) => onTrackVolumeChange(track.id, vol)}
              isPlaying={isPlaying}
              isMuted={track.muted}
            />
            <PanKnob
              value={track.pan}
              size={20}
              onChange={pan => onTrackPanChange(track.id, pan)}
            />
          </div>
          {track.instrument && <span className={styles.trackInstrument}>{track.instrument}</span>}
        </div>
      </div>
      <div className={styles.trackContent} style={{ minHeight: '80px' }}>
        {track.clips.map((clip, idx) => {
          const clipWidth = clip.duration * pixelsPerBeat;
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

              {(track.type === 'midi' || track.type === 'drums') && notes.length > 0 && (
                <svg className={styles.clipNotes} viewBox="0 0 100 100" preserveAspectRatio="none">
                  {notes.map((note, noteIdx) => {
                    const x = (note.start / clip.duration) * 100;
                    const w = Math.max(1, (note.duration / clip.duration) * 100);
                    const y = ((maxPitch - note.pitch) / pitchRange) * 100;
                    const h = (1 / pitchRange) * 100;
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

              {track.type === 'audio' && (
                <svg className={styles.clipWaveform} viewBox="0 0 100 100" preserveAspectRatio="none">
                  {Array.from({ length: 50 }).map((_, i) => {
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

TrackLane.displayName = 'TrackLane';

export default TrackLane;
