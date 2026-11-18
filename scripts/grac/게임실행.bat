@echo off
rem Opens the game in the browser through a small local server (PowerShell, built into Windows).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
