@echo off
REM Enhanced HTTP Server Debug Launcher
powershell -ExecutionPolicy Bypass -File "%~dp0%ServerDebug.ps1" -Port 8000 -LogToFile -Verbose
pause