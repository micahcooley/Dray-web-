# Piano Roll Preview - QA Checklist

## Manual Verification Steps

This checklist documents manual steps to verify the Piano Roll preview enhancements are working correctly.

### 1. Preview Note Triggering
- [ ] **Test**: Open Piano Roll and click/drag rapidly across different notes
  - **Expected**: No pops, clicks, or audio glitches during rapid dragging
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Drag pointer very quickly across many notes
  - **Expected**: Audio remains smooth, no CPU spikes or browser lag
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 2. Monophonic Preview Behavior
- [ ] **Test**: Click on one note, then immediately click another note
  - **Expected**: Only one preview note plays at a time (monophonic)
  - **Expected**: First note stops cleanly when second note starts
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Rapid-fire clicking on different notes
  - **Expected**: No overlapping preview notes, clean transitions
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 3. Drum Preview Kit Switching
- [ ] **Test**: Open Piano Roll for a drum track
  - **Expected**: Kit loads instantly when preview is triggered
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Change drum kit (e.g., from 808 to 909) and immediately preview
  - **Expected**: Correct drum sound for the new kit plays instantly
  - **Expected**: No latency or delay in kit switching
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview kick, snare, hi-hat in rapid succession
  - **Expected**: All drum sounds play correctly
  - **Expected**: No audio bleed or overlapping drum hits
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 4. Preview Isolation from Main Playback
- [ ] **Test**: Play timeline while simultaneously previewing notes in Piano Roll
  - **Expected**: Preview notes do not interfere with main timeline playback
  - **Expected**: Main playback continues smoothly while previewing
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview notes during playback, then stop playback
  - **Expected**: Preview notes continue to work correctly after stopping
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 5. Preview with Different Engines
- [ ] **Test**: Preview synth presets (e.g., Super Saw, Analog Pad)
  - **Expected**: Preview plays correct preset instantly
  - **Expected**: No audio bleed when switching between notes
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview bass presets (e.g., Sub Bass, 808 Bass)
  - **Expected**: Preview plays correct bass sound (transposed down 1 octave)
  - **Expected**: Clean release when switching notes
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview keys presets (e.g., Grand Piano, Rhodes)
  - **Expected**: Preview plays correct keys sound
  - **Expected**: No stuck notes or audio leaks
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview vocal presets (e.g., Choir, Vocoder)
  - **Expected**: Preview plays correct vocal sound
  - **Expected**: Reverb tails from previous notes stop cleanly
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview FX presets (e.g., Riser, Impact)
  - **Expected**: FX preview plays correctly
  - **Expected**: Previous FX nodes are disposed/cleaned up
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 6. Effect Tail Behavior
- [ ] **Test**: Preview a note with heavy reverb/delay (e.g., Atmosphere pad)
  - **Expected**: Reverb tail is acceptable for UI responsiveness
  - **Note**: Effect tails may overlap briefly during rapid preview - this is acceptable
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Rapidly preview notes with long reverb tails
  - **Expected**: No excessive CPU usage or memory leaks
  - **Expected**: Browser remains responsive
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 7. Memory and Performance
- [ ] **Test**: Open Piano Roll, preview 100+ different notes over 2 minutes
  - **Expected**: No memory leaks (check DevTools Memory tab)
  - **Expected**: Preview remains responsive throughout
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Switch between different presets and preview notes
  - **Expected**: Synths are cached after first use (instant playback)
  - **Expected**: No stuttering or delays on subsequent previews
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

### 8. Edge Cases
- [ ] **Test**: Open Piano Roll, close it, open again, preview notes
  - **Expected**: Preview works correctly after re-opening
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Change track instrument while Piano Roll is open, then preview
  - **Expected**: Preview uses the new instrument correctly
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

- [ ] **Test**: Preview notes on the piano keyboard sidebar
  - **Expected**: Sidebar preview works identically to grid preview
  - **Actual**: _____________________
  - **Status**: ☐ Pass ☐ Fail

---

## Testing Notes

**Date Tested**: _____________________  
**Tester**: _____________________  
**Browser/Version**: _____________________  
**OS**: _____________________  

**Overall Status**: ☐ All Tests Passed ☐ Some Tests Failed

**Additional Comments**:
_____________________________________________________________________________________
_____________________________________________________________________________________
_____________________________________________________________________________________
