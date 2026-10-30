import axios from 'axios';
import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import {
  COLORS, box, say, fail, actor, isSlash, pickUser, rnd,
} from '../lib/ui.js';

const ACTIONS = {
  abbraccia: { ep: 'hug', verb: 'abbraccia', self: 'si abbraccia da solo… serve un abbraccio?', emoji: '🤗', desc: 'Abbraccia qualcuno con una GIF' },
  bacia: { ep: 'kiss', verb: 'bacia', self: 'manda un bacio a tutti', emoji: '💋', desc: 'Bacia qualcuno con una GIF' },
  schiaffo: { ep: 'slap', verb: 'dà uno schiaffo a', self: 'si dà uno schiaffo da solo', emoji: '👋', desc: 'Dai uno schiaffo con una GIF' },
  coccola: { ep: 'pat', verb: 'coccola', self: 'vuole coccole…', emoji: '🥰', desc: 'Coccola qualcuno con una GIF' },
  mordi: { ep: 'bite', verb: 'morde', self: 'morde l\'aria', emoji: '😈', desc: 'Mordi qualcuno con una GIF' },
  balla: { ep: 'dance', verb: 'balla con', self: 'balla da solo 🎶', emoji: '💃', desc: 'Balla con una GIF' },
};

const BALL = [
  'Assolutamente sì ✅', 'Senza dubbio 💯', 'Puoi contarci 😎', 'Molto probabile 👍', 'I segni dicono di sì ✨',
  'Sì, ma non dirlo in giro 🤫', 'Mmm… riprova più tardi 🌫️', 'Meglio non dirtelo ora 🙈', 'Non riesco a prevederlo 🔮',
  'Non ci contare ❌', 'Le mie fonti dicono no 📉', 'Assolutamente no 🚫', 'Neanche per sogno 💀', 'Molto dubbioso 🤔',
];

const ROAST = [
  'ha la velocità di risposta di una connessione a 56k 🐌',
  'è il motivo per cui i manuali hanno le istruzioni più semplici 📖',
  'si perde anche nel menu del bot… e l\'ho fatto io 🤡',
  'ha più scuse di un server in manutenzione 🛠️',
  'è come il Wi-Fi in montagna: quando serve, non c\'è 📶',
  'legge "visualizzato" e sparisce per tre giorni 👻',
  'è l\'unico che riesce a perdere a tris contro un bot 🤖',
  'ha un ping più alto della sua autostima 📡',
  'dice "arrivo tra 5 minuti" e arriva il giorno dopo ⏰',
  'ha l\'energia sociale di un bot spento 🔌',
];

const RPS = { sasso: '🪨', carta: '📄', forbici: '✂️' };
const BEATS = { sasso: 'forbici', carta: 'sasso', forbici: 'carta' };

const opt = (name, desc, req = false) => (o) => o.setName(name).setDescription(desc).setRequired(req);

export const datas = [
  new SlashCommandBuilder().setName('8ball').setDescription('Fai una domanda alla palla magica').addStringOption(opt('domanda', 'La tua domanda', true)),
  new SlashCommandBuilder().setName('dado').setDescription('Tira un dado')
    .addIntegerOption((o) => o.setName('facce').setDescription('Numero di facce (default 6)').setMinValue(2).setMaxValue(1000)),
  new SlashCommandBuilder().setName('moneta').setDescription('Lancia una moneta'),
  new SlashCommandBuilder().setName('scegli').setDescription('Scelgo io per te').addStringOption(opt('opzioni', 'Opzioni separate da |', true)),
  new SlashCommandBuilder().setName('ship').setDescription('Calcola la compatibilità tra due persone')
    .addUserOption(opt('utente1', 'Prima persona', true)).addUserOption(opt('utente2', 'Seconda persona (default: tu)')),
  new SlashCommandBuilder().setName('rps').setDescription('Sasso carta forbici contro il bot'),
  new SlashCommandBuilder().setName('roast').setDescription('Una battuta cattiva (ma con affetto)').addUserOption(opt('utente', 'Chi?')),
  new SlashCommandBuilder().setName('rate').setDescription('Do un voto a qualsiasi cosa').addStringOption(opt('cosa', 'Cosa valuto?', true)),
  ...Object.entries(ACTIONS).map(([name, a]) => new SlashCommandBuilder().setName(name).setDescription(a.desc).addUserOption(opt('utente', 'Chi?'))),
];

