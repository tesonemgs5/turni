// Allinea il COLORE degli eventi gia' in calendario a quello del loro modello.
// Funzione pura (non scrive nulla): calcola cosa andrebbe cambiato.
//  - evento con modello valido: deve avere il colore del modello;
//  - evento "orfano" (senza modello, o con un modello che non esiste piu'):
//      * stesso calendario + stesso nome + stessi orari di un modello -> si COLLEGA
//        al modello (come fa gia' l'app al salvataggio) e prende il suo colore;
//      * stesso nome ma orari diversi, e UN SOLO modello con quel nome nel calendario
//        -> prende solo il colore (nessun collegamento, i report non cambiano);
//      * altrimenti non si tocca.
// Titoli e orari degli eventi non vengono mai modificati.
const norm = s => (s || "").trim().toUpperCase()
const hex = h => String(h || "").trim().toLowerCase()

export function calcolaAllineamentoColori({ events, modelli, mainCalId, coloreDelModello }) {
  const lista = (modelli || []).filter(Boolean)
  const perId = new Map(lista.map(m => [m.id, m]))
  const eventi = []
  Object.keys(events || {}).forEach(dk => {
    Object.keys(events[dk] || {}).forEach(cid => {
      ;(events[dk][cid] || []).forEach(e => {
        if (!e || !e.id) return
        let mod = e.modelloId ? perId.get(e.modelloId) : null
        let collega = null
        if (!mod) {
          const nome = norm(e.label)
          if (!nome) return
          const cand = lista.filter(m =>
            (m.calendarId || mainCalId) === cid &&
            (norm(m.titolo) === nome || norm(m.label) === nome))
          const esatto = cand.find(m => (m.inizio || "") === (e.tIn || "") && (m.fine || "") === (e.tOut || ""))
          if (esatto) { mod = esatto; collega = esatto.id }
          else if (cand.length === 1) { mod = cand[0] }
        }
        if (!mod) return
        const nuovo = coloreDelModello(mod)
        if (!nuovo) return
        if (hex(e.color) !== hex(nuovo) || collega) {
          eventi.push({ id: e.id, dk, cid, label: e.label, coloreVecchio: e.color, coloreNuovo: nuovo,
            collega, titoloModello: mod.titolo || mod.label || "" })
        }
      })
    })
  })
  const conteggio = new Map()
  eventi.forEach(x => conteggio.set(x.titoloModello, (conteggio.get(x.titoloModello) || 0) + 1))
  const perModello = [...conteggio.entries()].map(([titolo, n]) => ({ titolo, n })).sort((a, b) => b.n - a.n)
  return { totale: eventi.length, collegati: eventi.filter(x => x.collega).length, eventi, perModello }
}
