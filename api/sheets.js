export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const sheetsUrl = process.env.SHEETS_URL || process.env.VITE_SHEETS_URL;
  if (!sheetsUrl) {
    console.error('SHEETS_URL non configurata');
    return res.status(503).json({ error: 'Servizio Sheets non configurato' });
  }
  if (!process.env.SHEETS_URL) console.warn('VITE_SHEETS_URL è deprecata: configurare SHEETS_URL');

  try {
    const response = req.method === 'POST'
      ? await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(req.body),
      })
      : await fetch(`${sheetsUrl}?${new URLSearchParams(req.query || {}).toString()}`);
    const text = await response.text();
    if (!response.ok) {
      console.error(`Servizio Sheets ha risposto con HTTP ${response.status}`);
      return res.status(502).json({ error: 'Errore dal servizio Sheets', status: response.status });
    }
    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).send(text);
    }
  } catch (err) {
    console.error('Richiesta al servizio Sheets non riuscita:', err);
    return res.status(502).json({ error: 'Servizio Sheets non raggiungibile' });
  }
}
