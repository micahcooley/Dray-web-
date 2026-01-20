// Centralized constants for Drey DAW
// Eliminates magic numbers scattered throughout the codebase

// ============================================
// GRID & LAYOUT
// ============================================
export const NOTE_HEIGHT = 22;
export const SIDEBAR_WIDTH = 100;
export const BEATS_VISIBLE = 128;
export const DEFAULT_ZOOM = 100;
export const MIN_ZOOM = 30;
export const MAX_ZOOM = 300;

// ============================================
// AUDIO & TIMING
// ============================================
export const DEFAULT_TEMPO = 120;
export const DEFAULT_TIME_SIGNATURE = '4/4';
export const SAMPLE_RATE = 44100;
export const LOOKAHEAD_TIME = 0.1; // seconds
export const SCHEDULER_INTERVAL = 25; // milliseconds
export const NOTE_TOLERANCE = 0.001; // beats (more precise than 0.01)

/**
 * PREVIEW_TRACK_ID - Special trackId for preview notes in the Piano Roll UI
 * 
 * Purpose:
 * - Used exclusively for monophonic UI preview playback (not part of timeline data)
 * - Ensures preview notes are isolated from the main track's polyphonic playback
 * - Allows engines to maintain separate state for preview vs. timeline notes
 * 
 * Behavior:
 * - Preview notes are always monophonic (one note at a time)
 * - Each new preview note stops the previous one to avoid overlapping chaos
 * - Preview notes should be routed to avoid long effect tails when possible
 * - This trackId should never appear in saved project data
 */
export const PREVIEW_TRACK_ID = -1;

// ============================================
// POLYPHONY & VOICE POOLING
// ============================================
export const MAX_VOICES = 32;
export const VOICE_RELEASE_BUFFER = 0.5; // seconds after note ends before voice is reusable

// ============================================
// GRID OPTIONS
// ============================================
export const GRID_OPTIONS = [
    { label: '1/1', value: 4 },
    { label: '1/2', value: 2 },
    { label: '1/4', value: 1 },
    { label: '1/8', value: 0.5 },
    { label: '1/16', value: 0.25 },
    { label: '1/32', value: 0.125 },
] as const;

export const DEFAULT_GRID_SIZE = 0.25; // 1/16th note

// ============================================
// OCTAVE SETTINGS
// ============================================
export const OCTAVE_START = 1;
export const OCTAVE_COUNT = 8;
export const TOTAL_NOTES = OCTAVE_COUNT * 12;

// ============================================
// NOTE NAMES
// ============================================
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const BLACK_KEY_INDICES = [1, 3, 6, 8, 10] as const;

// ============================================
// DRUM MAP (General MIDI)
// ============================================
export const DRUM_MAP: Record<number, string> = {
    36: 'Kick Drum',
    37: 'Side Stick',
    38: 'Snare Drum',
    39: 'Hand Clap',
    40: 'Snare 2',
    41: 'Floor Tom L',
    42: 'Closed Hi-Hat',
    43: 'Floor Tom H',
    44: 'Pedal Hi-Hat',
    45: 'Low Tom',
    46: 'Open Hi-Hat',
    47: 'Mid Tom',
    48: 'High Tom',
    49: 'Crash Cymbal',
    50: 'High Tom 2',
    51: 'Ride Cymbal',
    52: 'China Cymbal',
    53: 'Ride Bell',
    54: 'Tambourine',
    56: 'Cowbell'
};

// ============================================
// TRACK COLORS
// ============================================
export const TRACK_COLORS = [
    '#eb459e', // Pink
    '#5865f2', // Blue/Purple
    '#57f287', // Green
    '#fee75c', // Yellow
    '#ed4245', // Red
    '#9b59b6', // Purple
    '#3498db', // Light Blue
    '#1abc9c', // Teal
] as const;

// ============================================
// UI THEME COLORS
// ============================================
export const THEME = {
    // Backgrounds
    bgDarkest: '#0b0b14',
    bgDark: '#0c0c14',
    bgMedium: '#141420',
    bgLight: '#1a1a24',
    bgLighter: '#1e1e2d',

    // Borders
    borderDark: '#1e1e2d',
    borderMedium: '#2a2a3e',
    borderLight: '#252538',

    // Text
    textBright: '#ffffff',
    textMain: '#a4a4d1',
    textDim: '#7171a1',
    textMuted: '#58587a',

    // Accents
    accentPrimary: '#5865f2',
    accentSecondary: '#eb459e',
    accentSuccess: '#57f287',
    accentWarning: '#fee75c',
    accentDanger: '#ed4245',

    // Playhead
    playheadColor: '#ff4d4d',
} as const;

