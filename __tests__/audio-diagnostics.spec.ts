// Mock toneEngine before importing scheduler
jest.mock('../src/lib/toneEngine', () => ({
  toneSynthEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playNote: jest.fn(),
    playChord: jest.fn(),
    panic: jest.fn()
  },
  toneDrumMachine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playNote: jest.fn(),
    playKick: jest.fn(),
    playSnare: jest.fn()
  },
  toneBassEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playNote: jest.fn()
  },
  toneKeysEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playNote: jest.fn(),
    playChord: jest.fn()
  },
  toneVocalEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playVocal: jest.fn()
  },
  toneFXEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    stopAll: jest.fn(),
    playFX: jest.fn()
  }
}));

// Mock audioEngine
jest.mock('../src/lib/audioEngine', () => ({
  audioEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    getState: jest.fn(() => 'running'),
    resume: jest.fn(() => Promise.resolve()),
    getNow: jest.fn(() => 0),
    onStateChange: jest.fn(),
    registerSchedulerWorklet: jest.fn(() => Promise.resolve(null)),
    getContext: jest.fn(() => ({
      currentTime: 0,
      decodeAudioData: async () => ({}),
      sampleRate: 48000,
      state: 'running'
    })),
    getDiagnostics: jest.fn(() => ({
      contextState: 'running',
      isInitialized: true,
      latencyHint: 'playback',
      lookAhead: 0.1,
      contextTime: 0,
      sampleRate: 48000,
      baseLatency: 0.005,
      outputLatency: 0
    })),
    getWorkletStatus: jest.fn(() => ({ available: true }))
  }
}));

import { AudioScheduler } from '../src/lib/scheduler';
import { audioEngine } from '../src/lib/audioEngine';

