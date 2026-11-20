@echo off
setlocal enabledelayedexpansion
title LocalEAS Digital - Durdurucu
cls

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
if exist "%SCRIPT_DIR%package.json" (
    set PROJECT_ROOT=%SCRIPT_DIR%
)

if exist "%SCRIPT_DIR%banner.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%banner.ps1"
)

set WSL_DISTRO=Ubuntu-22.04
set WSL_USER=%USERNAME%

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

echo [1/2] LocalEAS Digital sunucusu durduruluyor (%WSL_DISTRO% / %WSL_USER%)...
wsl.exe -d %WSL_DISTRO% -u %WSL_USER% bash -c "pkill -f '[n]ext-server' 2>/dev/null || true; pkill -f '[n]ext start' 2>/dev/null || true"

echo [2/2] Sunucu islemleri temizlendi.
echo.
echo [TAMAM] LocalEAS Digital basariyla durduruldu.
ping 127.0.0.1 -n 3 >nul
exit /b 0
