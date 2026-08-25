'use strict';
// macOS window chrome.  Target is macOS 12.3.1 and later.

module.exports = {
  id: 'darwin',

  // Preview-like: unified title bar, traffic lights inset over our own bar.
  windowOptions() {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 13, y: 16 },
      vibrancy: undefined,
      frame: true,
    };
  },

  // How much room the renderer must leave at the left of the title bar so the
  // traffic lights are never covered.
  chromeInsets() {
    return { titleBarLeft: 78, titleBarHeight: 46, showsOwnTitle: true };
  },

  // macOS keeps the app alive when the last window closes.
  quitsOnLastWindowClosed() {
    return false;
  },

  usesAppMenuRole() {
    return true;
  },
};
