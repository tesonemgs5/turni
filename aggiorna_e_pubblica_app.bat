@echo off
REM ─────────────────────────────────────────────────────────────────
REM  Doppio click su questo file per aggiornare la versione e
REM  ricostruire l'app (web + Android). Fa esattamente quello che
REM  faresti scrivendo a mano "python aggiorna_versione_e_build.py"
REM  nel terminale, ma senza dover aprire il terminale.
REM ─────────────────────────────────────────────────────────────────

REM Si posiziona nella cartella dove si trova QUESTO file .bat, così
REM funziona indipendentemente da dove lo lanci (doppio click da
REM Esplora risorse, da un collegamento sul desktop, ecc.). Deve stare
REM nella stessa cartella di aggiorna_versione_e_build.py (quella con
REM dentro "android", per intenderci).
cd /d "%~dp0"

echo ===============================================
echo   Aggiornamento e build dell'app in corso...
echo   Non chiudere questa finestra.
echo ===============================================
echo.

REM Controlla che Python sia installato e raggiungibile, per dare un
REM messaggio chiaro invece di una finestra che si chiude di scatto.
where python >nul 2>nul
if errorlevel 1 (
    echo ERRORE: Python non risulta installato o non e' nel PATH di sistema.
    echo Installa Python da https://www.python.org/downloads/ e riprova.
    echo.
    pause
    exit /b 1
)

REM Controlla che lo script Python sia presente accanto a questo .bat.
if not exist "aggiorna_versione_e_build.py" (
    echo ERRORE: non trovo "aggiorna_versione_e_build.py" in questa cartella:
    echo %cd%
    echo Questo file .bat deve stare nella STESSA cartella dello script Python.
    echo.
    pause
    exit /b 1
)

python aggiorna_versione_e_build.py

REM Lo script Python si ferma già da solo con "Premi INVIO per chiudere"
REM alla fine (anche in caso di errore): questa pausa extra scatta solo
REM se lo script termina in un modo imprevisto senza mostrare quel
REM messaggio (es. crash prima del suo stesso pausa_finale()), così la
REM finestra non si chiude comunque di scatto senza farti leggere l'esito.
echo.
echo ===============================================
echo   Finestra ancora aperta: premi un tasto per chiuderla.
echo ===============================================
pause >nul
