import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
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