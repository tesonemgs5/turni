import test from "node:test";
import assert from "node:assert/strict";
import { spiegaErrore } from "../src/31-spiega-errore.js";

test("errore di programma: spiega cosa succede ai dati", () => {
  const s = spiegaErrore("storeRef is not defined", "Errore imprevisto");
  assert.match(s.cosaSuccede, /difetto nel programma/);
  assert.match(s.perIDati, /PRIMA dell'errore/);
  assert.equal(s.tecnico, "storeRef is not defined");
});
test("rete assente", () => {
  assert.match(spiegaErrore("TypeError: Failed to fetch", "x").cosaSuccede, /internet/);
});
test("risposta non JSON (servizio AI)", () => {
  assert.match(spiegaErrore("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", "x").cosaSuccede, /formato/);
});
test("errore sconosciuto: spiegazione generica con il contesto", () => {
  const s = spiegaErrore("boh", "Salvataggio modello");
  assert.match(s.cosaSuccede, /Salvataggio modello/);
});
