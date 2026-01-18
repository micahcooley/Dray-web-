# Audio Engine Manual Verification Guide

This document provides step-by-step instructions for manually verifying the audio engine's stability, performance, and reliability.

## Prerequisites

1. Open the application in a modern web browser (Chrome, Firefox, or Edge recommended)
2. Ensure audio output is enabled and working
3. Have a test project with multiple tracks and clips ready (or create one)

## Accessing Diagnostics

The Audio Engine Diagnostics panel displays real-time metrics about the audio scheduler's performance.

1. Navigate to the DAW interface
2. Locate the **Audio Engine Diagnostics** panel (typically in settings or developer tools section)
3. The panel updates automatically every 250ms with current metrics

## Key Metrics Explained

### Engine Status
- **Clock Mode**: Shows whether AudioWorklet or fallback (setInterval) is being used
  - Green (AudioWorklet) = Optimal performance
  - Yellow (Fallback) = Compatible mode, slightly higher latency
- **Context State**: Should be "running" when playback is active
- **Sample Rate**: Audio sample rate (typically 44100 or 48000 Hz)
- **Base Latency**: Browser-reported baseline audio latency

### Tick Statistics
- **Total Ticks**: Number of scheduler ticks since playback started
- **Missed Ticks**: Number of ticks that were late by more than 50% of tick duration
- **Miss Rate**: Percentage of missed ticks (should be < 1% for good performance)
- **Status**: Whether scheduler is currently running

### Latency Metrics
- **Avg Latency**: Average time between when a tick should happen vs when it's processed
  - Green: < 5ms (Excellent)
  - Yellow: 5-10ms (Acceptable)
  - Red: > 10ms (Needs attention)
- **95th Percentile**: 95% of ticks have latency below this value
- **Latency History**: Visual sparkline showing latency trends

### Jitter Metrics
- **Avg Jitter**: Average variation in tick timing
  - Green: < 2ms (Excellent)
  - Yellow: 2-5ms (Acceptable)
  - Red: > 5ms (Needs attention)
- **Max Jitter**: Maximum observed jitter
- **Jitter History**: Visual sparkline showing jitter trends

## Manual Test Procedures

### Test 1: Basic Playback Stability

**Objective**: Verify that basic playback works without dropped notes or timing issues.

**Steps**:
1. Open or create a simple project with 2-3 tracks
2. Add some MIDI clips with notes on the beat
3. Open the diagnostics panel
4. Record the initial metrics (before playback):
   - Total Ticks: _____
   - Missed Ticks: _____
   - Avg Latency: _____
5. Start playback and let it run for 30 seconds
6. Record the final metrics:
   - Total Ticks: _____
   - Missed Ticks: _____
   - Miss Rate: _____
   - Avg Latency: _____
   - 95th Percentile Latency: _____
   - Avg Jitter: _____

**Expected Results**:
- Miss Rate should be < 1%
- Avg Latency should be < 5ms
- 95th Percentile Latency should be < 10ms
- Avg Jitter should be < 2ms
- All notes should play audibly without skips

### Test 2: High Load Stress Test

**Objective**: Verify performance under heavy load with many simultaneous notes.

**Steps**:
1. Create or open a busy project with:
   - 8+ tracks
   - Dense note patterns (many notes per beat)
   - Multiple audio clips
2. Open diagnostics panel
3. Record baseline metrics (stopped state)
4. Start playback
5. Monitor metrics for 60 seconds
6. Interact with UI during playback:
   - Adjust track volumes
   - Toggle track mutes
   - Change instrument settings
7. Record final metrics after 60 seconds

**Expected Results**:
- Miss Rate should still be < 2%
- Avg Latency may increase but should stay < 10ms
- No audible glitches or dropped notes
- UI remains responsive
- Sparklines should show relatively stable patterns

### Test 3: Long-Duration Playback

**Objective**: Verify no memory leaks or degradation over time.

