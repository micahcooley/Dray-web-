'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadCustomPresets } from '../lib/presets/synthPresets';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Compute initial theme from localStorage during state initialization
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('drey-theme') as Theme;
            return saved || 'dark';
        }
        return 'dark';
    });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // load any custom synth presets saved by the user
        try { if (typeof window !== 'undefined') loadCustomPresets(); } catch (e) { console.warn('Failed to load custom presets', e); }
        
        // Set the theme attribute on document
        document.documentElement.setAttribute('data-theme', theme);
        setMounted(true);
    }, [theme]);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('drey-theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    if (!mounted) {
        // Render children with default theme (dark) to allow hydration
        // Use visibility hidden or just render? Just render is fine as CSS handles it.
        // The key to avoiding flash is that initial HTML + CSS = Dark.
        return <>{children}</>;
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
