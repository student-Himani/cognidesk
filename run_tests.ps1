# CogniDesk Test Suite Runner (PowerShell)
param (
    [string]$Target = "ocr"
)

$Host.UI.RawUI.WindowTitle = "CogniDesk - Test Runner"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  CogniDesk Test Suite Runner (Windows PowerShell)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$RootDir = $PSScriptRoot
$VenvPy = Join-Path $RootDir "backend\venv\Scripts\python.exe"

if (-not (Test-Path $VenvPy)) {
    Write-Host "[ERROR] Virtual environment python not found at: $VenvPy" -ForegroundColor Red
    Write-Host "Please ensure the backend virtual environment is created." -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] Using virtual environment: $VenvPy" -ForegroundColor DarkGray

switch ($Target.ToLower()) {
    "ocr" {
        Write-Host "[INFO] Running Offline OCR test (tests/test_offline_ocr.py)..." -ForegroundColor Green
        & $VenvPy tests/test_offline_ocr.py
    }
    "standalone" {
        Write-Host "[INFO] Running Offline OCR Diagnostic Runner (standalone mode)..." -ForegroundColor Green
        & $VenvPy tests/test_offline_ocr.py --standalone
    }
    "ux" {
        Write-Host "[INFO] Running Chat UX & Suggestions test..." -ForegroundColor Green
        & $VenvPy tests/test_suggestions_and_chat_ux.py
    }
    "all" {
        Write-Host "[INFO] Running full pytest suite in tests/ and backend/tests/..." -ForegroundColor Green
        & $VenvPy -m pytest tests/ backend/tests/ -v
    }
    default {
        Write-Host "[INFO] Running custom target: $Target" -ForegroundColor Green
        & $VenvPy -m pytest $Target
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Test execution completed." -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
