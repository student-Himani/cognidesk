# CogniDesk Application Launcher (PowerShell)

$Host.UI.RawUI.WindowTitle = "CogniDesk - Application Launcher"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  CogniDesk - AI Desktop Workspace Launcher (PowerShell)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvPy = Join-Path $BackendDir "venv\Scripts\python.exe"

Write-Host "[1/3] Checking environment prerequisites..." -ForegroundColor Yellow

if (-not (Test-Path $VenvPy)) {
    Write-Host "[ERROR] Virtual environment python not found at: $VenvPy" -ForegroundColor Red
    exit 1
}

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host "[ERROR] Node.js is not found in PATH. Please install Node.js." -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Python Venv: Found ($VenvPy)" -ForegroundColor Green
Write-Host "  ✓ Node.js: Found" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Starting CogniDesk Backend (FastAPI + Uvicorn on Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; & '$VenvPy' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "[3/3] Starting CogniDesk Frontend (Vite + React on Port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendDir'; npm run dev"

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  CogniDesk services are starting:" -ForegroundColor Cyan
Write-Host "    - Frontend Web App:  http://localhost:5173" -ForegroundColor White
Write-Host "    - Backend API Docs:  http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "    - API Health Check:  http://127.0.0.1:8000/api/v1/health" -ForegroundColor White
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host "Done! Both servers have launched in separate PowerShell windows." -ForegroundColor Green
