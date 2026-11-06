@echo off
chcp 65001>nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Uninstall
pause
