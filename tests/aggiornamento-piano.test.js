import { test } from "node:test"
import assert from "node:assert/strict"
import {
  pianificaAggiornamento, passiDaPiano, leggiBodyRelease, formatoMb, urlCanale,
} from "../src/36-aggiornamento-piano.js"

const MB = 1024 * 1024
const manifest = (extra = {}) => ({
  version: 1,
  base: { build: 10, asset: "turni.apk", sha256: "b10", size: 41 * MB },
  current: { build: 13, sha256: "c13", size: 41 * MB },
  patches: [
    { from: 10, to: 11, asset: "patch-10-11.dpat", size: 2 * MB, from_sha: "b10", to_sha: "s11" },
    { from: 11, to: 12, asset: "patch-11-12.dpat", size: 1 * MB, from_sha: "s11", to_sha: "s12" },
    { from: 12, to: 13, asset: "patch-12-13.dpat", size: 1 * MB, from_sha: "s12", to_sha: "c13" },
  ],
  ...extra,
})

test("una sola patch dall'ultima build installata", () => {
  const p = pianificaAggiornamento(manifest(), 12)
  assert.equal(p.usaBase, false)
  assert.deepEqual(p.patch.map(e => e.asset), ["patch-12-13.dpat"])
  assert.equal(p.byte, 1 * MB)
})

test("catena di piu' patch dalla build installata se pesa meno della base", () => {
  const p = pianificaAggiornamento(manifest(), 10)
  assert.equal(p.usaBase, false)
  assert.equal(p.patch.length, 3)
  assert.equal(p.byte, 4 * MB)
})

test("build non nella catena: parte dalla base con le sue patch", () => {
  const p = pianificaAggiornamento(manifest(), 7)
  assert.equal(p.usaBase, true)
  assert.equal(p.patch.length, 3)
  assert.equal(p.byte, 41 * MB + 4 * MB)
})

test("installata nella catena: vincono le patch anche se pesanti (la base aggiungerebbe l'APK intero)", () => {
  const m = manifest()
  m.patches[0].size = 30 * MB
  m.patches[1].size = 30 * MB
  const p = pianificaAggiornamento(m, 10)
  assert.equal(p.usaBase, false)
  assert.equal(p.byte, 61 * MB)
})

test("gia' aggiornato: nessun piano; forzaCompleto riparte dalla base", () => {
  assert.equal(pianificaAggiornamento(manifest(), 13), null)
  assert.equal(pianificaAggiornamento(manifest(), 14), null)
  assert.equal(pianificaAggiornamento(manifest(), 13, { forzaCompleto: true }).usaBase, true)
})

test("elenco vuoto o rotto: nessun piano", () => {
  assert.equal(pianificaAggiornamento(null, 1), null)
  assert.equal(pianificaAggiornamento({}, 1), null)
  const senzaBase = manifest({ base: { build: 10, asset: "", size: 0 } })
  assert.equal(pianificaAggiornamento(senzaBase, 7), null)
})

test("passi: base prima, poi le patch, con etichetta e dimensione", () => {
  const passi = passiDaPiano(pianificaAggiornamento(manifest(), 7))
  assert.deepEqual(passi.map(s => s.etichetta), [
    "APK base (build 10)", "Patch 10 \u2192 11", "Patch 11 \u2192 12", "Patch 12 \u2192 13",
  ])
  assert.equal(passi[0].tipo, "base")
  assert.equal(passi[1].from_sha, "b10")
  assert.equal(formatoMb(passi[1].size), "2.0")
})

test("corpo della release: novita', riga del tipo e marcatori", () => {
  const body = "• Aggiornamenti come in DartPDF\n   – Scarichi solo la differenza.\n\n" +
    "Aggiornamento: patch, circa 6 MB\n<!-- update-kind:patch -->\n<!-- agg:11 -->\n<!-- app-build:263 -->"
  const r = leggiBodyRelease(body)
  assert.deepEqual(r.note, ["- Aggiornamenti come in DartPDF", "   - Scarichi solo la differenza."])
  assert.equal(r.rigaTipo, "Aggiornamento: patch, circa 6 MB")
  assert.equal(r.tipo, "patch")
  assert.equal(r.build, 263)
})

test("corpo vecchio con 'Tipo aggiornamento: full': niente scritta grezza", () => {
  const r = leggiBodyRelease("\n\nTipo aggiornamento: full\nBuild automatica dal commit 473be34\n<!-- update-kind:full -->\n<!-- agg:8 -->")
  assert.deepEqual(r.note, [])
  assert.equal(r.rigaTipo, "Aggiornamento: completo")
})

test("indirizzo del canale", () => {
  assert.equal(urlCanale("a/b", "patches.json"),
    "https://github.com/a/b/releases/download/canale-aggiornamenti/patches.json")
})
