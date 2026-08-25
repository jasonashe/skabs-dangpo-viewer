'use strict';
// Native window chrome lives here and nowhere else.  Everything the reader
// actually does — layout, text handling, panel logic — is in app/renderer and
// never asks which platform it is on.  A Windows build swaps in win32.js.

const chrome = (() => {
  switch (process.platform) {
    case 'darwin': return require('./darwin');
    case 'win32': return require('./win32');
    default: return require('./linux');
  }
})();

module.exports = chrome;
