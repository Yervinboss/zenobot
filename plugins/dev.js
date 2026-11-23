const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sh = promisify(execFile);
const ai = require('../lib/zeusai.js');

const ROOT = path.join(__dirname, '..');
const BK = path.join(ROOT, 'database', 'backups');
const MAX = 60000;

const OKF = (f) => /^(index\.js|(plugins|lib)\/[\w.\-\/]+\.js)$/.test(f) && !f.includes('..');
const full = (f) => path.join(ROOT, f);
const bk = (f) => path.join(BK, f.replace(/\//g, '__'));
const testoDi = (msg) => {
  const x = msg?.ephemeralMessage?.message || msg || {};
  return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || '';
};

global.__devErr = global.__devErr || {};

function elenco() {
  const out = ['index.js'];
  const walk = (rel) => {
    for (const e of fs.readdirSync(full(rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.js')) out.push(r);
    }
  };
  for (const d of ['plugins', 'lib']) { try { walk(d); } catch {} }
  return out.filter((f) => fs.existsSync(full(f)));
}

async function sintassi(code) {
  const tmp = path.join(os.tmpdir(), 'devcheck_' + Date.now() + '.js');
  fs.writeFileSync(tmp, code);
  try { await sh('node', ['--check', tmp], { timeout: 20000 }); return null; }
  catch (e) { return String(e.stderr || e.message).split('\n').slice(0, 6).join('\n').split(tmp).join('file'); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}

const SYSTEM = `Sei un ingegnere Node.js esperto. Ti do un file di un bot WhatsApp (Baileys, CommonJS) e un problema.
Rispondi SOLO con JSON valido, senza testo fuori dal JSON, in questo formato:
{"spiegazione":"cosa non va e cosa cambi, in italiano, max 3 righe","modifiche":[{"vecchio":"testo ESATTO copiato dal file","nuovo":"testo corretto"}]}
Regole: fai il cambiamento minimo; "vecchio" deve comparire UNA sola volta nel file, con spazi e a capo identici; non riscrivere il file intero; non toccare chiavi, sessioni o dati. Se non trovi errori, restituisci "modifiche":[].`;

async function proponi(f, problema) {
  const code = fs.readFileSync(full(f), 'utf8');
  if (code.length > MAX) throw new Error(`File troppo grande (${code.length} caratteri, max ${MAX})`);
  const raw = await ai.chiediDev(SYSTEM, `File: ${f}\nProblema: ${problema}\n\nCodice:\n${code}`);
  let j;
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); }
  catch { throw new Error('Zeus non ha risposto in modo leggibile, riprova.'); }
  let nuovo = code;
  for (const x of j.modifiche || []) {
    if (!x.vecchio) throw new Error('Una modifica era vuota');
    const n = nuovo.split(x.vecchio).length - 1;
    if (n !== 1) throw new Error(`Una modifica non combacia col file (${n} corrispondenze). Riprova.`);
    nuovo = nuovo.replace(x.vecchio, () => x.nuovo ?? '');
  }
  if (!(j.modifiche || []).length) return { j, nuovo: null, code };
  const err = await sintassi(nuovo);
  if (err) throw new Error('La modifica proposta romperebbe il file:\n' + err);
  return { j, nuovo, code };
}

module.exports = {
  commands: ['dev', 'sviluppatore'],
  name: 'dev',
  category: 'owner',
  author: 'ZEUS',
  description: 'Modalità sviluppatore: Zeus controlla e ripara il codice del bot',
  usage: 'check | fix <file> | ok | annulla | ripristina <file> | leggi <file>',
  cooldown: 3000,

  async run(sock, m, args, cmd, ctx) {
    if (!(ctx.isOwner || ai.isCreatore(ctx.sender))) return ctx.err('Solo il creatore può usare la modalità sviluppatore.');
    const sub = (args[0] || '').toLowerCase();
    const f = (args[1] || '').replace(/^\.\//, '');

    if (sub === 'check') {
      await ctx.react('🔍');
      const files = elenco();
      const bad = [];
      for (const x of files) {
        const e = await sintassi(fs.readFileSync(full(x), 'utf8'));
        if (e) { bad.push(x); global.__devErr[x] = e; } else delete global.__devErr[x];
      }
      if (!bad.length) return ctx.ok(`Controllati ${files.length} file: nessun errore di sintassi. ⚡`);
      return ctx.info(`Controllati ${files.length} file.\nCon errori:\n${bad.map((x) => '- *' + x + '*').join('\n')}\n\nUsa *.dev fix <file>* per farli sistemare a Zeus.`, 'DEV CHECK');
    }

    if (sub === 'leggi') {
      if (!OKF(f) || !fs.existsSync(full(f))) return ctx.err('File non valido. Es: *.dev leggi plugins/zeus.js 1 40*');
      const righe = fs.readFileSync(full(f), 'utf8').split('\n');
      const da = Math.max(1, parseInt(args[2], 10) || 1);
      const a = Math.min(righe.length, parseInt(args[3], 10) || da + 39);
      const txt = righe.slice(da - 1, a).map((r, i) => (da + i) + ' ' + r).join('\n').slice(0, 3500);
      return ctx.reply(`*${f}* (righe ${da}-${a} di ${righe.length})\n\`\`\`${txt}\`\`\``);
    }

    if (sub === 'fix') {
      if (!OKF(f) || !fs.existsSync(full(f))) return ctx.err('File non valido. Es: *.dev fix plugins/zeus.js*');
      const citato = ctx.quoted?.message ? testoDi(ctx.quoted.message).slice(0, 1500) : '';
      const problema = [args.slice(2).join(' '), citato, global.__devErr[f]].filter(Boolean).join('\n') || 'Cerca errori e bug evidenti.';
      await ctx.react('🛠️');
      try {
        const { j, nuovo, code } = await proponi(f, problema);
        if (!nuovo) return ctx.info(j.spiegazione || 'Non ho trovato errori da correggere.', 'DEV');
        global.__devPending = { f, nuovo, code, ts: Date.now() };
        const anteprima = j.modifiche.map((x, i) => `${i + 1}) ${String(x.vecchio).trim().slice(0, 120)}\n   ➜ ${String(x.nuovo ?? '').trim().slice(0, 120)}`).join('\n').slice(0, 1800);
        return ctx.info(`*${f}*\n${j.spiegazione}\n\nModifiche:\n${anteprima}\n\n*.dev ok* per applicare • *.dev annulla* per scartare`, 'PROPOSTA DI ZEUS');
      } catch (e) { return ctx.err(e.message); }
    }

    if (sub === 'ok') {
      const p = global.__devPending;
      if (!p || Date.now() - p.ts > 10 * 60 * 1000) return ctx.err('Non c\'è nessuna proposta valida (scade dopo 10 minuti).');
      if (fs.readFileSync(full(p.f), 'utf8') !== p.code) return ctx.err('Il file è cambiato nel frattempo. Rifai *.dev fix*.');
      fs.mkdirSync(bk(p.f), { recursive: true });
      fs.copyFileSync(full(p.f), path.join(bk(p.f), Date.now() + '.bak'));
      fs.writeFileSync(full(p.f), p.nuovo);
      delete global.__devErr[p.f];
      global.__devPending = null;
      return ctx.ok(`Applicato a *${p.f}* (backup salvato). Riavvia il bot con *node index.js* per usarlo. ⚡`);
    }

    if (sub === 'annulla') { global.__devPending = null; return ctx.ok('Proposta scartata.'); }

    if (sub === 'ripristina') {
      if (!OKF(f)) return ctx.err('File non valido. Es: *.dev ripristina plugins/zeus.js*');
      let l = [];
      try { l = fs.readdirSync(bk(f)).sort(); } catch {}
      if (!l.length) return ctx.err('Nessun backup per questo file.');
      const ultimo = l[l.length - 1];
      fs.copyFileSync(path.join(bk(f), ultimo), full(f));
      fs.unlinkSync(path.join(bk(f), ultimo));
      return ctx.ok(`Ripristinato *${f}* all'ultimo backup. Riavvia il bot.`);
    }

    return ctx.info('*.dev check* trova i file con errori\n*.dev fix <file> [problema]* Zeus propone la correzione\n*.dev ok* / *.dev annulla*\n*.dev ripristina <file>*\n*.dev leggi <file> [da] [a]*\n\nEsempio: *.dev fix plugins/zeus.js*', 'MODALITÀ SVILUPPATORE');
  },
};
