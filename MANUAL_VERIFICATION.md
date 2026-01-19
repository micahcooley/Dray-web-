# AudioContext Unification - Manual Verification Guide

## Overview
This PR unifies all AudioContext usage throughout the project to use a single shared singleton from `audioEngine`. This prevents accidental multiple context instantiation and guarantees clock consistency across all components.

## Changes Made

### 1. audioToMidiConverter.ts
**Before:**
- Maintained its own `private audioContext: AudioContext | null = null`
- Created new context with `new AudioContext()` in `initialize()`
- Used `this.audioContext` throughout the file

**After:**
- Removed private audioContext property
- Added `getContext()` method that calls `audioEngine.getContext()`
- Updated `initialize()` to call `audioEngine.initialize()`
- All operations now use the shared singleton context

### 2. pitchDetector.ts
**Before:**
- Maintained its own `private audioContext: AudioContext | null = null`
- Stored reference after calling `audioEngine.getContext()`
- Used `this.audioContext` throughout

**After:**
- Removed private audioContext property
- Calls `audioEngine.getContext()` directly when needed
- Simplified cleanup by removing context nullification

### 3. audioEngine.ts
**Enhancements:**
- Added `static contextCreationCount` to track context creation
- Added warning when multiple contexts are created (for debugging)
- Added `getContextCreationCount()` debug utility
- Added `assertSingleContext()` debug utility for runtime verification

### 4. Verified Existing Files
- ✅ `stemSeparator.ts` - Already uses `audioEngine.getContext()`
- ✅ `synthEngine.ts` - Already uses `audioEngine.getContext()`
- ✅ `scheduler.ts` - Uses `audioEngine` throughout
- ✅ OfflineAudioContext instances (in stemSeparator and daw/page.tsx) are intentional for offline rendering

## Manual Verification Steps

### 1. Verify Single Context Creation

Open the browser console and run:
```javascript
// Check context creation count
AudioEngine.getContextCreationCount()
// Should return 1

// Assert single context
AudioEngine.assertSingleContext()
// Should return true and not log any errors
```

### 2. Test Audio to MIDI Conversion

1. Navigate to the DAW page
2. Import an audio file with the "Audio Conversion" feature
3. Select "Melody" mode and convert
4. Check browser console for:
   - No warnings about multiple AudioContext instances
   - Verify conversion completes successfully
   - Check that generated MIDI notes play correctly

### 3. Test Pitch Detection (Hum to MIDI)

1. Navigate to the DAW page
2. Click on "Hum to MIDI" feature
3. Allow microphone access
4. Sing or hum a note
5. Verify:
   - Pitch detection works in real-time
   - No console warnings about multiple contexts
   - MIDI notes are generated correctly

### 4. Test WorkletDiagnostics Page

1. Navigate to `/daw` and look for WorkletDiagnostics or similar diagnostic pages
2. Check that only one AudioContext is reported as active
3. Verify timing metrics show stable clock values
4. Confirm no "lost voices" or timing drift issues

### 5. Test Full DAW Workflow

1. Create a new project
2. Add multiple tracks with different instruments
3. Use synth editor to play notes
4. Record MIDI with pitch detector
5. Import audio and convert to MIDI
6. Play back the full arrangement
7. Verify:
   - All instruments play in sync
   - No timing drift or clock inconsistencies
   - No audio glitches or dropouts
   - Check console for context creation count (should be 1)

### 6. Test Settings Modal (Audio Devices)

1. Open Settings Modal
2. Navigate to Audio settings
3. Test "Play Test Tone" button
4. Verify test tone plays without issues
5. Check console for any context-related warnings

## Expected Console Output

### Good Output (Single Context):
```
AudioEngine initialized successfully with context state: running
```

### Bad Output (Multiple Contexts - should not happen):
```
[AudioEngine] Multiple AudioContext instances detected! Count: 2
This may cause timing issues and resource waste.
```

## Debugging Commands

Open browser console and test:

```javascript
// Get the singleton instance
const engine = audioEngine;

// Check if initialized
engine.isReady(); // Should be true after first use

// Get the context
const ctx = engine.getContext();
console.log('Context state:', ctx.state);
console.log('Context sample rate:', ctx.sampleRate);
console.log('Context current time:', ctx.currentTime);

// Check creation count
AudioEngine.getContextCreationCount(); // Should be 1

// Run assertion
AudioEngine.assertSingleContext(); // Should return true
```

## Success Criteria

✅ Only one AudioContext is created (verified via getContextCreationCount())
✅ All audio features work correctly (playback, recording, conversion)
✅ No timing drift or synchronization issues
✅ No console warnings about multiple contexts
✅ All existing tests pass
✅ TypeScript compilation succeeds (except pre-existing errors)

## Known Pre-existing Issues

- Build may fail due to network issues fetching Google Fonts (unrelated to this PR)
- TypeScript errors in `src/lib/engines/bass.ts` (unrelated to this PR)
- These issues exist in the base branch and are not introduced by this PR

## Rollback Plan

If issues are discovered, the changes can be safely reverted by:
1. Restoring `audioToMidiConverter.ts` to use its own AudioContext
2. Restoring `pitchDetector.ts` to store its own context reference
3. Removing the debug utilities from `audioEngine.ts`

However, this would reintroduce the multiple context problem that this PR solves.
