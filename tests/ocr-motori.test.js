import { test } from "node:test";
import assert from "node:assert/strict";
import { paroleDaBlocchi, leggiConMotore, MOTORI_OCR, righeDaDizionarioDictionary,
  decodificaCTC, paroleDaRiga } from "../src/35-ocr-motori.js";

test("paroleDaBlocchi appiattisce blocks > paragraphs > lines > words", () => {
  const blocks = [
    { paragraphs: [ { lines: [ { words: [ { text: "a" }, { text: "b" } ] }, { words: [ { text: "c" } ] } ] } ] },
    { paragraphs: [ { lines: [ { words: [ { text: "d" } ] } ] } ] },
  ];
  assert.deepEqual(paroleDaBlocchi(blocks).map(w => w.text), ["a", "b", "c", "d"]);
});

test("paroleDaBlocchi tollera strutture vuote o mancanti", () => {
  assert.deepEqual(paroleDaBlocchi(null), []);
  assert.deepEqual(paroleDaBlocchi([{}]), []);
  assert.deepEqual(paroleDaBlocchi([{ paragraphs: [{}] }]), []);
});

test("leggiConMotore: motore sconosciuto o non ancora disponibile segnala l'errore", async () => {
  await assert.rejects(() => leggiConMotore("inesistente", null), e => e.isMotoreNonDisponibile === true);
});

test("MOTORI_OCR elenca tesseract e paddle", () => {
  assert.deepEqual(MOTORI_OCR, ["tesseract", "paddle"]);
});

test("decodificaCTC collassa ripetizioni e scarta il blank", () => {
  const scores = new Float32Array([
    0.1, 0.8, 0.1,
    0.1, 0.8, 0.1,
    0.9, 0.05, 0.05,
    0.1, 0.1, 0.8,
  ]);
  assert.equal(decodificaCTC(scores, 4, ["a", "b"]).text, "ab");
});

test("righeDaDizionarioDictionary aggiunge il carattere spazio", () => {
  assert.deepEqual(righeDaDizionarioDictionary("a\nb\n"), ["a", "b", " "]);
});

test("paroleDaRiga divide il testo mantenendo bbox e confidenza", () => {
  const words = paroleDaRiga("Primo Secondo", { x0: 10, y0: 20, x1: 110, y1: 30 }, 87);
  assert.deepEqual(words.map(w => w.text), ["Primo", "Secondo"]);
  assert.equal(words[0].confidence, 87);
  assert.equal(words[1].bbox.x1, 110);
});
