'use client';

import React, { useState, useEffect } from 'react';
import { X, Speaker, Mic, Keyboard, Monitor, User, Volume2, Activity } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'audio' | 'midi' | 'interface' | 'account';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('audio');
    const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
    const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
    const [selectedOutput, setSelectedOutput] = useState<string>('default');
    const [audioState, setAudioState] = useState<string>('suspended');
    const [latencyHint, setLatencyHint] = useState<'interactive' | 'balanced' | 'playback'>('playback');
    const [lookAhead, setLookAhead] = useState(0.1);
    const [meterLevel, setMeterLevel] = useState(0);

    // Function to load audio devices
    const loadDevices = async () => {
        try {
            const devices = await audioEngine.getAudioDevices();
            setOutputs(devices.filter(d => d.kind === 'audiooutput'));
            setInputs(devices.filter(d => d.kind === 'audioinput'));
        } catch (_e) {
            console.error("Failed to load devices", e);
        }
    };

    // Monitor audio levels for the meter
    useEffect(() => {
        let animationFrame: number;
        const updateMeter = () => {
            if (!isOpen) return;

            try {
                // Show visual activity feedback based on audio state
                if (audioEngine.getState() === 'running') {
                    const time = Date.now() / 100;
                    setMeterLevel(Math.abs(Math.sin(time)) * 80);
                } else {
                    setMeterLevel(0);
                }
            } catch (_e) {
                setMeterLevel(0);
            }
            animationFrame = requestAnimationFrame(updateMeter);
        };

        if (isOpen) {
            updateMeter();
            loadDevices();
            setAudioState(audioEngine.getState() || 'unknown');
        }

        const interval = setInterval(() => {
            setAudioState(audioEngine.getState() || 'unknown');
        }, 1000);

        return () => {
            cancelAnimationFrame(animationFrame);
            clearInterval(interval);
        };
    }, [isOpen]);

    const handleDeviceChange = async (deviceId: string) => {
        setSelectedOutput(deviceId);
        await audioEngine.setOutputDevice(deviceId);
    };

    const handleTestTone = () => {
        audioEngine.playTestTone();
    };

    const handleChangePerformance = (hint: 'interactive' | 'balanced' | 'playback', look: number) => {
        setLatencyHint(hint);
        setLookAhead(look);
        audioEngine.updatePerformanceSettings(hint, look);
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Sidebar */}
                <div className={styles.sidebar}>
                    <div className={styles.header}>
                        <h2>Settings</h2>
                    </div>

                    <button
                        className={`${styles.navItem} ${activeTab === 'audio' ? styles.active : ''}`}
                        onClick={() => setActiveTab('audio')}
                    >
                        <Speaker size={18} /> Audio
                    </button>
                    <button
                        className={`${styles.navItem} ${activeTab === 'midi' ? styles.active : ''}`}
                        onClick={() => setActiveTab('midi')}
                    >
                        <Keyboard size={18} /> MIDI
                    </button>
                    <button
                        className={`${styles.navItem} ${activeTab === 'interface' ? styles.active : ''}`}
                        onClick={() => setActiveTab('interface')}
                    >
                        <Monitor size={18} /> Interface
                    </button>
                    <button
                        className={`${styles.navItem} ${activeTab === 'account' ? styles.active : ''}`}
                        onClick={() => setActiveTab('account')}
                    >
                        <User size={18} /> Account
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {activeTab === 'audio' && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>Audio Settings</h2>

                            <div className={styles.settingGroup}>
                                <h3><Volume2 size={16} /> Output Device</h3>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Audio Output</span>
                                        <span className={styles.description}>Select where sound plays (Speakers/Headphones)</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                                        <select
                                            className={styles.select}
                                            value={selectedOutput}
                                            onChange={(e) => handleDeviceChange(e.target.value)}
                                            style={{ flex: 1, maxWidth: '250px' }}
                                        >
                                            <option value="default">Default System Output</option>
                                            {outputs.map(device => (
                                                <option key={device.deviceId} value={device.deviceId}>
                                                    {device.label || `Device ${device.deviceId.slice(0, 5)}...`}
                                                </option>
                                            ))}
                                        </select>
                                        {outputs.length > 0 && !outputs[0].label && (
                                            <button
                                                className={`${styles.btn} ${styles.btnPrimary}`}
                                                style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                                onClick={async () => {
                                                    await audioEngine.requestPermissions();
                                                    loadDevices();
                                                }}
                                            >
                                                Grant Access
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.meterContainer}>
                                    <div
                                        className={styles.meterBar}
                                        style={{ width: `${meterLevel}%`, opacity: audioState === 'running' ? 1 : 0.5 }}
                                    />
                                </div>

                                <div className={styles.row} style={{ marginTop: 20 }}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Troubleshoot</span>
                                        <span className={styles.description}>
                                            Status: <span style={{ color: audioState === 'running' ? '#57f287' : '#ed4245' }}>{audioState.toUpperCase()}</span>
                                        </span>
                                    </div>
                                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleTestTone}>
                                        Play Test Tone
                                    </button>
                                </div>
                            </div>

                            <div className={styles.settingGroup}>
                                <h3><Mic size={16} /> Input Device</h3>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Microphone</span>
                                        <span className={styles.description}>Select input for recording audio</span>
                                    </div>
                                    <select className={styles.select}>
                                        <option value="default">Default System Input</option>
                                        {inputs.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Device ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.settingGroup}>
                                <h3><Activity size={16} /> Advanced Performance</h3>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Latency Mode</span>
                                        <span className={styles.description}>
                                            Trade-off between responsiveness and stability
                                        </span>
                                    </div>
                                    <select
                                        className={styles.select}
                                        value={latencyHint}
                                        onChange={(e) => handleChangePerformance(e.target.value as any, lookAhead)}
                                    >
                                        <option value="interactive">Interactive (Fastest)</option>
                                        <option value="balanced">Balanced</option>
                                        <option value="playback">Playback (Most Stable)</option>
                                    </select>
                                </div>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Lookahead: {lookAhead}s</span>
                                        <span className={styles.description}>Audio buffer size (Higher = safer)</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.05"
                                        value={lookAhead}
                                        onChange={(e) => handleChangePerformance(latencyHint, parseFloat(e.target.value))}
                                        style={{ width: '200px' }}
                                    />
                                </div>
                            </div>


                        </div>
                    )}

                    {activeTab === 'interface' && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>Interface</h2>
                            <div className={styles.settingGroup}>
                                <h3>Theme</h3>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>Color Theme</span>
                                        <span className={styles.description}>Choose your vibe</span>
                                    </div>
                                    <select className={styles.select}>
                                        <option>Drey Dark (Default)</option>
                                        <option>Cyber Blue</option>
                                        <option>Midnight Purple</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'midi' && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>MIDI Configuration</h2>
                            <div className={styles.settingGroup}>
                                <div className={styles.row}>
                                    <div className={styles.label}>
                                        <span className={styles.labelText}>MIDI Inputs</span>
                                        <span className={styles.description}>Connect keyboards or controllers</span>
                                    </div>
                                    <div style={{ color: '#888', fontStyle: 'italic' }}>No devices detected</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
                    <X size={24} />
                </button>
            </div>
        </div>
    );
}
