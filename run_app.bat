@echo off
setlocal enabledelayedexpansion

title CogniDesk - Application Launcher

echo ========================================================================
echo   CogniDesk - AI Desktop Workspace Launcher
echo ========================================================================

set ROOT_DIR=%~dp0
set BACKEND_DIR=%ROOT_DIR%backend
set FRONTEND_DIR=%ROOT_DIR%frontend
set VENV_PY=%BACKEND_DIR%\venv\Scripts\python.exe

echo [1/3] Checking environment prerequisites...

if not exist "%VENV_PY%" (
    echo [ERROR] Virtual environment python not found at:
    echo         %VENV_PY%
    echo Please ensure the backend virtual environment is created.
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js (https://nodejs.org) to run the frontend.
    pause
    exit /b 1
)

echo   - Python Venv: Found (%VENV_PY%)
echo   - Node.js: Found

echo.
echo [2/3] Starting CogniDesk Backend (FastAPI + Uvicorn)...
cd /d "%BACKEND_DIR%"
start "CogniDesk - Backend (Port 8000)" cmd /k ""%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo.
echo [3/3] Starting CogniDesk Frontend (Vite + React)...
cd /d "%FRONTEND_DIR%"
start "CogniDesk - Frontend (Port 5173)" cmd /k "npm run dev"

cd /d "%ROOT_DIR%"

echo.
echo ========================================================================
echo   CogniDesk services are starting:
echo     - Frontend Web App:  http://localhost:5173
echo     - Backend API Docs:  http://127.0.0.1:8000/docs
echo     - API Health Check:  http://127.0.0.1:8000/api/v1/health
echo ========================================================================
echo.
echo Waiting 3 seconds before opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo Done! Both servers are running in separate terminal windows.
echo Keep those windows open while using CogniDesk.
