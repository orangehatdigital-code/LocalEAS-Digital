@echo off
setlocal enabledelayedexpansion
title LocalEAS Digital - Baslatici
cls

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
if exist "%SCRIPT_DIR%package.json" (
    set PROJECT_ROOT=%SCRIPT_DIR%
)

if exist "%SCRIPT_DIR%banner.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%banner.ps1"
)

REM Default WSL settings
set WSL_DISTRO=Ubuntu-22.04
set WSL_USER=%USERNAME%

REM Read custom overrides from .env.local or .env if present
if exist "%PROJECT_ROOT%\.env.local" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%PROJECT_ROOT%\.env.local") do (
        if "%%a"=="WSL_DISTRO" set WSL_DISTRO=%%b
        if "%%a"=="WSL_USER" set WSL_USER=%%b
    )
) else if exist "%PROJECT_ROOT%\.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%PROJECT_ROOT%\.env") do (
        if "%%a"=="WSL_DISTRO" set WSL_DISTRO=%%b
        if "%%a"=="WSL_USER" set WSL_USER=%%b
    )
)

echo [1/3] WSL2 (%WSL_DISTRO% / %WSL_USER%) uzerinde durum kontrol ediliyor...

wsl.exe -d %WSL_DISTRO% -u %WSL_USER% bash -c "pgrep -f '[n]ext-server' >/dev/null 2>&1"
if not errorlevel 1 (
    echo [BILGI] Dashboard zaten calisiyor. Tarayici aciliyor...
    start "" "http://localhost:3000"
    exit /b 0
)

echo [2/3] LocalEAS Digital arka planda baslatiliyor (%WSL_DISTRO%)...
wsl.exe -d %WSL_DISTRO% -u %WSL_USER% bash -lc "cd ~/builds/local-expo-dashboard && [ -f scripts/start-wsl.sh ] && (sed -i 's/\r$//' scripts/start-wsl.sh 2>/dev/null; bash scripts/start-wsl.sh) || (sed -i 's/\r$//' start-wsl.sh 2>/dev/null; bash start-wsl.sh)"

echo [3/3] http://localhost:3000 hazir olmasi bekleniyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%check-ready.ps1"

if errorlevel 1 (
    echo.
    echo [UYARI] Sunucu 15 saniyede yanit vermedi.
    echo Log dosyasini kontrol edin: ~/builds/logs/dashboard-server.log
    pause
    exit /b 1
)

echo [TAMAM] Dashboard basariyla acildi: http://localhost:3000
start "" "http://localhost:3000"
ping 127.0.0.1 -n 3 >nul
exit /b 0
