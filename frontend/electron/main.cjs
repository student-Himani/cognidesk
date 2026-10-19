/**
 * CogniDesk Desktop - Electron Main Process
 * Secure, offline-first desktop wrapper for React/Vite frontend + FastAPI backend.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const backendManager = require('./backendManager.cjs');

let mainWindow = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/**
 * Check if the Vite dev server is running on localhost:5173
 */
function isDevServerRunning() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5173,
        path: '/',
        method: 'GET',
        timeout: 800,
      },
      (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: '#0B0F17',
    title: 'CogniDesk - Offline AI Knowledge Engine',
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false, // Prevents white flash during initial rendering
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Smooth appearance when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Security: Prevent navigation to untrusted external sites inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigation to localhost or file://
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Route backend status updates to renderer
  backendManager.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cognidesk:backend-status', status);
    }
  });

  // Determine whether to load dev server or static build
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';
  let devServerActive = false;

  if (isDev) {
    devServerActive = await isDevServerRunning();
  }

  if (devServerActive) {
    console.log('[Main] Loading frontend from Vite dev server at http://127.0.0.1:5173');
    await mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`[Main] Loading static production frontend from: ${indexPath}`);
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register IPC handlers
function registerIpcHandlers() {
  ipcMain.handle('cognidesk:get-version', () => app.getVersion());
  ipcMain.handle('cognidesk:get-backend-port', () => backendManager.getPort());

  ipcMain.handle('cognidesk:get-backend-status', () => {
    return backendManager.getStatus();
  });

  ipcMain.handle('cognidesk:restart-backend', async () => {
    await backendManager.stop();
    return await backendManager.start();
  });

  ipcMain.handle('cognidesk:open-external', async (_event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('cognidesk:is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.on('cognidesk:window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('cognidesk:window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('cognidesk:window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  registerIpcHandlers();

  // Automatically start and verify backend
  try {
    await backendManager.start();
  } catch (err) {
    console.error('[Main] Warning: Failed to start backend during initial startup:', err);
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let isQuitting = false;

app.on('before-quit', async (e) => {
  if (!isQuitting) {
    isQuitting = true;
    e.preventDefault();
    console.log('[Main] Application shutting down. Terminating backend manager...');
    try {
      await backendManager.stop();
    } catch (err) {
      console.warn('[Main] Backend stop error during quit:', err);
    }
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
