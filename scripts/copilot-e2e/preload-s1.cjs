const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('h', { log: s => ipcRenderer.send('h:log', s), play: () => ipcRenderer.send('h:play') })
