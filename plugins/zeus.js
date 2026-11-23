const ai = require('../lib/zeusai.js');
const { voce } = require('../lib/voce.js');
const { btn } = { btn: { reply: (text, id) => ({ text, id }) } };

function libMedia() {
  for (const n of ['@innovatorssoft/baileys', '@itsliaaa/baileys', '@whiskeysockets/baileys', 'baileys']) {
    try { const l = require(n); if (l.downloadMediaMessage) return l; } catch {}
  }
  return null;
}
const unwrap = (msg) => msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg;
const testoDi = (msg) => {
  const x = unwrap(msg) || {};
  return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || '';
};
const bare = (j = '') => String(j).split('@')[0].split(':')[0];
const nolog = { info() {}, error() {}, warn() {}, debug() {}, trace() {}, fatal() {}, child() { return nolog; } };

function quotedDi(m) {
  const msg = unwrap(m.message) || {};
  const ci = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo;
  if (!ci?.quotedMessage) return null;
  return { stanzaId: ci.stanzaId, participant: ci.participant, message: ci.quotedMessage };
}

async function scaricaImmagine(sock, m, quoted, chat) {
  const lib = libMedia();
  if (!lib) return null;
  let target = null;
  if (unwrap(m.message)?.imageMessage) target = m;
  else if (quoted?.message && unwrap(quoted.message)?.imageMessage) {
    target = { key: { remoteJid: chat, id: quoted.stanzaId, participant: quoted.participant, fromMe: false }, message: unwrap(quoted.message) };
  }
  if (!target) return null;
  const buf = await lib.downloadMediaMessage(target, 'buffer', {}, { logger: nolog, reuploadRequest: sock.updateMediaMessage });
  if (!buf || buf.length > 3_500_000) throw new Error('Immagine troppo grande');
  return { mime: 'image/jpeg', b64: buf.toString('base64') };
}

async function mandaVoce(sock, chat, m, testo) {
  const ogg = await voce(testo);
  await sock.sendMessage(chat, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
}

// Parte comune: comando e risposta automatica
async function elabora({ sock, m, chat, userId, owner, domanda, quoted, web, mode, ctx }) {
  const react = (e) => sock.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {});
  const err = (t) => (ctx ? ctx.err(t) : sock.sendMessage(chat, { text: '❌ ' + t }, { quoted: m }));
  const creatore = !!owner || ai.isCreatore(userId);

  let image = null;
  try { image = await scaricaImmagine(sock, m, quoted, chat); }
  catch (e) { return err('Non riesco a leggere la foto: ' + e.message); }

  let citato = '';
  if (mode !== 'rigenera') citato = quoted?.message ? testoDi(quoted.message).slice(0, 1500) : '';

  if (!domanda && !citato && !image) return err('Scrivi una domanda.');
  if (!creatore && ai.limiteRimasto(userId) <= 0) {
    return sock.sendMessage(chat, { text: `⚠️ Hai finito le ${ai.CFG.limiteGiorno} domande di oggi. Tornano domani!` }, { quoted: m });
  }

  await react('⚡');
  try {
    const risposta = await ai.chiediZeus({ userId, domanda, image, citato, web, creatore, noWeb: mode === 'riscrivi' || mode === 'codice' });
    if (!creatore) ai.conta(userId);

    const vm = ai.getVoce(userId);
    const mandaV = async () => {
      try { await mandaVoce(sock, chat, m, risposta); return true; }
      catch (e) { await err('Voce non disponibile: ' + e.message); return false; }
    };
    let vocaleInviato = false;
    if (vm === 'solo') vocaleInviato = await mandaV();
    if (!vocaleInviato) {
      const iosPrivato = ctx && ctx.isPrivate && ctx.device !== 'android';
      if (ctx && iosPrivato) {
        await ctx.reply(risposta);
      } else if (ctx) {
        await ctx.reply(risposta);
        if (ai.getAuto('btn:' + userId, false)) try {
          await ctx.sendButtons({
            text: '⚡ Azioni rapide',
            footer: 'Zeus AI',
            buttons: [btn.reply('🔁 Rigenera', 'zeus rigenera'), btn.reply('📝 Riassumi', 'zeus riassumi'), btn.reply('🌍 Traduci', 'zeus traduci'), btn.reply('🔊 Ascolta', 'zeus ascolta')],
          });
        } catch {}
      } else {
        await sock.sendMessage(chat, { text: risposta }, { quoted: m });
      }
      if (vm && vm !== 'solo') await mandaV();
    }
    await react('✅');
  } catch (e) {
    await react('❌');
    await err('Errore AI: ' + e.message);
  }
}

