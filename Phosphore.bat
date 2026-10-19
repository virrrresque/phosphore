@echo off
rem Double-clic : compile puis lance Phosphore (version de développement).
cd /d "%~dp0"
call npm start
if errorlevel 1 pause
