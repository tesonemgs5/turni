import test from "node:test";
import assert from "node:assert/strict";
import { supabase } from "../src/11-supabase.js";
import { SUPABASE_CONFIGURATO, SUPABASE_SOLO_BACKUP } from "../src/42-regola-supabase.js";

// REGOLA 1: senza chiavi nella build l'app deve funzionare lo stesso, tutta in locale.

test("senza chiavi Supabase non e' configurato e resta solo backup", () => {
  assert.equal(SUPABASE_CONFIGURATO, false);
  assert.equal(SUPABASE_SOLO_BACKUP, true);
});

test("ogni richiesta risponde 'backup disattivato' senza rete e senza eccezioni", async () => {
  const r = await supabase.from("events").select("*").eq("user_id", "x").order("date_key").limit(5);
  assert.equal(r.data, null);
  assert.equal(r.error.backupDisattivato, true);
  const u = await supabase.from("modelli").upsert({ id: 1 });
  assert.equal(u.error.backupDisattivato, true);
  const f = await supabase.rpc("get_changes", { a: 1 });
  assert.equal(f.error.backupDisattivato, true);
});

test("sessione, canali in tempo reale e logout non rompono niente", async () => {
  const { data } = await supabase.auth.getSession();
  assert.equal(data.session, null);
  const sub = supabase.auth.onAuthStateChange(() => {});
  sub.data.subscription.unsubscribe();
  const canale = supabase.channel("x").on("postgres_changes", {}, () => {}).subscribe();
  canale.unsubscribe();
  supabase.removeChannel(canale);
  assert.equal((await supabase.auth.signOut()).error, null);
  const login = await supabase.auth.signInWithPassword({ email: "a", password: "b" });
  assert.equal(login.error.backupDisattivato, true);
});
