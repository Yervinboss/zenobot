const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MODEL = 'gemini-3.1-flash-tts-preview';
const VOCE = 'Kore';

function keyGemini() {
  if (process.env.GEMINI_KEY) return process.env.GEMINI_KEY.trim();
  try { return fs.readFileSync(path.join(__dirname, 'gemini.key'), 'utf8').trim(); } catch { return ''; }
}

function pulisciPerVoce(t) {
  let s = String(t)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~`>#]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 700) {
    s = s.slice(0, 700);
    const i = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
    if (i > 300) s = s.slice(0, i + 1);
  }
  return s;
}

function ffmpeg(args, input) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', ...args]);
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => rej(new Error('ffmpeg non trovato (pkg install ffmpeg)')));
    p.on('close', (c) => (c === 0 ? res(Buffer.concat(out)) : rej(new Error('ffmpeg: ' + err.slice(0, 120)))));
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}

async function ttsGemini(testo) {
  const k = keyGemini();
  if (!k) throw new Error('Key Gemini mancante');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
    body: JSON.stringify({
      contents: [{ parts: [{ text: testo }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOCE } } },
      },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || 'HTTP ' + r.status);
  const parte = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!parte) throw new Error('Audio vuoto');
  return ffmpeg(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'], Buffer.from(parte.inlineData.data, 'base64'));
}

async function ttsGoogle(testo) {
  const pezzi = [];
  let cur = '';
  for (const w of testo.split(' ')) {
    if ((cur + ' ' + w).length > 180) { pezzi.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) pezzi.push(cur);
  const bufs = [];
  for (const p of pezzi) {
    const r = await fetch('https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=it&q=' + encodeURIComponent(p), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error('TTS HTTP ' + r.status);
    bufs.push(Buffer.from(await r.arrayBuffer()));
  }
  return ffmpeg(['-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'], Buffer.concat(bufs));
}

async function voce(testo) {
  const t = pulisciPerVoce(testo);
  if (!t) throw new Error('Niente da leggere');
  try {
    return await ttsGemini(t);
  } catch (e1) {
    try { return await ttsGoogle(t); } catch { throw new Error(e1.message); }
  }
}

module.exports = { voce };
