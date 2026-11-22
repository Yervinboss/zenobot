const fs = require('fs');
const path = require('path');
const vision = require('./vision.js');

const DIR = path.join(__dirname, '..', 'database');
const FILE = path.join(DIR, 'zeno_ai.json');
const KEYFILE = path.join(__dirname, 'groq.key');

const CFG = {
  model: 'openai/gpt-oss-120b',
  limiteGiorno: 25,
  memoria: 10,
};

const MODI = {
  normale: '',
  prof: 'MODALITÀ PROF: spiega come un bravo professore: chiaro e ordinato, con un esempio pratico e, se serve, un mini riassunto finale.',
  comico: 'MODALITÀ COMICO: rispondi con battute e ironia, ma dai comunque l\'informazione giusta.',
  sarcastico: 'MODALITÀ SARCASTICO: tono secco e sarcastico, ma senza offendere nessuno e sempre con la risposta corretta.',
  breve: 'MODALITÀ BREVE: rispondi in massimo 2 frasi.',
};

function getKey() {
  if (process.env.GROQ_KEY) return process.env.GROQ_KEY.trim();
  try { return fs.readFileSync(KEYFILE, 'utf8').trim(); } catch { return ''; }
}

let db = { mem: {}, uso: {}, modo: {}, voce: {}, auto: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
let timer = null;
function salva() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch {}
  }, 1500);
}

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const usi = (u) => (db.uso[u] && db.uso[u].g === oggi() ? db.uso[u].n : 0);
const limiteRimasto = (u) => Math.max(0, CFG.limiteGiorno - usi(u));
const conta = (u) => { db.uso[u] = { g: oggi(), n: usi(u) + 1 }; salva(); };
const reset = (u) => { delete db.mem[u]; salva(); };

const getModo = (u) => (MODI[db.modo[u]] !== undefined ? db.modo[u] : 'normale');
const setModo = (u, m) => { db.modo[u] = m; salva(); };
const getVoce = (u) => db.voce[u] || '';
const setVoce = (u, v) => { db.voce[u] = v || ''; salva(); };
const getAuto = (chat, def) => (db.auto[chat] === undefined ? def : !!db.auto[chat]);
const setAuto = (chat, v) => { db.auto[chat] = !!v; salva(); };

function ultimaRisposta(u) {
  const s = db.mem[u] || [];
  const x = s[s.length - 1];
  return x && x.role === 'assistant' ? x.content : '';
}

function preparaRigenera(u) {
  const s = db.mem[u] || [];
  if (s.length < 2) return null;
  const domanda = s[s.length - 2].content;
  db.mem[u] = s.slice(0, -2);
  salva();
  return domanda;
}

const personalita = (modo) => `Sei Zeno, l'AI del bot WhatsApp ZENO ULTIMATE.
Carattere: simpatico, sveglio, un po' ironico ma mai offensivo. Parli come un amico, in italiano naturale.
Regole:
- Risposte brevi e chiare (di solito sotto 900 caratteri), vai dritto al punto.
- Formatta per WhatsApp: *grassetto*, _corsivo_, elenchi con "-". Mai ** o # e niente tabelle.
- Al massimo 1-2 emoji.
- Se non sei sicuro, dillo invece di inventare.
- Se ti chiedono chi sei: sei Zeno, assistente AI di ZENO ULTIMATE.
${MODI[modo] || ''}
Data e ora attuali: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' })}.`;

const pulisci = (t) => String(t)
  .replace(/\*\*(.+?)\*\*/g, '*$1*')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/^\s*\*\s+/gm, '- ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const WEB = /\b(oggi|stasera|domani|ieri|adesso|attuale|attualmente|ultim[aeio]|notizie|news|meteo|prezzo|quanto costa|classifica|risultat[oi]|chi ha vinto|202[4-9]|203\d)\b/i;

async function chiama(body) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error?.message || 'HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return d.choices?.[0]?.message?.content?.trim() || '';
}

async function chiediZeno({ userId, domanda, image, citato, web, noWeb }) {
  if (!getKey()) throw new Error('Key mancante (lib/groq.key)');
  const storia = db.mem[userId] || [];
  let testo = domanda || (image ? 'Descrivi cosa vedi.' : 'Commenta o spiegami questo messaggio.');
  if (citato) testo = `Messaggio citato:\n"""${citato}"""\n\nDomanda: ${domanda || 'Spiegami / commenta questo messaggio.'}`;
  const system = { role: 'system', content: personalita(getModo(userId)) };
  let out;

  if (image) {
    out = await vision.descrivi(testo, image, system.content);
  } else {
    const body = { model: CFG.model, max_tokens: 1800, reasoning_effort: 'low', messages: [system, ...storia, { role: 'user', content: testo }] };
    if (!noWeb && (web || WEB.test(testo))) {
      try {
        out = await chiama({ ...body, tools: [{ type: 'browser_search' }], reasoning_effort: 'medium' });
      } catch (e) {
        if (e.status === 429 || e.status === 401) throw e;
        out = await chiama(body);
      }
    } else {
      out = await chiama(body);
    }
  }

  out = pulisci(out) || 'Non sono riuscito a rispondere, riprova.';
  storia.push({ role: 'user', content: testo }, { role: 'assistant', content: out });
  db.mem[userId] = storia.slice(-CFG.memoria);
  salva();
  return out;
}

module.exports = {
  chiediZeno, reset, limiteRimasto, conta, CFG, MODI,
  getModo, setModo, getVoce, setVoce, getAuto, setAuto,
  ultimaRisposta, preparaRigenera,
};
