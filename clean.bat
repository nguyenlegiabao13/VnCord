@echo off
setlocal EnableExtensions
title VnCord Cleaner
cd /d "%~dp0"

echo ============================================
echo   VnCord Cleaner
echo ============================================
echo.
echo Se xoa cac thu muc / file sinh ra khi build:
echo   - dist\                  (ket qua build)
echo   - node_modules\          (dependencies, chay lai: build.bat)
echo   - .modules\              (cache module Vencord companion)
echo   - ExtensionCache\
echo   - misc\bundle, misc\scripts
echo   - *.log, *.tsbuildinfo, .eslintcache
echo.

REM --y de bo qua cau hoi xac nhan
if /i "%~1"=="--y" goto :confirm

choice /c YN /n /m "Xac nhan xoa? [Y/N] "
if errorlevel 2 (
    echo Da huy.
    pause
    exit /b 0
)

:confirm
echo.
echo Dang xoa...

if exist "dist"              rd /s /q "dist"
if exist "node_modules"      rd /s /q "node_modules"
if exist ".modules"          rd /s /q ".modules"
if exist "ExtensionCache"    rd /s /q "ExtensionCache"
if exist ".VSCodeCounter"    rd /s /q ".VSCodeCounter"
if exist "misc\bundle"       rd /s /q "misc\bundle"
if exist "misc\scripts"      rd /s /q "misc\scripts"

if exist "*.log"             del /q /f "*.log" 2>nul
if exist "*.tsbuildinfo"     del /q /f "*.tsbuildinfo" 2>nul
if exist ".eslintcache"      del /q /f ".eslintcache" 2>nul

echo.
echo ============================================
echo   DA XOA SACH
echo   De build lai: build.bat
echo ============================================
pause
exit /b 0
