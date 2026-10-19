/**
 * CogniDesk Desktop - Secure Electron Preload Bridge
 * Context Isolation: true | Node Integration: false
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cognideskDesktop', {
  isElectron: true,
  platform: process.platform,

  // App & Environment Info
  getAppVersion: () => ipcRenderer.invoke('cognidesk:get-version'),
  getBackendPort: () => ipcRenderer.invoke('cognidesk:get-backend-port'),
  getBackendStatus: () => ipcRenderer.invoke('cognidesk:get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('cognidesk:restart-backend'),

  // External Links (safely delegated to shell)
  openExternal: (url) => ipcRenderer.invoke('cognidesk:open-external', url),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('cognidesk:window-minimize'),
  maximizeWindow: () => ipcRenderer.send('cognidesk:window-maximize'),
  closeWindow: () => ipcRenderer.send('cognidesk:window-close'),
  isMaximized: () => ipcRenderer.invoke('cognidesk:is-maximized'),

  // Subscriptions
  onBackendStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('cognidesk:backend-status', subscription);
    return () => ipcRenderer.removeListener('cognidesk:backend-status', subscription);
  },
});
