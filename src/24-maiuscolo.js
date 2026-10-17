// Tutto cio' che si digita in un campo di testo diventa MAIUSCOLO, in tutta l'app (ricerche, nomi, note...).
// Modulo globale: non serve toccare i singoli campi. Esclusi: password, email, indirizzi, numeri, date, orari, file, colori
// e i campi con data-no-upper.
const TIPI_ESCLUSI = new Set(["password", "email", "url", "number", "date", "time", "datetime-local", "month", "week", "file", "color", "range", "checkbox", "radio", "hidden", "submit", "button", "reset", "image"]);
const PAROLE_ESCLUSE = /https?:|url|@|e-?mail|password|token|chiave|\bapi\b|script/i;

function eEscluso(el) {
  if (el.hasAttribute("data-no-upper")) return true;
  const chiave = [el.placeholder, el.name, el.id, el.getAttribute("aria-label")].filter(Boolean).join(" ");
  if (PAROLE_ESCLUSE.test(chiave)) return true;
  if (/^https?:\/\//i.test(el.value || "")) return true;
  return false;
}
function daConvertire(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === "TEXTAREA") return !el.readOnly && !el.disabled && !eEscluso(el);
  if (el.tagName !== "INPUT") return false;
  const tipo = (el.getAttribute("type") || "text").toLowerCase();
  if (TIPI_ESCLUSI.has(tipo)) return false;
  return !el.readOnly && !el.disabled && !eEscluso(el);
}
// Scrive il valore maiuscolo con il setter NATIVO (non quello di React): cosi' React vede il cambio e chiama onChange
// con il testo gia' maiuscolo. Il cursore resta dov'era.
function rendiMaiuscolo(el) {
  const v = el.value;
  if (typeof v !== "string" || !v) return false;
  const su = v.toLocaleUpperCase("it-IT");
  if (su === v || su.length !== v.length) return false;
  let s = null, e = null;
  try { s = el.selectionStart; e = el.selectionEnd; } catch (_) {}
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  if (!desc || !desc.set) return false;
  desc.set.call(el, su);
  try { if (s !== null) el.setSelectionRange(s, e); } catch (_) {}
  return true;
}
function segnaCampo(el) {
  if (daConvertire(el)) { if (el.getAttribute("autocapitalize") !== "characters") el.setAttribute("autocapitalize", "characters"); }
}

export function attivaMaiuscoloGlobale() {
  if (typeof document === "undefined" || window.__maiuscoloAttivo) return;
  window.__maiuscoloAttivo = true;

  // Digitazione normale (fuori dalla composizione della tastiera): converte subito, in fase di cattura,
  // prima che React legga il valore.
  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (ev.isComposing || !daConvertire(el)) return;
    rendiMaiuscolo(el);
  }, true);
  // Composizione (suggerimenti della tastiera): si converte quando la parola e' confermata e si avvisa React.
  document.addEventListener("compositionend", (ev) => {
    const el = ev.target;
    if (!daConvertire(el)) return;
    if (rendiMaiuscolo(el)) el.dispatchEvent(new Event("input", { bubbles: true }));
  }, true);
  // Alla perdita del focus: ultima rete di sicurezza.
  document.addEventListener("focusout", (ev) => {
    const el = ev.target;
    if (!daConvertire(el)) return;
    if (rendiMaiuscolo(el)) el.dispatchEvent(new Event("input", { bubbles: true }));
  }, true);
  // La tastiera Android scrive gia' in maiuscolo.
  document.addEventListener("focusin", (ev) => segnaCampo(ev.target), true);
  const marcaTutti = (radice) => { try { (radice || document).querySelectorAll("input, textarea").forEach(segnaCampo); } catch (_) {} };
  marcaTutti(document);
  try {
    new MutationObserver((mutazioni) => {
      for (const m of mutazioni) m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.tagName === "INPUT" || n.tagName === "TEXTAREA") segnaCampo(n); else marcaTutti(n);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Rete di sicurezza visiva: mostra maiuscolo anche mentre la tastiera sta ancora componendo la parola.
  const st = document.createElement("style");
  st.textContent = `
    input:not([type=password]):not([type=email]):not([type=url]):not([type=number]):not([type=date]):not([type=time]):not([type=datetime-local]):not([type=month]):not([type=week]):not([type=file]):not([type=color]):not([type=range]):not([type=checkbox]):not([type=radio]):not([data-no-upper]):not([placeholder*="url" i]):not([placeholder*="script" i]):not([placeholder*="email" i]):not([placeholder*="password" i]),
    textarea:not([data-no-upper]) { text-transform: uppercase; }
    input::placeholder, textarea::placeholder { text-transform: none; }`;
  document.head.appendChild(st);
}
