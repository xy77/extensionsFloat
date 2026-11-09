@echo off
chcp 65001>nul
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" (
  echo Cannot find Windows PowerShell at:
  echo   %PS_EXE%
  echo Please run this on Windows 10/11 with PowerShell 5.1.
  pause
  exit /b 1
)
if not exist "%~dp0install-windows.ps1" (
  echo Cannot find install-windows.ps1 next to this file.
  echo Keep both files in the scripts folder of the extracted extension.
  pause
  exit /b 1
)
"%PS_EXE%" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
echo.
pause
