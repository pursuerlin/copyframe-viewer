import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('copyframeViewer', {
  chooseArchive: () => ipcRenderer.invoke('copyframe-viewer:choose-archive')
});
