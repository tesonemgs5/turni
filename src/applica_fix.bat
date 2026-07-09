@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ============================================
echo   FIX ModelloSelector / RotazioneForm
echo ============================================
echo.

REM --- Percorso di App.jsx: modifica questa riga se il file si trova altrove ---
set APPJSX_PATH=App.jsx

if not exist "%APPJSX_PATH%" (
    echo [ERRORE] Non trovo "%APPJSX_PATH%" nella cartella corrente.
    echo          Sposta questo .bat e fix_modelloselector.py nella cartella
    echo          del progetto, oppure modifica la variabile APPJSX_PATH.
    pause
    exit /b 1
)

echo Eseguo lo script Python sul file: %APPJSX_PATH%
echo.

python fix_modelloselector.py "%APPJSX_PATH%"
set SCRIPT_RESULT=%errorlevel%

echo.
if not "%SCRIPT_RESULT%"=="0" (
    echo ============================================
    echo   ATTENZIONE: le modifiche NON sono andate
    echo   a buon fine. Il file NON e' stato toccato.
    echo   Controlla i messaggi sopra, correggi lo
    echo   script e riprova.
    echo ============================================
    pause
    exit /b 1
)

echo ============================================
echo   Tutte le modifiche sono andate a buon fine!
echo ============================================
echo.

set /p COMMIT_MSG=Inserisci il messaggio di commit (o lascia vuoto per annullare): 

if "%COMMIT_MSG%"=="" (
    echo Nessun messaggio inserito. Commit e push ANNULLATI.
    echo Le modifiche restano applicate localmente al file, ma non vengono committate.
    pause
    exit /b 0
)

echo.
echo Eseguo: git add App.jsx
git add "%APPJSX_PATH%"

echo Eseguo: git commit -m "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"
if not "%errorlevel%"=="0" (
    echo [ERRORE] Il commit e' fallito. Controlla l'output sopra.
    pause
    exit /b 1
)

echo Eseguo: git push
git push
if not "%errorlevel%"=="0" (
    echo [ERRORE] Il push e' fallito. Controlla l'output sopra.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Commit e push completati con successo!
echo ============================================
pause
