import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import * as eco from '../lib/eco.js';

const MIN_BET = 10;
const SEVEN = '7️⃣';

export const data = new SlashCommandBuilder()
  .setName('slot')
  .setDescription('Gioca alla slot machine')
  .addIntegerOption((o) =>
    o.setName('puntata').setDescription('Quanto vuoi puntare (default 100)').setMinValue(MIN_BET).setRequired(false))
  .addBooleanOption((o) =>
    o.setName('info').setDescription('Mostra la tabella dei premi').setRequired(false));

// simbolo, peso (probabilità)
const SYMBOLS = [['🍒', 30], ['🍋', 25], ['🍇', 20], ['🔔', 12], ['💎', 7], [SEVEN, 4]];
const TOTAL = SYMBOLS.reduce((s, [, w]) => s + w, 0);
const PAY3 = { '🍒': 16, '🍋': 28, '🍇': 42, '🔔': 70, '💎': 170, [SEVEN]: 330 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function draw() {
  let n = Math.random() * TOTAL;
  for (const [s, w] of SYMBOLS) { n -= w; if (n < 0) return s; }
  return '🍒';
}

function evaluate(r, bet) {
  const [a, b, c] = r;
  let mult = 0;
  let label = '😬 Niente da fare, riprova!';
  if (a === b && b === c) {
    mult = PAY3[a];
    label = a === SEVEN ? '🎰 **JACKPOT!!!** 🎰' : `🎉 **Tris di ${a}!**`;
  } else if (a === b || b === c || a === c) {
    mult = 2;
    label = '🍒🍒 **Due ciliegie!**';
  }
  return { mult, win: Math.floor(bet * mult), label };
}

const grid = (r) => `## ${r.join('  ┃  ')}`;

function spinEmbed(reels, bet) {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎰 Slot machine')
    .setDescription(`💰 **Puntata:** ${eco.fmt(bet)}\n\n${grid(reels)}\n\n*Gira...*`);
}

function finalPayload(reels, bet, res, playerId) {
  const net = res.win - bet;
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  const label = net > 0 ? '📈 Guadagno' : net < 0 ? '📉 Perdita' : '↔️ Puntata restituita';
  const embed = new EmbedBuilder()
    .setColor(net > 0 ? 0x2ecc71 : net < 0 ? 0xe74c3c : 0x95a5a6)
    .setTitle('🎰 Slot machine')
    .setDescription(
      `💰 **Puntata:** ${eco.fmt(bet)}\n\n${grid(reels)}\n\n${res.label}\n${label}: **${sign}${eco.fmt(Math.abs(net))}**`,
    )
    .setFooter({ text: `Saldo: ${eco.fmt(eco.balance(playerId))} • Zeno Bot` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`slot:again:${playerId}:${bet}`)
      .setLabel(`🔄 Gira ancora (${bet})`)
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

function infoEmbed() {
  const lines = Object.entries(PAY3).map(([s, m]) => `${s} ${s} ${s} → **×${m}**${s === SEVEN ? ' (jackpot)' : ''}`);
  lines.push('Due simboli uguali (coppia) → **×2**');
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('📋 Tabella premi slot')
    .setDescription(`${lines.join('\n')}\n\nPuntata minima: ${eco.fmt(MIN_BET)}`);
}

// Gioca una mano: paga subito la vincita, poi anima i rulli
async function run(first, edit, playerId, bet) {
  const r = [draw(), draw(), draw()];
  const res = evaluate(r, bet);
  const net = res.win - bet;
  if (res.win) eco.add(playerId, res.win);
  if (net > 0) eco.stat(playerId, 'won', net);
  else if (net < 0) eco.stat(playerId, 'lost', -net);

  const safe = (p) => Promise.resolve(edit(p)).catch(() => {});
  await first({ embeds: [spinEmbed([draw(), draw(), draw()], bet)], components: [] });
  await sleep(650);
  await safe({ embeds: [spinEmbed([r[0], draw(), draw()], bet)] });
  await sleep(650);
  await safe({ embeds: [spinEmbed([r[0], r[1], draw()], bet)] });
  await sleep(650);
  await safe(finalPayload(r, bet, res, playerId));
}

async function slot(ctx, { text = '' } = {}) {
  const slash = eco.isSlash(ctx);
  const playerId = slash ? ctx.user.id : ctx.author.id;

  if ((slash && ctx.options.getBoolean('info')) || (!slash && /\binfo\b/i.test(text))) {
    return ctx.reply({ embeds: [infoEmbed()] });
  }

  let bet = 100;
  if (slash) bet = ctx.options.getInteger('puntata') ?? 100;
  else {
    const m = text.match(/(\d+|all|tutto|max)/i);
    if (m) bet = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : eco.balance(playerId);
  }

  if (bet < MIN_BET) return eco.say(ctx, `❌ La puntata minima è ${eco.fmt(MIN_BET)}.`, true);
  if (!eco.take(playerId, bet)) {
    return eco.say(
      ctx,
      `💸 Non hai abbastanza soldi: saldo **${eco.fmt(eco.balance(playerId))}**. Prova con \`.daily\` o \`.work\`!`,
      true,
    );
  }

  let msg = null;
  const first = async (p) => { msg = await ctx.reply(p); };
  const edit = slash ? (p) => ctx.editReply(p) : (p) => msg.edit(p);
  return run(first, edit, playerId, bet);
}

slot.command = /^(slot|slots)$/i;
slot.help = ['slot'];
slot.tags = ['fun', 'economy'];
slot.desc = 'Gioca alla slot machine puntando soldi';

export default slot;

// ───────────── Bottone "Gira ancora" ─────────────
export const prefix = 'slot';
export async function onComponent(i) {
  const [, action, ownerId, betStr] = i.customId.split(':');
  const hidden = (content) => i.reply({ content, flags: MessageFlags.Ephemeral });

  if (action !== 'again') return;
  if (i.user.id !== ownerId) return hidden('⛔ Questa slot non è tua.');

  const bet = parseInt(betStr, 10) || 100;
  if (!eco.take(i.user.id, bet)) {
    return hidden(`💸 Non hai abbastanza soldi per puntare ${eco.fmt(bet)}: saldo **${eco.fmt(eco.balance(i.user.id))}**.`);
  }
  return run((p) => i.update(p), (p) => i.editReply(p), i.user.id, bet);
}
