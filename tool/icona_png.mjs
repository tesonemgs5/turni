// Solo per la build Windows: electron-builder vuole un'icona PNG, nel repo c'e' solo l'SVG.
// Crea public/icons/icon-512.png (non va nel repo). Richiede: npm i --no-save sharp
import sharp from 'sharp'

await sharp('public/icons/icon-512.svg', { density: 384 })
  .resize(512, 512)
  .png()
  .toFile('public/icons/icon-512.png')
console.log('Icona creata: public/icons/icon-512.png')
