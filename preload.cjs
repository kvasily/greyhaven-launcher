// The launcher's page (app/) talks to the launcher through this, and nothing else does: the game,
// loaded from the shard in the same window, gets only the handoff below.
const { contextBridge, ipcRenderer } = require('electron')

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('launcher', {
    info: () => ipcRenderer.invoke('launcher:info'),
    status: () => ipcRenderer.invoke('launcher:status'),
    play: () => ipcRenderer.invoke('launcher:play'),
    restart: () => ipcRenderer.invoke('launcher:restart'),
    download: () => ipcRenderer.invoke('launcher:download'),
    check: () => ipcRenderer.invoke('launcher:check'),
    skins: () => ipcRenderer.invoke('launcher:skins'),
    pin: id => ipcRenderer.invoke('launcher:pin', id),
    onUpdate: listener => { ipcRenderer.on('launcher:update', (_event, update) => listener(update)) },
    // The login view and the gear's switch (main.cjs): the account's name only, never its token.
    account: () => ipcRenderer.invoke('launcher:account'),
    login: form => ipcRenderer.invoke('launcher:login', form),
    signout: () => ipcRenderer.invoke('launcher:signout'),
    front: mode => ipcRenderer.invoke('launcher:front', mode),
  })
} else if (/^https?:$/.test(location.protocol)) {
  // The game page, loaded from the shard: one thing only, the login the launcher opened it with
  // (once; main.cjs checks it is the shard's page asking). src/launcher-login.ts takes it.
  contextBridge.exposeInMainWorld('greyhavenLauncher', { handoff: () => ipcRenderer.invoke('launcher:handoff') })
}
