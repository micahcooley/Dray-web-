export interface BaseEngineInterface {
  initialize(): Promise<void>;
  stopAll(): void;
  dispose(): void;
}

export interface SynthEngineInterface extends BaseEngineInterface {
  playNote(trackId: number, preset: string, note: number | string, duration?: string | number, velocity?: number, time?: number): void | Promise<void>;
  playChord(trackId: number, preset: string, notes?: (number | string)[], duration?: string | number, velocity?: number): void | Promise<void>;
  panic?(): void;
  dispose(): void;
}

export interface KeysEngineInterface extends BaseEngineInterface {
  playNote(trackId: number, note: number | string, duration?: string | number, velocity?: number, preset?: string, time?: number): Promise<void>;
  playChord(trackId: number, preset: string, notes?: (number | string)[], duration?: string | number, velocity?: number): Promise<void>;
  dispose(): void;
}

export interface DrumEngineInterface extends BaseEngineInterface {
  playNote(trackId: number | undefined, midiNote: number, velocity?: number, time?: number): void;
  playKick(trackId?: number, kit?: string, velocity?: number, time?: number): Promise<void>;
  playSnare(trackId?: number, kit?: string, velocity?: number, time?: number): Promise<void>;
  dispose(): void;
}

export interface BassEngineInterface extends BaseEngineInterface {
  playNote(trackId: number, note: number | string, duration: string | number, velocity: number, preset: string, time?: number): Promise<void>;
  dispose(): void;
}

export interface FXEngineInterface extends BaseEngineInterface {
  playFX(trackId: number | undefined, type: string, velocity?: number): Promise<void>;
  dispose(): void;
}

export interface VocalEngineInterface extends BaseEngineInterface {
  playVocal(trackId: number, note: number, type: string, time?: number): Promise<void>;
  dispose(): void;
}
