
class AudioEngine {
  private static instance: AudioEngine;
  private context: AudioContext | null = null;
  private masterGain: any | null = null;
  private _isInitialized = false;
  private Tone: any = null;
  private initializationPromise: Promise<void> | null = null;
  private currentLatencyHint: 'interactive' | 'balanced' | 'playback' = 'playback';
  private currentLookAhead = 0.1;

  // Track channels for mixing
  private trackChannels = new Map<number, any>();
  private pendingTrackStates = new Map<number, { volume?: number; pan?: number }>();

  private constructor() { }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
    return AudioEngine.instance;
  }

  public async initialize(latencyHint: 'interactive' | 'balanced' | 'playback' = 'playback', lookAhead = 0.1) {
    // If we are already initialized and the context is running or valid, just resume if needed
    if (this._isInitialized && this.context) {
      if (this.context.state === 'suspended') {
        try { await this.context.resume(); } catch (e) { }
      }
      return;
    }

    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      this.currentLatencyHint = latencyHint;
      this.currentLookAhead = lookAhead;

      // 1. Load Tone.js
      if (!this.Tone) {
        this.Tone = await import('tone');
      }

      // 2. CRITICAL: Manually create the Context to ensure it's NATIVE.
      // This bypasses any Tone.js wrappers that might fail AudioWorkletNode type checks.
      if (!this.context) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.context = new AudioContextClass({ latencyHint: this.currentLatencyHint });
      }

      // 3. Inject this native context into Tone.js
      this.Tone.setContext(this.context);

      // 4. Now start Tone (which resumes the context)
      await this.Tone.start();

      // 5. Ensure we are running
      if (this.context.state === 'suspended') {
        try { await this.context.resume(); } catch (e) { }
      }

      // 6. Create Master Gain
      // We use Tone's master output for simplicity and chain validity
      try {
        this.masterGain = this.Tone.getDestination();
      } catch (e) {
        console.error("Failed to get Tone destination", e);
        // Fallback should rarely happen if Tone started
        this.masterGain = this.context.destination;
      }

      this._isInitialized = true;

      // Apply pending track states
      this.pendingTrackStates.forEach((state, id) => {
        if (state.volume !== undefined) this.updateTrackVolume(id, state.volume);
        if (state.pan !== undefined) this.updateTrackPan(id, state.pan);
      });
      this.pendingTrackStates.clear();

      console.log("AudioEngine initialized successfully with context state:", this.context.state);
    })();

    return this.initializationPromise;
  }

  public getContext(): AudioContext {
    if (!this.context) throw new Error('AudioEngine not initialized (Context is null)');
    return this.context;
  }

  public getState(): AudioContextState | null { return this.context?.state || null; }

  public isReady(): boolean { return !!this.context && this._isInitialized; }

  public getNow(): number {
    // Always prefer Tone.now() to keep sync with instruments
    if (this.Tone && typeof this.Tone.now === 'function') return this.Tone.now();
    return this.context ? this.context.currentTime : 0;
  }

  public getTone(): any { return this.Tone; }

  // Simplified Track Channel Management
  public getTrackChannel(trackId: number) {
    if (!this._isInitialized || !this.Tone) throw new Error('AudioEngine not initialized');

    if (this.trackChannels.has(trackId)) return this.trackChannels.get(trackId);

    // Create channel chain: Input -> Volume -> Panner -> Meter -> Master
    const input = new this.Tone.Gain(1.0);
    const volume = new this.Tone.Gain(1.0);
    const panner = new this.Tone.Panner(0);
    const meter = new this.Tone.Meter({ smoothing: 0.3 });

    // Connect chain
    input.connect(volume);
    volume.connect(panner);
    panner.connect(meter);
    meter.connect(this.masterGain); // Connect to Main Output

    const channel = { input, volume, panner, meter };
    this.trackChannels.set(trackId, channel);
    return channel;
  }

  public updateTrackVolume(trackId: number, value: number) {
    if (!this._isInitialized) {
      const s = this.pendingTrackStates.get(trackId) || {};
      s.volume = value;
      this.pendingTrackStates.set(trackId, s);
      return;
    }
    const ch = this.getTrackChannel(trackId);
    // Ramp to avoid clicks
    try { ch.volume.gain.rampTo(value, 0.05); } catch (e) { ch.volume.gain.value = value; }
  }

  public updateTrackPan(trackId: number, value: number) {
    if (!this._isInitialized) {
      const s = this.pendingTrackStates.get(trackId) || {};
      s.pan = value;
      this.pendingTrackStates.set(trackId, s);
      return;
    }
    const ch = this.getTrackChannel(trackId);
    try { ch.panner.pan.rampTo(value / 100, 0.05); } catch (e) { ch.panner.pan.value = value / 100; }
  }

  public getTrackLevels(): Record<number, number> {
    const out: Record<number, number> = {};
    if (!this.context || !this._isInitialized) return out;

    this.trackChannels.forEach((ch: any, id: number) => {
      try {
        const v = ch.meter.getValue();
        // Convert dB to 0-1 range roughly
        // -60dB = 0, 0dB = 1.
        const val = typeof v === 'number' ? v : -100;
        out[id] = Math.max(0, Math.min(1, (val + 60) / 60));
      } catch (e) { out[id] = 0; }
    });
    return out;
  }

  public async resume() {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
      this.notifyStateChange();
    }
  }

  public async suspend() {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
      this.notifyStateChange();
    }
  }

  // State Change Listener Support
  private stateListeners: ((state: AudioContextState) => void)[] = [];

  public onStateChange(callback: (state: AudioContextState) => void) {
    this.stateListeners.push(callback);
    // Immediate callback with current state
    if (this.context) callback(this.context.state);
  }

  private notifyStateChange() {
    if (this.context) {
      const state = this.context.state;
      this.stateListeners.forEach(cb => cb(state));
    }
  }

  // DEVICE MANAGEMENT FOR SETTINGS MODAL
  public async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices;
    } catch (e) {
      console.error('Failed to enumerate devices:', e);
      return [];
    }
  }

  public async setOutputDevice(deviceId: string): Promise<void> {
    // Note: Output device selection requires experimental APIs
    // Modern browsers support setSinkId on audio elements
    console.log('Setting output device to:', deviceId);
  }

  public async playTestTone(): Promise<void> {
    await this.initialize();
    if (!this.context || !this.Tone) return;

    try {
      const osc = new this.Tone.Oscillator({ type: 'sine', frequency: 440 });
      osc.toDestination();
      osc.start();
      setTimeout(() => {
        osc.stop();
        osc.dispose();
      }, 500);
    } catch (e) {
      console.error('Failed to play test tone:', e);
    }
  }

  public async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (e) {
      console.error('Failed to get audio permissions:', e);
      return false;
    }
  }

  public updatePerformanceSettings(latencyHint: 'interactive' | 'balanced' | 'playback', lookAhead: number): void {
    // Performance settings are applied on next context creation
    // Store for future use
    console.log('Performance settings updated:', { latencyHint, lookAhead });
  }
  
  /**
   * Preload an audio clip and return a Promise
   * Centralizes audio clip preloading with proper error handling
   */
  public async preloadAudioClip(url: string): Promise<AudioBuffer> {
    if (!this.context) {
      await this.initialize();
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context!.decodeAudioData(arrayBuffer);
    return audioBuffer;
  }

  // REGISTER SCHEDULER WORKLET
  // Completely rewritten to be simple and safe. No SharedArrayBuffer.
  public async registerSchedulerWorklet(): Promise<{ node: AudioWorkletNode } | null> {
    if (!this.context) return null;

    // Defines the processor code as a string to avoid external file loading issues
    // Uses standard port messaging for maximum compatibility.
    const processorCode = `
      class SchedulerProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this._nextTickTime = 0;
          this._tickIndex = 0;
          this._running = false;
          this._tempo = 120;
          this._ticksPerBeat = 4; // 16th notes
          this._lookahead = 0.1;
          
          // CRITICAL: Bind message handler to port
          this.port.onmessage = (event) => this.handleMessage(event);
        }

        static get parameterDescriptors() {
          return [];
        }

        process(inputs, outputs, parameters) {
          if (!this._running) return true;

          // Use global currentTime from AudioWorkletGlobalScope (no const)
          const now = currentTime;

          // Initialize nextTickTime if first run or reset
          if (this._nextTickTime === 0) {
             this._nextTickTime = now + 0.05;
          }

          // Check if it's time for a tick
          // We can process multiple ticks if we fell behind slightly, 
          // but we cap it to avoid spiral of death
          let loops = 0;
          while (now + this._lookahead >= this._nextTickTime && loops < 50) {
             // Send tick to main thread
             this.port.postMessage({
               type: 'tick',
               tickIndex: this._tickIndex,
               engineTime: this._nextTickTime
             });

             // Advance time
             const secondsPerBeat = 60.0 / this._tempo;
             const secondsPerTick = secondsPerBeat / this._ticksPerBeat;
             
             this._nextTickTime += secondsPerTick;
             this._tickIndex++;
             loops++;
          }

          return true;
        }

        handleMessage(event) {
          const msg = event.data;
          switch (msg.type) {
            case 'start':
              this._running = true;
              this._nextTickTime = currentTime + 0.05; // Reset start time
              break;
            case 'stop':
              this._running = false;
              break;
            case 'setTempo':
              this._tempo = msg.tempo || 120;
              break;
            case 'setTick':
              this._tickIndex = msg.tick || 0;
              // Reset timing slightly to align
              this._nextTickTime = currentTime + 0.05;
              break;
            case 'init':
              this._tickIndex = msg.startTick || 0;
              this._tempo = msg.tempo || 120;
              break;
          }
        }
      }

      registerProcessor('scheduler-processor', SchedulerProcessor);
    `;

    try {
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.context.audioWorklet.addModule(url);

      const node = new AudioWorkletNode(this.context, 'scheduler-processor');

      // Handle messages from the processor if needed (though we mostly listen on the port in Scheduler.ts)
      node.port.onmessage = (event) => {
        // Debugging or internal logic
      };

      // Prevent GC
      node.connect(this.context.destination);

      return { node };

    } catch (e) {
      console.error("Failed to register scheduler worklet:", e);
      return null; // Logic will fallback to setInterval
    }
  }
}

export const audioEngine = AudioEngine.getInstance();
