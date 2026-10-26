import { useState, useEffect, useCallback } from 'react';

// Version bumped to v3 due to simulation engine & scenario state additions
const STORAGE_VERSION = 'v3';

export function getStorageKey(key: string): string {
  return `bharat_apex_${key}_${STORAGE_VERSION}`;
}

export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const fullKey = getStorageKey(key);
    const item = localStorage.getItem(fullKey);
    if (!item) return defaultValue;

    const parsed = JSON.parse(item);
    if (parsed && typeof parsed === 'object' && '_version' in parsed) {
      if (parsed._version === STORAGE_VERSION) {
        const saved = parsed.data;
        // Merge saved state with defaults when both are non-null objects
        if (
          defaultValue !== null &&
          typeof defaultValue === 'object' &&
          !Array.isArray(defaultValue) &&
          saved !== null &&
          typeof saved === 'object' &&
          !Array.isArray(saved)
        ) {
          return {
            ...defaultValue,
            ...saved,
          } as T;
        }
        return saved as T;
      }
    }
    return defaultValue;
  } catch (error) {
    console.warn(`[usePersistentState] Error loading key "${key}" from localStorage:`, error);
    return defaultValue;
  }
}

export function saveToLocalStorage<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const fullKey = getStorageKey(key);
    const payload = {
      _version: STORAGE_VERSION,
      timestamp: Date.now(),
      data: value,
    };
    localStorage.setItem(fullKey, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn(`[usePersistentState] Error saving key "${key}" to localStorage:`, error);
    return false;
  }
}

// Throttle map for localStorage saves (max once per second)
const throttleTimers = new Map<string, any>();
const pendingSaveData = new Map<string, any>();

export function saveToLocalStorageThrottled<T>(key: string, value: T, throttleMs = 1000): void {
  if (typeof window === 'undefined') return;

  pendingSaveData.set(key, value);

  if (!throttleTimers.has(key)) {
    const timer = setTimeout(() => {
      const dataToSave = pendingSaveData.get(key);
      pendingSaveData.delete(key);
      throttleTimers.delete(key);
      if (dataToSave !== undefined) {
        saveToLocalStorage(key, dataToSave);
      }
    }, throttleMs);
    throttleTimers.set(key, timer);
  }
}

export function removeFromLocalStorage(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    const fullKey = getStorageKey(key);
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.warn(`[usePersistentState] Error removing key "${key}" from localStorage:`, error);
  }
}

/**
 * Custom hook for state persisted to localStorage with try/catch, throttling, and versioning.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (val: T | ((prev: T) => T)) => void, () => void] {
  const [state, setState] = useState<T>(() => {
    const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    return loadFromLocalStorage<T>(key, fallback);
  });

  const setPersistentState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const nextValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        saveToLocalStorageThrottled(key, nextValue, 1000);
        return nextValue;
      });
    },
    [key]
  );

  const resetState = useCallback(() => {
    const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    removeFromLocalStorage(key);
    setState(fallback);
  }, [key, initialValue]);

  // Sync if another tab or window updates localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === getStorageKey(key) && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed._version === STORAGE_VERSION) {
            setState(parsed.data);
          }
        } catch {
          // Ignore parse errors from concurrent storage events
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key]);

  return [state, setPersistentState, resetState];
}
