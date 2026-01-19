'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Circle, Sparkles, Settings, Share2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { audioEngine } from '../../lib/audioEngine';

// Format seconds to MM:SS:mmm
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
}

export default function Toolbar() {
  const { isPlaying, togglePlay, activeProject } = useProjectStore();
  const playbackTime = usePlaybackTime();

  const handleTogglePlay = async () => {
    if (!isPlaying) {
      await audioEngine.initialize();
      await audioEngine.resume();

      try {
        const engines = await import('../../lib/toneEngine');
        await Promise.all([
          engines.toneSynthEngine.initialize(),
          engines.toneDrumMachine.initialize(),
          engines.toneBassEngine.initialize(),
          engines.toneKeysEngine.initialize(),
          engines.toneVocalEngine.initialize(),
          engines.toneFXEngine.initialize()
        ]);
      } catch (e) {
        console.warn('Failed to start engines:', e);
      }
    } else {
      // Don't suspend context on pause, just stop transport
      // But we can stop engines if needed
      try {
        const engines = await import('../../lib/toneEngine');
        engines.toneSynthEngine.stopAll();
        engines.toneBassEngine.stopAll();
        engines.toneKeysEngine.stopAll();
        engines.toneVocalEngine.stopAll();
      } catch (e) {
        console.warn('Failed to stop engines:', e);
      }
    }
    togglePlay();
  };

  return (
    <div className="toolbar glass">
      <div className="toolbar-section">
        <div className="project-info">
          <span className="project-name">{activeProject?.name || 'Untitled Project'}</span>
          <span className="project-version">v1.2</span>
        </div>
      </div>

      <div className="toolbar-section transport">
        <motion.button
          className="tool-btn"
          onClick={handleTogglePlay}
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.95 }}
        >
          {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </motion.button>
        <motion.button
          className="tool-btn record"
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,77,77,0.1)' }}
          whileTap={{ scale: 0.95 }}
        >
          <Circle size={18} fill="currentColor" />
        </motion.button>
        <div className="time-display">
          <span className="time-value">{formatTime(playbackTime)}</span>
          <span className="tempo-value">{activeProject?.tempo || 120} BPM</span>
        </div>
      </div>

      <div className="toolbar-section actions">
        <motion.button
          className="btn-wingman"
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(235, 69, 158, 0.4)' }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles size={16} /> Wingman AI
        </motion.button>
        <motion.button
          className="tool-btn"
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          <Settings size={18} />
        </motion.button>
        <motion.button
          className="tool-btn"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Share2 size={18} />
        </motion.button>
        <motion.button
          className="btn-zenith"
          whileHover={{ scale: 1.05, borderColor: '#5865f2' }}
          whileTap={{ scale: 0.95 }}
        >
          Open in Zenith
        </motion.button>
      </div>

      <style jsx>{`
        .toolbar {
          height: 60px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 1.5rem;
          margin-bottom: 2px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .project-info {
          display: flex;
          flex-direction: column;
        }
        .project-name {
          font-weight: 700;
          font-size: 0.875rem;
        }
        .project-version {
          font-size: 0.75rem;
          color: var(--text-dim);
        }
        .transport {
          gap: 0.5rem;
        }
        .tool-btn {
          background: transparent;
          border: none;
          color: var(--text-main);
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }
        .tool-btn.record:hover {
          color: #ff4d4d;
        }
        .time-display {
          background: rgba(0, 0, 0, 0.3);
          padding: 0.25rem 0.75rem;
          border-radius: var(--radius-sm);
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 100px;
          font-family: 'JetBrains Mono', monospace;
        }
        .time-value {
          font-size: 0.875rem;
          color: var(--accent-primary);
          font-weight: 700;
        }
        .tempo-value {
          font-size: 0.625rem;
          color: var(--text-dim);
        }
        .btn-wingman {
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.8125rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 0 15px rgba(235, 69, 158, 0.2);
          cursor: pointer;
        }
        .btn-zenith {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
          color: var(--text-main);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-md);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
