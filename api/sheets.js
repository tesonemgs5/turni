export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEETS_URL = process.env.VITE_SHEETS_URL;

  try {
    if (req.method === 'POST') {
      const response = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(req.body),
      });
      const text = await response.text();
      try {
        return res.status(200).json(JSON.parse(text));
      } catch {
        return res.status(200).send(text);
      }
    }

    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query).toString();
      const response = await fetch(`${SHEETS_URL}?${params}`);
      const text = await response.text();
      try {
        return res.status(200).json(JSON.parse(text));
      } catch {
        return res.status(200).send(text);
      }
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
