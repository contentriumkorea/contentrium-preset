@echo off
"%~dp0Setup.exe" --offline-directory "%~dp0."
if errorlevel 1 pause
