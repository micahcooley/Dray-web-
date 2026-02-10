// Lightweight typed wrapper for lazy-loading Tone.js
// Provide the runtime loader and use the actual Tone module type for better typing

export type ToneLibType = typeof import('tone');

let _tone: any | null = null;

export async function ensureTone(): Promise<ToneLibType> {
    if (!_tone) {
        _tone = await import('tone');
    }
    return _tone as ToneLibType;
}

export function getToneSync(): ToneLibType | null {
    return _tone as ToneLibType;
}
