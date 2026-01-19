# Context Unification PR Summary

## Pull Request Title
**context-unification: Use singleton AudioContext, remove direct instantiation**

## Problem Statement
Prior to this PR, multiple AudioContext instances could be created throughout the application:
- `audioToMidiConverter.ts` created its own AudioContext
- `pitchDetector.ts` stored and managed its own AudioContext reference
- This led to potential timing inconsistencies and resource waste
- Multiple contexts can cause clock drift and synchronization issues

## Solution
Unified all AudioContext usage to use a single shared singleton from `audioEngine`:
- Removed direct `new AudioContext()` calls from components
- Updated all modules to reference `audioEngine.getContext()`
- Added debug utilities to detect and warn about multiple context creation

## Changes Summary

### Modified Files (3)
1. **src/lib/audioToMidiConverter.ts** (16 lines changed)
   - Removed private audioContext property
   - Added getContext() helper method
   - Updated to use audioEngine.getContext()

2. **src/lib/pitchDetector.ts** (19 lines changed)
   - Removed private audioContext property
   - Updated all references to use audioEngine.getContext()
   - Simplified cleanup logic

3. **src/lib/audioEngine.ts** (27 lines added)
   - Added contextCreationCount tracking
   - Added warning for multiple context detection
   - Added getContextCreationCount() utility
   - Added assertSingleContext() utility

### New Files (1)
4. **MANUAL_VERIFICATION.md** (168 lines)
   - Comprehensive manual testing guide
   - Expected behaviors and console output
   - Debugging commands
   - Success criteria

## Technical Details

### Before
```typescript
// audioToMidiConverter.ts
class AudioToMidiConverter {
    private audioContext: AudioContext | null = null;
    async initialize() {
        this.audioContext = new AudioContext(); // ❌ Creates new context
    }
}

// pitchDetector.ts
class PitchDetector {
    private audioContext: AudioContext | null = null;
    async initialize() {
        this.audioContext = audioEngine.getContext(); // ❌ Stores reference
    }
}
```

### After
```typescript
// audioToMidiConverter.ts
class AudioToMidiConverter {
    async initialize() {
        await audioEngine.initialize(); // ✅ Uses singleton
    }
    private getContext(): AudioContext {
        return audioEngine.getContext(); // ✅ Direct access when needed
    }
}

// pitchDetector.ts
class PitchDetector {
    async initialize() {
        const audioContext = audioEngine.getContext(); // ✅ Local reference only
    }
    // Uses audioEngine.getContext() directly when needed
}
```

## Verification Results

### Automated Tests
✅ All 4 test suites pass (5 tests total)
✅ No new TypeScript errors introduced
✅ Code compiles successfully

### Code Analysis
✅ Only one location creates AudioContext (audioEngine.ts:48)
✅ No other `new AudioContext()` calls found in source code
✅ stemSeparator.ts already used audioEngine correctly
✅ synthEngine.ts already used audioEngine correctly
✅ OfflineAudioContext uses are intentional (offline rendering)

### Static Analysis
```bash
# Verified single instantiation point
$ grep -r "new AudioContext" src/ | grep -v OfflineAudioContext
src/lib/audioEngine.ts:48:        this.context = new AudioContextClass({ ... });
# ✅ Only one result - exactly as intended
```

## Runtime Debug Utilities

Developers can verify single context behavior:

```javascript
// Get creation count
AudioEngine.getContextCreationCount(); // Returns: 1

// Assert single context
AudioEngine.assertSingleContext(); // Returns: true (no errors)
```

If multiple contexts are accidentally created, the console will show:
```
⚠️ [AudioEngine] Multiple AudioContext instances detected! Count: 2
   This may cause timing issues and resource waste.
```

## Benefits

1. **Guaranteed Single Context**: Only one AudioContext exists application-wide
2. **Clock Consistency**: All audio operations use the same timing reference
3. **Resource Efficiency**: No duplicate contexts consuming resources
4. **Easier Debugging**: Debug utilities help identify issues
5. **Better Synchronization**: All audio features stay in sync

## Testing Recommendations

1. Test Audio to MIDI conversion with various audio files
2. Test Pitch Detection (Hum to MIDI) with microphone input
3. Verify WorkletDiagnostics shows single context
4. Test full DAW workflow with multiple tracks
5. Verify no timing drift during playback
6. Check console for context creation count = 1

## Known Pre-existing Issues (Not Related to This PR)

- Build may fail fetching Google Fonts (network issue)
- TypeScript errors in `src/lib/engines/bass.ts` (pre-existing)
- These exist in the base branch before this PR

## Rollback Plan

If issues occur, changes can be safely reverted by restoring:
- audioToMidiConverter.ts to create its own AudioContext
- pitchDetector.ts to store its own context reference

However, this would reintroduce the multiple context problem.

## Conclusion

This PR successfully achieves its goal of unifying AudioContext usage throughout the application. All changes are minimal, surgical, and focused on the specific problem. The implementation includes robust debug utilities to prevent future regressions.

**Status**: ✅ Ready for Review and Merge
