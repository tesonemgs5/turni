export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito" });
  }

  const { fileBase64, mimeType } = req.body || {};
  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: "File mancante" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY non configurata su Vercel" });
  }

  const prompt = `Guarda questa immagine o PDF di una tabella turni di lavoro.
Estrai OGNI giorno che ha un turno assegnato e indicalo con data e nome del turno esattamente come scritto (es. "NOTTE", "PRIMO", "SECONDO", "3° TURNO", "MATTINA", "POMERIGGIO", ecc).
Rispondi SOLO con un array JSON valido, senza testo prima o dopo, senza markdown, in questo formato esatto:
[{"data":"YYYY-MM-DD","turno":"NOME TURNO COME SCRITTO"}]
Se non trovi l'anno nella tabella, deducilo dal contesto o usa l'anno corrente.
Se un giorno non ha turno assegnato o è vuoto, non includerlo nell'array.`;

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: fileBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      console.error("Errore Gemini API:", errText);
      return res.status(502).json({ error: "Errore dalla API Gemini" });
    }

    const data = await r.json();
    const testoRisposta = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    let turni;
    try {
      turni = JSON.parse(testoRisposta);
    } catch (parseErr) {
      console.error("Risposta Gemini non è JSON valido:", testoRisposta);
      return res.status(502).json({ error: "Risposta AI non interpretabile" });
    }

    if (!Array.isArray(turni)) {
      return res.status(502).json({ error: "Formato risposta AI inatteso" });
    }

    const turniValidi = turni.filter(
      (t) => t && typeof t.data === "string" && typeof t.turno === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.data)
    );

    return res.status(200).json(turniValidi);
  } catch (err) {
    console.error("Errore chiamata Gemini:", err);
    return res.status(500).json({ error: "Errore interno durante l'estrazione" });
  }
}