// ============================================
// SOUND LIBRARY - EXPANDED TO MATCH NEW ENGINES
// ============================================
export const SOUND_LIBRARY = {
    Drums: {
        'Modern': ['808 Kit', 'Trap Kit', 'EDM Kit', 'Boom Bap', '909 Kit', 'Phonk Kit'],
        'Acoustic': ['Acoustic Kit', 'Jazz Brushes', 'Rock Kit'],
        'Lo-Fi': ['Lo-Fi Kit', 'Vinyl Drums']
    },
    Bass: {
        'Synth': ['Sub Bass', 'Synth Bass', 'Wobble Bass', 'Reese Bass', '808 Bass', 'Acid Bass', 'Moog Bass'],
        'Pluck': ['Pluck Bass', 'FM Bass', 'Slap Bass'],
        'Acoustic': ['Fingered Bass', 'Finger Bass', 'Upright Bass', 'Analog Bass']
    },
    Synths: {
        'Leads': [
            'Super Saw', 'Trance Lead', 'Bright Lead', 'FM Lead', 'Pluck Lead',
            'Portamento Lead', 'Distorted Lead'
        ],
        'Pads': [
            'Analog Pad', 'Warm Pad', 'String Pad', 'Atmosphere', 'Crystal Pad',
            'Dark Pad', 'Noise Pad'
        ],
        'Arps': ['Future Bass Chord', 'Stab', 'Plucked Strings', 'Arp Synth', 'Chiptune'],
        'FX': ['Sci-Fi Riser', 'Laser', 'Zap']
    },
    Keys: {
        'Piano': ['Grand Piano', 'Upright Piano', 'Piano'],
        'E-Piano': ['Electric Piano', 'Rhodes', 'Wurlitzer', 'Fender Rhodes', 'Wurli', 'Clavinet', 'Clav', 'Warm Keys', 'Lofi Keys'],
        'Organ': ['Organ', 'Synth Organ', 'Hammond B3'],
        'Mallet': ['Bells', 'Marimba', 'Vibraphone', 'Celesta', 'Music Box', 'Kalimba', 'Vibes']
    },
    FX: [
        'Riser', 'Downlifter', 'Impact', 'Sweep', 'White Noise', 'Whoosh', 'Laser',
        'Tension', 'Release', 'Reverse Cymbal', 'Sub Drop', 'Swell', 'Vinyl Crackle'
    ],
    Vocals: {
        'Choir': ['Choir', 'Ooh', 'Aah', 'Choir Aah', 'Choir Ooh', 'Choir Eeh', 'Gospel Choir'],
        'Vox': ['Vocal Chop', 'Adlib', 'Harmony', 'Vox Lead', 'Vocal', 'Siren'],
        'Synth Vocal': ['Vocoder', 'Talkbox', 'Ethereal Voice', 'Vocal Pad']
    },
    Leads: [
        'Super Saw', 'Bright Lead', 'Trance Lead', 'Pluck Lead',
        'FM Lead', 'Portamento Lead', 'Distorted Lead'
    ],
    Pads: [
        'Analog Pad', 'String Pad', 'Crystal Pad', 'Atmosphere',
        'Dark Pad', 'Noise Pad', 'Warm Pad'
    ],
    Bells: [
        'Bell', 'FM Bell', 'Glass Bell', 'Plucked Strings',
        'Marimba', 'Kalimba', 'Celesta', 'Glockenspiel'
    ],
    Arps: [
        'Arp Synth', 'Chiptune', 'Stab', 'Future Bass Chord'
    ],
    Textures: [
        'Sci-Fi Riser', 'Tape Hiss', 'Vinyl Crackle', 'Rain',
        'White Noise Pad', 'Ocean Waves', 'Wind', 'Digital Glitch', 'Shimmer', 'Drone'
    ]
} as const;

export type SoundCategoryType = keyof typeof SOUND_LIBRARY;

// ============================================
// INSTRUMENT ENGINE MAPPING
// Maps sound names to their appropriate engine
// ============================================
export const BASS_PRESETS = [
    'Sub Bass', 'Synth Bass', 'Reese Bass', '808 Bass', 'Acid Bass',
    'FM Bass', 'Wobble Bass', 'Pluck Bass', 'Moog Bass', 'Finger Bass',
    'Slap Bass', 'Analog Bass'
];

export const KEYS_PRESETS = [
    'Electric Piano', 'E-Piano', 'Rhodes', 'Fender Rhodes', 'Wurlitzer',
    'Wurli', 'Clavinet', 'Clav', 'Warm Keys', 'Lofi Keys', 'Lo-Fi Keys',
    'Synth Organ', 'Organ', 'Grand Piano', 'Piano', 'Harpsichord',
    'Celesta', 'Music Box', 'Marimba', 'Vibes'
];

export const VOCAL_PRESETS = [
    'Choir', 'Choir Aah', 'Choir Ooh', 'Choir Eeh', 'Vocal Pad',
    'Ethereal Voice', 'Vocoder', 'Gospel Choir', 'Siren',
    'Vocal', 'Vox', 'Adlib', 'Harmony', 'Ooh', 'Aah'
];

export const FX_PRESETS = [
    'Riser', 'Rise', 'Build Up', 'Downlifter', 'Down', 'Drop',
    'Impact', 'Hit', 'Boom', 'Sweep', 'White Noise Sweep',
    'Laser', 'Zap', 'Sci-Fi', 'Vinyl Crackle', 'Crackle', 'Lo-Fi',
    'Reverse Cymbal', 'Reverse', 'Sub Drop', 'Bass Drop',
    'Tension', 'Suspense', 'Whoosh', 'Pass By', 'Swell', 'Pad Swell'
];

/**
 * Determine which engine should handle a given instrument name
 */
export function getEngineForInstrument(instrument: string): 'bass' | 'keys' | 'vocal' | 'fx' | 'synth' {
    const inst = instrument || '';

    // Check Bass presets
    if (BASS_PRESETS.some(p => inst.includes(p) || inst.toLowerCase().includes(p.toLowerCase()))) {
        return 'bass';
    }

    // Check Keys presets  
    if (KEYS_PRESETS.some(p => inst.includes(p) || inst.toLowerCase().includes(p.toLowerCase()))) {
        return 'keys';
    }

    // Check Vocal presets
    if (VOCAL_PRESETS.some(p => inst.includes(p) || inst.toLowerCase().includes(p.toLowerCase()))) {
        return 'vocal';
    }

    // Check FX presets
    if (FX_PRESETS.some(p => inst.includes(p) || inst.toLowerCase().includes(p.toLowerCase()))) {
        return 'fx';
    }

    // Default to synth engine
    return 'synth';
}
