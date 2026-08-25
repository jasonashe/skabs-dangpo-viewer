'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const platform = require('./platform');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const EXPLANATIONS = path.join(ROOT, 'Explanations');
const QUOTES = path.join(EXPLANATIONS, 'quotes');
const QUOTE_INDEX = path.join(QUOTES, 'index.json');
const SOURCES = path.join(ROOT, 'Commentaries');

const STATE_FILE = () => path.join(app.getPath('userData'), 'reader-state.json');

let win = null;

// ---------------------------------------------------------------- the window
function createWindow() {
  win = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#e9e7e2',
    title: 'སྐབས་དང་པོའི་སྤྱི་དོན།',
    ...platform.windowOptions(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  restoreWindowBounds(win);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // straight to the text: no start screen, nothing to pick
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveWindowBounds(win));
  win.on('closed', () => { win = null; });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function readStateSync() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function restoreWindowBounds(w) {
  const b = readStateSync().windowBounds;
  if (b && b.width > 400 && b.height > 300) w.setBounds(b);
}

function saveWindowBounds(w) {
  if (!w || w.isDestroyed()) return;
  const state = readStateSync();
  state.windowBounds = w.isMaximized() ? state.windowBounds : w.getBounds();
  try {
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2));
  } catch { /* a lost window size is not worth an error dialog */ }
}

// ------------------------------------------------------------------- menubar
// The six re-bindable actions live in the renderer; the menu mirrors whatever
// the reader has bound them to.
const ACTIONS = [
  { id: 'explanation', label: 'Look at Explanation' },
  { id: 'translation', label: 'Find Translation of Selection' },
  { id: 'highlight', label: 'Apply Highlight' },
  { id: 'dark', label: 'Toggle Dark Appearance' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
];

function toAccelerator(binding) {
  if (!binding) return undefined;
  const parts = [];
  if (binding.meta) parts.push('CommandOrControl');
  if (binding.ctrl && !binding.meta) parts.push('Control');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  const key = String(binding.key || '').trim();
  if (!key) return undefined;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function buildMenu(bindings = {}) {
  const actionItems = ACTIONS.map((a) => ({
    label: a.label,
    accelerator: toAccelerator(bindings[a.id]),
    click: () => send('menu', a.id),
  }));

  const template = [];
  if (platform.usesAppMenuRole()) {
    template.push({ role: 'appMenu' });
  }
  template.push(
    {
      label: 'File',
      submenu: [
        {
          label: 'Reveal Source PDF',
          click: () => shell.showItemInFolder(
            path.join(ROOT, 'སྐབས་དང་པོའི་སྤྱི་དོན།.pdf')),
        },
        { type: 'separator' },
        platform.usesAppMenuRole() ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Show Table of Contents',
          click: () => send('menu', 'toggleToc'),
        },
        {
          label: 'Show Text',
          click: () => send('menu', 'toggleText'),
        },
        { type: 'separator' },
        { label: 'Bigger Text', accelerator: 'CommandOrControl+Plus',
          click: () => send('menu', 'textBigger') },
        { label: 'Smaller Text', accelerator: 'CommandOrControl+-',
          click: () => send('menu', 'textSmaller') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Reader',
      submenu: actionItems,
    },
    {
      role: 'window',
      submenu: platform.usesAppMenuRole()
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' },
           { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ----------------------------------------------------------------------- ipc
function withinDir(dir, name) {
  const full = path.resolve(dir, name);
  if (!full.startsWith(path.resolve(dir) + path.sep)) return null;
  return full;
}

ipcMain.handle('chrome-insets', () => ({
  ...platform.chromeInsets(), platform: platform.id,
}));

ipcMain.handle('read-data', async (_e, name) => {
  const file = withinDir(DATA_DIR, name);
  if (!file) throw new Error('bad data name');
  return JSON.parse(await fsp.readFile(file, 'utf8'));
});

ipcMain.handle('read-explanation', async (_e, paraId) => {
  if (!/^[a-z0-9_-]+$/i.test(String(paraId))) return null;
  const file = path.join(EXPLANATIONS, `${paraId}.md`);
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('list-explanations', async () => {
  try {
    const names = await fsp.readdir(EXPLANATIONS);
    return names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3));
  } catch {
    return [];
  }
});

// Quote records are filed per commentary under Explanations/quotes, mirroring
// how the analysis material is organised; the packed index is the flat view of
// that store, so a lookup is one read rather than a directory walk.
let quoteIndex = null;
let quoteIndexAt = 0;

async function loadQuoteIndex() {
  try {
    const stat = await fsp.stat(QUOTE_INDEX);
    if (quoteIndex && stat.mtimeMs === quoteIndexAt) return quoteIndex;
    quoteIndex = JSON.parse(await fsp.readFile(QUOTE_INDEX, 'utf8'));
    quoteIndexAt = stat.mtimeMs;
  } catch {
    quoteIndex = quoteIndex || {};
  }
  return quoteIndex;
}

ipcMain.handle('read-quote', async (_e, id) => {
  if (!/^[a-z0-9_-]+$/i.test(String(id))) return null;
  const index = await loadQuoteIndex();
  return index[id] || null;
});

// A window onto a commentary file: enough text before and after the quote for
// the reader to see where it sits.
ipcMain.handle('read-source', async (_e, { file, offset = 0, before = 4000,
                                           after = 6000 } = {}) => {
  const full = withinDir(SOURCES, path.basename(String(file || '')));
  if (!full) return null;
  try {
    const text = await fsp.readFile(full, 'utf8');
    const start = Math.max(0, offset - before);
    const end = Math.min(text.length, offset + after);
    return { start, end, total: text.length, text: text.slice(start, end) };
  } catch {
    return null;
  }
});

ipcMain.handle('load-state', () => readStateSync());

ipcMain.handle('save-state', async (_e, patch) => {
  const state = { ...readStateSync(), ...patch };
  await fsp.mkdir(path.dirname(STATE_FILE()), { recursive: true });
  await fsp.writeFile(STATE_FILE(), JSON.stringify(state, null, 2));
  return true;
});

ipcMain.handle('set-shortcuts', (_e, bindings) => {
  buildMenu(bindings || {});
  return true;
});

ipcMain.handle('set-title-bar-theme', (_e, dark) => {
  if (win && !win.isDestroyed() && process.platform === 'win32') {
    try {
      win.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: dark ? '#cdc6bd' : '#5b5651',
        height: 46,
      });
    } catch { /* older Windows builds simply keep the system colours */ }
  }
  return true;
});

// --------------------------------------------------------------- app startup
app.on('ready', () => {
  buildMenu(readStateSync().shortcuts || {});
  createWindow();
});

app.on('window-all-closed', () => {
  if (platform.quitsOnLastWindowClosed()) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

process.on('uncaughtException', (err) => {
  if (app.isReady()) {
    dialog.showErrorBox('སྐབས་དང་པོའི་སྤྱི་དོན།', String(err && err.stack || err));
  }
});
