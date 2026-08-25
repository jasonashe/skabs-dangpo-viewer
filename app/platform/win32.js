'use strict';
// Windows window chrome.  The only thing that differs from macOS is the
// caption: system buttons sit at the right, so the renderer keeps its inset
// there instead, and closing the last window quits the app.

module.exports = {
  id: 'win32',

  windowOptions() {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#5b5651',
        height: 46,
      },
      frame: true,
    };
  },

  chromeInsets() {
    return { titleBarLeft: 12, titleBarRight: 146, titleBarHeight: 46,
             showsOwnTitle: true };
  },

  quitsOnLastWindowClosed() {
    return true;
  },

  usesAppMenuRole() {
    return false;
  },
};