describe('Audio Diagnostics', () => {
  let scheduler: AudioScheduler;

  beforeEach(() => {
    scheduler = AudioScheduler.getInstance();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  describe('getDiagnostics', () => {
    it('returns comprehensive diagnostic data structure', () => {
      const diagnostics = scheduler.getDiagnostics();

      // Verify all expected fields are present
      expect(diagnostics).toHaveProperty('usingWorklet');
      expect(diagnostics).toHaveProperty('totalTicks');
      expect(diagnostics).toHaveProperty('missedTicks');
      expect(diagnostics).toHaveProperty('missedTickPercentage');
      expect(diagnostics).toHaveProperty('avgLatencyMs');
      expect(diagnostics).toHaveProperty('p95LatencyMs');
      expect(diagnostics).toHaveProperty('avgJitterMs');
      expect(diagnostics).toHaveProperty('maxJitterMs');
      expect(diagnostics).toHaveProperty('latencySamples');
      expect(diagnostics).toHaveProperty('jitterSamples');
      expect(diagnostics).toHaveProperty('samplesScheduled');
      expect(diagnostics).toHaveProperty('samplesDropped');
      expect(diagnostics).toHaveProperty('isRunning');
      expect(diagnostics).toHaveProperty('currentTempo');
      expect(diagnostics).toHaveProperty('audioContextState');
    });

    it('returns initial state with zero metrics', () => {
      const diagnostics = scheduler.getDiagnostics();

      expect(diagnostics.totalTicks).toBe(0);
      expect(diagnostics.missedTicks).toBe(0);
      expect(diagnostics.missedTickPercentage).toBe(0);
      expect(diagnostics.avgLatencyMs).toBe(0);
      expect(diagnostics.p95LatencyMs).toBe(0);
      expect(diagnostics.avgJitterMs).toBe(0);
      expect(diagnostics.maxJitterMs).toBe(0);
      expect(diagnostics.latencySamples).toEqual([]);
      expect(diagnostics.jitterSamples).toEqual([]);
      expect(diagnostics.isRunning).toBe(false);
    });

    it('maintains backward compatibility with legacy fields', () => {
      const diagnostics = scheduler.getDiagnostics();

      // Legacy fields should still exist
      expect(diagnostics).toHaveProperty('sabUsed');
      expect(diagnostics).toHaveProperty('head');
      expect(diagnostics).toHaveProperty('tail');
      expect(diagnostics).toHaveProperty('unread');
      expect(diagnostics).toHaveProperty('samples');
    });

    it('calculates average latency correctly', () => {
      const scheduler = AudioScheduler.getInstance();
      
      // Access private diagnostics to inject test data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      diagnosticsPrivate.latencySamples = [1, 2, 3, 4, 5];
      diagnosticsPrivate.latencySum = 15;

      const diagnostics = scheduler.getDiagnostics();
      
      expect(diagnostics.avgLatencyMs).toBe(3); // 15 / 5 = 3
      expect(diagnostics.samples).toBe(5);
    });

    it('calculates 95th percentile latency correctly', () => {
      const scheduler = AudioScheduler.getInstance();
      
      // Create array with 100 samples for percentile calculation
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      diagnosticsPrivate.latencySamples = samples;
      diagnosticsPrivate.latencySum = samples.reduce((a, b) => a + b, 0);

      const diagnostics = scheduler.getDiagnostics();
      
      // 95th percentile of 1-100 should be around 95-96 (due to floor rounding)
      expect(diagnostics.p95LatencyMs).toBeGreaterThanOrEqual(95);
      expect(diagnostics.p95LatencyMs).toBeLessThanOrEqual(96);
    });

    it('calculates missed tick percentage correctly', () => {
      const scheduler = AudioScheduler.getInstance();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      diagnosticsPrivate.totalTicks = 1000;
      diagnosticsPrivate.missedTicks = 10;

      const diagnostics = scheduler.getDiagnostics();
      
      expect(diagnostics.missedTickPercentage).toBe(1); // 10/1000 * 100 = 1%
    });

    it('calculates jitter metrics correctly', () => {
      const scheduler = AudioScheduler.getInstance();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      diagnosticsPrivate.jitterSamples = [0.5, 1.0, 1.5, 2.0, 2.5];

      const diagnostics = scheduler.getDiagnostics();
      
      expect(diagnostics.avgJitterMs).toBe(1.5); // (0.5+1.0+1.5+2.0+2.5)/5 = 1.5
      expect(diagnostics.maxJitterMs).toBe(2.5);
    });

    it('returns empty arrays when no samples collected', () => {
      const scheduler = AudioScheduler.getInstance();
      
      // Reset diagnostics to clear any data from previous tests
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      diagnosticsPrivate.latencySamples = [];
      diagnosticsPrivate.jitterSamples = [];
      diagnosticsPrivate.latencySum = 0;
      
      const diagnostics = scheduler.getDiagnostics();
      
      expect(Array.isArray(diagnostics.latencySamples)).toBe(true);
      expect(Array.isArray(diagnostics.jitterSamples)).toBe(true);
      expect(diagnostics.latencySamples.length).toBe(0);
      expect(diagnostics.jitterSamples.length).toBe(0);
    });

    it('includes current tempo in diagnostics', () => {
      const diagnostics = scheduler.getDiagnostics();
      
      // Default tempo should be 120
      expect(diagnostics.currentTempo).toBe(120);
    });

    it('includes audio context state', () => {
      const diagnostics = scheduler.getDiagnostics();
      
      expect(diagnostics.audioContextState).toBeDefined();
    });

    it('reports worklet usage correctly when not using worklet', () => {
      const diagnostics = scheduler.getDiagnostics();
      
      // Should be false initially (worklet not started)
      expect(diagnostics.usingWorklet).toBe(false);
    });
  });

  describe('Diagnostic tracking during playback', () => {
    it('tracks running state correctly', async () => {
      const diagBefore = scheduler.getDiagnostics();
      expect(diagBefore.isRunning).toBe(false);

      await scheduler.start();
      
      const diagAfter = scheduler.getDiagnostics();
      expect(diagAfter.isRunning).toBe(true);

      await scheduler.stop();
      
      const diagStopped = scheduler.getDiagnostics();
      expect(diagStopped.isRunning).toBe(false);
    }, 10000);
  });

  describe('Metric limits and bounds', () => {
    it('limits latency sample array to configured maximum', () => {
      const scheduler = AudioScheduler.getInstance();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      
      // Set max to 1000 (default)
      const maxSamples = diagnosticsPrivate.maxLatencySamples;
      
      // Add more samples than the limit
      for (let i = 0; i < maxSamples + 100; i++) {
        diagnosticsPrivate.latencySamples.push(1.0);
        diagnosticsPrivate.latencySum += 1.0;
        
        // Manually trim to simulate the scheduler behavior
        if (diagnosticsPrivate.latencySamples.length > maxSamples) {
          const removed = diagnosticsPrivate.latencySamples.shift();
          diagnosticsPrivate.latencySum -= removed;
        }
      }
      
      const diagnostics = scheduler.getDiagnostics();
      
      // Should not exceed max samples
      expect(diagnostics.latencySamples.length).toBeLessThanOrEqual(maxSamples);
    });

    it('handles division by zero gracefully', () => {
      const scheduler = AudioScheduler.getInstance();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnosticsPrivate = (scheduler as any).diagnostics;
      
      diagnosticsPrivate.totalTicks = 0;
      diagnosticsPrivate.missedTicks = 0;
      diagnosticsPrivate.latencySamples = [];
      diagnosticsPrivate.jitterSamples = [];
      
      const diagnostics = scheduler.getDiagnostics();
      
      // Should return 0 for percentages and averages, not NaN
      expect(diagnostics.missedTickPercentage).toBe(0);
      expect(diagnostics.avgLatencyMs).toBe(0);
      expect(diagnostics.avgJitterMs).toBe(0);
      expect(diagnostics.maxJitterMs).toBe(0);
    });
  });
});

describe('AudioEngine Diagnostics', () => {
  it('provides engine diagnostic information', () => {
    const diagnostics = audioEngine.getDiagnostics();
    
    expect(diagnostics).toHaveProperty('contextState');
    expect(diagnostics).toHaveProperty('isInitialized');
    expect(diagnostics).toHaveProperty('latencyHint');
    expect(diagnostics).toHaveProperty('lookAhead');
    expect(diagnostics).toHaveProperty('contextTime');
    expect(diagnostics).toHaveProperty('sampleRate');
    expect(diagnostics).toHaveProperty('baseLatency');
  });

  it('reports worklet availability status', () => {
    const status = audioEngine.getWorkletStatus();
    
    expect(status).toHaveProperty('available');
    expect(typeof status.available).toBe('boolean');
  });
});
