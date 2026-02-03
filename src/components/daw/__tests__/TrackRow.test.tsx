import React, { useState, useCallback } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TrackRow from '../TrackRow';
import type { Track } from '../../../lib/types';
import '@testing-library/jest-dom';

// Mock child components to isolate TrackRow testing
jest.mock('../VolumeMeter', () => {
  return function MockVolumeMeter() { return <div data-testid="volume-meter" />; };
});
jest.mock('../PanKnob', () => {
  return function MockPanKnob() { return <div data-testid="pan-knob" />; };
});
// Mock CSS modules
jest.mock('../trackrow.module.css', () => ({
  trackLane: 'trackLane',
  muted: 'muted',
}));

const mockTrack = (id: number): Track => ({
  id,
  name: `Track ${id}`,
  type: 'midi',
  color: '#ffffff',
  volume: 0.8,
  pan: 0,
  muted: false,
  soloed: false,
  meterL: 0,
  meterR: 0,
  clips: []
});

function TestContainer() {
  const [tracks, setTracks] = useState([mockTrack(1), mockTrack(2)]);

  const handleMute = useCallback((id: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, muted: !t.muted } : t));
  }, []);

  const noop = useCallback(() => {}, []);

  return (
    <div>
      {tracks.map(track => (
        <TrackRow
          key={track.id}
          track={track}
          isSelected={false}
          isGreyedOut={false}
          isDragging={false}
          isDropTarget={false}
          isPlaying={false}
          pixelsPerBeat={50}
          onSelect={noop}
          onDoubleClick={noop}
          onContextMenu={noop}
          onDragStart={noop}
          onDragOver={noop}
          onDragLeave={noop}
          onDrop={noop}
          onDragEnd={noop}
          onMute={handleMute}
          onSolo={noop}
          onVolumeChange={noop}
          onPanChange={noop}
        />
      ))}
      <button data-testid="mute-1" onClick={() => handleMute(1)}>Mute 1</button>
    </div>
  );
}

describe('TrackRow Performance', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('TrackRow memoization prevents re-render of unrelated tracks', () => {
    render(<TestContainer />);

    // Initial render: 2 tracks rendered
    const getRenderLogs = () => logSpy.mock.calls
      .map(c => c[0])
      .filter(msg => typeof msg === 'string' && msg.includes('[TrackRow] Rendered Track'));

    // Initial render should log both
    const initialLogs = getRenderLogs();
    expect(initialLogs.length).toBe(2);
    expect(initialLogs.some(l => l.includes('Track 1'))).toBe(true);
    expect(initialLogs.some(l => l.includes('Track 2'))).toBe(true);

    logSpy.mockClear();

    // Action: Mute Track 1
    act(() => {
      fireEvent.click(screen.getByTestId('mute-1'));
    });

    // Check logs
    const updateLogs = getRenderLogs();

    // Track 1 should update
    const track1Log = updateLogs.find(l => l.includes('Track 1'));
    expect(track1Log).toBeDefined();

    // Track 2 should NOT update
    const track2Log = updateLogs.find(l => l.includes('Track 2'));
    expect(track2Log).toBeUndefined();

    expect(updateLogs.length).toBe(1);
  });
});
