import { AudioScheduler } from '../src/lib/scheduler';

// Mock fetch to simulate failure
global.fetch = jest.fn(() =>
  Promise.reject(new Error('Network error'))
) as jest.Mock;

const PRELOAD_TEST_TIMEOUT = 10000; // Allow time for retries

describe('preload', () => {
  it('does not crash when preloading missing urls', async () => {
    const sched = AudioScheduler.getInstance();
    
    // Should handle error gracefully and not throw
    await sched.preloadAudioClip('http://invalid-url.local/test.wav');
    
    // Should not throw
    expect(true).toBe(true);
  }, PRELOAD_TEST_TIMEOUT);
});
