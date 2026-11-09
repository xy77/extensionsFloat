@echo off
chcp 65001>nul
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" (
  echo Cannot find Windows PowerShell at:
  echo   %PS_EXE%
  pause
  exit /b 1
)
if not exist "%~dp0install-windows.ps1" (
  echo Cannot find install-windows.ps1 next to this file.
  pause
  exit /b 1
)
"%PS_EXE%" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Uninstall
echo.
pause
