// Re-bindable keyboard shortcuts.  A binding is { key, meta, ctrl, alt, shift };
// "meta" means the platform's command key, so the same stored binding reads as
// ⌘T on macOS and Ctrl+T on Windows.

const IS_MAC = (navigator.platform || '').toLowerCase().includes('mac')
  || (navigator.userAgent || '').includes('Mac OS');

export const ACTION_LABELS = {
  explanation: 'Open explanation',
  translation: 'Find translation of selection',
  highlight: 'Apply highlight',
  dark: 'Toggle dark appearance',
  search: 'Search',
  settings: 'Settings',
};

const NAMED = {
  ' ': 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓',
  ArrowLeft: '←', ArrowRight: '→', Enter: '↩', Backspace: '⌫', Tab: '⇥',
};

export function formatBinding(b) {
  if (!b || !b.key) return 'None';
  const parts = [];
  if (IS_MAC) {
    if (b.ctrl) parts.push('⌃');
    if (b.alt) parts.push('⌥');
    if (b.shift) parts.push('⇧');
    if (b.meta) parts.push('⌘');
  } else {
    if (b.meta || b.ctrl) parts.push('Ctrl');
    if (b.alt) parts.push('Alt');
    if (b.shift) parts.push('Shift');
  }
  const key = NAMED[b.key] || (b.key.length === 1 ? b.key.toUpperCase() : b.key);
  parts.push(key);
  return IS_MAC ? parts.join('') : parts.join('+');
}

export function bindingFromEvent(e) {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;
  return {
    key: e.key.length === 1 ? e.key.toUpperCase() : e.key,
    meta: IS_MAC ? e.metaKey : e.ctrlKey,
    ctrl: IS_MAC ? e.ctrlKey : false,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

export function matches(e, b) {
  if (!b || !b.key) return false;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key !== (b.key.length === 1 ? b.key.toUpperCase() : b.key)) return false;
  const meta = IS_MAC ? e.metaKey : e.ctrlKey;
  const ctrl = IS_MAC ? e.ctrlKey : false;
  return meta === !!b.meta && ctrl === !!b.ctrl
    && e.altKey === !!b.alt && e.shiftKey === !!b.shift;
}

export function findAction(e, bindings) {
  for (const [action, binding] of Object.entries(bindings || {})) {
    if (matches(e, binding)) return action;
  }
  return null;
}

export const isMac = IS_MAC;
