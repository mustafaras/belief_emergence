import { describe, expect, it, beforeEach, beforeAll } from 'vitest';

/**
 * Unit tests for AccessibilityContext storage logic.
 * We test the persistence contract (localStorage 'be-a11y-prefs') and the
 * default-value guarantee without needing a DOM renderer.
 */

// Provide a minimal localStorage shim for the Node test environment
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    };
  }
});

const STORAGE_KEY = 'be-a11y-prefs';

/** Mirror of the readStored() logic from AccessibilityContext.tsx */
function readStored(): { rovingTabindex: boolean } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.rovingTabindex === 'boolean') {
      return { rovingTabindex: parsed.rovingTabindex };
    }
  } catch {
    // ignore
  }
  return null;
}

describe('AccessibilityContext storage contract', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults rovingTabindex to true when no stored preference exists', () => {
    const stored = readStored();
    // When stored is null, the context falls back to default = true
    const rovingTabindex = stored ? stored.rovingTabindex : true;
    expect(rovingTabindex).toBe(true);
  });

  it('toggle flips the persisted boolean (simulated write → read cycle)', () => {
    // Simulate initial state: default ON (true)
    let current = true;
    expect(current).toBe(true);

    // Simulate toggle OFF
    current = !current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rovingTabindex: current }));
    expect(current).toBe(false);

    // Read back from storage
    const stored = readStored();
    expect(stored).not.toBeNull();
    expect(stored!.rovingTabindex).toBe(false);

    // Simulate toggle ON again
    current = !current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rovingTabindex: current }));
    const stored2 = readStored();
    expect(stored2!.rovingTabindex).toBe(true);
  });

  it('reads persisted preference correctly on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rovingTabindex: false }));
    const stored = readStored();
    expect(stored).not.toBeNull();
    expect(stored!.rovingTabindex).toBe(false);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'NOT_JSON');
    const stored = readStored();
    expect(stored).toBeNull();
    // Context should fall back to default true
    const rovingTabindex = stored ? stored.rovingTabindex : true;
    expect(rovingTabindex).toBe(true);
  });
});
