'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The single seam between the renderer and the host.  app/renderer/bridge.js
// implements the same shape over fetch() so the reader can be exercised in a
// plain browser during development; nothing above this line is platform-aware.
contextBridge.exposeInMainWorld('skabsHost', {
  kind: 'electron',
  platform: process.platform,
  chromeInsets: () => ipcRenderer.invoke('chrome-insets'),
  readData: (name) => ipcRenderer.invoke('read-data', name),
  readExplanation: (paraId) => ipcRenderer.invoke('read-explanation', paraId),
  listExplanations: () => ipcRenderer.invoke('list-explanations'),
  readQuote: (id) => ipcRenderer.invoke('read-quote', id),
  readSource: (opts) => ipcRenderer.invoke('read-source', opts),
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (patch) => ipcRenderer.invoke('save-state', patch),
  setShortcuts: (bindings) => ipcRenderer.invoke('set-shortcuts', bindings),
  setTitleBarTheme: (dark) => ipcRenderer.invoke('set-title-bar-theme', dark),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
