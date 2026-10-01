// The launcher's page (app/) talks to the launcher through this, and nothing else does: the game,
// loaded from the shard in the same window, gets none of it.
const { contextBridge, ipcRenderer } = require('electron')

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('launcher', {
    info: () => ipcRenderer.invoke('launcher:info'),
    status: () => ipcRenderer.invoke('launcher:status'),
    play: () => ipcRenderer.invoke('launcher:play'),
    restart: () => ipcRenderer.invoke('launcher:restart'),
    download: () => ipcRenderer.invoke('launcher:download'),
    check: () => ipcRenderer.invoke('launcher:check'),
    onUpdate: listener => { ipcRenderer.on('launcher:update', (_event, update) => listener(update)) },
  })
}