const seed = (a, b) => {
  let h = 0;
  for (const c of [a, b].sort().join('')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 101;
};

async function action(ctx, cmd, text) {
  const a = ACTIONS[cmd];
  const user = actor(ctx);
  const target = await pickUser(ctx, text);
  let gif = null;
  try {
    const r = await axios.get(`https://nekos.best/api/v2/${a.ep}`, { timeout: 6000 });
    gif = r.data?.results?.[0]?.url;
  } catch (e) { /* senza GIF va bene lo stesso */ }
  const line = target && target.id !== user.id
    ? `**${user.displayName}** ${a.verb} **${target.displayName}** ${a.emoji}`
    : `**${user.displayName}** ${a.self} ${a.emoji}`;
  const e = box(COLORS.pink, null, line);
  if (gif) e.setImage(gif);
  return say(ctx, { embeds: [e] });
}

async function ship(ctx, text) {
  let a; let b;
  if (isSlash(ctx)) {
    a = ctx.options.getUser('utente1');
    b = ctx.options.getUser('utente2') || ctx.user;
  } else {
    const ids = [...text.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]).slice(0, 2);
    const us = (await Promise.all(ids.map((id) => ctx.client.users.fetch(id).catch(() => null)))).filter(Boolean);
    a = us[0];
    b = us[1] || ctx.author;
  }
  if (!a) return fail(ctx, 'Menziona una o due persone! `.ship @utente`');
  if (a.id === b.id) return fail(ctx, 'Serve una seconda persona 😅');
  const pct = seed(a.id, b.id);
  const hearts = Math.round(pct / 10);
  const name = a.username.slice(0, Math.ceil(a.username.length / 2)) + b.username.slice(Math.floor(b.username.length / 2));
  const verdict = pct >= 90 ? '💍 Anime gemelle!' : pct >= 70 ? '😍 Coppia perfetta' : pct >= 50 ? '😊 C\'è del potenziale' : pct >= 30 ? '😬 Meglio come amici' : '💀 Lasciate stare';
  return say(ctx, {
    embeds: [box(COLORS.pink, `💘 ${a.username} × ${b.username}`,
      `**${pct}%**\n${'💖'.repeat(hearts)}${'🖤'.repeat(10 - hearts)}\n\n${verdict}\n✨ Nome coppia: **${name}**`)],
  });
}

const rpsPrompt = (uid) => ({
  embeds: [box(COLORS.info, '✊ Sasso Carta Forbici', 'Scegli la tua mossa e sfida il bot!')],
  components: [new ActionRowBuilder().addComponents(
    ...Object.entries(RPS).map(([k, e]) => new ButtonBuilder()
      .setCustomId(`fun:rps:${k}:${uid}`).setLabel(k[0].toUpperCase() + k.slice(1)).setEmoji(e).setStyle(ButtonStyle.Primary)),
  )],
});

async function fun(ctx, { text = '', command = '' } = {}) {
  const cmd = command.toLowerCase();
  const arg = (name) => (isSlash(ctx) ? ctx.options.getString(name) : text.trim()) || '';
  if (ACTIONS[cmd]) return action(ctx, cmd, text);

  switch (cmd) {
    case '8ball': case 'palla': {
      const q = arg('domanda');
      if (!q) return fail(ctx, 'Fammi una domanda! `.8ball sono bello?`');
      return say(ctx, { embeds: [box(COLORS.main, '🎱 La palla magica risponde', `**❓ ${q}**\n\n${rnd(BALL)}`)] });
    }
    case 'dado': {
      const n = isSlash(ctx) ? ctx.options.getInteger('facce') : parseInt(text, 10);
      const faces = Math.min(1000, Math.max(2, n || 6));
      return say(ctx, { embeds: [box(COLORS.info, '🎲 Dado', `Hai tirato un **${1 + Math.floor(Math.random() * faces)}** (d${faces})`)] });
    }
    case 'moneta':
      return say(ctx, { embeds: [box(COLORS.gold, '🪙 Moneta', `È uscito: **${rnd(['Testa', 'Croce'])}**`)] });
    case 'scegli': {
      const opts = arg('opzioni').split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return fail(ctx, 'Dammi almeno 2 opzioni: `.scegli pizza | sushi | kebab`');
      return say(ctx, { embeds: [box(COLORS.main, '🤔 Ho deciso', `Scelgo: **${rnd(opts)}**`)] });
    }
    case 'ship': return ship(ctx, text);
    case 'rps': return say(ctx, rpsPrompt(actor(ctx).id));
    case 'roast': {
      const t = (await pickUser(ctx, text)) || actor(ctx);
      return say(ctx, { embeds: [box(COLORS.err, '🔥 ROAST', `**${t.displayName}** ${rnd(ROAST)}`)] });
    }
    case 'rate': {
      const what = arg('cosa');
      if (!what) return fail(ctx, 'Cosa devo valutare? `.rate pizza`');
      const v = Math.floor(Math.random() * 11);
      return say(ctx, { embeds: [box(COLORS.gold, `⭐ Voto per "${what.slice(0, 80)}"`, `**${v}/10**\n${'⭐'.repeat(v)}${'▫️'.repeat(10 - v)}`)] });
    }
    default: return null;
  }
}

fun.command = /^(8ball|palla|dado|moneta|scegli|ship|rps|roast|rate|abbraccia|bacia|schiaffo|coccola|mordi|balla)$/i;
fun.help = ['8ball', 'dado', 'moneta', 'scegli', 'ship', 'rps', 'roast', 'rate', ...Object.keys(ACTIONS)];
fun.tags = ['fun'];
fun.desc = 'Giochi e divertimento';
export default fun;

export const prefix = 'fun';
export async function onComponent(i) {
  const [, kind, choice, uid] = i.customId.split(':');
  if (i.user.id !== uid) {
    return i.reply({ content: '🙅 Questa partita non è tua! Usa `.rps`.', flags: MessageFlags.Ephemeral });
  }
  if (kind === 'again') return i.update(rpsPrompt(uid));
  const me = rnd(Object.keys(RPS));
  const res = choice === me ? 'draw' : BEATS[choice] === me ? 'win' : 'lose';
  const title = { win: '🏆 Hai vinto!', lose: '💀 Hai perso!', draw: '🤝 Pareggio!' }[res];
  const color = { win: COLORS.ok, lose: COLORS.err, draw: COLORS.warn }[res];
  return i.update({
    embeds: [box(color, title, `Tu: ${RPS[choice]} **${choice}**\nBot: ${RPS[me]} **${me}**`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun:again:x:${uid}`).setLabel('Rivincita').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    )],
  });
}
