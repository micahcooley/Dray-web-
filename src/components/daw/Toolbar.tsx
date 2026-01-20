'use client';

import React from 'react';
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
    } else {
      await audioEngine.suspend();
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
        <button className="tool-btn" onClick={handleTogglePlay}>
          {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button className="tool-btn record">
          <Circle size={18} fill="currentColor" />
        </button>
        <div className="time-display">
          <span className="time-value">{formatTime(playbackTime)}</span>
          <span className="tempo-value">{activeProject?.tempo || 120} BPM</span>
        </div>
      </div>

      <div className="toolbar-section actions">
        <button className="btn-wingman">
          <Sparkles size={16} /> Wingman AI
        </button>
        <button className="tool-btn"><Settings size={18} /></button>
        <button className="tool-btn"><Share2 size={18} /></button>
        <button className="btn-zenith">Open in Zenith</button>
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
          transition: background 0.2s;
        }
        .tool-btn:hover {
          background: var(--bg-surface);
          color: var(--accent-primary);
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
        }
        .btn-zenith {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
          color: var(--text-main);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-md);
          font-size: 0.75rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
