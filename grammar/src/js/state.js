// Persists the learner state in localStorage. When storage is blocked the
// state lives in memory for this visit only.
import { defaultState, normalizeState, migrateLegacy, LEGACY_KEYS } from './engine/migrate.js';

export const STATE_KEY = 'gi-state-v1';
export const LANG_KEY = 'gi-lang';
export const THEME_KEY = 'gi-theme';

export function safeGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); return true; } catch { return false; }
}

export function createStore(ctx, { storage = globalThis.localStorage, day }) {
  let available = true;
  let migrated = false;
  let state;
  try {
    const saved = storage.getItem(STATE_KEY);
    if (saved) state = normalizeState(JSON.parse(saved), ctx, day);
    else {
      const legacy = storage.getItem(LEGACY_KEYS.state);
      if (legacy) {
        state = migrateLegacy(JSON.parse(legacy), ctx, day);
        migrated = true;
        const lang = storage.getItem(LEGACY_KEYS.lang);
        const theme = storage.getItem(LEGACY_KEYS.theme);
        if (lang && !storage.getItem(LANG_KEY)) storage.setItem(LANG_KEY, lang);
        if (theme && !storage.getItem(THEME_KEY)) storage.setItem(THEME_KEY, theme);
      }
    }
  } catch {
    available = false;
  }
  state ||= normalizeState(defaultState(day), ctx, day);

  const listeners = new Set();
  let timer = 0;
  const write = () => {
    clearTimeout(timer);
    timer = 0;
    try {
      storage.setItem(STATE_KEY, JSON.stringify(state));
      available = true;
    } catch {
      available = false;
    }
  };
  if (migrated) write();

  return {
    get state() { return state; },
    get available() { return available; },
    get migrated() { return migrated; },
    save() {
      clearTimeout(timer);
      timer = setTimeout(write, 150);
    },
    flush() {
      if (timer) write();
    },
    update(fn) {
      const result = fn(state);
      this.save();
      for (const listener of listeners) listener(state);
      return result;
    },
    replace(next) {
      state = next;
      write();
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
