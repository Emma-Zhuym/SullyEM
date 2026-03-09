@echo off
title XHS Skills Toolkit
chcp 65001 >nul 2>nul

set "TOOLKIT_DIR=%~dp0"
set "TOOLKIT_DIR=%TOOLKIT_DIR:~0,-1%"

REM === Find xiaohongshu-skills (try both folder names) ===
set "SKILLS_DIR=%TOOLKIT_DIR%\xiaohongshu-skills"
if not exist "%SKILLS_DIR%\scripts\cli.py" set "SKILLS_DIR=%TOOLKIT_DIR%\xiaohongshu-skills-main"
if not exist "%SKILLS_DIR%\scripts\cli.py" (
    echo [ERROR] xiaohongshu-skills folder not found!
    echo Put it in: %TOOLKIT_DIR%\xiaohongshu-skills\
    pause
    exit /b 1
)

REM === Find xhs-bridge.mjs ===
set "BRIDGE=%TOOLKIT_DIR%\xhs-bridge.mjs"
if not exist "%BRIDGE%" (
    echo [ERROR] xhs-bridge.mjs not found!
    pause
    exit /b 1
)

REM === Find cloudflared (try common names) ===
set "CLOUDFLARED="
if exist "%TOOLKIT_DIR%\cloudflared.exe" set "CLOUDFLARED=%TOOLKIT_DIR%\cloudflared.exe"
if not defined CLOUDFLARED if exist "%TOOLKIT_DIR%\cloudflared" set "CLOUDFLARED=%TOOLKIT_DIR%\cloudflared"
if not defined CLOUDFLARED if exist "%TOOLKIT_DIR%\cloudflared-windows-amd64.exe" set "CLOUDFLARED=%TOOLKIT_DIR%\cloudflared-windows-amd64.exe"

REM === Check and auto-install Node.js ===
where node >nul 2>nul
if errorlevel 1 (
    echo [SETUP] Node.js not found, trying to install via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>nul
    if errorlevel 1 (
        echo [WARN] winget install failed, trying direct download...
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "$url='https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi'; $out=\"$env:TEMP\node-install.msi\"; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process msiexec.exe -ArgumentList '/i',$out,'/quiet','/norestart' -Wait -NoNewWindow; Remove-Item $out"
        if errorlevel 1 (
            echo [ERROR] Node.js auto-install failed!
            echo Please download manually from https://nodejs.org
            pause
            exit /b 1
        )
    )
    REM Refresh PATH for this session
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    where node >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Node.js installed but not found in PATH. Please restart this script.
        pause
        exit /b 1
    )
    echo [OK] Node.js installed successfully.
    echo.
)

REM === Check and auto-install uv ===
where uv >nul 2>nul
if errorlevel 1 (
    echo [SETUP] uv not found, installing...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    if errorlevel 1 (
        echo [ERROR] uv install failed!
        echo Please manually run: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
        pause
        exit /b 1
    )
    REM Refresh PATH so uv is available in this session
    set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%PATH%"
    where uv >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] uv installed but not found in PATH. Please restart this script.
        pause
        exit /b 1
    )
    echo [OK] uv installed successfully.
    echo.
)

REM === Check Python (via uv) ===
uv python find >nul 2>nul
if errorlevel 1 (
    echo [SETUP] Python not found, installing via uv...
    uv python install
    if errorlevel 1 (
        echo [ERROR] Python install failed!
        pause
        exit /b 1
    )
    echo [OK] Python installed successfully.
    echo.
)

REM === First run: install Python deps ===
if not exist "%SKILLS_DIR%\.venv" (
    echo [SETUP] Installing Python dependencies...
    pushd "%SKILLS_DIR%"
    uv sync
    popd
    if errorlevel 1 (
        echo [ERROR] Dependency install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
    echo.
)

REM === Start Chrome on port 9222 with XHS profile ===
set "CHROME_PROFILE=%USERPROFILE%\.xhs\chrome-profile"
set "CHROME_PORT=9222"

REM Try common Chrome locations
set "CHROME_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME_EXE (
    echo [WARN] Chrome not found, CLI will try to start it automatically.
) else (
    echo [0] Starting Chrome with XHS profile...
    start "" "%CHROME_EXE%" --remote-debugging-port=%CHROME_PORT% --user-data-dir="%CHROME_PROFILE%" --no-first-run --start-maximized https://www.xiaohongshu.com
    timeout /t 3 /nobreak >nul
)

REM === Step 1: Start bridge server ===
echo [1/2] Starting bridge server...
start "XHS-Bridge" cmd /k node "%BRIDGE%" --skills-dir "%SKILLS_DIR%" --port 18061
timeout /t 2 /nobreak >nul

REM === Step 2: Cloudflared tunnel ===
if not defined CLOUDFLARED (
    echo [SETUP] cloudflared not found, downloading...
    set "CLOUDFLARED=%TOOLKIT_DIR%\cloudflared.exe"
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%TOOLKIT_DIR%\cloudflared.exe'"
    if not exist "%TOOLKIT_DIR%\cloudflared.exe" (
        echo [WARN] cloudflared download failed, skipping tunnel (local only).
        echo        You can download manually from: https://github.com/cloudflare/cloudflared/releases
        set "CLOUDFLARED="
    ) else (
        echo [OK] cloudflared downloaded.
        echo.
    )
)

if defined CLOUDFLARED (
    echo [2/2] Starting cloudflared tunnel...
    echo       [DEBUG] Path: %CLOUDFLARED%
    start "Cloudflared" cmd /k ""%CLOUDFLARED%" tunnel --url http://localhost:18061"
    timeout /t 4 /nobreak >nul
) else (
    echo [2/2] Skipping tunnel (local only).
)

echo.
echo  ============================================
echo   ALL STARTED
echo  ============================================
echo.
echo   Bridge: http://localhost:18061/api
echo.
if defined CLOUDFLARED (
    echo   Cloudflared tunnel is starting...
    echo   Look for the public URL in the Cloudflared window.
    echo   It looks like: https://xxx-xxx-xxx.trycloudflare.com
    echo   Use that URL + /api as your server URL.
) else (
    echo   Local only mode (no tunnel^).
    echo   Set server URL to: http://localhost:18061/api
)
echo.
echo   Chrome should be open at xiaohongshu.com
echo   Please login if not already logged in.
echo   Login session saved in: %%USERPROFILE%%\.xhs\chrome-profile\
echo.
echo   To stop: close the other popup windows.
echo.
pause
