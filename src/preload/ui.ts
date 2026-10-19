// Pont minimal pour l'interface du navigateur uniquement (les sites n'ont aucun preload).
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('phos', {
  send: (msg: unknown) => ipcRenderer.send('ui', msg),
  on: (cb: (event: string, data: unknown) => void) => {
    ipcRenderer.on('to-ui', (_e, event: string, data: unknown) => cb(event, data));
  },
});
