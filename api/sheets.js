function breve(testo) {
  return String(testo || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function urlScriptGoogle(valore) {
  try {
    const u = new URL(String(valore || '').trim());
    return u.protocol === 'https:' && u.hostname === 'script.google.com' ? u.toString() : '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  // L'URL dello script è quello salvato nell'app (campo sheetsUrl del body, solo script.google.com);
  // la variabile SHEETS_URL di Vercel resta come ripiego.
  const urlApp = urlScriptGoogle(req.body && req.body.sheetsUrl) || urlScriptGoogle(req.query && req.query.sheetsUrl);
  const sheetsUrl = urlApp || process.env.SHEETS_URL || process.env.VITE_SHEETS_URL;
  if (!sheetsUrl) {
    console.error('SHEETS_URL non configurata');
    return res.status(503).json({ error: 'Servizio Sheets non configurato' });
  }
  if (!urlApp && !process.env.SHEETS_URL) console.warn('VITE_SHEETS_URL è deprecata: configurare SHEETS_URL');
  const { sheetsUrl: _u, ...bodySenzaUrl } = (req.body && typeof req.body === 'object') ? req.body : {};
  const { sheetsUrl: _q, ...querySenzaUrl } = req.query || {};

  try {
    const response = req.method === 'POST'
      ? await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(req.body && typeof req.body === 'object' ? bodySenzaUrl : req.body),
      })
      : await fetch(`${sheetsUrl}?${new URLSearchParams(querySenzaUrl).toString()}`);
    const text = await response.text();
    if (!response.ok) {
      console.error(`Servizio Sheets ha risposto con HTTP ${response.status}`);
      return res.status(502).json({ error: 'Errore dal servizio Sheets', status: response.status, dettaglio: breve(text) });
    }
    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).send(text);
    }
  } catch (err) {
    console.error('Richiesta al servizio Sheets non riuscita:', err);
    const causa = err && err.cause ? (err.cause.code || err.cause.message) : '';
    return res.status(502).json({ error: 'Servizio Sheets non raggiungibile', dettaglio: breve(`${err && err.message ? err.message : err} ${causa}`) });
  }
}
