import { host } from '../bridge.js';

export const DEFAULT_SHORTCUTS = {
  explanation: { key: 'E', meta: true, shift: true },
  translation: { key: 'T', meta: true },
  highlight: { key: 'H', meta: true, shift: true },
  dark: { key: 'D', meta: true, shift: true },
  search: { key: 'F', meta: true },
  settings: { key: ',', meta: true },
};

export const DEFAULTS = {
  appearance: 'light',          // 'light' | 'dark'
  tibetanFont: 'Noto Serif Tibetan',
  englishFont: 'Iowan Old Style',
  textSize: 21,                 // px, root text
  tocOpen: true,
  textOpen: true,
  scrollTop: 0,
  anchorParaId: null,
  anchorOffsetRatio: 0,
  highlights: [],               // { id, paraId, start, end, color }
  highlightColor: 'a',
  shortcuts: DEFAULT_SHORTCUTS,
};

const listeners = new Set();
let state = { ...DEFAULTS };
let saveTimer = null;

const PERSISTED = [
  'appearance', 'tibetanFont', 'englishFont', 'textSize', 'tocOpen',
  'textOpen', 'scrollTop', 'anchorParaId', 'anchorOffsetRatio', 'highlights',
  'highlightColor', 'shortcuts',
];

export function get() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function set(patch, { persist = true } = {}) {
  const next = { ...state, ...patch };
  const changed = Object.keys(patch).filter((k) => next[k] !== state[k]);
  if (!changed.length) return state;
  state = next;
  for (const fn of listeners) fn(state, changed);
  if (persist) scheduleSave();
  return state;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

export async function flush() {
  clearTimeout(saveTimer);
  const patch = {};
  for (const key of PERSISTED) patch[key] = state[key];
  try {
    await host.saveState(patch);
  } catch { /* the reader keeps working even if the state file is unwritable */ }
}

export async function load() {
  let stored = {};
  try {
    stored = (await host.loadState()) || {};
  } catch { /* first run */ }
  const merged = { ...DEFAULTS };
  for (const key of PERSISTED) {
    if (stored[key] !== undefined && stored[key] !== null) merged[key] = stored[key];
  }
  merged.shortcuts = { ...DEFAULT_SHORTCUTS, ...(stored.shortcuts || {}) };
  if (!Array.isArray(merged.highlights)) merged.highlights = [];
  state = merged;
  return state;
}

// Flush on the way out so a crash mid-session still resumes where it stopped.
window.addEventListener('beforeunload', () => { flush(); });
window.addEventListener('pagehide', () => { flush(); });
