import { useState, useCallback, useEffect, useRef } from 'react';

// Global map: key → Set of setState functions listening to that key
const listeners = {};

function notify(key) {
  if (listeners[key]) {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    listeners[key].forEach(fn => fn(value));
  }
}

export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (typeof window === 'undefined') return initialValue;
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed = JSON.parse(item);
      if (key === 'save-user' && (!parsed.email || !parsed.id)) {
        window.localStorage.removeItem(key);
        return initialValue;
      }
      if (key.startsWith('save-bags') && !Array.isArray(parsed)) {
        window.localStorage.removeItem(key);
        return initialValue;
      }
      return parsed;
    } catch {
      return initialValue;
    }
  });

  // Register this component as a listener for this key
  useEffect(() => {
    if (!listeners[key]) listeners[key] = new Set();
    const handler = (val) => setStoredValue(val ?? initialValue);
    listeners[key].add(handler);
    return () => listeners[key].delete(handler);
  }, [key, initialValue]);

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      // Notify all other components watching this key in the same tab
      notify(key);
    } catch (e) {
      console.error(`useLocalStorage setValue error [${key}]:`, e);
    }
  }, [key, storedValue]);

  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      window.localStorage.removeItem(key);
      notify(key);
    } catch (e) {
      console.error(`useLocalStorage removeValue error [${key}]:`, e);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
};

/**
 * writeLocalStorage — writes directly to localStorage AND notifies
 * all useLocalStorage hooks watching the same key.
 * Use this instead of localStorage.setItem so React state stays in sync.
 */
export const writeLocalStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notify(key);
  } catch (e) {
    console.error(`writeLocalStorage error [${key}]:`, e);
  }
};

export const readLocalStorage = (key, fallback = null) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
