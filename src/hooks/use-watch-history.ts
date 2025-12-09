'use client';

import { useState, useEffect, useCallback } from 'react';

export type HistoryItem = {
  id: number;
  tmdbId: string;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average: number;
  overview: string;
  season?: number;
  episode?: number;
  playedAt: number;
  progress?: number; // In seconds
  duration?: number; // In seconds
};

const HISTORY_KEY = 'flix_watch_history';
const EVENT_KEY = 'flix_history_update';

export function useWatchHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load history from storage
  const loadFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse watch history', e);
      }
    } else {
        setHistory([]);
    }
    setIsLoaded(true);
  }, []);

  // Listen for updates
  useEffect(() => {
    loadFromStorage();
    window.addEventListener(EVENT_KEY, loadFromStorage);
    window.addEventListener('storage', loadFromStorage);

    return () => {
      window.removeEventListener(EVENT_KEY, loadFromStorage);
      window.removeEventListener('storage', loadFromStorage);
    };
  }, [loadFromStorage]);

  // Save helper
  const saveAndNotify = useCallback((newHistory: HistoryItem[]) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
        setHistory(newHistory);
        window.dispatchEvent(new Event(EVENT_KEY));
    }
  }, []);

  // ADD TO HISTORY (Fixed to preserve progress)
  const addToHistory = useCallback((item: Omit<HistoryItem, 'playedAt'>) => {
    if (typeof window === 'undefined') return;
    
    const currentStored = localStorage.getItem(HISTORY_KEY);
    const currentHistory: HistoryItem[] = currentStored ? JSON.parse(currentStored) : [];

    // Check if this item already exists to preserve its progress
    const existingItem = currentHistory.find((i) => i.tmdbId === item.tmdbId);

    // Filter out the old entry so we can move the new one to the top
    const filtered = currentHistory.filter((i) => i.tmdbId !== item.tmdbId);
    
    let progress = 0;
    let duration = 0;

    // If it exists, verify if it's the exact same video (Movie OR Same Season/Episode)
    if (existingItem) {
        const isSameVideo = 
            item.media_type === 'movie' || 
            (existingItem.season === item.season && existingItem.episode === item.episode);
            
        if (isSameVideo) {
            // Preserve the progress!
            progress = existingItem.progress || 0;
            duration = existingItem.duration || 0;
            console.log(`Preserving progress for ${item.title}: ${progress}s`);
        }
    }
    
    const newItem: HistoryItem = {
      ...item,
      playedAt: Date.now(),
      progress, // Use the preserved progress (or 0 if new/different episode)
      duration
    };

    // Add to top of list, keep max 20 items
    const newHistory = [newItem, ...filtered].slice(0, 20);
    saveAndNotify(newHistory);
  }, [saveAndNotify]);

  // UPDATE PROGRESS
  const updateProgress = useCallback((tmdbId: string, progress: number, duration: number) => {
    if (typeof window === 'undefined') return;
    
    const currentStored = localStorage.getItem(HISTORY_KEY);
    const currentHistory: HistoryItem[] = currentStored ? JSON.parse(currentStored) : [];

    const index = currentHistory.findIndex((i) => i.tmdbId === tmdbId);
    if (index === -1) return;

    const currentItem = currentHistory[index];
    
    // Optimization: Only save if progress changed by > 5 seconds to avoid spamming storage
    if (currentItem.progress && Math.abs(currentItem.progress - progress) < 5) return;

    const newHistory = [...currentHistory];
    newHistory[index] = { ...newHistory[index], progress, duration, playedAt: Date.now() };
    
    saveAndNotify(newHistory);
  }, [saveAndNotify]);

  // REMOVE FROM HISTORY
  const removeFromHistory = useCallback((tmdbId: string) => {
    if (typeof window === 'undefined') return;
    
    const currentStored = localStorage.getItem(HISTORY_KEY);
    const currentHistory: HistoryItem[] = currentStored ? JSON.parse(currentStored) : [];
    
    const newHistory = currentHistory.filter((i) => i.tmdbId !== tmdbId);
    saveAndNotify(newHistory);
  }, [saveAndNotify]);

  return { history, addToHistory, updateProgress, removeFromHistory, isLoaded };
}