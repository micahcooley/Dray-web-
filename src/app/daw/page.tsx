'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback, useRef } from 'react';
// Note: tone engines are imported dynamically to avoid creating AudioContext on module load

import {
  Play, Square, Circle, SkipBack,
  Sparkles, Settings, Share2, Plus, ChevronDown, ChevronRight,
  Volume2, Folder,
  X, Music, Drum, FileAudio, Undo2, Redo2
} from 'lucide-react';
import { useHistory } from '../../hooks/useHistory';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../lib/audioEngine';
import { grokService } from '../../lib/grokService';
import { SYNTH_PRESETS } from '../../lib/synthEngine'; // Imported for presets list
import PianoRoll, { Note } from '../../components/daw/PianoRoll';
import AudioEditor from '../../components/daw/AudioEditor';
import TimeDisplay from '../../components/daw/TimeDisplay';
import SettingsModal from '../../components/daw/SettingsModal';
import WingmanPanel from '../../components/daw/WingmanPanel';
import SynthEditorPanel from '../../components/daw/SynthEditorPanel';
import { getProjectContext, parseWingmanResponse } from '../../lib/wingmanBridge';
import { stemSeparator } from '../../lib/stemSeparator';
import MasterPlayhead from '../../components/daw/MasterPlayhead';
import TrackRow from '../../components/daw/TrackRow';
import AudioConversionModal from '../../components/daw/AudioConversionModal';
import { PatternGenerators } from '../../lib/patternGenerators';
import type { Track, Clip, MidiNote, TrackType, AudioWaveform } from '../../lib/types';
import { SOUND_TYPE_MAP } from '../../lib/types';
import nextDynamic from 'next/dynamic';
const ThemeToggle = nextDynamic(() => import('../../components/ThemeToggle'), { ssr: false });

// SVG Icons
const BeatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="6" width="4" height="12" rx="1" />
    <rect x="10" y="3" width="4" height="18" rx="1" />
    <rect x="18" y="8" width="4" height="8" rx="1" />
  </svg>
);

const MelodyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const MixIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <circle cx="4" cy="12" r="2" />
    <circle cx="12" cy="10" r="2" />
    <circle cx="20" cy="14" r="2" />
  </svg>
);

// Initial tracks with real MIDI data
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
};

// Track colors by type
const TRACK_COLORS = ['#eb459e', '#5865f2', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#3498db', '#1abc9c'];

// Initial tracks with real MIDI data
const INITIAL_TRACKS: Track[] = [
  {
    id: 1, name: 'Drums', type: 'drums', color: '#eb459e', volume: 0.8, pan: 0, muted: false, soloed: false, meterL: 0, meterR: 0, instrument: '808 Kit',
    clips: [
      {
        start: 0, duration: 4, name: 'Beat 1', notes: [
          { id: 'd1', pitch: 36, start: 0, duration: 0.25, velocity: 1 },
          { id: 'd2', pitch: 42, start: 1, duration: 0.25, velocity: 1 },
          { id: 'd3', pitch: 38, start: 2, duration: 0.25, velocity: 1 },
          { id: 'd4', pitch: 42, start: 3, duration: 0.25, velocity: 1 },
        ]
      }
    ]
  },
  {
    id: 2, name: 'Bass', type: 'midi', color: '#5865f2', volume: 0.75, pan: 0, muted: false, soloed: false, meterL: 0, meterR: 0, instrument: 'Sub Bass',
    clips: [
      {
        start: 0, duration: 4, name: 'Sub Bass', notes: [
          { id: 'b1', pitch: 36, start: 0, duration: 1, velocity: 0.8 },
          { id: 'b2', pitch: 36, start: 1.5, duration: 0.5, velocity: 0.8 },
          { id: 'b3', pitch: 38, start: 2, duration: 0.5, velocity: 0.8 },
          { id: 'b4', pitch: 41, start: 3, duration: 1, velocity: 0.8 },
        ]
      }
    ]
  },
  {
    id: 3, name: 'Lead', type: 'midi', color: '#57f287', volume: 0.65, pan: 15, muted: false, soloed: false, meterL: 0, meterR: 0, instrument: 'Super Saw',
    clips: [
      {
        start: 0, duration: 8, name: 'Melody', notes: [
          { id: 'l1', pitch: 72, start: 0, duration: 0.5, velocity: 0.7 },
          { id: 'l2', pitch: 74, start: 0.5, duration: 0.5, velocity: 0.7 },
          { id: 'l3', pitch: 76, start: 1, duration: 1, velocity: 0.7 },
          { id: 'l4', pitch: 74, start: 2, duration: 0.5, velocity: 0.7 },
          { id: 'l5', pitch: 72, start: 2.5, duration: 0.5, velocity: 0.7 },
          { id: 'l6', pitch: 67, start: 3, duration: 1, velocity: 0.7 },
        ]
      }
    ]
  },
  {
    id: 4, name: 'Pad', type: 'midi', color: '#fee75c', volume: 0.5, pan: -10, muted: false, soloed: false, meterL: 0, meterR: 0, instrument: 'Analog Pad',
    clips: [
      {
        start: 0, duration: 8, name: 'Chords', notes: [
          { id: 'p1', pitch: 60, start: 0, duration: 4, velocity: 0.5 },
          { id: 'p2', pitch: 64, start: 0, duration: 4, velocity: 0.5 },
          { id: 'p3', pitch: 67, start: 0, duration: 4, velocity: 0.5 },
          { id: 'p4', pitch: 58, start: 4, duration: 4, velocity: 0.5 },
          { id: 'p5', pitch: 62, start: 4, duration: 4, velocity: 0.5 },
          { id: 'p6', pitch: 65, start: 4, duration: 4, velocity: 0.5 },
        ]
      }
    ]
  }
];

import { SOUND_LIBRARY, type SoundCategoryType as SoundCategory } from '../../lib/constants';

// UI Type for casting the readonly constant
export type SubcategoryData = { readonly [subcategory: string]: readonly string[] } | readonly string[];

// Helper to flatten subcategories for compatibility
export function getAllSoundsInCategory(category: SoundCategory): readonly string[] {
  const data = (SOUND_LIBRARY as any)[category];
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data).flat() as readonly string[];
}

type WingmanMessage = { role: 'ai' | 'user'; text: string };

