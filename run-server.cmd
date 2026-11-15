@echo off
rem ScholarScroll local backend + app.
rem Starts the Python/SQLite server on http://127.0.0.1:8000/ and opens it.
rem The database lives in server\data\ and is ignored by git.
cd /d "%~dp0"

start "ScholarScroll backend (port 8000)" cmd /k python server\app.py
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8000/