const AIUTO = [
  '*.zeus <domanda>* risponde',
  '*.zeus web <domanda>* cerca su internet',
  'Rispondi a un messaggio o a una foto con *.zeus*',
  '*.zeus codice <richiesta>* scrive codice',
  '*.zeus idea <tema>* 5 idee originali',
  '*.zeus traduci [lingua]* traduce l\'ultima risposta',
  '*.zeus modo normale|prof|comico|sarcastico|breve|epico|coder|coach*',
  '*.zeus ricorda <cosa>* • *.zeus memoria* • *.zeus dimentica [n]*',
  '*.zeus risposta testo|audio|entrambi*',
  '*.zeus ascolta* legge l\'ultima risposta',
  '*.zeus auto on/off* risposta automatica (admin/owner)',
  '*.zeus chisono* • *.zeus reset* • *.zeus stato*',
].join('\n');

module.exports = {
  commands: ['zeus', 'ai'],
  name: 'zeus',
  category: 'funzioni',
  author: 'ZEUS',
  description: "L'AI di Zeus: ragiona, cerca sul web, legge foto, scrive codice, ricorda e parla",
  usage: '<domanda> | web | codice | idea | modo | ricorda | voce | auto | reset | stato',
  cooldown: 3000,

  async run(sock, m, args, cmd, ctx) {
    const userId = ctx.sender;
    const chat = ctx.chat;
    const creatore = !!ctx.isOwner || ai.isCreatore(userId);
    let domanda = ctx.argsText.trim();
    const sub = (args[0] || '').toLowerCase();
    const base = { sock, m, chat, userId, owner: creatore, quoted: ctx.quoted, ctx };

    if (sub === 'reset') { ai.reset(userId); return ctx.ok('Memoria della chat azzerata. Ripartiamo da zero!'); }

    if (sub === 'chisono') {
      return ctx.info(creatore
        ? `Tu sei *${ai.CREATORE.nome}*, il mio creatore e sviluppatore. ⚡ Ti riconosco, sull'Olimpo comandi tu.`
        : 'Sei un mortale dell\'Olimpo, ma qui sei il benvenuto. Il mio creatore è un altro!', 'ZEUS');
    }

    if (sub === 'stato') {
      const rim = creatore ? '∞' : ai.limiteRimasto(userId);
      const auto = ai.getAuto(chat, true) ? 'attiva' : 'spenta';
      let extra = '';
      if (creatore) { const s = ai.statistiche(); extra = `\nDomande totali: *${s.domande}* • Utenti: *${s.utenti}*`; }
      return ctx.info(`Domande rimaste oggi: *${rim}* / ${ai.CFG.limiteGiorno}\nModalità: *${ai.getModo(userId)}*\nRisposta: *${{ '': 'solo testo', solo: 'solo audio' }[ai.getVoce(userId)] || 'testo + audio'}*\nRicordi salvati: *${ai.fatti(userId).length}*\nRisposta automatica qui: *${auto}*${extra}`, 'ZEUS AI');
    }

    if (sub === 'ricorda') {
      const t = domanda.slice(7).trim();
      if (!t) return ctx.err('Scrivi cosa devo ricordare. Es: *.zeus ricorda mi chiamo Luca*');
      const n = ai.ricorda(userId, t);
      return ctx.ok(`Lo tengo a mente (${n}/${ai.CFG.maxFatti}).`);
    }
    if (sub === 'memoria') {
      const l = ai.fatti(userId);
      if (!l.length) return ctx.info('Non mi hai ancora chiesto di ricordare niente.\nUsa *.zeus ricorda <cosa>*', 'MEMORIA');
      return ctx.info(l.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n\n*.zeus dimentica <n>* ne toglie uno', 'MEMORIA');
    }
    if (sub === 'dimentica') {
      const n = parseInt(args[1], 10);
      if (!ai.dimentica(userId, Number.isNaN(n) ? 0 : n)) return ctx.err('Numero non valido. Guarda *.zeus memoria*');
      return ctx.ok(n ? 'Ricordo eliminato.' : 'Ho dimenticato tutto.');
    }

    if (sub === 'modo') {
      const scelta = (args[1] || '').toLowerCase();
      if (!ai.MODI[scelta]) return ctx.info(`Modalità attuale: *${ai.getModo(userId)}*\nScegli: ${Object.keys(ai.MODI).map((x) => '*' + x + '*').join(', ')}\nEsempio: *.zeus modo epico*`, 'MODALITÀ');
      ai.setModo(userId, scelta);
      return ctx.ok(`Modalità impostata: *${scelta}*`);
    }

    if (sub === 'risposta' || sub === 'formato') {
      const MAPPA = { testo: '', audio: 'solo', vocale: 'solo', entrambi: 'on', tutti: 'on' };
      const v = (args[1] || '').toLowerCase();
      if (!Object.hasOwn(MAPPA, v)) {
        const att = { '': 'solo testo', solo: 'solo audio' }[ai.getVoce(userId)] || 'testo + audio';
        return ctx.info('Formato attuale: *' + att + '*\nScegli:\n*.zeus risposta testo*\n*.zeus risposta audio*\n*.zeus risposta entrambi*', 'FORMATO RISPOSTA');
      }
      ai.setVoce(userId, MAPPA[v]);
      const nome = { '': 'solo testo', solo: 'solo audio', on: 'testo + audio' }[MAPPA[v]];
      return ctx.ok('Da ora rispondo con: *' + nome + '*');
    }

    if (sub === 'bottoni') {
      const v = (args[1] || '').toLowerCase();
      if (v !== 'on' && v !== 'off') return ctx.info('Bottoni azioni rapide: *' + (ai.getAuto('btn:' + userId, false) ? 'on' : 'off') + '*\nUsa *.zeus bottoni on* oppure *.zeus bottoni off*', 'BOTTONI');
      ai.setAuto('btn:' + userId, v === 'on');
      return ctx.ok('Bottoni azioni rapide: *' + v + '*');
    }

    if (sub === 'voce') {
      const v = (args[1] || '').toLowerCase();
      if (!['on', 'off', 'solo'].includes(v)) return ctx.info('Voce: *' + (ai.getVoce(userId) || 'off') + '*\nUsa *.zeus voce on*, *.zeus voce solo* o *.zeus voce off*', 'VOCE');
      ai.setVoce(userId, v === 'solo' ? 'solo' : (v === 'on' ? 'on' : ''));
      return ctx.ok(`Risposte in vocale: *${v}*`);
    }

    if (sub === 'auto') {
      const v = (args[1] || '').toLowerCase();
      if (v !== 'on' && v !== 'off') return ctx.info(`Risposta automatica qui: *${ai.getAuto(chat, true) ? 'on' : 'off'}*\nUsa *.zeus auto on* oppure *.zeus auto off*`, 'AUTO');
      if (ctx.isGroup && !ctx.isAdmin && !creatore) return ctx.err('Solo gli admin possono cambiarlo.');
      ai.setAuto(chat, v === 'on');
      return ctx.ok(`Risposta automatica in questa chat: *${v}*`);
    }

    if (sub === 'ascolta') {
      const ultima = ai.ultimaRisposta(userId);
      if (!ultima) return ctx.err('Non c\'è ancora nessuna risposta da leggere.');
      await ctx.react('🔊');
      try { await mandaVoce(sock, chat, m, ultima); } catch (e) { await ctx.err('Voce non disponibile: ' + e.message); }
      return;
    }

    if (sub === 'rigenera') {
      const prima = ai.preparaRigenera(userId);
      if (!prima) return ctx.err('Non ho niente da rigenerare.');
      return elabora({ ...base, domanda: prima, mode: 'rigenera' });
    }
    if (sub === 'riassumi') {
      if (!ai.ultimaRisposta(userId)) return ctx.err('Non ho niente da riassumere.');
      return elabora({ ...base, domanda: 'Riassumi in massimo 2 righe quello che hai appena scritto.', mode: 'riscrivi', quoted: null });
    }
    if (sub === 'traduci') {
      if (!ai.ultimaRisposta(userId)) return ctx.err('Non ho niente da tradurre.');
      const lingua = args.slice(1).join(' ') || 'inglese';
      return elabora({ ...base, domanda: `Traduci in ${lingua} quello che hai appena scritto.`, mode: 'riscrivi', quoted: null });
    }

    if (sub === 'codice') {
      const q = domanda.slice(6).trim();
      if (!q) return ctx.err('Dimmi cosa devo programmare. Es: *.zeus codice un bot che saluta*');
      return elabora({ ...base, domanda: 'Scrivi codice completo e funzionante per: ' + q + '. Usa blocchi ``` e spiega in 2 righe come usarlo.', mode: 'codice' });
    }
    if (sub === 'idea') {
      const q = domanda.slice(4).trim();
      if (!q) return ctx.err('Su cosa vuoi idee? Es: *.zeus idea nome per un negozio*');
      return elabora({ ...base, domanda: `Dammi 5 idee originali e concrete su: ${q}. Per ognuna una riga di spiegazione.`, mode: 'riscrivi' });
    }

    let web = false;
    if (sub === 'web') { web = true; domanda = domanda.slice(3).trim(); }

    if (!domanda && !ctx.quoted?.message && !m.message?.imageMessage) return ctx.err('Scrivi una domanda.\n\n' + AIUTO);
    return elabora({ ...base, domanda, web });
  },

  // Risposta automatica: in privato e quando il bot viene taggato (o chiamato "zeus ...")
  onMessage(sock, m) {
    (async () => {
      try {
        if (!m?.message || m.key?.fromMe) return;
        const chat = m.key.remoteJid || '';
        if (chat === 'status@broadcast' || chat.endsWith('@newsletter')) return;

        const msg = unwrap(m.message) || {};
        const testo = (msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '').trim();
        if (!testo || /^[.!\/#]/.test(testo)) return;

        const isGroup = chat.endsWith('@g.us');
        const ci = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || {};
        const mie = [bare(sock.user?.id), bare(sock.user?.lid)].filter(Boolean);
        const taggato = (ci.mentionedJid || []).some((j) => mie.includes(bare(j)));
        const chiamato = /^(zeus|zeno)[\s,:!?]/i.test(testo);
        if (isGroup && !taggato && !chiamato) return;
        if (!ai.getAuto(chat, true)) return;

        const sender = bare(isGroup ? (m.key.participant || m.participant) : chat);
        if (!sender) return;
        try {
          const sa = require('../lib/soloadmin');
          if (typeof sa.canUse === 'function' && !(await sa.canUse(sock, m))) return;
        } catch {}

        global.__zeusAutoCd = global.__zeusAutoCd || new Map();
        const ora = Date.now();
        if (ora - (global.__zeusAutoCd.get(sender) || 0) < 3000) return;
        global.__zeusAutoCd.set(sender, ora);

        const G = global.ZEUS || global.ZENO;
        const owner = G?.isOwner ? G.isOwner(sender) : false;
        const domanda = testo.replace(/@\d+/g, '').replace(/^(zeus|zeno)[\s,:!?]+/i, '').trim();
        await elabora({ sock, m, chat, userId: sender, owner, domanda, quoted: quotedDi(m), ctx: null });
      } catch {}
    })();
  },
};
