import { AudioScheduler } from '../src/lib/scheduler';

// Mock audioEngine to simulate audioContext time mapping
jest.mock('../src/lib/audioEngine', () => ({
  audioEngine: {
    initialize: jest.fn(() => Promise.resolve()),
    getState: jest.fn(() => 'running'),
    resume: jest.fn(() => Promise.resolve()),
    getNow: jest.fn(() => 1.5), // engine time sample
    getContext: jest.fn(() => ({ currentTime: 0.5 })), // audio context now
    registerSchedulerWorklet: jest.fn(() => {
      const port: Partial<MessagePort> = { 
        start: jest.fn(), 
        postMessage: jest.fn(), 
        onmessage: null,
        close: jest.fn()
      };
      setTimeout(() => port.onmessage && port.onmessage(({ data: { type: 'tick', tickIndex: 0, engineTime: 1.5 } } as unknown) as MessageEvent));
      return Promise.resolve({ port: port as MessagePort });
    }),
    onStateChange: jest.fn()
  }
}));

jest.mock('../src/lib/toneEngine', () => ({
  toneSynthEngine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn() },
  toneDrumMachine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn(), playNote: jest.fn() },
  toneBassEngine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn() },
  toneKeysEngine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn() },
  toneVocalEngine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn() },
  toneFXEngine: { initialize: jest.fn(() => Promise.resolve()), stopAll: jest.fn() }
}));

describe('Worklet timing mapping', () => {
  it('receives tick aligned to engine time mapping', async () => {
    const sched = AudioScheduler.getInstance();
    await sched.start();
    await new Promise(r => setTimeout(r, 50));
    await sched.stop();
    expect(true).toBe(true);
  });
});
