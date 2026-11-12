@echo off
rem ScholarScroll local preview.
rem Starts the static server on http://127.0.0.1:8124/ and opens the browser.
rem Keep the server window open while you use the app.
cd /d "%~dp0"

start "ScholarScroll server (port 8124)" cmd /k python -m http.server 8124 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8124/
