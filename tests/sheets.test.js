import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/sheets.js";

function createResponse(){
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(key, value){ this.headers[key] = value; },
    status(code){ this.statusCode = code; return this; },
    json(value){ this.body = value; return this; },
    send(value){ this.body = value; return this; },
    end(){ this.ended = true; return this; },
  };
}

async function invoke(method, values={}){
  const res = createResponse();
  await handler({ method, ...values }, res);
  return res;
}

test("risponde chiaramente se SHEETS_URL non è configurata", async t=>{
  const current = process.env.SHEETS_URL;
  const currentLegacy = process.env.VITE_SHEETS_URL;
  delete process.env.SHEETS_URL;
  delete process.env.VITE_SHEETS_URL;
  const oldError = console.error;
  console.error = () => {};
  t.after(()=>{
    if(current===undefined) delete process.env.SHEETS_URL;
    else process.env.SHEETS_URL=current;
    if(currentLegacy===undefined) delete process.env.VITE_SHEETS_URL;
    else process.env.VITE_SHEETS_URL=currentLegacy;
    console.error=oldError;
  });
  const res = await invoke("GET");
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "Servizio Sheets non configurato" });
});

test("rifiuta i metodi non supportati senza invocare il backend", async()=>{
  assert.equal((await invoke("DELETE")).statusCode, 405);
});

test("inoltra GET e restituisce JSON", async t=>{
  const oldUrl = process.env.SHEETS_URL;
  const oldFetch = globalThis.fetch;
  process.env.SHEETS_URL = "https://sheets.example/exec";
  globalThis.fetch = async url=>{
    assert.equal(url, "https://sheets.example/exec?azione=leggi");
    return { ok:true, text:async()=>'{"ok":true}' };
  };
  t.after(()=>{
    if(oldUrl===undefined) delete process.env.SHEETS_URL;
    else process.env.SHEETS_URL=oldUrl;
    globalThis.fetch=oldFetch;
  });
  const res = await invoke("GET", { query:{ azione:"leggi" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok:true });
});

test("converte gli errori upstream in 502 senza inoltrare contenuti interni", async t=>{
  const oldUrl = process.env.SHEETS_URL;
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  process.env.SHEETS_URL = "https://sheets.example/exec";
  globalThis.fetch = async()=>({ ok:false, status:500, text:async()=>"dettagli interni" });
  console.error = () => {};
  t.after(()=>{
    if(oldUrl===undefined) delete process.env.SHEETS_URL;
    else process.env.SHEETS_URL=oldUrl;
    globalThis.fetch=oldFetch;
    console.error=oldError;
  });
  const res = await invoke("GET");
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error:"Errore dal servizio Sheets", status:500 });
});
