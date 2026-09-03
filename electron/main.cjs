// File principale di Electron: crea la finestra dell'app desktop e carica
// i file già compilati da Vite (cartella dist/), esattamente come farebbe
// un browser ma senza barra indirizzi né cornice da browser — un vero
// programma Windows, installabile con un .exe, che si avvia offline dal
// primissimo avvio perché tutto il codice è già dentro il file installato
// (non deve scaricare nulla da internet per partire).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function creaFinestraPrincipale() {
  const finestra = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../public/icons/icon-512.png'),
    webPreferences: {
      // L'app usa solo API web standard (fetch, localStorage, Supabase-js
      // via https) — non serve integrazione Node.js dentro la pagina,
      // quindi si tengono le impostazioni di sicurezza di default più
      // restrittive (contextIsolation true, nodeIntegration false).
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Sfondo scuro coerente col theme-color dell'app, evita un flash
    // bianco durante il caricamento iniziale della finestra.
    backgroundColor: '#0f172a',
  });

  // In produzione, l'app carica i file statici già compilati da
  // "vite build" (cartella dist/), copiati accanto all'eseguibile.
  // Non c'è alcuna richiesta di rete per caricare l'app stessa: da qui
  // in avanti, l'unica rete usata è quella verso Supabase per il backup,
  // esattamente come nella versione PWA già sistemata.
  finestra.loadFile(path.join(__dirname, '../dist/index.html'));

  // TEMPORANEO: apre gli strumenti sviluppatore per vedere eventuali errori
  finestra.webContents.openDevTools();

  // Rimuove la barra dei menu di default di Electron (File/Edit/View/...)
  // che non serve per questa app e sarebbe solo rumore per l'utente.
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  creaFinestraPrincipale();

  app.on('activate', () => {
    // Su macOS è normale ricreare una finestra quando si clicca l'icona
    // nel dock e non ce ne sono aperte; su Windows questo branch non
    // scatta mai in pratica, ma non è dannoso tenerlo per portabilità.
    if (BrowserWindow.getAllWindows().length === 0) creaFinestraPrincipale();
  });
});

app.on('window-all-closed', () => {
  // Su Windows/Linux l'app si chiude del tutto quando si chiude
  // l'ultima finestra (comportamento standard atteso dall'utente).
  if (process.platform !== 'darwin') app.quit();
});