export default function DAWPage() {
  const { createProject, activeProject, isPlaying, togglePlay, setCurrentTime } = useProjectStore();

  // Use history hook for undo/redo support
  const {
    state: tracks,
    setState: setTracks,
    undo,
    redo,
    canUndo,
    canRedo,
    lastAction,
    historyLength
  } = useHistory<Track[]>(INITIAL_TRACKS);

  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const [isHydrated, setIsHydrated] = useState(false);

  // Load tracks from localStorage AFTER hydration (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('drey-tracks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTracks(parsed, 'Load from storage');
        }
      }
    } catch (e) {
      console.warn('Failed to load tracks from localStorage:', e);
    }
    setIsHydrated(true);
  }, [setTracks]);

  // Persist tracks to localStorage (debounced, only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem('drey-tracks', JSON.stringify(tracks));
      } catch (e) {
        console.warn('Failed to save tracks to localStorage:', e);
      }
    }, 500); // Debounce 500ms
    return () => clearTimeout(timeout);
  }, [tracks, isHydrated]);

  // Keyboard shortcuts for undo/redo and Spacebar play/stop
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar for play/stop (Issue #30)
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!isPlaying) {
          await audioEngine.initialize();
          await audioEngine.resume();
        } else {
          await audioEngine.suspend();
        }
        togglePlay();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      // Also support Ctrl+Y for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isPlaying, togglePlay]);

  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Synths');
  const [wingmanOpen, setWingmanOpen] = useState(true);
  const [wingmanInput, setWingmanInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [wingmanMessages, setWingmanMessages] = useState<WingmanMessage[]>([
    { role: 'ai', text: "Hey! I'm Wingman, your AI producer. What would you like to create today?" }
  ]);
  const [masterVolume, setMasterVolume] = useState(85);
  const [gridDivision, setGridDivision] = useState<number>(4); // 1=1/1, 2=1/2, 4=1/4, 8=1/8, 16=1/16

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: number } | null>(null);

  // Drag reorder state
  const [draggedTrackId, setDraggedTrackId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  // Rename modal state
  const [renameModal, setRenameModal] = useState<{ trackId: number; name: string } | null>(null);

  // Color picker state
  const [colorPickerTrackId, setColorPickerTrackId] = useState<number | null>(null);

  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  // Audio-to-MIDI conversion modal state
  const [conversionModal, setConversionModal] = useState<{
    file: File | Blob;
    targetTrackId: number;
  } | null>(null);

  const editingTrack = tracks.find(t => t.id === editingTrackId) || null;

  // Handle audio-to-MIDI conversion completion
  const handleConversionComplete = (notes: MidiNote[], targetTrackId: number) => {
    setTracks(prev => prev.map(track => {
      if (track.id !== targetTrackId) return track;

      // Create new clip with converted notes
      const newClip: Clip = {
        start: 0,
        duration: Math.max(...notes.map(n => n.start + n.duration), 4),
        name: 'Converted from Audio',
        notes: notes.map((n, i) => ({ ...n, id: `conv-${Date.now()}-${i}` }))
      };

      return {
        ...track,
        clips: [...(track.clips || []), newClip]
      };
    }), 'Convert audio to MIDI');

    setConversionModal(null);
  };

  // Get setTracks from store to sync local state
  const { setTracks: syncTracksToStore } = useProjectStore();

  // CRITICAL: Sync local tracks to Zustand store for scheduler to work
  useEffect(() => {
    syncTracksToStore(tracks as any);
  }, [tracks, syncTracksToStore]);

  useEffect(() => {
    if (!activeProject) {
      createProject('Untitled Project');
    }
    // Do NOT initialize audio engines here — initialization must happen
    // after a user gesture due to browser autoplay policies. Engines
    // will be initialized on first interaction / when playback starts.
    // Preload project audio in background to reduce playback misses
    (async () => {
      try {
        const scheduler = (await import('../../lib/scheduler')).audioScheduler;
        // call public preload per clip
        tracks.forEach(t => t.clips.forEach((c: any) => { if (c.audioUrl) scheduler.preloadAudioClip(c.audioUrl); }));
      } catch (e) { /* ignore in prod */ }
    })();
  }, [activeProject, createProject]);

  const handleTogglePlay = async () => {
    if (!isPlaying) {
      await audioEngine.initialize();
      await audioEngine.resume();
      // Dynamically import engines to avoid creating AudioContext before user gesture
      const engines = await import('../../lib/toneEngine');
      await Promise.all([
        engines.toneSynthEngine.initialize(),
        engines.toneDrumMachine.initialize(),
        engines.toneBassEngine.initialize(),
        engines.toneKeysEngine.initialize(),
        engines.toneVocalEngine.initialize(),
        engines.toneFXEngine.initialize()
      ]);
      togglePlay();
    } else {
      togglePlay();
      try {
        const engines = await import('../../lib/toneEngine');
        engines.toneSynthEngine.stopAll();
        engines.toneBassEngine.stopAll();
        engines.toneKeysEngine.stopAll();
        engines.toneVocalEngine.stopAll();
      } catch (e) {
        console.warn('Failed to stop engines:', e);
      }
    }
  };

  // ... inside DAWPage component

  const handleWingmanSend = useCallback(async () => {
    if (!wingmanInput.trim() || isLoading) return;

    // 1. Prepare user message
    const userMsg = { role: 'user' as const, text: wingmanInput };
    setWingmanMessages(prev => [...prev, userMsg]);
    setWingmanInput('');
    setIsLoading(true);

    try {
      // 2. Build Context
      const context = getProjectContext(
        activeProject,
        tracks,
        isPlaying,
        // Use AudioContext time if available, otherwise 0
        audioEngine.getState() !== null ? audioEngine.getContext().currentTime : 0,
        selectedTrackId,
        SOUND_LIBRARY,
        canUndo,
        canRedo,
        lastAction
      );

      // 3. Call Grok
      // We map our simplified WingmanMessage to GrokMessage
      const chatHistory = wingmanMessages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text
      })) as any[];

      chatHistory.push({ role: 'user', content: userMsg.text });

      const rawResponse = await grokService.chat(chatHistory, context, false);

      // 4. Parse Response for Actions
      const { text, actions } = parseWingmanResponse(rawResponse);

      // 5. Display Text Response
      setWingmanMessages(prev => [...prev, { role: 'ai', text }]);

      // 6. Execute Actions
      if (actions.length > 0) {
        console.log('Executing Wingman Actions:', actions);
        executeWingmanActions(actions);
      }

    } catch (err) {
      console.error(err);
      setWingmanMessages(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an issue connecting to my brain." }]);
    } finally {
      setIsLoading(false);
    }
  }, [wingmanInput, isLoading, wingmanMessages, activeProject, tracks, isPlaying, selectedTrackId]);

  // Execute the list of actions returned by the AI
  const executeWingmanActions = (actions: any[]) => {
    // We process actions sequentially or batch them
    // For state updates like setTracks, functional updates are best

    setTracks(currentTracks => {
      let newTracks = [...currentTracks];

      actions.forEach(action => {
        try {
          switch (action.type) {
            case 'create_track': {
              const { type, name, instrument } = action.payload;
              const newId = Math.max(0, ...newTracks.map(t => t.id)) + 1;
              const color = TRACK_COLORS[newId % TRACK_COLORS.length];
              newTracks.push({
                id: newId,
                name: name || `New ${type}`,
                type: type || 'midi',
                color,
                volume: 0.75,
                pan: 0,
                muted: false,
                soloed: false,
                meterL: 0,
                meterR: 0,
                instrument: instrument || 'Grand Piano',
                clips: []
              });
              break;
            }
            case 'add_midi_clip': {
              const { trackId, name, start, duration, notes } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                newTracks[trackIndex] = {
                  ...newTracks[trackIndex],
                  clips: [
                    ...newTracks[trackIndex].clips,
                    {
                      name: name || 'Clip',
                      start: start || 0,
                      duration: duration || 4,
                      notes: (notes || []).map((n: any) => ({
                        ...n,
                        id: n.id || `wm-${Date.now()}-${Math.random()}`,
                        velocity: n.velocity || 0.8
                      }))
                    }
                  ]
                };
              }
              break;
            }
            case 'set_volume': {
              const { trackId, value } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                newTracks[trackIndex] = { ...newTracks[trackIndex], volume: Math.max(0, Math.min(1, value)) };
              }
              break;
            }
            case 'set_pan': {
              const { trackId, value } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                newTracks[trackIndex] = { ...newTracks[trackIndex], pan: Math.max(-100, Math.min(100, value)) };
              }
              break;
            }
            case 'mute_track': {
              const { trackId } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                newTracks[trackIndex] = { ...newTracks[trackIndex], muted: !newTracks[trackIndex].muted };
              }
              break;
            }
            case 'solo_track': {
              const { trackId } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                newTracks[trackIndex] = { ...newTracks[trackIndex], soloed: !newTracks[trackIndex].soloed };
              }
              break;
            }
            case 'add_audio_clip': {
              const { trackId, start, sampleName } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);
              if (trackIndex !== -1) {
                // Find sample duration or default to 4 beats for now since we don't have sample metadata easily accessible
                const duration = 4; // Placeholder
                newTracks[trackIndex] = {
                  ...newTracks[trackIndex],
                  clips: [
                    ...newTracks[trackIndex].clips,
                    {
                      name: sampleName || 'Audio Clip',
                      start: start || 0,
                      duration,
                      waveform: { peaks: Array.from({ length: 100 }, () => Math.random()) } // Dummy waveform
                    }
                  ]
                };
              }
              break;
            }
            case 'generate_pattern': {
              const { trackId, style, key, scale, length } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);

              if (trackIndex !== -1) {
                const track = newTracks[trackIndex];
                let notes: any[] = [];

                // Import generator dynamically or use if imported at top
                // Since we can't easily dynamic import in this flow without async, we assume PatternGenerators is available
                // or we use a simple inline switch if avoiding imports, but we should import it.
                // For now, let's assume we added the import. If not, this chunk needs the import too.

                if (track.type === 'drums' || style.includes('trap') || style.includes('house')) {
                  notes = PatternGenerators.generateDrumPattern(style, length || 4);
                } else {
                  notes = PatternGenerators.generateChordProgression({ key: key || 'C', scale: scale || 'Minor', mood: 'emotional', length: length || 4 });
                }

                // Map to internal note format with IDs
                const clipNotes = notes.map((n, idx) => ({
                  id: `gen-${Date.now()}-${idx}`,
                  pitch: n.pitch,
                  start: n.start,
                  duration: n.duration,
                  velocity: n.velocity
                }));

                newTracks[trackIndex] = {
                  ...track,
                  clips: [...track.clips, {
                    name: `${style} Pattern`,
                    start: 0,
                    duration: length || 4,
                    notes: clipNotes
                  }]
                };
              }
              break;
            }
            case 'modify_note': {
              const { trackId, noteId, pitch, start, duration, velocity } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);

              if (trackIndex !== -1) {
                const track = newTracks[trackIndex];
                const clips = track.clips.map(clip => {
                  if (clip.notes) {
                    const noteIndex = clip.notes.findIndex(n => n.id === noteId);
                    if (noteIndex !== -1) {
                      const newNotes = [...clip.notes];
                      const note = newNotes[noteIndex];
                      newNotes[noteIndex] = {
                        ...note,
                        pitch: pitch !== undefined ? pitch : note.pitch,
                        start: start !== undefined ? start : note.start,
                        duration: duration !== undefined ? duration : note.duration,
                        velocity: velocity !== undefined ? velocity : note.velocity
                      };
                      return { ...clip, notes: newNotes };
                    }
                  }
                  return clip;
                });
                newTracks[trackIndex] = { ...track, clips };
              }
              break;
            }
            case 'generate_sound': {
              console.log('Generating sound from code...');
              setIsLoading(true); // Keep loading state

              const { name, duration } = action.payload;
              // Run in async function to not block — use a safe generator instead of evaluating arbitrary code
              (async () => {
                try {
                  const sampleRate = 44100;
                  const length = Math.ceil(duration * sampleRate);
                  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

                  // Simple safe generator: create a detuned pad / short impulse using oscillators
                  const gain = offlineCtx.createGain();
                  gain.gain.value = 0.5;
                  gain.connect(offlineCtx.destination);

                  const osc = offlineCtx.createOscillator();
                  osc.type = 'sine';
                  osc.frequency.value = 220;
                  const osc2 = offlineCtx.createOscillator();
                  osc2.type = 'sine';
                  osc2.frequency.value = 220 * 1.005;

                  const g2 = offlineCtx.createGain();
                  g2.gain.value = 0.5;

                  osc.connect(g2);
                  osc2.connect(g2);
                  g2.connect(gain);

                  const now = 0;
                  osc.start(now);
                  osc2.start(now);
                  // Simple envelope
                  gain.gain.setValueAtTime(0.0001, now);
                  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
                  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);

                  osc.stop(now + duration);
                  osc2.stop(now + duration);

                  const buffer = await offlineCtx.startRendering();
                  const wavBlob = stemSeparator.audioBufferToWav(buffer);
                  const url = URL.createObjectURL(wavBlob);

                  // Find or create Audio track
                  let targetTrackId = selectedTrackId;
                  const targetTrack = newTracks.find(t => t.id === targetTrackId);

                  if (!targetTrack || targetTrack.type !== 'audio') {
                    const newId = Math.max(0, ...newTracks.map(t => t.id)) + 1;
                    const newTrack: Track = {
                      id: newId,
                      name: 'Generated Audio',
                      type: 'audio',
                      color: '#4ec9b0',
                      volume: 0.8,
                      pan: 0,
                      muted: false,
                      soloed: false,
                      meterL: 0,
                      meterR: 0,
                      clips: [],
                      instrument: 'Audio'
                    };
                    setTracks(currentTracks => [...currentTracks, newTrack]);
                    targetTrackId = newId;
                  }

                  // Add clip to target track
                  const bpm = activeProject?.tempo || 120;
                  const beats = duration * (bpm / 60);

                  setTracks(currentTracks => currentTracks.map(t => {
                    if (t.id === targetTrackId) {
                      return {
                        ...t,
                        clips: [...t.clips, {
                          id: `clip-gen-${Date.now()}`,
                          name: name || 'Generated Sound',
                          start: audioEngine.getState() !== null ? audioEngine.getContext().currentTime : 0,
                          duration: beats,
                          audioUrl: url,
                          waveform: { peaks: stemSeparator.extractPeaks(buffer, 100) }
                        } as any]
                      };
                    }
                    return t;
                  }));

                  setIsLoading(false);

                } catch (e) {
                  console.error('Generation execution error:', e);
                  setIsLoading(false);
                }
              })();
              break;
            }
            case 'delete_track': {
              const { trackId } = action.payload;
              newTracks = newTracks.filter(t => t.id !== trackId);
              break;
            }
            case 'delete_notes': {
              const { trackId, noteIds } = action.payload;
              const trackIndex = newTracks.findIndex(t => t.id === trackId);

              if (trackIndex !== -1) {
                const track = newTracks[trackIndex];
                const clips = track.clips.map(clip => {
                  if (clip.notes) {
                    return {
                      ...clip,
                      notes: clip.notes.filter(n => !noteIds.includes(n.id))
                    };
                  }
                  return clip;
                });
                newTracks[trackIndex] = { ...track, clips };
              }
              break;
            }
            case 'undo': {
              // Undo is handled outside the track loop
              undo();
              break;
            }
            case 'redo': {
              // Redo is handled outside the track loop
              redo();
              break;
            }
          }
        } catch (e) {
          console.error("Error executing action", action, e);
        }
      });

      return newTracks;
    });
  };

  const handleSuggestionClick = (type: string) => {
    const prompts: Record<string, string> = {
      beat: 'Generate a hard-hitting trap beat at 140 BPM',
      melody: 'Create a catchy melody for my track',
      mix: 'Help me mix and master this track'
    };
    setWingmanInput(prompts[type] || '');
  };

  const handleTrackVolumeChange = useCallback((trackId: number, volume: number) => {
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, volume, meterL: volume * 85, meterR: volume * 80 } : t
    ));
  }, [setTracks]);

  const handleTrackPanChange = useCallback((trackId: number, pan: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, pan } : t));
  }, [setTracks]);

  const handleTrackMute = useCallback((trackId: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t));
  }, [setTracks]);

  const handleTrackSolo = useCallback((trackId: number, shiftKey: boolean = false) => {
    setTracks(prev => {
      const currentTrack = prev.find(t => t.id === trackId);
      const newSoloState = !currentTrack?.soloed;

      if (shiftKey) {
        // Additive solo: toggle just this track
        return prev.map(t => t.id === trackId ? { ...t, soloed: newSoloState } : t);
      } else {
        // Exclusive solo: unsolo all others, toggle this track
        return prev.map(t => t.id === trackId ? { ...t, soloed: newSoloState } : { ...t, soloed: false });
      }
    });
  }, [setTracks]);

  const handleSelectTrack = useCallback((trackId: number) => {
    setSelectedTrackId(trackId);
  }, []);

  const handleTrackDoubleClick = useCallback((trackId: number) => {
    setEditingTrackId(trackId);
  }, []);

  // Context menu handlers
  const handleTrackContextMenu = useCallback((e: React.MouseEvent, trackId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  }, []);

  const closeContextMenu = () => setContextMenu(null);

  const handleChangeTrackType = (trackId: number, newType: TrackType) => {
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, type: newType, clips: [] } : t
    ), 'Change track type');
    closeContextMenu();
  };

  const handleDuplicateTrack = (trackId: number) => {
    setTracks(prev => {
      const track = prev.find(t => t.id === trackId);
      if (!track) return prev;
      const newId = Math.max(0, ...prev.map(t => t.id)) + 1;
      const duplicate: Track = {
        ...track,
        id: newId,
        name: `${track.name} (Copy)`,
        clips: track.clips.map(c => ({ ...c }))
      };
      const idx = prev.findIndex(t => t.id === trackId);
      const newTracks = [...prev];
      newTracks.splice(idx + 1, 0, duplicate);
      return newTracks;
    }, 'Duplicate track');
    closeContextMenu();
  };

  const handleDeleteTrack = (trackId: number) => {
    setTracks(prev => prev.filter(t => t.id !== trackId), 'Delete track');
    closeContextMenu();
  };

  const handleRenameTrack = (trackId: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      setRenameModal({ trackId, name: track.name });
    }
    closeContextMenu();
  };

  const confirmRename = () => {
    if (renameModal && renameModal.name.trim()) {
      setTracks(prev => prev.map(t =>
        t.id === renameModal.trackId ? { ...t, name: renameModal.name.trim() } : t
      ), 'Rename track');
    }
    setRenameModal(null);
  };

  const handleChangeColor = (trackId: number, color: string) => {
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, color } : t
    ), 'Change track color');
    setColorPickerTrackId(null);
    closeContextMenu();
  };

  const handleClearClips = (trackId: number) => {
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, clips: [] } : t
    ), 'Clear clips');
    closeContextMenu();
  };

  // Drag reorder handlers
  // Audio Context Resume on Interaction
  useEffect(() => {
    const handleInteraction = async () => {
      await audioEngine.initialize();
      const context = audioEngine.getContext();
      if (context.state === 'suspended') {
        await context.resume();
        console.log('Audio Context Resumed via Interaction');
      }
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, trackId: number) => {

    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, trackId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTrackId !== null && draggedTrackId !== trackId) {
      setDropTargetId(trackId);
    }
  }, [draggedTrackId]);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTrackId: number) => {
    e.preventDefault();
    setDropTargetId(null);

    // Check if files were dropped (audio file for conversion)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const targetTrack = tracksRef.current.find(t => t.id === targetTrackId);

      // Audio file dropped on MIDI track - offer conversion
      if (file.type.startsWith('audio/') && targetTrack && targetTrack.type === 'midi') {
        setConversionModal({ file, targetTrackId });
        return;
      }

      // Audio file dropped on audio track - handle normally (could add audio import here)
      if (file.type.startsWith('audio/') && targetTrack && targetTrack.type === 'audio') {
        // TODO: Import audio clip to track
        console.log('Audio file dropped on audio track - import not yet implemented');
        return;
      }
    }

    // Track reordering (original behavior)
    if (draggedTrackId === null || draggedTrackId === targetTrackId) {
      setDraggedTrackId(null);
      return;
    }

    setTracks(prev => {
      const dragIdx = prev.findIndex(t => t.id === draggedTrackId);
      const targetIdx = prev.findIndex(t => t.id === targetTrackId);
      if (dragIdx === -1 || targetIdx === -1) return prev;

      const newTracks = [...prev];
      const [dragged] = newTracks.splice(dragIdx, 1);
      newTracks.splice(targetIdx, 0, dragged);
      return newTracks;
    }, 'Reorder tracks');

    setDraggedTrackId(null);
  }, [draggedTrackId, setTracks]);

  const handleDragEnd = useCallback(() => setDraggedTrackId(null), []);

  // Play preview sound using Tone.js engines for professional quality
  const playPreviewSound = async (category: SoundCategory, sound: string) => {
    // Ensure audio engine is initialized (requires user gesture)
    await audioEngine.initialize();

    // Stop any previous sounds
    const engines = await import('../../lib/toneEngine');
    engines.toneSynthEngine.stopAll();
    engines.toneBassEngine.stopAll();
    engines.toneKeysEngine.stopAll();

    if (category === 'Synths') {
      // Play chord with selected synth preset (trackId=-1 for preview)
      await engines.toneSynthEngine.playChord(-1, sound, [60, 64, 67], '2n', 0.7);
    } else if (category === 'Keys') {
      // ToneKeysEngine uses playChord with (trackId, preset, notes, duration, velocity)
      await engines.toneKeysEngine.playChord(-1, sound, [60, 64, 67], '2n', 0.75);
    } else if (category === 'Bass') {
      // Each bass type plays at LOW octaves to showcase the bass character
      const bassPitches: Record<string, number> = {
        'Sub Bass': 24,       // C0 - DEEP sub (lowest)
        'Synth Bass': 28,     // E0 - punchy low
        'Pluck Bass': 31,     // G0 - plucky deep
        'Wobble Bass': 26,    // D0 - wobble sub
        'Reese Bass': 24,     // C0 - deep reese
        'FM Bass': 33,        // A0 - FM character
        'Acid Bass': 36,      // C1 - acid squelch
        'Fingered Bass': 29,  // F0 - fingered low
      };
      // ToneBassEngine uses playNote(trackId, note, duration, velocity, preset)
      await engines.toneBassEngine.playNote(-1, bassPitches[sound] || 24, '2n', 0.95, sound);
    } else if (category === 'Drums') {
      // Play a preview kick with the selected kit
      await engines.toneDrumMachine.playKick(-1, sound, 0.9);
    } else if (category === 'FX') {
      // ToneFXEngine.playFX(trackId, type, velocity)
      await engines.toneFXEngine.playFX(-1, sound, 0.8);
    } else if (category === 'Vocals') {
      // ToneVocalEngine.playVocal(trackId, note, sample)
      await engines.toneVocalEngine.playVocal(-1, 60, sound);
    }
  };

  // Apply sound to track on double-click
  const handleSoundDoubleClick = (category: SoundCategory, sound: string) => {
    const soundType = SOUND_TYPE_MAP[category];
    const selectedTrack = tracks.find(t => t.id === selectedTrackId);

    // Strict check for Drums: Always create new track if current is not drums
    if (category === 'Drums' && selectedTrack?.type !== 'drums') {
      createNewTrack('drums', sound);
      return;
    }

    if (selectedTrack && selectedTrack.type === soundType) {
      // Apply to current track if compatible
      setTracks(prev => prev.map(t =>
        t.id === selectedTrackId
          ? { ...t, instrument: sound, name: sound }
          : t
      ));
    } else {
      // Create new track with this instrument
      createNewTrack(soundType, sound);
    }
  };

  // Create new track
  const createNewTrack = (type: TrackType, instrument?: string) => {
    const newId = Math.max(...tracks.map(t => t.id), 0) + 1;
    const color = TRACK_COLORS[newId % TRACK_COLORS.length];
    const name = instrument || (type === 'drums' ? 'New Drums' : type === 'midi' ? 'New Synth' : 'New Audio');

    const newTrack: Track = {
      id: newId,
      name,
      type,
      color,
      volume: 0.75,
      pan: 0,
      muted: false,
      soloed: false,
      meterL: 60,
      meterR: 58,
      instrument,
      clips: []
    };

    setTracks(prev => [...prev, newTrack]);
    setSelectedTrackId(newId);
    setShowAddTrackModal(false);
  };

  const updateTrackNotes = useCallback((trackId: number, newNotes: Note[]) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;

      // If no clips exist, create a default one
      if (t.clips.length === 0) {
        return {
          ...t,
          clips: [{
            start: 0,
            duration: 16, // 4 bars default
            name: `${t.name} Pattern`,
            notes: newNotes
          }]
        };
      }

      // Update existing first clip
      const clips = [...t.clips];
      clips[0] = { ...clips[0], notes: newNotes };
      return { ...t, clips };
    }));
  }, [setTracks]);

  const handlePianoRollClose = useCallback(() => {
    setEditingTrackId(null);
  }, []);

  const handlePianoRollNotesChange = useCallback((newNotes: Note[]) => {
    if (editingTrackId !== null) {
      updateTrackNotes(editingTrackId, newNotes);
    }
  }, [editingTrackId, updateTrackNotes]);

  const PIXELS_PER_BEAT = 50;
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const showSynthEditor = selectedTrack && selectedTrack.type === 'midi' && selectedTrack.instrument;

  return (
    <div className="daw-container">
      {/* Add Track Modal */}
      {showAddTrackModal && (
        <div className="modal-overlay" onClick={() => setShowAddTrackModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Track</h3>
              <button className="modal-close" onClick={() => setShowAddTrackModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-content">
              <button className="track-type-btn" onClick={() => createNewTrack('midi')}>
                <Music size={24} />
                <span>MIDI Track</span>
                <small>For synths, keys, and virtual instruments</small>
              </button>
              <button className="track-type-btn" onClick={() => createNewTrack('audio')}>
                <FileAudio size={24} />
                <span>Audio Track</span>
                <small>For recordings, samples, and vocals</small>
              </button>
              <button className="track-type-btn" onClick={() => createNewTrack('drums')}>
                <Drum size={24} />
                <span>Drum Pad</span>
                <small>For beats and percussion</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PianoRoll Editor */}
      {editingTrack && editingTrack.type === 'audio' ? (
        <AudioEditor
          track={editingTrack}
          onTrackChange={(updated) => setTracks(prev => prev.map(t => t.id === updated.id ? updated : t))}
          onClose={() => setEditingTrackId(null)}
        />
      ) : editingTrack && (
        <PianoRoll
          trackId={editingTrack.id}
          trackName={editingTrack.name}
          trackColor={editingTrack.color}
          trackType={editingTrack.type as any}
          instrument={editingTrack.instrument}
          notes={editingTrack.clips[0]?.notes || []}
          onNotesChange={handlePianoRollNotesChange}
          onClose={handlePianoRollClose}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu-overlay"
          onClick={closeContextMenu}
        >
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => handleRenameTrack(contextMenu.trackId)}>
              ✏️ Rename
            </button>
            <div className="context-menu-divider" />
            <div className="context-menu-label">Track Type</div>
            <button onClick={() => handleChangeTrackType(contextMenu.trackId, 'midi')}>
              🎹 MIDI
            </button>
            <button onClick={() => handleChangeTrackType(contextMenu.trackId, 'audio')}>
              🎵 Audio
            </button>
            <button onClick={() => handleChangeTrackType(contextMenu.trackId, 'drums')}>
              🥁 Drums
            </button>
            <div className="context-menu-divider" />
            <div className="context-menu-label">Color</div>
            <div className="color-picker-row">
              {TRACK_COLORS.map(color => (
                <button
                  key={color}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => handleChangeColor(contextMenu.trackId, color)}
                />
              ))}
            </div>
            <div className="context-menu-divider" />
            <button onClick={() => handleDuplicateTrack(contextMenu.trackId)}>
              📋 Duplicate
            </button>
            <button onClick={() => handleClearClips(contextMenu.trackId)}>
              🗑️ Clear Clips
            </button>
            <div className="context-menu-divider" />
            <button className="danger" onClick={() => handleDeleteTrack(contextMenu.trackId)}>
              ❌ Delete Track
            </button>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div className="modal-overlay" onClick={() => setRenameModal(null)}>
          <div className="modal rename-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename Track</h3>
              <button className="modal-close" onClick={() => setRenameModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-content">
              <input
                type="text"
                className="rename-input"
                value={renameModal.name}
                onChange={e => setRenameModal({ ...renameModal, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && confirmRename()}
                autoFocus
                placeholder="Track name..."
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setRenameModal(null)}>Cancel</button>
                <button className="btn-primary" onClick={confirmRename}>Rename</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="logo">
            <Sparkles size={20} className="logo-icon" />
            <span className="logo-text">Drey</span>
          </div>
          <div className="project-name">{activeProject?.name || 'Untitled'}</div>
          <div className="history-controls">
            <button
              className={`history-btn ${!canUndo ? 'disabled' : ''}`}
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              className={`history-btn ${!canRedo ? 'disabled' : ''}`}
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 size={16} />
            </button>
          </div>
          <div className="grid-controls">
            <select
              className="grid-select"
              value={gridDivision}
              onChange={(e) => setGridDivision(Number(e.target.value))}
              title="Grid Division"
            >
              <option value={1}>1/1</option>
              <option value={2}>1/2</option>
              <option value={4}>1/4</option>
              <option value={8}>1/8</option>
              <option value={16}>1/16</option>
            </select>
          </div>
        </div>
        <div className="transport">
          <button className="transport-btn" onClick={() => setCurrentTime(0)}><SkipBack size={16} /></button>
          <button className="transport-btn play" onClick={handleTogglePlay}>
            {isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="transport-btn record"><Circle size={16} /></button>
          <div className="time-display"><TimeDisplay /></div>
          <div className="tempo-display">
            <span className="tempo-value">128</span>
            <span className="tempo-label">BPM</span>
          </div>
          <div className="signature">4/4</div>
        </div>
        <div className="toolbar-right">
          <ThemeToggle />
          <button className="action-btn" onClick={() => setShowSettings(true)}><Settings size={18} /></button>
          <button className="action-btn"><Share2 size={18} /></button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Wingman Panel */}
        <WingmanPanel
          project={activeProject}
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          onExecuteActions={executeWingmanActions}
        />


        {/* Timeline */}
        <main className="timeline-section">
          {/* Click ruler to seek playhead */}
          <div
            className="timeline-ruler"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const headerWidth = 170;
              if (x > headerWidth) {
                const pixels = x - headerWidth;
                const beat = pixels / PIXELS_PER_BEAT;
                const time = beat * (60 / (activeProject?.tempo || 120));
                setCurrentTime(time);
                // If playing, we should restart transport at new time - but simplest is just update state for now
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="ruler-track-space"></div>
            {Array.from({ length: 17 }, (_, i) => (
              <div key={i} className="ruler-mark" style={{ width: PIXELS_PER_BEAT }}><span>{i + 1}</span></div>
            ))}
          </div>
          <div className="track-lanes">
            {/* Grid lines overlay */}
            <div className="grid-lines" style={{ left: '170px' }}>
              {Array.from({ length: 17 * gridDivision }, (_, i) => (
                <div
                  key={i}
                  className={`grid-line ${i % gridDivision === 0 ? 'major' : 'minor'}`}
                  style={{ left: `${(i / gridDivision) * PIXELS_PER_BEAT}px` }}
                />
              ))}
            </div>
            {tracks.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                isSelected={selectedTrackId === track.id}
                isGreyedOut={tracks.some(t => t.soloed) && !track.soloed}
                isDragging={draggedTrackId === track.id}
                isDropTarget={dropTargetId === track.id}
                isPlaying={isPlaying}
                pixelsPerBeat={PIXELS_PER_BEAT}
                onSelect={handleSelectTrack}
                onDoubleClick={handleTrackDoubleClick}
                onContextMenu={handleTrackContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onMute={handleTrackMute}
                onSolo={handleTrackSolo}
                onVolumeChange={handleTrackVolumeChange}
                onPanChange={handleTrackPanChange}
              />
            ))}
            {/* Empty State / Add Track Area */}
            <div
              className="empty-track-area"
              onClick={() => setShowAddTrackModal(true)}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowAddTrackModal(true);
              }}
            >
              <div className="empty-state-content">
                <Plus size={24} />
                <span>Add New Track</span>
                <small>Click or drop samples here</small>
              </div>
            </div>

            {/* Playhead - uses animated playbackBeat for smooth movement */}
            {/* Playhead - uses animated playbackBeat for smooth movement */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 171, zIndex: 10, pointerEvents: 'none' }}>
              <MasterPlayhead pixelsPerBeat={PIXELS_PER_BEAT} height={900} scrollLeft={0} />
            </div>
          </div>
        </main>

        {/* Synth Editor Panel (sidebar) */}
        {showSynthEditor && (
          <aside style={{ width: 360, padding: 12 }}>
            <SynthEditorPanel presetName={selectedTrack?.instrument ?? ''} />
          </aside>
        )}


        {/* Browser */}
        <aside className="sample-browser">
          <div className="browser-header">
            <Folder size={16} />
            <span>Sounds</span>
            <span className="sound-count">300+</span>
          </div>
          <div className="browser-hint">Double-click to apply to track</div>
          <div className="browser-categories">
            {(Object.entries(SOUND_LIBRARY) as [SoundCategory, SubcategoryData][]).map(([category, data]) => {
              const isNested = !Array.isArray(data);
              const allSounds = isNested ? Object.values(data).flat() : data;
              const totalCount = allSounds.length;

              return (
                <div key={category} className="category">
                  <button className="category-header" onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}>
                    {expandedCategory === category ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{category}</span>
                    <span className="count">{totalCount}</span>
                  </button>
                  {expandedCategory === category && (
                    <div className="sounds-list">
                      {isNested ? (
                        // Render subcategories
                        Object.entries(data as { [key: string]: string[] }).map(([subcategory, sounds]) => (
                          <div key={subcategory} className="subcategory">
                            <div className="subcategory-header" style={{
                              padding: '4px 8px',
                              fontSize: '0.7rem',
                              color: '#888',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              marginTop: '4px'
                            }}>
                              {subcategory}
                            </div>
                            {sounds.map(sound => (
                              <div
                                key={sound}
                                className="sound-item"
                                draggable
                                onClick={() => playPreviewSound(category, sound)}
                                onDoubleClick={() => handleSoundDoubleClick(category, sound)}
                              >
                                <Volume2 size={12} />
                                <span>{sound}</span>
                              </div>
                            ))}
                          </div>
                        ))
                      ) : (
                        // Render flat list
                        (data as string[]).map(sound => (
                          <div
                            key={sound}
                            className="sound-item"
                            draggable
                            onClick={() => playPreviewSound(category, sound)}
                            onDoubleClick={() => handleSoundDoubleClick(category, sound)}
                          >
                            <Volume2 size={12} />
                            <span>{sound}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>


      </div>



      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {conversionModal && (
        <AudioConversionModal
          audioFile={conversionModal.file}
          onClose={() => setConversionModal(null)}
          onConversionComplete={(notes) => handleConversionComplete(notes, conversionModal.targetTrackId)}
        />
      )}


      <style jsx>{`
        .daw-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-deep);
          color: var(--text-main);
          overflow: hidden;
          font-family: 'Inter', -apple-system, sans-serif;
        }

        /* Context Menu */
        .context-menu-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
        }
        .context-menu {
          position: fixed;
          background: #1a1a24;
          border: 1px solid #2a2a3a;
          border-radius: 8px;
          padding: 4px;
          min-width: 160px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 1001;
        }
        .context-menu button {
          display: block;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: #ccc;
          text-align: left;
          font-size: 0.75rem;
          cursor: pointer;
          border-radius: 4px;
        }
        .context-menu button:hover { background: rgba(88, 101, 242, 0.2); color: white; }
        .context-menu button.danger { color: #ed4245; }
        .context-menu button.danger:hover { background: rgba(237, 66, 69, 0.2); }
        .context-menu-divider { height: 1px; background: #2a2a3a; margin: 4px 0; }
        .context-menu-label { 
          font-size: 0.65rem; 
          color: #666; 
          padding: 4px 12px 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .color-picker-row {
          display: flex;
          gap: 4px;
          padding: 6px 12px;
          flex-wrap: wrap;
        }
        .color-swatch {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .color-swatch:hover { transform: scale(1.15); border-color: white; }

        /* Drag states */
        .track-lane.dragging { opacity: 0.5; background: rgba(88, 101, 242, 0.1); }
        .track-lane.drop-target { 
          border-top: 2px solid #5865f2; 
          background: rgba(88, 101, 242, 0.08);
        }

        /* Rename modal */
        .rename-modal { max-width: 320px; }
        .rename-input {
          width: 100%;
          padding: 10px 12px;
          background: #0a0a10;
          border: 1px solid #2a2a3a;
          border-radius: 6px;
          color: white;
          font-size: 0.875rem;
          outline: none;
          margin-bottom: 12px;
        }
        .rename-input:focus { border-color: #5865f2; }
        .modal-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .btn-secondary {
          padding: 8px 16px;
          background: #2a2a3a;
          border: none;
          border-radius: 6px;
          color: #ccc;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .btn-secondary:hover { background: #3a3a4a; color: white; }
        .btn-primary {
          padding: 8px 16px;
          background: #5865f2;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .btn-primary:hover { background: #4752c4; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: #12121a;
          border: 1px solid #2a2a3a;
          border-radius: 12px;
          width: 400px;
          max-width: 90vw;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid #2a2a3a;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .modal-close {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 4px;
        }
        .modal-close:hover { color: white; }
        .modal-content {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .track-type-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.25rem;
          background: #1a1a24;
          border: 1px solid #2a2a3a;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        .track-type-btn:hover {
          background: #2a2a3a;
          border-color: #5865f2;
        }
        .track-type-btn span {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .track-type-btn small {
          color: #666;
          font-size: 0.7rem;
        }

        /* Toolbar */
        .toolbar {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--theme-border);
        }
        .toolbar-left { display: flex; align-items: center; gap: 1rem; }
        .logo { display: flex; align-items: center; gap: 0.5rem; }
        .logo-icon { color: #5865f2; }
        .logo-text {
          font-weight: 800;
          font-size: 1.2rem;
          background: linear-gradient(135deg, #5865f2, #eb459e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .project-name { font-size: 0.8rem; color: #666; }
        .history-controls { display: flex; gap: 2px; margin-left: 0.5rem; }
        .history-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: var(--border-subtle);
          border: 1px solid var(--border-bright);
          border-radius: 4px;
          color: var(--text-dim);
          cursor: pointer;
          transition: all 0.15s;
        }
        .history-btn:hover:not(.disabled) { background: var(--border-bright); color: var(--text-bright); border-color: var(--accent-primary); }
        .history-btn.disabled { opacity: 0.3; cursor: not-allowed; }
        .grid-controls { margin-left: 0.25rem; }
        .grid-select {
          background: var(--border-subtle);
          border: 1px solid var(--border-bright);
          border-radius: 4px;
          color: var(--text-dim);
          padding: 4px 8px;
          font-size: 0.7rem;
          cursor: pointer;
          outline: none;
        }
        .grid-select:hover { border-color: var(--accent-primary); color: var(--text-bright); }
        .grid-select:focus { border-color: var(--accent-primary); }
        .grid-lines {
          position: absolute;
          top: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 1;
        }
        .grid-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
        }
        .grid-line.major { background: rgba(255, 255, 255, 0.08); }
        .grid-line.minor { background: rgba(255, 255, 255, 0.03); }
        .transport {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: var(--bg-deep);
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
        }
        .transport-btn {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-dim);
          border-radius: 4px;
          cursor: pointer;
        }
        .transport-btn:hover { background: var(--border-subtle); color: var(--text-bright); }
        .transport-btn.play { background: linear-gradient(135deg, #5865f2, #4752c4); color: white; }
        .transport-btn.record:hover { color: #ff4d4d; }
        .time-display, .tempo-display, .signature {
          background: var(--bg-deep);
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          margin-left: 0.5rem;
          font-size: 0.75rem;
        }
        .time { color: #5865f2; font-family: monospace; }
        .tempo-value { color: #eb459e; font-weight: 700; }
        .tempo-label { color: #444; font-size: 0.5rem; margin-left: 2px; }
        .signature { color: #444; }
        .toolbar-right { display: flex; gap: 0.25rem; }
        .action-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-dim);
          border-radius: 4px;
          cursor: pointer;
        }
        .action-btn:hover { background: var(--border-subtle); color: var(--text-bright); }

        /* Main Content */
        .main-content { flex: 1; display: flex; overflow: hidden; }



        /* Browser */
        .sample-browser {
          width: 180px;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
        }
        .browser-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.75rem;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-dim);
          border-bottom: 1px solid var(--border-subtle);
        }
        .sound-count {
          margin-left: auto;
          background: #5865f2;
          color: white;
          padding: 0.1rem 0.4rem;
          border-radius: 8px;
          font-size: 0.5rem;
        }
        .browser-hint {
          padding: 0.25rem 0.75rem;
          font-size: 0.5rem;
          color: #444;
          font-style: italic;
        }
        .browser-categories { flex: 1; overflow-y: auto; padding: 0.4rem; }
        .category-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem;
          background: transparent;
          border: none;
          color: #888;
          font-size: 0.7rem;
          cursor: pointer;
          border-radius: 4px;
        }
        .category-header:hover { background: #1a1a24; color: white; }
        .category-header .count { margin-left: auto; color: #444; font-size: 0.55rem; }
        .sounds-list { padding-left: 0.75rem; }
        .sound-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.4rem;
          font-size: 0.6rem;
          color: #555;
          cursor: pointer;
          border-radius: 3px;
        }
        .sound-item:hover { background: rgba(88, 101, 242, 0.1); color: #5865f2; }

        /* Timeline */
        .timeline-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-deep);
          overflow: hidden;
        }
        .timeline-ruler {
          height: 24px;
          display: flex;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
        }
        .ruler-track-space { width: 170px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); }
        .ruler-mark {
          display: flex;
          align-items: center;
          padding-left: 4px;
          font-size: 0.5rem;
          color: var(--text-dim);
          border-left: 1px solid var(--border-subtle);
        }
        .track-lanes { 
          flex: 1; 
          overflow-y: auto; 
          position: relative; 
          display: flex;
          flex-direction: column;
        }
        .empty-track-area {
            flex: 1;
            min-height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-top: 1px dashed #1a1a24;
            margin-top: 2px;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.5;
        }
        .empty-track-area:hover {
            background: rgba(88, 101, 242, 0.05);
            opacity: 1;
        }
        .empty-state-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: #444;
        }
        .empty-track-area:hover .empty-state-content {
            color: #5865f2;
        }
        .empty-state-content small {
            font-size: 0.7rem;
            color: #444;
        }
        .track-lane {
          display: flex;
          height: 80px;
          flex-shrink: 0;
          border-bottom: 1px solid #0c0c12;
          cursor: pointer;
          transition: background 0.15s;
        }
        .track-lane:hover { background: rgba(255, 255, 255, 0.02); }
        .track-lane.selected { background: rgba(88, 101, 242, 0.08); }
        .track-lane.muted { opacity: 0.4; }
        .track-lane.greyed { opacity: 0.35; filter: saturate(0.3); }
        .track-header {
          width: 170px;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0 0.6rem;
          background: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .track-color { width: 3px; height: 32px; border-radius: 2px; }
        .track-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; overflow: hidden; }
        .track-name { display: block; font-size: 0.7rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .track-instrument { display: block; font-size: 0.5rem; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .track-controls { display: flex; gap: 0.2rem; }
        .track-btn {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--border-subtle);
          border: none;
          color: var(--text-dim);
          font-size: 0.5rem;
          font-weight: 700;
          border-radius: 3px;
          cursor: pointer;
        }
        .track-btn:hover { color: white; }
        .track-btn.active { background: #ff4d4d; color: white; }
        .track-btn.active.solo { background: #fee75c; color: #000; }
        .volume-meter-container {
          position: relative;
          width: 60px;
          height: 10px;
        }
        .volume-meter-bg {
          position: absolute;
          top: 3px;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--border-subtle);
          border-radius: 2px;
          overflow: hidden;
        }
        .volume-meter-fill {
          height: 100%;
          background: linear-gradient(90deg, #57f287, #fee75c, #ed4245);
          opacity: 0.6;
          transition: width 0.1s;
        }
        .mini-vol {
          -webkit-appearance: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 60px;
          height: 10px;
          background: transparent;
          outline: none;
          cursor: pointer;
        }
        .mini-vol::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 6px;
          height: 10px;
          border-radius: 2px;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .mini-vol::-webkit-slider-thumb:hover { background: #5865f2; }
        .track-content { flex: 1; position: relative; }
        .clip {
          position: absolute;
          top: 6px;
          bottom: 6px;
          border-radius: 4px;
          border-left: 3px solid;
          cursor: pointer;
        }
        .clip:hover { filter: brightness(1.15); }
        .clip-name { position: absolute; top: 3px; left: 6px; font-size: 0.5rem; color: rgba(255, 255, 255, 0.8); font-weight: 600; z-index: 1; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .clip-notes, .clip-waveform { 
          position: absolute; 
          top: 14px; 
          left: 3px; 
          right: 3px; 
          bottom: 3px; 
          width: calc(100% - 6px);
          height: calc(100% - 17px);
          overflow: hidden;
        }


        /* Mixer */
        .mixer {
          height: 180px;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
        }
        .mixer-header {
          padding: 0.3rem 1rem;
          font-size: 0.55rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-dim);
          letter-spacing: 1px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .mixer-channels {
          display: flex;
          gap: 2px;
          padding: 0.5rem;
          height: calc(100% - 24px);
          overflow-x: auto;
        }
        .channel {
          width: 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.4rem;
          background: var(--bg-deep);
          border-radius: 4px;
          border: 1px solid var(--border-subtle);
          flex-shrink: 0;
          cursor: pointer;
        }
        .channel:hover { border-color: #2a2a34; }
        .channel.muted { opacity: 0.4; }
        .channel.soloed { border-color: #fee75c; }
        .channel.selected { border-color: #5865f2; background: rgba(88, 101, 242, 0.05); }
        .channel.master {
          width: 72px;
          background: linear-gradient(180deg, rgba(88, 101, 242, 0.08) 0%, #0a0a10 100%);
          border-color: rgba(88, 101, 242, 0.3);
        }
        .channel-label {
          font-size: 0.5rem;
          font-weight: 600;
          margin-bottom: 0.3rem;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }
        .master-label { color: #5865f2 !important; }
        .channel-main { display: flex; gap: 3px; flex: 1; width: 100%; }
        .meter-container { display: flex; gap: 2px; }
        .master-meters { gap: 3px; }
        .meter {
          width: 5px;
          height: 100%;
          background: var(--bg-deep);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }
        .master-meter { width: 8px; }
        .meter-fill {
          position: absolute;
          bottom: 0;
          width: 100%;
          background: linear-gradient(to top, #57f287 0%, #57f287 55%, #fee75c 75%, #ff6b6b 90%, #ff4d4d 100%);
          border-radius: 2px;
        }
        .master-fill { background: linear-gradient(to top, #5865f2 0%, #5865f2 55%, #eb459e 75%, #ff6b6b 90%, #ff4d4d 100%); }
        .fader-container { flex: 1; display: flex; justify-content: center; }
        .fader-track {
          width: 6px;
          height: 100%;
          background: var(--border-subtle);
          border-radius: 3px;
          position: relative;
        }
        .master-fader-track { width: 10px; }
        .fader-fill {
          position: absolute;
          bottom: 0;
          width: 100%;
          background: linear-gradient(to top, #3a3a4a 0%, #5a5a6a 100%);
          border-radius: 3px;
        }
        .master-fader-fill { background: linear-gradient(to top, #4752c4 0%, #5865f2 100%); }
        .fader {
          position: absolute;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          -webkit-appearance: slider-vertical;
          writing-mode: bt-lr;
        }
        .channel-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.25rem;
        }
        .pan-knob {
          width: 18px;
          height: 18px;
          background: #1a1a24;
          border-radius: 50%;
          position: relative;
          border: 1px solid #2a2a34;
        }
        .knob {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 7px;
          background: #5865f2;
          transform-origin: bottom center;
          margin-left: -1px;
          margin-top: -7px;
          border-radius: 1px;
        }
        .channel-buttons { display: flex; gap: 0.15rem; }
        .ch-btn {
          width: 16px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #1a1a24;
          border: none;
          color: #444;
          font-size: 0.45rem;
          font-weight: 700;
          border-radius: 2px;
          cursor: pointer;
        }
        .ch-btn:hover { color: white; }
        .ch-btn.m.active { background: #ff4d4d; color: white; }
        .ch-btn.s.active { background: #fee75c; color: #000; }
      `}</style>
    </div>
  );
}
