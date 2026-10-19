# CogniDesk Windows Production Installer Build Script (Module 30)
# Automates testing, asset preparation, Python bundling, and NSIS installer generation

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendDir = Join-Path $RepoRoot "backend"
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CogniDesk - Windows Production Installer Packaging" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Root: $RepoRoot"
Write-Host ""

# Step 1: Automated Verification - Backend Tests
Write-Host "[1/5] Running Backend Quality & Integrity Tests..." -ForegroundColor Yellow
& $PythonExe -m pytest backend/tests/test_flashcard_quality.py backend/tests/test_flashcards.py -v
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backend test suite failed. Aborting packaging."
    exit 1
}
Write-Host "✓ Backend tests passed successfully." -ForegroundColor Green
Write-Host ""

# Step 2: Generate App Icons
Write-Host "[2/5] Generating Multi-Resolution Application Icons..." -ForegroundColor Yellow
& $PythonExe scripts/generate_app_icon.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to generate application icons."
    exit 1
}
Write-Host "✓ Application icons created in frontend/electron/assets." -ForegroundColor Green
Write-Host ""

# Step 3: Prepare Bundled Python Runtime
Write-Host "[3/5] Validating & Preparing Bundled Python Runtime..." -ForegroundColor Yellow
& $PythonExe scripts/prepare_packaged_python.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to prepare bundled Python runtime."
    exit 1
}
Write-Host "✓ Bundled Python runtime ready in python-runtime." -ForegroundColor Green
Write-Host ""

# Step 4: Build Frontend Production Bundle
Write-Host "[4/5] Building React/Vite Desktop Frontend Bundle..." -ForegroundColor Yellow
Set-Location $FrontendDir
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend Vite production build failed."
    exit 1
}
Write-Host "✓ Frontend built successfully to frontend/dist." -ForegroundColor Green
Write-Host ""

# Step 5: Build NSIS Installer with electron-builder
Write-Host "[5/5] Compiling Windows NSIS Installer (.exe)..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
cmd.exe /c "npx electron-builder --win nsis"
if ($LASTEXITCODE -ne 0) {
    Write-Error "electron-builder failed."
    exit 1
}

$ReleaseDir = Join-Path $FrontendDir "release"
$Installers = Get-ChildItem -Path $ReleaseDir -Filter "*.exe"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  CogniDesk Windows Installer Generated Successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
foreach ($exe in $Installers) {
    $sizeMB = [math]::Round($exe.Length / 1MB, 2)
    Write-Host "Installer: $($exe.FullName) ($sizeMB MB)" -ForegroundColor Cyan
}
Write-Host ""
Set-Location $RepoRoot