**Steps**:
1. Start playback of a looping project
2. Record initial metrics at 1 minute
3. Let playback continue for 5 minutes
4. Record metrics every minute
5. Compare metrics over time

**Expected Results**:
- Metrics should remain stable over time
- No significant increase in latency or jitter
- Total Ticks should increment consistently
- Miss Rate should not increase over time

### Test 4: Worklet vs Fallback Comparison

**Objective**: Compare performance between AudioWorklet and fallback modes.

**Steps**:
1. Check current Clock Mode in diagnostics
2. Run Test 1 and record all metrics
3. Force fallback mode (if needed, disable AudioWorklet in browser)
4. Run Test 1 again with same project
5. Compare metrics between modes

**Expected Results**:
- AudioWorklet mode should have lower latency
- Both modes should have < 1% miss rate
- Fallback mode may show slightly higher jitter

## Baseline Expectations

These are target values for a healthy audio engine:

| Metric | Excellent | Acceptable | Needs Investigation |
|--------|-----------|------------|---------------------|
| Miss Rate | < 0.1% | < 1% | > 1% |
| Avg Latency | < 3ms | < 5ms | > 5ms |
| 95th Percentile Latency | < 5ms | < 10ms | > 10ms |
| Avg Jitter | < 1ms | < 2ms | > 2ms |
| Max Jitter | < 3ms | < 5ms | > 5ms |

## Comparing Before/After Changes

When comparing metrics before and after code changes:

1. **Record Baseline**: Run all tests above on stable branch
2. **Document Environment**: Browser version, OS, hardware specs
3. **Apply Changes**: Checkout PR branch
4. **Re-run Tests**: Use identical test projects
5. **Compare Results**: Look for:
   - Significant increases in miss rate (> 0.5% change)
   - Latency increases (> 2ms change)
   - Jitter increases (> 1ms change)
   - Visual changes in sparklines (more spikes)

## Troubleshooting

### High Miss Rate (> 1%)
- Check CPU usage (other processes competing)
- Verify browser isn't throttling (background tab)
- Check browser extensions (some can interfere)
- Try in incognito mode

### High Latency (> 5ms)
- Check audio buffer settings in browser
- Verify AudioWorklet is available
- Check system audio latency settings
- Close other audio applications

### High Jitter (> 2ms)
- Verify browser is using hardware acceleration
- Check for system-level timing issues
- Monitor CPU thermal throttling
- Try different audio output device

## Automated Logging (Optional)

For automated verification, open browser console and run:

```javascript
// Start logging diagnostics every second
const logDiagnostics = setInterval(() => {
  const diag = audioScheduler.getDiagnostics();
  console.log('Diagnostics:', {
    time: new Date().toISOString(),
    totalTicks: diag.totalTicks,
    missedTicks: diag.missedTicks,
    missRate: diag.missedTickPercentage.toFixed(2),
    avgLatency: diag.avgLatencyMs.toFixed(2),
    p95Latency: diag.p95LatencyMs.toFixed(2),
    avgJitter: diag.avgJitterMs.toFixed(2)
  });
}, 1000);

// Stop logging after 5 minutes
setTimeout(() => clearInterval(logDiagnostics), 300000);
```

## Reporting Issues

When reporting audio stability issues, include:

1. Browser and version
2. Operating system
3. Screenshot of diagnostics panel
4. Steps to reproduce
5. Baseline vs observed metrics
6. Project complexity (number of tracks, clips, notes)
7. Console errors (if any)

## Success Criteria

A successful audio engine implementation should achieve:

- ✅ < 1% miss rate under normal load
- ✅ < 5ms average latency
- ✅ < 10ms 95th percentile latency
- ✅ < 2ms average jitter
- ✅ No audible glitches or dropped notes
- ✅ Stable metrics over 5+ minute playback
- ✅ Responsive UI during playback
- ✅ Consistent performance across browser sessions
