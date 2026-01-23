
import { audioToMidiConverter } from '../lib/audioToMidiConverter';
import { audioEngine } from '../lib/audioEngine';

// Mock audioEngine
jest.mock('../lib/audioEngine', () => ({
    audioEngine: {
        initialize: jest.fn().mockResolvedValue(undefined),
        getContext: jest.fn().mockReturnValue({
            decodeAudioData: jest.fn()
        })
    }
}));

describe('AudioToMidiConverter', () => {
    const mockSampleRate = 44100;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Helper to create a mocked AudioBuffer with specific data
    const createMockAudioBuffer = (data: Float32Array) => {
        return {
            sampleRate: mockSampleRate,
            length: data.length,
            duration: data.length / mockSampleRate,
            numberOfChannels: 1,
            getChannelData: (channel: number) => data
        } as unknown as AudioBuffer;
    };

    it('should convert a simple sine wave melody correctly', async () => {
        // Generate 1 second of 440Hz sine wave
        const duration = 1.0;
        const length = Math.floor(mockSampleRate * duration);
        const buffer = new Float32Array(length);
        const freq = 440;
        for (let i = 0; i < length; i++) {
            buffer[i] = Math.sin(2 * Math.PI * freq * i / mockSampleRate);
        }

        const audioBuffer = createMockAudioBuffer(buffer);

        // Convert directly passing AudioBuffer (bypassing decodeAudioData)
        const result = await audioToMidiConverter.convert(audioBuffer, 'melody');

        expect(result.notes.length).toBeGreaterThan(0);
        // 440Hz is MIDI 69 (A4)
        // Allowing small tolerance or exact match
        // The algorithm might split into multiple notes or one long note
        const note = result.notes[0];
        expect(note.pitch).toBe(69);
    });

    it('should detect silence and return no notes', async () => {
        const length = 44100;
        const buffer = new Float32Array(length).fill(0);
        const audioBuffer = createMockAudioBuffer(buffer);

        const result = await audioToMidiConverter.convert(audioBuffer, 'melody');

        expect(result.notes.length).toBe(0);
    });
});
