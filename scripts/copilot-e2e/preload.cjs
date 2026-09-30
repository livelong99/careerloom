const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('h', {
  audio: m => ipcRenderer.send('careerloom:copilotAudio', m),
  log: s => ipcRenderer.send('h:log', s),
})
