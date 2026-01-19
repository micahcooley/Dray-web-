'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
// Note: tone engines are imported dynamically to avoid creating AudioContext on module load

import {
  Music, Drum, FileAudio, Plus, X
} from 'lucide-react';
import { useHistory } from '../../hooks/useHistory';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../lib/audioEngine';
import { grokService } from '../../lib/grokService';
import PianoRoll, { Note } from '../../components/daw/PianoRoll';
import AudioEditor from '../../components/daw/AudioEditor';
import SettingsModal from '../../components/daw/SettingsModal';
import WingmanPanel from '../../components/daw/WingmanPanel';
import SynthEditorPanel from '../../components/daw/SynthEditorPanel';
import { getProjectContext, parseWingmanResponse } from '../../lib/wingmanBridge';
import { stemSeparator } from '../../lib/stemSeparator';
import AudioConversionModal from '../../components/daw/AudioConversionModal';
import { PatternGenerators } from '../../lib/patternGenerators';
import type { Track, Clip, MidiNote, TrackType } from '../../lib/types';
import { SOUND_TYPE_MAP } from '../../lib/types';
import Timeline from '../../components/daw/Timeline';
import TrackList from '../../components/daw/TrackList';
import Mixer from '../../components/daw/Mixer';
import Toolbar from '../../components/daw/Toolbar';
import { SOUND_LIBRARY, type SoundCategoryType as SoundCategory } from '../../lib/constants';
import { Folder, ChevronDown, ChevronRight, Volume2 } from 'lucide-react';

// UI Type for casting the readonly constant
export type SubcategoryData = { readonly [subcategory: string]: readonly string[] } | readonly string[];

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

// Track colors by type
const TRACK_COLORS = ['#eb459e', '#5865f2', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#3498db', '#1abc9c'];

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
  const [masterVolume, setMasterVolume] = useState(0.85); // Normalized 0-1
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

  const handleTrackVolumeChange = (trackId: number, volume: number) => {
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, volume, meterL: volume * 85, meterR: volume * 80 } : t
    ));
  };

  const handleTrackMute = (trackId: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t));
  };

  const handleTrackSolo = (trackId: number, shiftKey: boolean = false) => {
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
  };

  const handleSelectTrack = (trackId: number) => {
    setSelectedTrackId(trackId);
  };

  // Context menu handlers
  const handleTrackContextMenu = (e: React.MouseEvent, trackId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  };

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

  const handleDragStart = (e: React.DragEvent, trackId: number) => {

    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, trackId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTrackId !== null && draggedTrackId !== trackId) {
      setDropTargetId(trackId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTrackId: number) => {
    e.preventDefault();
    setDropTargetId(null);

    // Check if files were dropped (audio file for conversion)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const targetTrack = tracks.find(t => t.id === targetTrackId);

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
  };

  const handleDragEnd = () => setDraggedTrackId(null);

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
      <Toolbar />

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
          <Timeline
            pixelsPerBeat={PIXELS_PER_BEAT}
            tempo={activeProject?.tempo || 120}
            onSetTime={(time) => {
              setCurrentTime(time);
            }}
          />
          <TrackList
            tracks={tracks}
            gridDivision={gridDivision}
            pixelsPerBeat={PIXELS_PER_BEAT}
            isPlaying={isPlaying}
            selectedTrackId={selectedTrackId}
            draggedTrackId={draggedTrackId}
            dropTargetId={dropTargetId}
            onSelectTrack={handleSelectTrack}
            onEditTrack={(id) => setEditingTrackId(id)}
            onContextMenu={handleTrackContextMenu}
            onMuteTrack={handleTrackMute}
            onSoloTrack={handleTrackSolo}
            onVolumeChange={handleTrackVolumeChange}
            onPanChange={(id, pan) => setTracks(prev => prev.map(t => t.id === id ? { ...t, pan } : t))}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onAddTrackClick={() => setShowAddTrackModal(true)}
            onAddTrackContextMenu={(e) => {
              e.preventDefault();
              setShowAddTrackModal(true);
            }}
          />
          <Mixer
            tracks={tracks}
            masterVolume={masterVolume}
            onMasterVolumeChange={(val) => setMasterVolume(val)}
            onTrackVolumeChange={handleTrackVolumeChange}
            onTrackPanChange={(id, val) => setTracks(prev => prev.map(t => t.id === id ? { ...t, pan: val } : t))}
            onTrackMute={handleTrackMute}
            onTrackSolo={handleTrackSolo}
            isPlaying={isPlaying}
          />
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
      `}</style>
    </div>
  );
}
