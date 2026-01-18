// Algorithmic Pattern Generators for Wingman AI
// Expanded with more styles, scales, and humanization

export interface GeneratedNote {
    pitch: number;
    start: number;
    duration: number;
    velocity: number;
}

// ============================================
// SCALES - Expanded with more options
// ============================================
export const SCALES: Record<string, number[]> = {
    // Basic
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Melodic Minor': [0, 2, 3, 5, 7, 9, 11],

    // Modes
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],

    // Pentatonic
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
    'Blues': [0, 3, 5, 6, 7, 10],

    // Exotic
    'Japanese': [0, 1, 5, 7, 8],
    'Arabic': [0, 1, 4, 5, 7, 8, 11],
    'Hungarian Minor': [0, 2, 3, 6, 7, 8, 11],
    'Whole Tone': [0, 2, 4, 6, 8, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Keep legacy export for compatibility
export const CHORD_SCALES = SCALES;

// ============================================
// DRUM MAPPING
// ============================================
export const DRUM_MAP = {
    KICK: 36,
    SNARE: 38,
    CLAP: 39,
    HAT_CLOSED: 42,
    HAT_OPEN: 46,
    CRASH: 49,
    RIDE: 51,
    TOM_LO: 45,
    TOM_MID: 47,
    TOM_HI: 50,
    RIMSHOT: 37,
    COWBELL: 56,
    TAMBOURINE: 54,
    PERC_1: 60,
    PERC_2: 61,
};

// ============================================
// ROOT NOTE MAPPING
// ============================================
const ROOT_MAP: Record<string, number> = {
    'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63,
    'E': 64, 'F': 65, 'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68,
    'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71
};

// ============================================
// HUMANIZATION HELPERS
// ============================================
// Utility for future humanization features
// function humanize(value: number, amount: number): number {
//     return value + (Math.random() - 0.5) * amount;
// }

function humanizeVelocity(base: number, variation: number = 0.1): number {
    return Math.max(0.1, Math.min(1, base + (Math.random() - 0.5) * variation));
}

function humanizeTiming(time: number, swing: number = 0, humanization: number = 0.01): number {
    let result = time;
    // Apply swing to even 16th notes
    if (swing > 0 && (Math.round(time * 4) % 2 === 1)) {
        result += swing * 0.125; // Delay even 16ths
    }
    // Add slight random timing variation
    result += (Math.random() - 0.5) * humanization;
    return Math.max(0, result);
}

// ============================================
// PATTERN GENERATORS
// ============================================
export const PatternGenerators = {
    /**
     * Generate drum patterns based on style
     */
    generateDrumPattern(style: string, length: number = 4, options: {
        swing?: number;
        humanize?: boolean;
        complexity?: 'simple' | 'medium' | 'complex';
    } = {}): GeneratedNote[] {
        const notes: GeneratedNote[] = [];
        const s = style.toLowerCase();
        const swing = options.swing ?? 0;
        const doHumanize = options.humanize ?? true;
        const complexity = options.complexity ?? 'medium';

        const addNote = (pitch: number, start: number, duration: number, velocity: number) => {
            notes.push({
                pitch,
                start: doHumanize ? humanizeTiming(start, swing) : start,
                duration,
                velocity: doHumanize ? humanizeVelocity(velocity) : velocity
            });
        };

        if (s.includes('trap')) {
            // Trap Beat: Sparse kicks, snare on 3, busy hi-hats with rolls
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                // Kicks: Beat 1, occasional pickups
                addNote(DRUM_MAP.KICK, offset, 0.5, 1.0);
                if (Math.random() > 0.5) addNote(DRUM_MAP.KICK, offset + 2.75, 0.25, 0.85);
                if (Math.random() > 0.7) addNote(DRUM_MAP.KICK, offset + 3.5, 0.25, 0.75);

                // Snare with clap layer on beat 3
                addNote(DRUM_MAP.SNARE, offset + 2, 0.5, 0.95);
                addNote(DRUM_MAP.CLAP, offset + 2, 0.5, 0.85);

                // Hi-hats with rolls
                for (let i = 0; i < 16; i++) {
                    const pos = offset + (i * 0.25);
                    if (Math.random() > 0.1) {
                        // Roll probability
                        if (complexity === 'complex' && Math.random() > 0.85) {
                            // Triplet roll
                            for (let r = 0; r < 3; r++) {
                                addNote(DRUM_MAP.HAT_CLOSED, pos + (r * 0.083), 0.06, 0.7 - (r * 0.1));
                            }
                        } else {
                            addNote(DRUM_MAP.HAT_CLOSED, pos, 0.1, i % 4 === 0 ? 0.85 : 0.65);
                        }
                    }
                }
            }
        } else if (s.includes('lo-fi') || s.includes('lofi')) {
            // Lo-Fi Hip-Hop: Slightly wonky drums, heavy swing
            const lofiSwing = 0.15;
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                addNote(DRUM_MAP.KICK, offset, 0.5, 0.9);
                addNote(DRUM_MAP.KICK, offset + 1.5, 0.5, 0.7);
                addNote(DRUM_MAP.SNARE, offset + 1, 0.5, 0.75);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.5, 0.8);

                // Lazy hats
                for (let i = 0; i < 8; i++) {
                    const pos = offset + (i * 0.5);
                    addNote(DRUM_MAP.HAT_CLOSED, humanizeTiming(pos, lofiSwing, 0.03), 0.15, 0.55 + Math.random() * 0.15);
                }
            }
        } else if (s.includes('phonk')) {
            // Phonk: Aggressive, distorted feel
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                addNote(DRUM_MAP.KICK, offset, 0.6, 1.0);
                addNote(DRUM_MAP.KICK, offset + 1.75, 0.3, 0.9);
                addNote(DRUM_MAP.KICK, offset + 2.5, 0.4, 0.85);
                addNote(DRUM_MAP.SNARE, offset + 1, 0.4, 0.95);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.4, 1.0);
                addNote(DRUM_MAP.COWBELL, offset + 0.5, 0.2, 0.6);
                addNote(DRUM_MAP.COWBELL, offset + 2.5, 0.2, 0.55);

                for (let i = 0; i < 16; i++) {
                    addNote(DRUM_MAP.HAT_CLOSED, offset + (i * 0.25), 0.08, 0.6);
                }
            }
        } else if (s.includes('boom bap') || s.includes('boombap')) {
            // Boom Bap: Classic hip-hop with swing
            const boomBapSwing = 0.08;
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                addNote(DRUM_MAP.KICK, offset, 0.5, 0.95);
                addNote(DRUM_MAP.KICK, offset + 2.75, 0.35, 0.8);
                addNote(DRUM_MAP.SNARE, offset + 1, 0.5, 0.9);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.5, 0.95);

                for (let i = 0; i < 8; i++) {
                    const pos = offset + (i * 0.5);
                    addNote(DRUM_MAP.HAT_CLOSED, humanizeTiming(pos, boomBapSwing), 0.15, i % 2 === 0 ? 0.75 : 0.6);
                }
            }
        } else if (s.includes('house') || s.includes('dance')) {
            // House: Four on the floor, off-beat hats
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                for (let beat = 0; beat < 4; beat++) {
                    addNote(DRUM_MAP.KICK, offset + beat, 0.5, 1.0);
                    addNote(DRUM_MAP.HAT_OPEN, offset + beat + 0.5, 0.25, 0.75);
                }
                addNote(DRUM_MAP.CLAP, offset + 1, 0.5, 0.9);
                addNote(DRUM_MAP.CLAP, offset + 3, 0.5, 0.9);
            }
        } else if (s.includes('techno')) {
            // Techno: Driving, mechanical
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                for (let beat = 0; beat < 4; beat++) {
                    addNote(DRUM_MAP.KICK, offset + beat, 0.4, 1.0);
                }
                addNote(DRUM_MAP.CLAP, offset + 1, 0.4, 0.85);
                addNote(DRUM_MAP.CLAP, offset + 3, 0.4, 0.85);

                // 16th note hats
                for (let i = 0; i < 16; i++) {
                    const vel = (i % 4 === 0) ? 0.8 : (i % 2 === 0) ? 0.6 : 0.45;
                    addNote(DRUM_MAP.HAT_CLOSED, offset + (i * 0.25), 0.1, vel);
                }
            }
        } else if (s.includes('dnb') || s.includes('drum and bass') || s.includes('jungle')) {
            // Drum & Bass: Fast breakbeat feel
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                // Amen-style pattern
                addNote(DRUM_MAP.KICK, offset, 0.25, 1.0);
                addNote(DRUM_MAP.KICK, offset + 1.5, 0.25, 0.9);
                addNote(DRUM_MAP.KICK, offset + 2.75, 0.25, 0.85);
                addNote(DRUM_MAP.SNARE, offset + 0.5, 0.25, 0.9);
                addNote(DRUM_MAP.SNARE, offset + 1.25, 0.25, 0.75);
                addNote(DRUM_MAP.SNARE, offset + 2, 0.25, 0.95);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.25, 0.85);
                addNote(DRUM_MAP.SNARE, offset + 3.5, 0.25, 0.7);

                for (let i = 0; i < 16; i++) {
                    if (Math.random() > 0.3) {
                        addNote(DRUM_MAP.HAT_CLOSED, offset + (i * 0.25), 0.1, 0.5 + Math.random() * 0.3);
                    }
                }
            }
        } else if (s.includes('jazz') || s.includes('swing')) {
            // Jazz: Swing feel, ride-focused
            const jazzSwing = 0.2;
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                // Subtle kick
                addNote(DRUM_MAP.KICK, offset, 0.4, 0.6);
                addNote(DRUM_MAP.KICK, offset + 2, 0.4, 0.55);

                // Snare ghost notes
                addNote(DRUM_MAP.SNARE, offset + 1, 0.3, 0.7);
                addNote(DRUM_MAP.SNARE, offset + 2.5, 0.2, 0.45);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.3, 0.75);

                // Ride pattern with swing
                for (let i = 0; i < 8; i++) {
                    const pos = offset + (i * 0.5);
                    addNote(DRUM_MAP.RIDE, humanizeTiming(pos, jazzSwing, 0.02), 0.25, 0.6 + Math.random() * 0.2);
                }
            }
        } else if (s.includes('acoustic') || s.includes('rock') || s.includes('pop')) {
            // Rock/Pop: Straightforward beat
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;

                addNote(DRUM_MAP.KICK, offset, 0.5, 0.95);
                addNote(DRUM_MAP.KICK, offset + 2, 0.5, 0.9);
                addNote(DRUM_MAP.SNARE, offset + 1, 0.5, 0.9);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.5, 0.95);

                // 8th note hats
                for (let i = 0; i < 8; i++) {
                    addNote(DRUM_MAP.HAT_CLOSED, offset + (i * 0.5), 0.2, i % 2 === 0 ? 0.75 : 0.6);
                }
            }
        } else {
            // Default: Simple 4-on-floor with hats
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;
                for (let beat = 0; beat < 4; beat++) {
                    addNote(DRUM_MAP.KICK, offset + beat, 0.5, 0.9);
                    addNote(DRUM_MAP.HAT_CLOSED, offset + beat, 0.2, 0.7);
                    addNote(DRUM_MAP.HAT_CLOSED, offset + beat + 0.5, 0.2, 0.55);
                }
                addNote(DRUM_MAP.SNARE, offset + 1, 0.5, 0.85);
                addNote(DRUM_MAP.SNARE, offset + 3, 0.5, 0.85);
            }
        }

        return notes;
    },

    /**
     * Generate chord progressions based on style/mood
     */
    generateChordProgression(options: {
        key?: string;
        scale?: string;
        mood?: string;
        length?: number;
        octave?: number;
        voicing?: 'triad' | 'seventh' | 'extended';
    } = {}): GeneratedNote[] {
        const key = options.key ?? 'C';
        const scale = options.scale ?? 'Minor';
        const mood = (options.mood ?? 'emotional').toLowerCase();
        const length = options.length ?? 4;
        const octave = options.octave ?? 4;
        const voicing = options.voicing ?? 'triad';

        const root = ROOT_MAP[key] ?? 60;
        const octaveAdjust = (octave - 4) * 12;
        const baseRoot = root + octaveAdjust;
        const scaleIntervals = SCALES[scale] ?? SCALES['Minor'];

        const notes: GeneratedNote[] = [];

        // Get scale degree note
        const getScaleNote = (degree: number, octaveOffset: number = 0): number => {
            const d = (degree - 1) % 7;
            const octaves = Math.floor((degree - 1) / 7) + octaveOffset;
            return baseRoot + scaleIntervals[d] + (octaves * 12);
        };

        // Build chord from scale degree
        const getChord = (degree: number): number[] => {
            const result = [getScaleNote(degree)];
            result.push(getScaleNote(degree + 2)); // 3rd
            result.push(getScaleNote(degree + 4)); // 5th
            if (voicing === 'seventh' || voicing === 'extended') {
                result.push(getScaleNote(degree + 6)); // 7th
            }
            if (voicing === 'extended') {
                result.push(getScaleNote(degree + 8)); // 9th
            }
            return result;
        };

        // Choose progression based on mood
        let progression: number[];
        if (mood.includes('sad') || mood.includes('emotional') || mood.includes('melancholy')) {
            progression = [6, 4, 1, 5]; // vi - IV - I - V
        } else if (mood.includes('happy') || mood.includes('uplifting') || mood.includes('joy')) {
            progression = [1, 5, 6, 4]; // I - V - vi - IV
        } else if (mood.includes('dark') || mood.includes('tense') || mood.includes('suspense')) {
            progression = [1, 7, 6, 7]; // i - VII - VI - VII (minor)
        } else if (mood.includes('epic') || mood.includes('powerful')) {
            progression = [1, 5, 6, 3, 4]; // I - V - vi - iii - IV
        } else if (mood.includes('chill') || mood.includes('ambient')) {
            progression = [1, 3, 4, 1]; // i - III - IV - i
        } else if (mood.includes('jazz') || mood.includes('sophisticated')) {
            progression = [2, 5, 1, 6]; // ii - V - I - vi
        } else if (mood.includes('trap') || mood.includes('hip hop')) {
            progression = [1, 1, 6, 6]; // i - i - VI - VI
        } else if (mood.includes('edm') || mood.includes('dance')) {
            progression = [1, 6, 4, 5]; // i - VI - IV - V
        } else {
            // Default emotional
            progression = [1, 4, 5, 4];
        }

        // Extend or trim progression to fit length
        while (progression.length < length) {
            progression.push(progression[progression.length - 1]);
        }
        progression = progression.slice(0, length);

        const chordDuration = length / progression.length;

        progression.forEach((degree, idx) => {
            const chordPitches = getChord(degree);
            chordPitches.forEach(pitch => {
                notes.push({
                    pitch,
                    start: idx * chordDuration,
                    duration: chordDuration * 0.95, // Slight gap
                    velocity: humanizeVelocity(0.75, 0.1)
                });
            });
        });

        return notes;
    },

    /**
     * Generate a melody based on key/scale
     */
    generateMelody(options: {
        key?: string;
        scale?: string;
        length?: number;
        density?: 'sparse' | 'medium' | 'dense';
        style?: string;
    } = {}): GeneratedNote[] {
        const key = options.key ?? 'C';
        const scale = options.scale ?? 'Minor';
        const length = options.length ?? 4;
        const density = options.density ?? 'medium';

        const root = ROOT_MAP[key] ?? 60;
        const scaleIntervals = SCALES[scale] ?? SCALES['Minor'];
        const notes: GeneratedNote[] = [];

        const getScaleNote = (index: number): number => {
            const octave = Math.floor(index / scaleIntervals.length);
            const degree = index % scaleIntervals.length;
            return root + scaleIntervals[degree] + (octave * 12);
        };

        // Determine note density
        const gridSize = density === 'sparse' ? 1 : density === 'dense' ? 0.25 : 0.5;
        const stepsPerBar = 4 / gridSize;
        const totalSteps = length * stepsPerBar / 4;

        let currentNote = Math.floor(Math.random() * 5) + 5; // Start in middle of scale

        for (let step = 0; step < totalSteps; step++) {
            // Probability of placing a note
            const prob = density === 'sparse' ? 0.3 : density === 'dense' ? 0.8 : 0.6;
            if (Math.random() < prob) {
                // Move by step or skip
                const jump = Math.random() > 0.7 ? (Math.random() > 0.5 ? 2 : -2) : (Math.random() > 0.5 ? 1 : -1);
                currentNote = Math.max(0, Math.min(14, currentNote + jump)); // Keep in 2 octave range

                const duration = gridSize * (Math.random() > 0.7 ? 2 : 1);

                notes.push({
                    pitch: getScaleNote(currentNote),
                    start: step * gridSize,
                    duration: duration * 0.9,
                    velocity: humanizeVelocity(0.8, 0.15)
                });
            }
        }

        return notes;
    },

    /**
     * Generate a bass line
     */
    generateBassline(options: {
        key?: string;
        scale?: string;
        style?: string;
        length?: number;
    } = {}): GeneratedNote[] {
        const key = options.key ?? 'C';
        const scale = options.scale ?? 'Minor';
        const style = (options.style ?? 'simple').toLowerCase();
        const length = options.length ?? 4;

        const root = (ROOT_MAP[key] ?? 60) - 24; // 2 octaves down
        const scaleIntervals = SCALES[scale] ?? SCALES['Minor'];
        const notes: GeneratedNote[] = [];

        const getScaleNote = (degree: number): number => {
            const d = (degree - 1) % 7;
            const octaves = Math.floor((degree - 1) / 7);
            return root + scaleIntervals[d] + (octaves * 12);
        };

        if (style.includes('808') || style.includes('trap')) {
            // Trap 808 bass
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;
                notes.push({ pitch: getScaleNote(1), start: offset, duration: 2, velocity: 0.95 });
                if (Math.random() > 0.5) {
                    notes.push({ pitch: getScaleNote(1) - 2, start: offset + 2.5, duration: 0.5, velocity: 0.8 });
                }
                notes.push({ pitch: getScaleNote(5), start: offset + 3, duration: 1, velocity: 0.85 });
            }
        } else if (style.includes('walking') || style.includes('jazz')) {
            // Walking bass
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;
                notes.push({ pitch: getScaleNote(1), start: offset, duration: 0.9, velocity: 0.85 });
                notes.push({ pitch: getScaleNote(3), start: offset + 1, duration: 0.9, velocity: 0.75 });
                notes.push({ pitch: getScaleNote(5), start: offset + 2, duration: 0.9, velocity: 0.8 });
                notes.push({ pitch: getScaleNote(4), start: offset + 3, duration: 0.9, velocity: 0.75 });
            }
        } else if (style.includes('octave') || style.includes('dance')) {
            // Octave bass (house/dance)
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;
                for (let beat = 0; beat < 4; beat++) {
                    notes.push({ pitch: getScaleNote(1), start: offset + beat, duration: 0.4, velocity: 0.9 });
                    notes.push({ pitch: getScaleNote(1) + 12, start: offset + beat + 0.5, duration: 0.4, velocity: 0.7 });
                }
            }
        } else {
            // Simple root-fifth
            for (let bar = 0; bar < length / 4; bar++) {
                const offset = bar * 4;
                notes.push({ pitch: getScaleNote(1), start: offset, duration: 1.5, velocity: 0.9 });
                notes.push({ pitch: getScaleNote(5), start: offset + 2, duration: 1.5, velocity: 0.8 });
            }
        }

        return notes;
    },

    /**
     * Generate an arpeggio pattern
     */
    generateArpeggio(options: {
        key?: string;
        scale?: string;
        pattern?: 'up' | 'down' | 'updown' | 'random';
        speed?: 'slow' | 'medium' | 'fast';
        length?: number;
    } = {}): GeneratedNote[] {
        const key = options.key ?? 'C';
        const scale = options.scale ?? 'Minor';
        const pattern = options.pattern ?? 'up';
        const speed = options.speed ?? 'medium';
        const length = options.length ?? 4;

        const root = ROOT_MAP[key] ?? 60;
        const scaleIntervals = SCALES[scale] ?? SCALES['Minor'];
        const notes: GeneratedNote[] = [];

        // Build arpeggio notes (triad + octave)
        const arpNotes = [
            root,
            root + scaleIntervals[2],
            root + scaleIntervals[4],
            root + 12,
        ];

        const stepSize = speed === 'slow' ? 0.5 : speed === 'fast' ? 0.125 : 0.25;
        const stepsPerBar = 4 / stepSize;
        const totalSteps = (length / 4) * stepsPerBar;

        for (let step = 0; step < totalSteps; step++) {
            let noteIndex: number;

            switch (pattern) {
                case 'down':
                    noteIndex = (arpNotes.length - 1) - (step % arpNotes.length);
                    break;
                case 'updown':
                    const cycle = step % (arpNotes.length * 2 - 2);
                    noteIndex = cycle < arpNotes.length ? cycle : (arpNotes.length * 2 - 2) - cycle;
                    break;
                case 'random':
                    noteIndex = Math.floor(Math.random() * arpNotes.length);
                    break;
                case 'up':
                default:
                    noteIndex = step % arpNotes.length;
            }

            notes.push({
                pitch: arpNotes[noteIndex],
                start: step * stepSize,
                duration: stepSize * 0.8,
                velocity: humanizeVelocity(0.75, 0.1)
            });
        }

        return notes;
    },
};
