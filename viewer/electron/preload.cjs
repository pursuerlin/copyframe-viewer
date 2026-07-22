const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preloads support the CommonJS Electron bridge. Keeping
// this file as .cjs is important: an ESM preload can silently fail to expose
// the bridge in a packaged macOS app, leaving the welcome-page button inert.
contextBridge.exposeInMainWorld('copyframeViewer', {
  chooseArchive: () => ipcRenderer.invoke('copyframe-viewer:choose-archive')
});
