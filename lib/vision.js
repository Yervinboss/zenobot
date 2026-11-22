const fs = require('fs');
const path = require('path');
const MODEL = 'gemini-3.5-flash-lite';

function key() {
  if (process.env.GEMINI_KEY) return process.env.GEMINI_KEY.trim();
  try { return fs.readFileSync(path.join(__dirname, 'gemini.key'), 'utf8').trim(); } catch { return ''; }
}

async function descrivi(testo, image, system) {
  const k = key();
  if (!k) throw new Error('Key Gemini mancante (lib/gemini.key)');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: testo }, { inlineData: { mimeType: image.mime, data: image.b64 } }] }],
      generationConfig: { maxOutputTokens: 800 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || 'HTTP ' + r.status);
  const t = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!t) throw new Error(d.promptFeedback?.blockReason ? 'Immagine bloccata dal filtro' : 'Risposta vuota');
  return t;
}

module.exports = { descrivi };
