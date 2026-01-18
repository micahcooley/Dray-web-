import React, { useEffect, useState } from 'react';
import { audioScheduler } from '../../lib/scheduler';
import { audioEngine } from '../../lib/audioEngine';

export default function WorkletDiagnostics() {
  const [diag, setDiag] = useState(audioScheduler.getDiagnostics());
  const [engineDiag, setEngineDiag] = useState(audioEngine.getDiagnostics());
  const [threshold, setThreshold] = useState(2);
  const [poll, setPoll] = useState(6);

  useEffect(() => {
    const t = setInterval(() => {
      setDiag(audioScheduler.getDiagnostics());
      setEngineDiag(audioEngine.getDiagnostics());
    }, 250);
    return () => clearInterval(t);
  }, []);

  const applySettings = () => {
    audioScheduler.setNotifyThreshold(Number(threshold));
    audioScheduler.setPollInterval(Number(poll));
  };

  // Calculate sparkline data for latency (last 50 samples)
  const latencySparkline = diag.latencySamples.slice(-50);
  const maxLatency = Math.max(...latencySparkline, 1);
  
  // Calculate sparkline data for jitter (last 50 samples)
  const jitterSparkline = diag.jitterSamples.slice(-50);
  const maxJitter = Math.max(...jitterSparkline, 1);

  return (
    <div style={{ padding: 12, background: '#0b0b14', border: '1px solid #222', color: '#ddd', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14, color: '#5865f2' }}>Audio Engine Diagnostics</div>
      
      {/* Engine Status */}
      <div style={{ marginBottom: 12, padding: 8, background: '#13131a', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#aaa' }}>Engine Status</div>
        <div>Clock Mode: <span style={{ color: diag.usingWorklet ? '#3ba55d' : '#faa81a' }}>{diag.usingWorklet ? 'AudioWorklet' : 'Fallback (setInterval)'}</span></div>
        <div>Context State: <span style={{ color: engineDiag.contextState === 'running' ? '#3ba55d' : '#ed4245' }}>{engineDiag.contextState}</span></div>
        <div>Sample Rate: {engineDiag.sampleRate} Hz</div>
        <div>Base Latency: {(engineDiag.baseLatency * 1000).toFixed(2)} ms</div>
        {engineDiag.outputLatency > 0 && <div>Output Latency: {(engineDiag.outputLatency * 1000).toFixed(2)} ms</div>}
      </div>

      {/* Tick Statistics */}
      <div style={{ marginBottom: 12, padding: 8, background: '#13131a', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#aaa' }}>Tick Statistics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>Total Ticks: <span style={{ color: '#5865f2', fontWeight: 600 }}>{diag.totalTicks}</span></div>
          <div>Missed Ticks: <span style={{ color: diag.missedTicks > 0 ? '#ed4245' : '#3ba55d', fontWeight: 600 }}>{diag.missedTicks}</span></div>
          <div>Miss Rate: <span style={{ color: diag.missedTickPercentage > 1 ? '#ed4245' : '#3ba55d', fontWeight: 600 }}>{diag.missedTickPercentage.toFixed(2)}%</span></div>
          <div>Status: <span style={{ color: diag.isRunning ? '#3ba55d' : '#aaa' }}>{diag.isRunning ? 'Running' : 'Stopped'}</span></div>
        </div>
      </div>

      {/* Latency Metrics */}
      <div style={{ marginBottom: 12, padding: 8, background: '#13131a', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#aaa' }}>Latency Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>Avg Latency: <span style={{ color: diag.avgLatencyMs > 5 ? '#faa81a' : '#3ba55d', fontWeight: 600 }}>{diag.avgLatencyMs.toFixed(2)} ms</span></div>
          <div>95th Percentile: <span style={{ color: diag.p95LatencyMs > 10 ? '#ed4245' : '#3ba55d', fontWeight: 600 }}>{diag.p95LatencyMs.toFixed(2)} ms</span></div>
          <div>Samples: {diag.samples}</div>
        </div>
        
        {/* Latency Sparkline */}
        {latencySparkline.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Latency History (last 50 ticks)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 30, gap: 1, background: '#0a0a10', padding: 4, borderRadius: 4 }}>
              {latencySparkline.map((val, idx) => {
                const height = (val / maxLatency) * 100;
                const color = val > 10 ? '#ed4245' : val > 5 ? '#faa81a' : '#3ba55d';
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      flex: 1, 
                      height: `${Math.max(height, 2)}%`, 
                      background: color,
                      minWidth: 1,
                      opacity: 0.8
                    }} 
                    title={`${val.toFixed(2)} ms`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Jitter Metrics */}
      <div style={{ marginBottom: 12, padding: 8, background: '#13131a', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#aaa' }}>Jitter Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>Avg Jitter: <span style={{ color: diag.avgJitterMs > 2 ? '#faa81a' : '#3ba55d', fontWeight: 600 }}>{diag.avgJitterMs.toFixed(2)} ms</span></div>
          <div>Max Jitter: <span style={{ color: diag.maxJitterMs > 5 ? '#ed4245' : '#3ba55d', fontWeight: 600 }}>{diag.maxJitterMs.toFixed(2)} ms</span></div>
        </div>
        
        {/* Jitter Sparkline */}
        {jitterSparkline.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Jitter History (last 50 ticks)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 30, gap: 1, background: '#0a0a10', padding: 4, borderRadius: 4 }}>
              {jitterSparkline.map((val, idx) => {
                const height = (val / maxJitter) * 100;
                const color = val > 5 ? '#ed4245' : val > 2 ? '#faa81a' : '#3ba55d';
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      flex: 1, 
                      height: `${Math.max(height, 2)}%`, 
                      background: color,
                      minWidth: 1,
                      opacity: 0.8
                    }} 
                    title={`${val.toFixed(2)} ms`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legacy Fields (for backward compatibility) */}
      <div style={{ marginBottom: 12, padding: 8, background: '#13131a', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#aaa' }}>Legacy Diagnostics</div>
        <div>SAB used: {diag.sabUsed ? 'yes' : 'no'}</div>
        <div>Head: {diag.head} Tail: {diag.tail} Unread: {diag.unread}</div>
      </div>

      {/* Settings */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          Notify threshold:
          <input value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: 50, padding: 4 }} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          Poll ms:
          <input value={poll} onChange={e => setPoll(Number(e.target.value))} style={{ width: 50, padding: 4 }} />
        </label>
        <button onClick={applySettings} style={{ background: '#5865f2', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Apply</button>
      </div>
    </div>
  );
}
