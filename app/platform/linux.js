'use strict';
// Linux chrome — used for development and headless verification only.

module.exports = {
  id: 'linux',

  windowOptions() {
    return { frame: true, titleBarStyle: 'default' };
  },

  chromeInsets() {
    return { titleBarLeft: 12, titleBarHeight: 46, showsOwnTitle: true };
  },

  quitsOnLastWindowClosed() {
    return true;
  },

  usesAppMenuRole() {
    return false;
  },
};
