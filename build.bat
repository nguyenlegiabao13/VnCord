@echo off
setlocal EnableExtensions
title VnCord Builder
cd /d "%~dp0"

echo ============================================
echo   VnCord Builder
echo ============================================
echo.

REM ---- Kiem tra Node.js ----
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js. Hay cai Node.js 22+ tu https://nodejs.org
    goto :fail
)
for /f "tokens=* usebackq" %%v in (`node -v`) do set NODE_VER=%%v
echo Node.js %NODE_VER%

REM ---- Kiem tra pnpm ----
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [INFO] Chua co pnpm, dang bat corepack...
    call corepack enable
    call corepack prepare pnpm@12.15.0 --activate
    where pnpm >nul 2>&1
    if errorlevel 1 (
        echo [LOI] Khong bat duoc pnpm. Chay thu cong: npm i -g pnpm
        goto :fail
    )
)
for /f "tokens=* usebackq" %%v in (`pnpm -v`) do set PNPM_VER=%%v
echo pnpm %PNPM_VER%
echo.

REM ---- Dong bo dependencies (nhanh neu da cap nhat) ----
echo [1/2] Kiem tra dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 goto :fail
echo.

REM ---- Build theo tham so ----
echo [2/2] Build...
set TARGET=%~1
if "%TARGET%"==""           set TARGET=desktop
if /i "%TARGET%"=="desktop" goto :build_desktop
if /i "%TARGET%"=="web"     goto :build_web
if /i "%TARGET%"=="watch"   goto :build_watch
if /i "%TARGET%"=="inject"  goto :build_inject

echo [LOI] Tham so khong hop le: "%TARGET%"
echo Cach dung: build.bat [desktop^|web^|watch^|inject]
goto :fail

:build_desktop
call pnpm build
if errorlevel 1 goto :fail
echo.
echo Build desktop xong! Ket qua nam trong thu muc dist\
goto :done

:build_web
call pnpm buildWeb
if errorlevel 1 goto :fail
echo.
echo Build web xong! ZIP extension nam trong dist\, userscript la dist\VnCord.user.js
goto :done

:build_watch
call pnpm watch
goto :done

:build_inject
call pnpm build
if errorlevel 1 goto :fail
call pnpm inject
if errorlevel 1 goto :fail
echo.
echo Build + inject xong! Khoi dong lai Discord de ap dung.
goto :done

:done
echo.
echo ============================================
echo   HOAN THANH
echo ============================================
pause
exit /b 0

:fail
echo.
echo ============================================
echo   BUILD THAT BAI - xem loi o tren
echo ============================================
pause
exit /b 1
