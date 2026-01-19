'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Circle, Sparkles, Settings, Share2, Undo2, Redo2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { audioEngine } from '../../lib/audioEngine';
import dynamic from 'next/dynamic';

const ThemeToggle = dynamic(() => import('../ThemeToggle'), { ssr: false });

// Format seconds to MM:SS:mmm
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
}

interface ToolbarProps {
  onSettingsClick: () => void;
  onWingmanClick: () => void;
  onShareClick?: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  gridDivision: number;
  setGridDivision: (val: number) => void;
}

export default function Toolbar({
  onSettingsClick,
  onWingmanClick,
  onShareClick,
  undo,
  redo,
  canUndo,
  canRedo,
  gridDivision,
  setGridDivision
}: ToolbarProps) {
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
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
          <Sparkles size={20} style={{ color: '#5865f2' }} />
          <span style={{ fontWeight: 800, fontSize: '1.2rem', background: 'linear-gradient(135deg, #5865f2, #eb459e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Drey</span>
        </div>
        <div className="project-info">
          <span className="project-name">{activeProject?.name || 'Untitled Project'}</span>
          <span className="project-version">v1.2</span>
        </div>

        <div className="history-controls">
          <motion.button
            className={`history-btn ${!canUndo ? 'disabled' : ''}`}
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            whileHover={canUndo ? { scale: 1.1, backgroundColor: 'var(--border-bright)' } : {}}
            whileTap={canUndo ? { scale: 0.95 } : {}}
          >
            <Undo2 size={16} />
          </motion.button>
          <motion.button
            className={`history-btn ${!canRedo ? 'disabled' : ''}`}
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            whileHover={canRedo ? { scale: 1.1, backgroundColor: 'var(--border-bright)' } : {}}
            whileTap={canRedo ? { scale: 0.95 } : {}}
          >
            <Redo2 size={16} />
          </motion.button>
        </div>

        <div className="grid-controls">
          <select
            className="grid-select"
            value={gridDivision}
            onChange={(e) => setGridDivision(Number(e.target.value))}
            title="Grid Division"
          >
            <option value={1}>1/1</option>
            <option value={2}>1/2</option>
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
          </select>
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
        <ThemeToggle />
        <motion.button
          className="btn-wingman"
          onClick={onWingmanClick}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(235, 69, 158, 0.4)' }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles size={16} /> Wingman AI
        </motion.button>
        <motion.button
          className="tool-btn"
          onClick={onSettingsClick}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          <Settings size={18} />
        </motion.button>
        <motion.button
          className="tool-btn"
          onClick={onShareClick}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Share2 size={18} />
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
          background: var(--bg-surface);
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
        .history-controls { display: flex; gap: 4px; margin-left: 0.5rem; }
        .history-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: var(--border-subtle);
          border: 1px solid var(--border-bright);
          border-radius: 4px;
          color: var(--text-dim);
          cursor: pointer;
          transition: all 0.15s;
        }
        .history-btn:hover:not(.disabled) { color: var(--text-bright); border-color: var(--accent-primary); }
        .history-btn.disabled { opacity: 0.3; cursor: not-allowed; }
        .grid-controls { margin-left: 0.25rem; }
        .grid-select {
          background: var(--border-subtle);
          border: 1px solid var(--border-bright);
          border-radius: 4px;
          color: var(--text-dim);
          padding: 4px 8px;
          font-size: 0.7rem;
          cursor: pointer;
          outline: none;
        }
        .grid-select:hover { border-color: var(--accent-primary); color: var(--text-bright); }
        .grid-select:focus { border-color: var(--accent-primary); }
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
      `}</style>
    </div>
  );
}
