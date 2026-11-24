@echo off
rem Starts Volleyball Home Base. Leave this window open while you use it.
rem After "Update now" on the Dashboard, Home Base exits with code 3 and this starts the new version.
cd /d "%~dp0"
set VB_HOME_BASE_LAUNCHER=1
set ARGS=
where python >nul 2>nul
if errorlevel 1 (set PY=py) else (set PY=python)
:start
%PY% home_base.py %ARGS%
if errorlevel 3 if not errorlevel 4 (
  set ARGS=--no-browser
  echo.
  goto start
)
pause
