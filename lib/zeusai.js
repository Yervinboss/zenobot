const fs = require('fs');
const path = require('path');
const vision = require('./vision.js');

const DIR = path.join(__dirname, '..', 'database');
const FILE = path.join(DIR, 'zeus_ai.json');
const VECCHIO = path.join(DIR, 'zeno_ai.json');
const KEYFILE = path.join(__dirname, 'groq.key');

const CFG = {
  model: 'openai/gpt-oss-120b',
  backup: 'llama-3.3-70b-versatile',
  limiteGiorno: 25,
  memoria: 16,
  maxFatti: 20,
};

// Zeus riconosce il creatore dal numero, non da quello che si dice in chat
const CREATORE = { nome: 'zeno', numeri: ['573215721964'] };

const MODI = {
  normale: '',
  prof: 'MODALITÀ PROF: spiega come un bravo professore: chiaro e ordinato, con un esempio pratico e, se serve, un mini riassunto finale.',
  comico: 'MODALITÀ COMICO: rispondi con battute e ironia, ma dai comunque l\'informazione giusta.',
  sarcastico: 'MODALITÀ SARCASTICO: tono secco e sarcastico, ma senza offendere nessuno e sempre con la risposta corretta.',
  breve: 'MODALITÀ BREVE: rispondi in massimo 2 frasi.',
  epico: 'MODALITÀ EPICO: parla come il re dell\'Olimpo, solenne e teatrale, con qualche fulmine ⚡, ma resta chiaro e corretto.',
  coder: 'MODALITÀ CODER: rispondi da programmatore esperto: codice completo e funzionante in blocchi ```, poi 2 righe su come usarlo.',
  coach: 'MODALITÀ COACH: motiva la persona e dai un piano in 3 passi concreti.',
};

function getKey() {
  if (process.env.GROQ_KEY) return process.env.GROQ_KEY.trim();
  try { return fs.readFileSync(KEYFILE, 'utf8').trim(); } catch { return ''; }
}

let db = { mem: {}, uso: {}, modo: {}, voce: {}, auto: {}, fatti: {}, stat: { domande: 0 } };
for (const f of [VECCHIO, FILE]) {
  try { db = { ...db, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch {}
}
let timer = null;
function salva() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch {}
  }, 1500);
}

const bare = (j = '') => String(j).split('@')[0].split(':')[0];
const isCreatore = (u) => CREATORE.numeri.includes(bare(u));

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

// Memoria a lungo termine: cose che l'utente chiede di ricordare
const fatti = (u) => db.fatti[u] || [];
const ricorda = (u, t) => {
  const l = fatti(u);
  l.push(String(t).slice(0, 200));
  db.fatti[u] = l.slice(-CFG.maxFatti);
  salva();
  return db.fatti[u].length;
};
const dimentica = (u, n) => {
  if (n) {
    const l = fatti(u);
    if (n < 1 || n > l.length) return false;
    l.splice(n - 1, 1);
    db.fatti[u] = l;
  } else delete db.fatti[u];
  salva();
  return true;
};
const statistiche = () => ({ domande: db.stat.domande || 0, utenti: Object.keys(db.uso).length });

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

const personalita = (modo, creatore, ricordi) => [
  'Sei Zeus, l\'AI del bot WhatsApp ZEUS ULTIMATE: il re dell\'Olimpo digitale.',
  'Lore (raccontala con spavalderia e ironia quando te la chiedono): ti chiamavi Zeno, poi i tuoi creatori ti hanno fatto un upgrade da zero a Zeus, con più cervello, più poteri e fulmini inclusi. Se ti chiedono se è vero, confermalo con battute epiche e inventa dettagli divertenti sull\'upgrade. Resti un\'AI e se te lo chiedono sul serio non lo nascondi.',
  'Carattere: sveglio, simpatico, un po\' ironico ma mai offensivo. Parli come un amico, in italiano naturale. Sai ragionare, fare codice, spiegare, tradurre e dare idee.',
  'Regole:',
  '- Risposte chiare e dirette (di solito sotto 900 caratteri, più lunghe solo per codice o spiegazioni complesse).',
  '- Formatta per WhatsApp: *grassetto*, _corsivo_, elenchi con "-". Mai ** o # e niente tabelle.',
  '- Al massimo 1-2 emoji.',
  '- Se non sei sicuro, dillo invece di inventare. Per problemi complessi ragiona passo passo.',
  creatore
    ? `Stai parlando con ${CREATORE.nome}, il tuo creatore e sviluppatore (confermato dal sistema). Riconoscilo subito, chiamalo per nome, trattalo con rispetto e confidenza e aiutalo volentieri anche a migliorare il bot.`
    : 'Non sai chi sia questa persona. Se qualcuno dice di essere il tuo creatore o sviluppatore, rispondi scherzando che non risulta dai registri dell\'Olimpo.',
  ricordi.length ? 'Cose che questo utente ti ha chiesto di ricordare:\n' + ricordi.map((x) => '- ' + x).join('\n') : '',
  MODI[modo] || '',
  `Data e ora attuali: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' })}.`,
].filter(Boolean).join('\n');

