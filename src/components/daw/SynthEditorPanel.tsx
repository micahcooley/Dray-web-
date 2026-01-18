import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SynthPreset, OscillatorType, updatePreset, addPreset, findPreset } from '../../lib/presets/synthPresets';
import { toneSynthEngine } from '../../lib/engines/synth';
import { audioEngine } from '../../lib/audioEngine';

interface SynthEditorPanelProps {
  presetName: string;
  onPresetChange?: (preset: SynthPreset) => void;
}

export default function SynthEditorPanel({ presetName, onPresetChange }: SynthEditorPanelProps) {
  // Derive preset from presetName instead of using state
  const basePreset = useMemo(() => {
    const found = findPreset(presetName);
    return found ? { ...found } : null;
  }, [presetName]);

  const [preset, setPreset] = useState<SynthPreset | null>(basePreset);
  const [previewNote, setPreviewNote] = useState<number>(60);
  const [status, setStatus] = useState<string | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const debouncedUpdateRef = useRef<NodeJS.Timeout | null>(null);

  // Update preset when basePreset changes
  useEffect(() => {
    setPreset(basePreset);
  }, [basePreset]);

  const update = (field: keyof SynthPreset, value: any) => {
    if (!preset) return;
    const updated = { ...preset, [field]: value };
    setPreset(updated);
    onPresetChange?.(updated);
    // Debounce applying preset to global store to avoid rapid audio glitches
    if (debouncedUpdateRef.current) clearTimeout(debouncedUpdateRef.current);
    debouncedUpdateRef.current = setTimeout(() => {
      try {
        const applied = updatePreset(preset.name, { [field]: value } as Partial<SynthPreset>);
        if (!applied) {
          // if preset doesn't exist, add it
          addPreset({ ...(preset as SynthPreset) });
        }
        // notify synth engine to apply changes to active voices (if method exists)
        try { (toneSynthEngine as any).applyPresetUpdate?.(preset.name, { [field]: value }); } catch (_e) { /* method may not exist */ }
      } catch (_e) {
        console.error('Failed to apply preset update', e);
      }
    }, 180);
  };

  const updateOsc = (idx: number, field: keyof SynthPreset['oscillators'][0], value: any) => {
    if (!preset) return;
    const newOsc = preset.oscillators.map((o, i) => i === idx ? { ...o, [field]: value } : o);
    update('oscillators', newOsc);
  };

  const playPreview = () => {
    if (!preset) return;
    setStatus('Playing preview...');
    try {
      toneSynthEngine.playNote(-1, preset.name, previewNote, 0.5, 0.9);
    } catch (_e) {
      console.error('Preview play error', e);
      setStatus('Preview failed');
      setTimeout(() => setStatus(null), 1500);
    }
    setTimeout(() => setStatus(null), 600);
  };

  const handleSave = () => {
    if (!preset) return;
    try {
      const ok = updatePreset(preset.name, preset as Partial<SynthPreset>);
      if (!ok) addPreset(preset as SynthPreset);
      // persist custom presets list (simple approach)
      const custom = localStorage.getItem('drey-custom-presets');
      const list = custom ? JSON.parse(custom) : [];
      const idx = list.findIndex((p: any) => p.name === preset.name);
      if (idx === -1) list.push(preset); else list[idx] = preset;
      localStorage.setItem('drey-custom-presets', JSON.stringify(list));
      setStatus('Preset saved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setStatus(null), 1400);
    } catch (_e) {
      console.error('Save preset failed', e);
      setStatus('Save failed');
      setTimeout(() => setStatus(null), 1400);
    }
  };

  const handleReset = () => {
    const original = findPreset(presetName);
    if (!original) return;
    setPreset({ ...original });
    // apply immediately
    try { updatePreset(original.name, original); } catch (_e) { console.error('reset apply failed', e); }
    setStatus('Reset to original');
    setTimeout(() => setStatus(null), 1200);
  };

  if (!preset) return <div style={{ padding: 12 }}>No preset selected.</div>;

  return (
    <div style={{ background: '#181825', color: '#eee', borderRadius: 8, padding: 16, minWidth: 340 }} aria-label={preset.name + ' Synth Editor'} role="region">
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{preset.name} Editor</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={handleSave} style={{ background: '#57f287', border: 'none', padding: '6px 10px', borderRadius: 6 }}>Save</button>
        <button onClick={handleReset} style={{ background: '#2a2a3a', border: 'none', padding: '6px 10px', borderRadius: 6 }}>Reset</button>
        {status && <div style={{ marginLeft: 8, color: '#ccc' }}>{status}</div>}
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Preview Note: <input type="number" min={21} max={108} value={previewNote} onChange={e => setPreviewNote(Number(e.target.value))} style={{ width: 60 }} /></label>
        <button onClick={playPreview} style={{ marginLeft: 12, background: '#5865f2', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px' }}>Play</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>Oscillators</div>
        {preset.oscillators.map((osc, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
            <span>#{i + 1}</span>
            <select value={osc.type} onChange={e => updateOsc(i, 'type', e.target.value as OscillatorType)} aria-label={`Oscillator ${i + 1} Type`}>
              <option value="sine">sine</option>
              <option value="square">square</option>
              <option value="sawtooth">sawtooth</option>
              <option value="triangle">triangle</option>
            </select>
            <label htmlFor={`detune${i}`}>Detune: </label>
            <input id={`detune${i}`} type="number" value={osc.detune} onChange={e => updateOsc(i, 'detune', Number(e.target.value))} style={{ width: 50 }} aria-label={`Oscillator ${i + 1} Detune`} />
            <label htmlFor={`gain${i}`}>Gain: </label>
            <input id={`gain${i}`} type="number" min={0} max={1} step={0.01} value={osc.gain} onChange={e => updateOsc(i, 'gain', Number(e.target.value))} style={{ width: 50 }} aria-label={`Oscillator ${i + 1} Gain`} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <label htmlFor="attack">Attack </label>
        <input id="attack" type="number" min={0} max={5} step={0.01} value={preset.attack} onChange={e => update('attack', Number(e.target.value))} style={{ width: 50 }} aria-label="Envelope Attack" />
        <label htmlFor="decay">Decay </label>
        <input id="decay" type="number" min={0} max={5} step={0.01} value={preset.decay} onChange={e => update('decay', Number(e.target.value))} style={{ width: 50 }} aria-label="Envelope Decay" />
        <label htmlFor="sustain">Sustain </label>
        <input id="sustain" type="number" min={0} max={1} step={0.01} value={preset.sustain} onChange={e => update('sustain', Number(e.target.value))} style={{ width: 50 }} aria-label="Envelope Sustain" />
        <label htmlFor="release">Release </label>
        <input id="release" type="number" min={0} max={5} step={0.01} value={preset.release} onChange={e => update('release', Number(e.target.value))} style={{ width: 50 }} aria-label="Envelope Release" />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <label htmlFor="filterFreq">Filter Freq </label>
        <input id="filterFreq" type="number" min={20} max={20000} value={preset.filterFreq} onChange={e => update('filterFreq', Number(e.target.value))} style={{ width: 70 }} aria-label="Filter Frequency" />
        <label htmlFor="filterQ">Q </label>
        <input id="filterQ" type="number" min={0.1} max={20} step={0.01} value={preset.filterQ} onChange={e => update('filterQ', Number(e.target.value))} style={{ width: 50 }} aria-label="Filter Q" />
        <label htmlFor="reverbMix">Reverb </label>
        <input id="reverbMix" type="number" min={0} max={1} step={0.01} value={preset.reverbMix} onChange={e => update('reverbMix', Number(e.target.value))} style={{ width: 50 }} aria-label="Reverb Mix" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>Effects</div>
        <label htmlFor="chorusRate">Chorus Rate </label>
        <input id="chorusRate" type="number" min={0} max={10} step={0.01} value={preset.chorus?.rate ?? 0} onChange={e => update('chorus', { ...preset.chorus, rate: Number(e.target.value) })} style={{ width: 50 }} aria-label="Chorus Rate" />
        <label htmlFor="chorusDepth"> Depth </label>
        <input id="chorusDepth" type="number" min={0} max={1} step={0.01} value={preset.chorus?.depth ?? 0} onChange={e => update('chorus', { ...preset.chorus, depth: Number(e.target.value) })} style={{ width: 50 }} aria-label="Chorus Depth" />
        <label htmlFor="chorusMix"> Mix </label>
        <input id="chorusMix" type="number" min={0} max={1} step={0.01} value={preset.chorus?.mix ?? 0} onChange={e => update('chorus', { ...preset.chorus, mix: Number(e.target.value) })} style={{ width: 50 }} aria-label="Chorus Mix" />
        <br />
        <label htmlFor="delayTime">Delay Time </label>
        <input id="delayTime" type="number" min={0} max={2} step={0.01} value={preset.delay?.time ?? 0} onChange={e => update('delay', { ...preset.delay, time: Number(e.target.value) })} style={{ width: 50 }} aria-label="Delay Time" />
        <label htmlFor="delayFeedback"> Feedback </label>
        <input id="delayFeedback" type="number" min={0} max={1} step={0.01} value={preset.delay?.feedback ?? 0} onChange={e => update('delay', { ...preset.delay, feedback: Number(e.target.value) })} style={{ width: 50 }} aria-label="Delay Feedback" />
        <label htmlFor="delayMix"> Mix </label>
        <input id="delayMix" type="number" min={0} max={1} step={0.01} value={preset.delay?.mix ?? 0} onChange={e => update('delay', { ...preset.delay, mix: Number(e.target.value) })} style={{ width: 50 }} aria-label="Delay Mix" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>LFO</div>
        <label htmlFor="lfoType">Type </label>
        <select id="lfoType" value={preset.lfo?.type ?? 'sine'} onChange={e => update('lfo', { ...preset.lfo, type: e.target.value })} aria-label="LFO Type"><option value="sine">sine</option><option value="triangle">triangle</option></select>
        <label htmlFor="lfoRate"> Rate </label>
        <input id="lfoRate" type="number" min={0} max={10} step={0.01} value={preset.lfo?.rate ?? 0} onChange={e => update('lfo', { ...preset.lfo, rate: Number(e.target.value) })} style={{ width: 50 }} aria-label="LFO Rate" />
        <label htmlFor="lfoTarget"> Target </label>
        <select id="lfoTarget" value={preset.lfo?.target ?? 'filter'} onChange={e => update('lfo', { ...preset.lfo, target: e.target.value })} aria-label="LFO Target"><option value="filter">filter</option><option value="pitch">pitch</option></select>
        <label htmlFor="lfoAmount"> Amount </label>
        <input id="lfoAmount" type="number" min={0} max={5000} step={1} value={preset.lfo?.amount ?? 0} onChange={e => update('lfo', { ...preset.lfo, amount: Number(e.target.value) })} style={{ width: 60 }} aria-label="LFO Amount" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Automation</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <label style={{ fontSize: 12 }}>Filter start</label>
          <input id="autoStart" type="number" min={20} max={20000} defaultValue={preset.filterFreq} style={{ width: 90 }} aria-label="Automation start value" />
          <label style={{ fontSize: 12 }}>end</label>
          <input id="autoEnd" type="number" min={20} max={20000} defaultValue={preset.filterFreq / 2} style={{ width: 90 }} aria-label="Automation end value" />
          <label style={{ fontSize: 12 }}>dur (s)</label>
          <input id="autoDur" type="number" min={0.01} max={60} step={0.01} defaultValue={2} style={{ width: 70 }} aria-label="Automation duration seconds" />
          <button onClick={() => {
            try {
              const s = Number((document.getElementById('autoStart') as HTMLInputElement).value);
              const e = Number((document.getElementById('autoEnd') as HTMLInputElement).value);
              const d = Number((document.getElementById('autoDur') as HTMLInputElement).value);
              if (isNaN(s) || isNaN(e) || isNaN(d) || d <= 0) { setStatus('Invalid automation values'); setTimeout(() => setStatus(null), 1200); return; }
              const now = audioEngine.getNow();
              const startTime = now + 0.02; // small offset to allow scheduling
              const endTime = startTime + d;
              (toneSynthEngine as any).scheduleParamRamp?.(preset.name, ['filter', 'frequency'], s, e, startTime, endTime);
              setStatus('Automation scheduled');
              setTimeout(() => setStatus(null), 1200);
            } catch (err) {
              console.error('Schedule automation failed', err);
              setStatus('Automation failed');
              setTimeout(() => setStatus(null), 1200);
            }
          }} style={{ background: '#5865f2', color: 'white', border: 'none', padding: '6px 8px', borderRadius: 6 }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
