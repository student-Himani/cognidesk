# CogniDesk 🧠⚡

> **Offline AI Knowledge & Document Intelligence Workspace**

CogniDesk is a privacy-first, fully offline AI workspace designed to organize, search, analyze, and interact with your personal document collection using local AI models (Ollama, Sentence Transformers, ChromaDB).

---

## 🏗 Directory Architecture

```
CogniDesk/
├── frontend/        # React + TypeScript + Tailwind CSS UI
├── backend/         # FastAPI Python Backend Service
├── database/        # SQLite Relational Storage
├── vector_db/       # ChromaDB Vector Store
├── uploads/         # Active User Document Storage
├── documents/       # Raw Document Archives
├── models/          # Local AI Model Weight Files / Resources
├── electron/        # Electron Wrapper (Desktop Distribution)
├── assets/          # Static Assets & Icons
├── docs/            # Architecture & Documentation
└── tests/           # Integration & End-to-End Test Suite
```

---

## 🚀 Quick Start (Development)

### 1. Backend Setup

```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt

# > python -m uvicorn app.main:app --reload  

c
```

Backend API running at: `http://localhost:8000` (Health Check: `http://localhost:8000/api/health`)

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend application running at: `http://localhost:5173`

---

## 🔄 CI/CD Pipeline & Automated Testing

CogniDesk uses **GitHub Actions** for continuous integration to validate backend logic and frontend build stability on every `push` and `pull_request` to `main`, `master`, `dev`, and `develop` branches.

### Workflows

| Workflow | Path | Purpose |
| :--- | :--- | :--- |
| **Backend CI** | [`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml) | Sets up Python 3.10, installs headless OCR/system libraries, runs complete `pytest` test suite (FastAPI, SQLite, ChromaDB, EasyOCR, RAG, and MCP). |
| **Frontend CI** | [`.github/workflows/frontend-ci.yml`](.github/workflows/frontend-ci.yml) | Sets up Node.js 20, validates TypeScript types (`tsc --noEmit`), and builds production Vite bundle (`npm run build`). |

### 🧪 Running CI Checks Locally

You can run the exact same automated checks locally before pushing changes:

#### 1. Backend Pytest Suite
```bash
# From the repository root (with backend venv activated)

# On Windows (PowerShell):
.\backend\venv\Scripts\pytest -v --tb=short

# On Linux / macOS (Bash):
source backend/venv/bin/activate
pytest -v --tb=short
```
```bash
pytest -q
```

#### 2. Frontend Type Check & Build
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run TypeScript type check
npx tsc --noEmit

# Compile production bundle
npm run build
```

---

## 📦 Production Windows Installer & Packaging (Module 30)

CogniDesk provides an automated, reproducible packaging pipeline to generate a standalone Windows desktop installer (`.exe`) bundling the Electron desktop runtime, React/Vite frontend, FastAPI backend, and a compatible Python runtime.

### 🔨 Building the Windows Installer

From the repository root in PowerShell:
```powershell
# Run the end-to-end packaging pipeline
.\scripts\package_win.ps1
```
Or directly from the `frontend` directory:
```bash
cd frontend
npm run package:win
```

The compiled installer will be generated in `frontend/release/CogniDesk Setup 1.0.0.exe`.

### 💾 Persistent Local User Data Architecture

CogniDesk follows modern Windows per-user application data standards:
- **Zero Program Files Writes**: Read-only application binaries and Python libraries reside in `%LOCALAPPDATA%\Programs\CogniDesk` (or installation folder).
- **Persistent Data Directory**: All writable user data is isolated in `%APPDATA%\CogniDesk`:
  - `database/cognidesk.db`: SQLite database storing user accounts, workspaces, document metadata, notes, flashcards, and settings.
  - `vector_db/`: ChromaDB embeddings and vector index.
  - `uploads/`: Processed document files and extracted text caches.
  - `backups/`: Automated rolling SQLite database backups created on each application startup (keeps the 7 most recent backups).
- **Upgrade & Uninstall Safety**: `deleteAppDataOnUninstall` is disabled by default. Uninstalling or upgrading CogniDesk will **never** silently delete your SQLite databases, notes, flashcards, or uploaded documents.
- **Automatic Migration**: On first launch in desktop production mode, CogniDesk detects existing databases or uploads from development mode and safely copies them into `%APPDATA%\CogniDesk`.

---

## 🤖 Ollama & Offline Privacy Guarantee

CogniDesk is built from the ground up as a **100% offline-first** intelligence workspace.

### 1. Prerequisites (Local Ollama Engine)
1. Download and install **Ollama** for Windows from [ollama.com/download](https://ollama.com/download).
2. Start Ollama (it runs in your Windows system tray at `http://127.0.0.1:11434`).
3. Pull the recommended local models via PowerShell or Command Prompt:
   ```powershell
   # Default fast intelligence model (recommended)
   ollama pull qwen2.5:3b

   # Fallback models (optional but recommended for auto-failover)
   ollama pull llama3.2:3b
   ollama pull mistral:7b
   ```

### 2. Privacy & Security Rules
- **Strict Offline Mode**: In Offline Mode, CogniDesk never attempts external network requests, never makes silent cloud AI calls, and never transmits your documents, notes, prompts, or API keys outside your machine.
- **Transparent Model Status**: The startup sequence and Settings page actively monitor Ollama connectivity. If Ollama is not running or a selected model is missing, clear actionable guidance is displayed on-screen.
- **Model Fallback**: If an active model runs out of VRAM or crashes, CogniDesk automatically tries the configured sequential fallback models (`qwen2.5:7b,llama3.2:3b,mistral:7b`) before reporting an error.

---

## ⚡ Startup Experience & Process Management

- **Cinematic Startup Synchronization**: On launch, CogniDesk displays the signature human and robotic hands meeting over the glowing AI nucleus. The animation displays for a minimum of 5 seconds **and** remains active until the backend health probe (`/api/v1/health`) confirms the database and vector indexes are operational.
- **Port Conflict Avoidance**: CogniDesk probes port `8000`. If port 8000 is occupied by an unrelated service, the backend automatically binds to the next available port (`8001`–`8020`) and seamlessly communicates the active port to the Electron frontend.
- **Safe Process Lifecycle**: On shutdown, CogniDesk cleanly terminates the backend child process tree using PID tracking, avoiding accidental termination of any unrelated Python processes running on your computer.

---

## 🛠️ Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Backend startup taking longer than usual"** | Initial database indexing or port scan. | Wait for the connection probe to finish, or click **Retry Backend** on the startup screen. |
| **"Ollama unreachable" in Settings** | Ollama service is not running. | Start Ollama from your Start Menu or run `ollama serve` in a terminal. |
| **"Model not found" during chat** | Required Ollama model has not been pulled. | Run `ollama pull qwen2.5:3b` in PowerShell and refresh the page. |
| **Port 8000 conflict** | Another local server is using port 8000. | CogniDesk will automatically shift to port 8001+. Check the active port in **Settings > Diagnostics**. |
| **Data Recovery** | Need to restore an earlier database state. | Copy a timestamped backup from `%APPDATA%\CogniDesk\backups\` into `%APPDATA%\CogniDesk\database\cognidesk.db`. |

---

## 🛡 License & Security

- **Electron Security**: Context isolation is strictly enforced (`contextIsolation: true`, `nodeIntegration: false`), with all renderer-to-system interactions mediated through a secure, validated preload bridge (`cognideskDesktop`).
- **Offline Data**: CogniDesk runs 100% locally on your device. Your data remains your own.

