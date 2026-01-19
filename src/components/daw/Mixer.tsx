'use client';

import React, { useEffect, useState, useRef } from 'react';
import { audioEngine } from '../../lib/audioEngine';
import type { Track } from '../../lib/types';
import PanKnob from './PanKnob';
import styles from './Mixer.module.css';

interface MixerProps {
  tracks: Track[];
  masterVolume: number;
  onMasterVolumeChange: (val: number) => void;
  onTrackVolumeChange: (id: number, val: number) => void;
  onTrackPanChange: (id: number, val: number) => void;
  onTrackMute: (id: number) => void;
  onTrackSolo: (id: number, shift: boolean) => void;
  isPlaying: boolean;
}

export default function Mixer({
  tracks,
  masterVolume,
  onMasterVolumeChange,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackMute,
  onTrackSolo,
  isPlaying
}: MixerProps) {
  const [levels, setLevels] = useState<Record<number, number>>({});
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setLevels({});
      return;
    }

    const loop = () => {
      // Get track levels
      const trackLevels = audioEngine.getTrackLevels();
      setLevels(trackLevels);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  // Handle Master Volume Change
  const handleMasterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) / 100;
    onMasterVolumeChange(val);
    audioEngine.setMasterVolume(val);
  };

  return (
    <div className={styles.mixer}>
      <div className={styles.mixerHeader}>
        MIXING CONSOLE
      </div>
      <div className={styles.mixerChannels}>
        {tracks.map(track => (
          <div key={track.id} className={styles.channel}>
            <div className={styles.channelLabel} title={track.name}>
              {track.name}
            </div>

            <div className={styles.channelMain}>
               {/* Meter */}
               <div className={styles.meter}>
                 <div
                   className={styles.meterFill}
                   style={{ height: `${(levels[track.id] || 0) * 100}%` }}
                 />
               </div>

               {/* Fader */}
               <div className={styles.faderContainer}>
                 <div className={styles.faderTrack}>
                   <div
                     className={styles.faderFill}
                     style={{ height: `${track.volume * 100}%` }}
                   />
                   <input
                     type="range"
                     min="0"
                     max="100"
                     value={track.volume * 100}
                     onChange={(e) => onTrackVolumeChange(track.id, parseInt(e.target.value) / 100)}
                     className={styles.faderInput}
                     title={`Volume: ${(track.volume * 100).toFixed(0)}%`}
                   />
                 </div>
               </div>
            </div>

            <div className={styles.channelControls}>
              <PanKnob
                value={track.pan}
                onChange={(val) => onTrackPanChange(track.id, val)}
                size={24}
              />
              <div className={styles.channelButtons}>
                <button
                  className={`${styles.chBtn} ${track.muted ? styles.chBtnMuted : ''}`}
                  onClick={() => onTrackMute(track.id)}
                >M</button>
                <button
                  className={`${styles.chBtn} ${track.soloed ? styles.chBtnSoloed : ''}`}
                  onClick={(e) => onTrackSolo(track.id, e.shiftKey)}
                >S</button>
              </div>
            </div>
          </div>
        ))}

        {/* Master Channel */}
        <div className={`${styles.channel} ${styles.channelMaster}`}>
            <div className={`${styles.channelLabel} ${styles.masterLabel}`}>
              MASTER
            </div>
            <div className={styles.channelMain}>
               {/* Master L/R Meters (Simulated for now as single) */}
               <div className={styles.masterMeters}>
                 <div className={`${styles.meter} ${styles.masterMeter}`}>
                   <div
                     className={`${styles.meterFill} ${styles.masterFill}`}
                     style={{ height: `${(levels['master'] || Math.max(...Object.values(levels), 0)) * 100}%` }}
                   />
                 </div>
               </div>

               {/* Master Fader */}
               <div className={styles.faderContainer}>
                 <div className={`${styles.faderTrack} ${styles.masterFaderTrack}`}>
                   <div
                     className={`${styles.faderFill} ${styles.masterFaderFill}`}
                     style={{ height: `${masterVolume * 100}%` }}
                   />
                   <input
                     type="range"
                     min="0"
                     max="100"
                     value={masterVolume * 100}
                     onChange={handleMasterChange}
                     className={styles.faderInput}
                     title={`Master: ${(masterVolume * 100).toFixed(0)}%`}
                   />
                 </div>
               </div>
            </div>
        </div>
      </div>
    </div>
  );
}
