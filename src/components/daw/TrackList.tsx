'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import type { Track } from '../../lib/types';
import VolumeMeter from './VolumeMeter';
import PanKnob from './PanKnob';
import MasterPlayhead from './MasterPlayhead';
import styles from './TrackList.module.css';

interface TrackListProps {
  tracks: Track[];
  gridDivision: number;
  pixelsPerBeat: number;
  isPlaying: boolean;
  selectedTrackId: number | null;
  draggedTrackId: number | null;
  dropTargetId: number | null;
  onSelectTrack: (id: number) => void;
  onEditTrack: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, id: number) => void;
  onMuteTrack: (id: number) => void;
  onSoloTrack: (id: number, shift: boolean) => void;
  onVolumeChange: (id: number, val: number) => void;
  onPanChange: (id: number, val: number) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onAddTrackClick: () => void;
  onAddTrackContextMenu: (e: React.MouseEvent) => void;
}

export default function TrackList({
  tracks,
  gridDivision,
  pixelsPerBeat,
  isPlaying,
  selectedTrackId,
  draggedTrackId,
  dropTargetId,
  onSelectTrack,
  onEditTrack,
  onContextMenu,
  onMuteTrack,
  onSoloTrack,
  onVolumeChange,
  onPanChange,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAddTrackClick,
  onAddTrackContextMenu
}: TrackListProps) {

  return (
    <div className={styles.trackLanes}>
      {/* Grid lines overlay */}
      <div className={styles.gridLines} style={{ left: '170px' }}>
        {Array.from({ length: 17 * gridDivision }, (_, i) => (
          <div
            key={i}
            className={`${styles.gridLine} ${i % gridDivision === 0 ? styles.gridLineMajor : styles.gridLineMinor}`}
            style={{ left: `${(i / gridDivision) * pixelsPerBeat}px` }}
          />
        ))}
      </div>

      {tracks.map(track => (
        <div
          key={track.id}
          className={`${styles.trackLane} ${track.muted ? styles.trackLaneMuted : ''} ${selectedTrackId === track.id ? styles.trackLaneSelected : ''} ${tracks.some(t => t.soloed) && !track.soloed ? styles.trackLaneGreyed : ''} ${draggedTrackId === track.id ? styles.trackLaneDragging : ''} ${dropTargetId === track.id ? styles.trackLaneDropTarget : ''}`}
          onClick={() => onSelectTrack(track.id)}
          onDoubleClick={() => onEditTrack(track.id)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span className={styles.trackName} title={track.name}>{track.name}</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trackBtn} ${track.muted ? styles.trackBtnActive : ''}`} onClick={e => { e.stopPropagation(); onMuteTrack(track.id); }}>M</button>
                  <button className={`${styles.trackBtn} ${track.soloed ? styles.trackBtnSoloActive : ''}`} onClick={e => { e.stopPropagation(); onSoloTrack(track.id, e.shiftKey); }} title="Click to solo, Shift+click for multi-solo">S</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <VolumeMeter
                  trackId={track.id}
                  volume={track.volume}
                  onVolumeChange={(vol) => onVolumeChange(track.id, vol)}
                  isPlaying={isPlaying}
                  isMuted={track.muted}
                />
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

                  {/* Audio Waveform Visualization */}
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
      ))}

      {/* Empty State / Add Track Area */}
      <div
        className={styles.emptyTrackArea}
        onClick={onAddTrackClick}
        onContextMenu={onAddTrackContextMenu}
      >
        <div className={styles.emptyStateContent}>
          <Plus size={24} />
          <span>Add New Track</span>
          <small>Click or drop samples here</small>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 171, zIndex: 10, pointerEvents: 'none' }}>
        <MasterPlayhead pixelsPerBeat={pixelsPerBeat} height={900} scrollLeft={0} />
      </div>
    </div>
  );
}
