/**
 * CogniDesk Desktop - FastAPI Backend Process Manager
 * Handles automatic startup, health monitoring, dynamic port conflict avoidance,
 * packaged path resolution, and clean process tree termination.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

class BackendManager {
  constructor() {
    this.process = null;
    this.port = 8000;
    this.host = '127.0.0.1';
    this.isAttached = false; // True if attached to an already running instance
    this.status = 'stopped'; // 'stopped' | 'starting' | 'running' | 'failed' | 'crashed'
    this.statusListeners = [];
  }

  onStatusChange(listener) {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  _notifyStatus(status, details = {}) {
    this.status = status;
    const payload = { status, timestamp: Date.now(), port: this.port, ...details };
    for (const listener of this.statusListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[BackendManager] Error notifying status listener:', err);
      }
    }
  }

  /**
   * Resolve path to python executable
   */
  getPythonPath() {
    const isWin = process.platform === 'win32';

    // Candidate 1: Packaged production build in process.resourcesPath
    if (process.resourcesPath) {
      const packagedPythonWin = path.join(process.resourcesPath, 'python', 'python.exe');
      const packagedPythonWinScripts = path.join(process.resourcesPath, 'python', 'Scripts', 'python.exe');
      const packagedPythonUnix = path.join(process.resourcesPath, 'python', 'bin', 'python');

      if (isWin && fs.existsSync(packagedPythonWin)) {
        return packagedPythonWin;
      }
      if (isWin && fs.existsSync(packagedPythonWinScripts)) {
        return packagedPythonWinScripts;
      }
      if (!isWin && fs.existsSync(packagedPythonUnix)) {
        return packagedPythonUnix;
      }
    }

    // Candidate 2: Local virtualenv in backend/venv (Development mode)
    const venvPythonWin = path.resolve(__dirname, '../../backend/venv/Scripts/python.exe');
    const venvPythonUnix = path.resolve(__dirname, '../../backend/venv/bin/python');

    if (isWin && fs.existsSync(venvPythonWin)) {
      return venvPythonWin;
    }
    if (!isWin && fs.existsSync(venvPythonUnix)) {
      return venvPythonUnix;
    }

    // Candidate 3: System python fallback
    return isWin ? 'python' : 'python3';
  }

  /**
   * Resolve backend working directory
   */
  getBackendDir() {
    // Packaged build
    if (process.resourcesPath) {
      const packagedBackendDir = path.join(process.resourcesPath, 'backend');
      if (fs.existsSync(packagedBackendDir)) {
        return packagedBackendDir;
      }
    }

    // Development mode
    const defaultBackendDir = path.resolve(__dirname, '../../backend');
    if (fs.existsSync(defaultBackendDir)) {
      return defaultBackendDir;
    }

    return process.cwd();
  }

  /**
   * Check if backend health endpoint responds
   */
  checkHealth(port = this.port, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const options = {
        hostname: this.host,
        port: port,
        path: '/api/v1/health',
        method: 'GET',
        timeout: timeoutMs,
      };

      const req = http.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          // Fall back check /health
          this._checkFallbackHealth(port, timeoutMs).then(resolve);
        }
      });

      req.on('error', () => {
        this._checkFallbackHealth(port, timeoutMs).then(resolve);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  _checkFallbackHealth(port, timeoutMs) {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: this.host,
          port: port,
          path: '/health',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
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

  /**
   * Start or attach to the FastAPI backend process
   */
  async start() {
    this._notifyStatus('starting');

    // Step 1: Check if CogniDesk backend is already running on default port 8000
    const runningOn8000 = await this.checkHealth(8000, 1000);
    if (runningOn8000) {
      console.log('[BackendManager] Detected existing running backend on 127.0.0.1:8000. Attaching...');
      this.port = 8000;
      this.isAttached = true;
      this._notifyStatus('running', { attached: true, port: this.port });
      return { success: true, attached: true, port: this.port };
    }

    // Step 2: Prevent port conflicts - find an available port
    let selectedPort = 8000;
    const is8000Free = await isPortAvailable(8000, this.host);

    if (!is8000Free) {
      console.warn('[BackendManager] Port 8000 is occupied by an external service. Searching for alternate port...');
      let foundPort = false;
      for (let p = 8001; p <= 8020; p++) {
        // If a CogniDesk backend is already active on an alternate port, attach to it
        if (await this.checkHealth(p, 500)) {
          console.log(`[BackendManager] Found existing CogniDesk backend running on port ${p}. Attaching...`);
          this.port = p;
          this.isAttached = true;
          this._notifyStatus('running', { attached: true, port: p });
          return { success: true, attached: true, port: p };
        }
        if (await isPortAvailable(p, this.host)) {
          selectedPort = p;
          foundPort = true;
          break;
        }
      }
      if (!foundPort) {
        throw new Error('Unable to find an available port between 8000 and 8020.');
      }
    }

    this.port = selectedPort;
    console.log(`[BackendManager] Selected active backend port: ${this.port}`);

    // Step 3: Spawn python backend
    const pythonPath = this.getPythonPath();
    const backendDir = this.getBackendDir();

    console.log(`[BackendManager] Spawning backend using: ${pythonPath}`);
    console.log(`[BackendManager] Working Directory: ${backendDir}`);

    const args = ['-m', 'uvicorn', 'app.main:app', '--host', this.host, '--port', String(this.port)];

    try {
      this.process = spawn(pythonPath, args, {
        cwd: backendDir,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          COGNIDESK_DESKTOP: '1',
          COGNIDESK_PORT: String(this.port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.isAttached = false;

      this.process.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          console.log(`[Backend:stdout] ${text}`);
        }
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          console.warn(`[Backend:stderr] ${text}`);
        }
      });

      this.process.on('error', (err) => {
        console.error('[BackendManager] Failed to start backend process:', err);
        this._notifyStatus('failed', { error: err.message, port: this.port });
      });

      this.process.on('exit', (code, signal) => {
        console.warn(`[BackendManager] Process exited with code ${code}, signal ${signal}`);
        if (this.status === 'running') {
          this._notifyStatus('crashed', { code, signal, port: this.port });
        } else if (this.status !== 'stopped') {
          this._notifyStatus('failed', { code, signal, port: this.port });
        }
        this.process = null;
      });

      // Step 4: Wait for health check to succeed (up to 30 seconds)
      const maxRetries = 60;
      let retries = 0;

      while (retries < maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        retries++;

        if (!this.process) {
          throw new Error('Backend process terminated unexpectedly during startup.');
        }

        const healthy = await this.checkHealth(this.port, 800);
        if (healthy) {
          console.log(`[BackendManager] Backend successfully started & healthy on ${this.host}:${this.port}`);
          this._notifyStatus('running', { port: this.port, pid: this.process?.pid });
          return { success: true, port: this.port };
        }
      }

      throw new Error(`Timed out waiting for backend health check response on port ${this.port} after 30 seconds.`);
    } catch (err) {
      console.error('[BackendManager] Backend launch error:', err);
      this._notifyStatus('failed', { error: err.message, port: this.port });
      await this.stop();
      return { success: false, error: err.message, port: this.port };
    }
  }

  /**
   * Stop the backend process safely
   * Avoids accidentally terminating unrelated Python processes on the user's system.
   */
  async stop() {
    if (this.isAttached) {
      console.log('[BackendManager] Was attached to external process; leaving external instance alive.');
      this.isAttached = false;
      this._notifyStatus('stopped');
      return;
    }

    if (!this.process) {
      this._notifyStatus('stopped');
      return;
    }

    const pid = this.process.pid;
    console.log(`[BackendManager] Stopping backend process tree PID ${pid}...`);

    if (process.platform === 'win32' && pid) {
      // Forcefully kill child process tree of THIS specific PID on Windows
      try {
        exec(`taskkill /pid ${pid} /T /F`, (err) => {
          if (err) {
            console.warn('[BackendManager] taskkill warning:', err.message);
          }
        });
      } catch (err) {
        console.warn('[BackendManager] taskkill error:', err);
      }
    } else if (pid) {
      try {
        this.process.kill('SIGTERM');
      } catch (err) {
        console.warn('[BackendManager] kill error:', err);
      }
    }

    this.process = null;
    this._notifyStatus('stopped');
  }

  getPort() {
    return this.port;
  }

  getStatus() {
    return {
      status: this.status,
      port: this.port,
      isAttached: this.isAttached,
      pid: this.process ? this.process.pid : null,
    };
  }
}

module.exports = new BackendManager();

