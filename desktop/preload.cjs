const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dartsRoomDesktop', {
  isDesktop: true,
  openGoogleAuth: (url) => ipcRenderer.invoke('auth:open-external', url),
  onAuthCallback: (callback) => {
    const listener = (_event, code) => callback(code)
    ipcRenderer.on('auth:callback', listener)
    ipcRenderer.send('auth:ready')
    return () => ipcRenderer.removeListener('auth:callback', listener)
  },
})
