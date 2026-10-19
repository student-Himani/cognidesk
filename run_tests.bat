@echo off
setlocal enabledelayedexpansion

title CogniDesk - Test Runner

echo ========================================================================
echo   CogniDesk Test Suite Runner (Windows)
echo ========================================================================

set ROOT_DIR=%~dp0
set VENV_PY=%ROOT_DIR%backend\venv\Scripts\python.exe

if not exist "%VENV_PY%" (
    echo [ERROR] Virtual environment python not found at:
    echo         %VENV_PY%
    echo Please make sure backend\venv is installed.
    pause
    exit /b 1
)

if "%1"=="" goto run_ocr
if "%1"=="ocr" goto run_ocr
if "%1"=="standalone" goto run_standalone
if "%1"=="all" goto run_all
goto run_custom

:run_ocr
echo [INFO] Running Offline OCR test (tests/test_offline_ocr.py)...
echo [INFO] Using virtual environment: %VENV_PY%
echo.
"%VENV_PY%" tests/test_offline_ocr.py
goto end

:run_standalone
echo [INFO] Running Offline OCR Diagnostic Runner (standalone mode)...
echo.
"%VENV_PY%" tests/test_offline_ocr.py --standalone
goto end

:run_all
echo [INFO] Running all test suites in tests/ and backend/tests/...
echo.
"%VENV_PY%" -m pytest tests/ backend/tests/ -v
goto end

:run_custom
echo [INFO] Running custom pytest target: %*
echo.
"%VENV_PY%" -m pytest %*
goto end

:end
echo.
echo ========================================================================
echo   Test run completed.
echo ========================================================================
