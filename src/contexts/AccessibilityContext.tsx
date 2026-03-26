import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface AccessibilityState {
  rovingTabindex: boolean;
  toggleRovingTabindex: () => void;
  reduceMotion: boolean;
}

const STORAGE_KEY = 'be-a11y-prefs';

interface StoredPrefs {
  rovingTabindex: boolean;
}

function readStored(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    if (typeof parsed.rovingTabindex === 'boolean') {
      return { rovingTabindex: parsed.rovingTabindex };
    }
  } catch {
    // ignore corrupt data
  }
  return null;
}

function writeStored(prefs: StoredPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage full or unavailable — silently degrade
  }
}

const AccessibilityContext = createContext<AccessibilityState | undefined>(undefined);

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [rovingTabindex, setRovingTabindex] = useState<boolean>(() => {
    const stored = readStored();
    return stored ? stored.rovingTabindex : true; // default ON
  });

  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // Listen for OS-level reduce-motion changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Persist roving tabindex preference
  useEffect(() => {
    writeStored({ rovingTabindex });
  }, [rovingTabindex]);

  const toggleRovingTabindex = useCallback(() => {
    setRovingTabindex((prev) => !prev);
  }, []);

  const value: AccessibilityState = {
    rovingTabindex,
    toggleRovingTabindex,
    reduceMotion,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export function useAccessibility(): AccessibilityState {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error(
      'useAccessibility must be used within an AccessibilityProvider. ' +
        'Wrap your component tree with <AccessibilityProvider> in main.tsx.',
    );
  }
  return ctx;
}
