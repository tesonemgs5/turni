import { test } from "node:test";
import assert from "node:assert/strict";
import { paroleDaBlocchi, leggiConMotore, MOTORI_OCR } from "../src/35-ocr-motori.js";

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
