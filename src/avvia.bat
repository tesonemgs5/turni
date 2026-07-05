@echo off
REM ═══════════════════════════════════════════════════════════════
REM avvia.bat — Doppio click per verificare e pubblicare le modifiche.
REM Richiama script.py, che sta nella stessa cartella di questo file.
REM ═══════════════════════════════════════════════════════════════

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python script.py
    goto :fine
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    python3 script.py
    goto :fine
)

echo.
echo ❌ Python non trovato sul sistema.
echo    Installa Python da https://www.python.org/downloads/
echo    e assicurati di selezionare "Add python.exe to PATH" durante l'installazione.
echo.
pause
goto :eof

:fine