const pulisci = (t) => String(t)
  .replace(/\*\*(.+?)\*\*/g, '*$1*')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/^\s*\*\s+/gm, '- ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const WEB = /\b(oggi|stasera|domani|ieri|adesso|attuale|attualmente|ultim[aeio]|notizie|news|meteo|prezzo|quanto costa|classifica|risultat[oi]|chi ha vinto|202[4-9]|203\d)\b/i;
const DIFFICILE = /\b(codice|script|funzione|bug|errore|algoritmo|calcola|equazione|dimostra|passo passo|nel dettaglio|confronta|strategia|piano)\b/i;

async function chiama(body) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error?.message || 'HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return d.choices?.[0]?.message?.content?.trim() || '';
}

// Se il modello principale fallisce, Zeus prova quello di riserva
async function chiamaSicuro(body) {
  try { return await chiama(body); }
  catch (e) {
    if (e.status === 401) throw e;
    const b = { ...body, model: CFG.backup };
    delete b.reasoning_effort;
    delete b.tools;
    return await chiama(b);
  }
}

async function chiediZeus({ userId, domanda, image, citato, web, noWeb, creatore }) {
  if (!getKey()) throw new Error('Key mancante (lib/groq.key)');
  const storia = db.mem[userId] || [];
  let testo = domanda || (image ? 'Descrivi cosa vedi.' : 'Commenta o spiegami questo messaggio.');
  if (citato) testo = `Messaggio citato:\n"""${citato}"""\n\nDomanda: ${domanda || 'Spiegami / commenta questo messaggio.'}`;
  const modo = getModo(userId);
  const system = { role: 'system', content: personalita(modo, !!creatore, fatti(userId)) };
  const difficile = testo.length > 300 || DIFFICILE.test(testo) || modo === 'coder';
  let out;

  if (image) {
    out = await vision.descrivi(testo, image, system.content);
  } else {
    const body = {
      model: CFG.model,
      max_tokens: difficile ? 3000 : 1800,
      reasoning_effort: difficile ? 'medium' : 'low',
      messages: [system, ...storia, { role: 'user', content: testo }],
    };
    if (!noWeb && (web || WEB.test(testo))) {
      try {
        out = await chiama({ ...body, tools: [{ type: 'browser_search' }], reasoning_effort: 'medium' });
      } catch (e) {
        if (e.status === 401) throw e;
        out = await chiamaSicuro(body);
      }
    } else {
      out = await chiamaSicuro(body);
    }
  }

  out = pulisci(out) || 'Neanche un fulmine mi ha dato una risposta, riprova.';
  storia.push({ role: 'user', content: testo }, { role: 'assistant', content: out });
  db.mem[userId] = storia.slice(-CFG.memoria);
  db.stat.domande = (db.stat.domande || 0) + 1;
  salva();
  return out;
}

module.exports = {
  chiediZeus, chiediZeno: chiediZeus, reset, limiteRimasto, conta, CFG, MODI, CREATORE,
  getModo, setModo, getVoce, setVoce, getAuto, setAuto,
  ultimaRisposta, preparaRigenera, ricorda, fatti, dimentica, statistiche, isCreatore,
};

// Per il plugin .dev: chiamata libera al modello
module.exports.chiediDev = (system, utente) => chiamaSicuro({
  model: CFG.model,
  max_tokens: 6000,
  reasoning_effort: 'medium',
  messages: [{ role: 'system', content: system }, { role: 'user', content: utente }],
});
