'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';

const THEME_KEY = 'minijira-theme';

const applyTheme = (theme) => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
};

export default function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        const stored = localStorage.getItem(THEME_KEY);
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = stored || (systemDark ? 'dark' : 'light');

        setTheme(initialTheme);
        applyTheme(initialTheme);
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.setItem(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
    };

    if (!mounted) return null;

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="fixed bottom-5 right-5 z-50 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow-lg shadow-black/10 backdrop-blur transition hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
    );
}