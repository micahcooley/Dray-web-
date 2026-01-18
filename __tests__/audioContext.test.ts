import { audioEngine } from '../src/lib/audioEngine';

describe('AudioContext Singleton Pattern', () => {
  
  it('should throw error when getContext is called before initialization', () => {
    // Create a new instance to test uninitialized state
    const AudioEngineClass = (audioEngine as any).constructor;
    const testInstance = Object.create(AudioEngineClass.prototype);
    testInstance.context = null;
    
    expect(() => {
      testInstance.getContext();
    }).toThrow('AudioEngine not initialized');
  });

  it('should use singleton pattern for getInstance', () => {
    const AudioEngineClass = (audioEngine as any).constructor;
    const instance1 = AudioEngineClass.getInstance();
    const instance2 = AudioEngineClass.getInstance();
    
    expect(instance1).toBe(instance2);
  });

  it('should have getContextInfo method', () => {
    expect(audioEngine.getContextInfo).toBeDefined();
    expect(typeof audioEngine.getContextInfo).toBe('function');
  });

  it('getContextInfo should return correct structure', () => {
    const info = audioEngine.getContextInfo();
    
    expect(info).toHaveProperty('count');
    expect(info).toHaveProperty('state');
    expect(info).toHaveProperty('sampleRate');
    expect(info).toHaveProperty('isInitialized');
    expect(typeof info.count).toBe('number');
    expect(typeof info.isInitialized).toBe('boolean');
  });

  it('should track context creation count', () => {
    const AudioEngineClass = (audioEngine as any).constructor;
    
    // Check that contextCreationCount exists
    expect(AudioEngineClass).toHaveProperty('contextCreationCount');
    expect(typeof AudioEngineClass.contextCreationCount).toBe('number');
  });
});