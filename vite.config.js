import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process';

// Calcola la "versione" dell'app come ggmmaa.hhmm riferita al momento in cui
// Vercel esegue questa build (npm run build), non al momento in cui il
// browser carica la pagina. Questo timestamp è la miglior approssimazione
// disponibile del "Ready" mostrato nella dashboard di Vercel: coincidono a
// meno dei pochi secondi/minuti che il deploy impiega dopo la build stessa,
// perché non esiste modo, dentro il codice React in esecuzione nel browser,
// di leggere l'orario reale di "Ready" di Vercel (quel dato vive solo nella
// dashboard/API di Vercel, non nel bundle).
// Uso il fuso orario Europe/Rome esplicitamente: i server di build (es.
// Vercel) girano tipicamente in UTC, quindi senza questo new Intl la
// versione mostrerebbe l'ora UTC invece dell'ora italiana.
function calcolaVersioneBuild() {
  // Usa la data dell'ULTIMO COMMIT git, non l'istante in cui gira questa
  // build: cosi' la versione resta IDENTICA sia che la build parta su
  // Vercel (subito dopo il push) sia che parta in locale ore o giorni
  // dopo (es. lanciando il file .bat per generare l'APK) -- finche' non
  // c'e' un nuovo commit, ricompilare produce sempre lo stesso numero.
  // Se il comando git fallisce per qualsiasi motivo (repo non trovato,
  // git non installato...) si ripiega sull'istante attuale, cosi' la
  // build non si blocca mai per questo.
  let ora;
  try {
    const isoCommit = execSync('git log -1 --format=%cI').toString().trim();
    ora = new Date(isoCommit);
    if (isNaN(ora.getTime())) throw new Error('data commit non valida');
  } catch {
    ora = new Date();
  }
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ora).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const inizioAnno = new Date(Date.UTC(parseInt(parti.year, 10), 0, 1));
  const oraRoma = new Date(Date.UTC(
    parseInt(parti.year, 10), parseInt(parti.month, 10) - 1, parseInt(parti.day, 10)
  ));
  const giornoAnno = Math.floor((oraRoma - inizioAnno) / 86400000) + 1;
  const cifraAnno = parti.year.slice(-1);
  return `${cifraAnno}.${giornoAnno}.${parti.hour}${parti.minute}`;
}

export default defineConfig({
  // Path relativi negli asset generati (dist/index.html usa "./assets/..."
  // invece di "/assets/..."), indispensabile perché l'app Electron carica
  // index.html da file:// e non da un server web: con path assoluti il
  // browser li interpreta come percorso radice del disco e fallisce con
  // ERR_FILE_NOT_FOUND.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(calcolaVersioneBuild()),
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
      mangle: { toplevel: true },
      format: { comments: false }
    }
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' invece di 'autoUpdate': con autoUpdate, ad ogni apertura o
      // reload il service worker tenta subito di controllare se c'è una
      // versione più recente. Se quel controllo fallisce per assenza di
      // rete (esattamente il caso "utente offline che ricarica la pagina"),
      // il worker già attivo può finire in stato 'redundant' e smettere di
      // servire la cache — mandando in errore proprio lo scenario offline
      // che deve invece continuare a funzionare. Con 'prompt' il worker
      // attivo resta sempre in servizio; il controllo di una versione più
      // recente avviene solo quando la registerSW() lo richiede
      // esplicitamente (vedi 9.main.jsx), non ad ogni reload automatico.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg'],
      manifest: {
        name: 'Calendario Turni',
        short_name: 'Turni',
        description: 'Calendario turni multi-calendario',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        // Relativi come 'base', non assoluti: con scope/start_url '/' il
        // browser risolve le icone dalla root del dominio, il che rompe la
        // risoluzione quando l'app non è servita esattamente dalla root
        // (o gira via file:// in Electron). './' allinea manifest e app.
        scope: './',
        start_url: './',
        icons: [
          { src: './icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: './icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: './icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Garantisce che qualsiasi navigazione (apertura o ricarica della
        // pagina) offline venga servita dalla index.html già in cache,
        // invece di lasciare che il browser tenti la rete e fallisca con
        // la sua pagina di errore nativa (il "dinosauro" di Chrome).
        navigateFallback: '/index.html',
        // CAUSA CONFERMATA del bug "offline non funziona anche col service
        // worker attivo": l'app viene aperta con un querystring del tipo
        // ?v=1788382990342 (cache-buster). Senza denylist esplicita,
        // Workbox in alcune versioni non applica navigateFallback a URL
        // con querystring, quindi quella richiesta andava dritta in rete
        // e falliva invece di essere servita dalla cache. Con denylist
        // vuota, ogni richiesta di navigazione (con o senza querystring)
        // passa dal fallback.
        navigateFallbackDenylist: [],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' }
          }
        ]
      }
    })
  ]
})
