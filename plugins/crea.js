const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sh = promisify(execFile);
const ai = require('../lib/zeusai.js');

const DIR = __dirname;
const MARK = '// creato da Zeus';
const RISERVATI = ['ok', 'annulla', 'elimina', 'lista'];

async function sintassi(code) {
  const tmp = path.join(os.tmpdir(), 'crea_' + Date.now() + '.js');
  fs.writeFileSync(tmp, code);
  try { await sh('node', ['--check', tmp], { timeout: 20000 }); return null; }
  catch (e) { return String(e.stderr || e.message).split('\n').slice(0, 6).join('\n').split(tmp).join('file'); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}

const SYSTEM = `Sei un ingegnere Node.js esperto. Scrivi un plugin per un bot WhatsApp (Baileys, CommonJS).
Rispondi SOLO con il codice del file, senza spiegazioni e senza blocchi markdown.
La prima riga deve essere esattamente: ${MARK}
Formato obbligatorio:
module.exports = {
  commands: ['NOME'],
  name: 'NOME',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'breve descrizione in italiano',
  usage: '<argomenti>',
  cooldown: 3000,
  async run(sock, m, args, cmd, ctx) { ... },
};
Dentro run hai: ctx.reply(testo), ctx.ok(testo), ctx.err(testo), ctx.info(testo, titolo), ctx.react(emoji), ctx.argsText (testo dopo il comando), ctx.sender, ctx.chat, ctx.isOwner, ctx.isGroup, ctx.isAdmin, ctx.quoted. Per messaggi speciali: sock.sendMessage(ctx.chat, { ... }, { quoted: m }).
Regole: testi per l'utente in italiano; usa fetch (Node 18+) per le API e solo librerie standard di Node; su Termux ci sono yt-dlp e ffmpeg. Gestisci gli errori con try/catch e dai messaggi chiari. Non leggere sessioni, chiavi o database, non cancellare file, non usare process.exit ed eval.`;

const pulisci = (t) => String(t).replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();

module.exports = {
  commands: ['crea'],
  name: 'crea',
  category: 'owner',
  author: 'ZEUS',
  description: 'Zeus crea un nuovo comando partendo da una descrizione',
  usage: '<nome> <cosa deve fare> | ok | annulla | lista | elimina <nome>',
  cooldown: 5000,

  async run(sock, m, args, cmd, ctx) {
    if (!(ctx.isOwner || ai.isCreatore(ctx.sender))) return ctx.err('Solo il creatore può creare nuovi comandi.');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'annulla') { global.__creaPending = null; return ctx.ok('Proposta scartata.'); }

    if (sub === 'lista') {
      const l = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && fs.readFileSync(path.join(DIR, f), 'utf8').startsWith(MARK));
      if (!l.length) return ctx.info('Zeus non ha ancora creato nessun comando.', 'CREATI DA ZEUS');
      return ctx.info(l.map((f) => '- *.' + f.replace('.js', '') + '*').join('\n'), 'CREATI DA ZEUS');
    }

    if (sub === 'elimina') {
      const n = (args[1] || '').toLowerCase().replace(/^\./, '');
      const file = path.join(DIR, n + '.js');
      if (!/^[a-z0-9]{2,20}$/.test(n) || !fs.existsSync(file)) return ctx.err('Comando non trovato.');
      if (!fs.readFileSync(file, 'utf8').startsWith(MARK)) return ctx.err('Posso eliminare solo i comandi creati da Zeus.');
      fs.unlinkSync(file);
      return ctx.ok(`Comando *${n}* eliminato. Riavvia il bot.`);
    }

    if (sub === 'ok') {
      const p = global.__creaPending;
      if (!p || Date.now() - p.ts > 15 * 60 * 1000) return ctx.err('Non c\'è nessuna proposta valida (scade dopo 15 minuti).');
      const file = path.join(DIR, p.nome + '.js');
      if (fs.existsSync(file)) return ctx.err('Esiste già un file con questo nome.');
      fs.writeFileSync(file, p.code);
      global.__creaPending = null;
      return ctx.ok(`Creato *plugins/${p.nome}.js*. Riavvia il bot con *node index.js* e prova *.${p.nome}* ⚡`);
    }

    const nome = sub.replace(/^\./, '');
    const desc = args.slice(1).join(' ').trim();
    if (!nome || !desc) return ctx.info('*.crea <nome> <cosa deve fare>*\nEsempio: *.crea meteo mostra il meteo della città che scrivo*\n\n*.crea ok* conferma • *.crea annulla*\n*.crea lista* • *.crea elimina <nome>*', 'CREA COMANDI');
    if (!/^[a-z0-9]{2,20}$/.test(nome) || RISERVATI.includes(nome)) return ctx.err('Nome non valido: usa 2-20 lettere o numeri, senza spazi.');
    if (fs.existsSync(path.join(DIR, nome + '.js'))) return ctx.err('Esiste già un plugin con questo nome. Scegline un altro.');

    await ctx.react('🛠️');
    try {
      let code = pulisci(await ai.chiediDev(SYSTEM, `Nome comando: ${nome}\nCosa deve fare: ${desc}`));
      if (!code.startsWith(MARK)) code = MARK + '\n' + code;
      if (!code.includes('module.exports')) throw new Error('Zeus non ha scritto un plugin valido, riprova.');
      const err = await sintassi(code);
      if (err) throw new Error('Il codice ha un errore, riprova:\n' + err);

      const flag = [];
      if (/child_process|execFile|exec\(|spawn/.test(code)) flag.push('esegue comandi di sistema');
      if (/fs\.(write|unlink|rm)/.test(code)) flag.push('scrive o cancella file');
      if (/eval\(|process\.exit/.test(code)) flag.push('usa eval o process.exit');

      global.__creaPending = { nome, code, ts: Date.now() };
      const righe = code.split('\n');
      const anteprima = righe.slice(0, 18).join('\n').slice(0, 1200);
      return ctx.reply(`*Zeus ha scritto .${nome}* (${righe.length} righe)\n${flag.length ? '⚠️ Attenzione: ' + flag.join(', ') + '\n' : ''}\n\`\`\`${anteprima}\n...\`\`\`\n\n*.crea ok* per creare il file • *.crea annulla* per scartarlo`);
    } catch (e) { return ctx.err(e.message); }
  },
};
