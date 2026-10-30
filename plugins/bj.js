import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import * as eco from '../lib/eco.js';

global.bjGames = global.bjGames || new Map(); // gameId -> stato partita

const MIN_BET = 10;
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';
const genId = () => Math.random().toString(36).slice(2, 8);

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildShuffledDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(game, hand) {
  if (!game.deck.length) game.deck = buildShuffledDeck();
  hand.push(game.deck.pop());
}

function scoreOf(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoft(cards) {
  let raw = 0;
  let hasAce = false;
  for (const c of cards) {
    if (c.rank === 'A') { raw += 11; hasAce = true; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') raw += 10;
    else raw += parseInt(c.rank, 10);
  }
  return hasAce && raw <= 21;
}

const cardStr = (c) => `\`${c.rank}${c.suit}\``;
const handStr = (cards) => cards.map(cardStr).join(' ');

function dealerPlay(game) {
  while (scoreOf(game.dealer) < 17 || (scoreOf(game.dealer) === 17 && isSoft(game.dealer))) {
    drawCard(game, game.dealer);
  }
  const pScore = scoreOf(game.player);
  const dScore = scoreOf(game.dealer);
  game.finished = true;
  if (dScore > 21) game.result = 'dealer_bust';
  else if (dScore > pScore) game.result = 'dealer_win';
  else if (dScore < pScore) game.result = 'player_win';
  else game.result = 'push';
}

// Nuova partita (la puntata è già stata pagata dal chiamante)
function freshGame(playerId, bet) {
  const id = genId();
  const game = {
    id, playerId, bet, baseBet: bet, settled: false, net: 0,
    deck: buildShuffledDeck(), player: [], dealer: [], finished: false, doubled: false,
  };
  global.bjGames.set(id, game);

  drawCard(game, game.player); drawCard(game, game.dealer);
  drawCard(game, game.player); drawCard(game, game.dealer);

  const pBJ = game.player.length === 2 && scoreOf(game.player) === 21;
  const dBJ = game.dealer.length === 2 && scoreOf(game.dealer) === 21;
  if (pBJ || dBJ) {
    game.finished = true;
    game.result = pBJ && dBJ ? 'push_blackjack' : pBJ ? 'player_blackjack' : 'dealer_blackjack';
    global.bjGames.delete(id);
  }
  return game;
}

// Paga la vincita una sola volta
function settle(game) {
  if (game.settled) return;
  game.settled = true;
  const b = game.bet;
  let back = 0;
  switch (game.result) {
    case 'player_blackjack': back = Math.floor(b * 2.5); break;
    case 'dealer_bust':
    case 'player_win': back = b * 2; break;
    case 'push':
    case 'push_blackjack': back = b; break;
    default: back = 0;
  }
  if (back) eco.add(game.playerId, back);
  game.net = back - b;
  if (game.net > 0) eco.stat(game.playerId, 'won', game.net);
  else if (game.net < 0) eco.stat(game.playerId, 'lost', -game.net);
}

function resultLine(game) {
  switch (game.result) {
    case 'player_blackjack': return '🂡 **Blackjack! Hai vinto!**';
    case 'dealer_blackjack': return '😬 Il banco ha fatto Blackjack. Hai perso.';
    case 'push_blackjack': return '🤝 Blackjack per entrambi: pareggio.';
    case 'player_bust': return `💥 Hai sballato con **${scoreOf(game.player)}**! Hai perso.`;
    case 'dealer_bust': return `🎉 Il banco ha sballato con **${scoreOf(game.dealer)}**! Hai vinto!`;
    case 'player_win': return '🎉 **Hai vinto!**';
    case 'dealer_win': return '😬 Ha vinto il banco.';
    case 'push': return '🤝 Pareggio.';
    default: return '';
  }
}

const resultColor = (r) => (
  ['player_blackjack', 'dealer_bust', 'player_win'].includes(r) ? 0x2ecc71
    : ['dealer_blackjack', 'player_bust', 'dealer_win'].includes(r) ? 0xe74c3c
      : 0x95a5a6
);

function buildPayload(game) {
  if (game.finished) settle(game);

  const pScore = scoreOf(game.player);
  const dScore = scoreOf(game.dealer);
  const dealerStr = game.finished ? handStr(game.dealer) : `${cardStr(game.dealer[0])} \`🂠\``;

  let desc = `💰 **Puntata:** ${eco.fmt(game.bet)}\n\n`
    + `**Le tue carte:** ${handStr(game.player)}  *(${pScore})*\n`
    + `**Carte del banco:** ${dealerStr}${game.finished ? `  *(${dScore})*` : ''}`;

  if (game.finished) {
    const net = game.net;
    const sign = net > 0 ? '+' : net < 0 ? '−' : '';
    const label = net > 0 ? '📈 Guadagno' : net < 0 ? '📉 Perdita' : '↔️ Puntata restituita';
    desc += `\n\n${resultLine(game)}\n${label}: **${sign}${eco.fmt(Math.abs(net))}**`;
  } else {
    desc += '\n\nCosa fai?';
  }

  const embed = new EmbedBuilder()
    .setTitle('🂡 Blackjack')
    .setColor(game.finished ? resultColor(game.result) : 0x5865f2)
    .setDescription(desc)
    .setFooter({ text: `Saldo: ${eco.fmt(eco.balance(game.playerId))} • Zeno Bot` });

  const components = [];
  if (!game.finished) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj:hit:${game.id}`).setLabel('🃏 Carta').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bj:stand:${game.id}`).setLabel('✋ Stai').setStyle(ButtonStyle.Secondary),
    );
    if (game.player.length === 2 && !game.doubled) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`bj:double:${game.id}`).setLabel('⏫ Raddoppia').setStyle(ButtonStyle.Success),
      );
    }
    components.push(row);
  } else {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bj:again:${game.playerId}:${game.baseBet}`)
        .setLabel(`🔄 Gioca ancora (${game.baseBet})`)
        .setStyle(ButtonStyle.Primary),
    ));
  }

  return { content: '', embeds: [embed], components };
}

// ───────────── Comando: /bj <puntata>  oppure  .bj <puntata|all> ─────────────
export const data = new SlashCommandBuilder()
  .setName('bj')
  .setDescription('Gioca a Blackjack contro il banco')
  .addIntegerOption((o) =>
    o.setName('puntata').setDescription('Quanto vuoi puntare (default 100)').setMinValue(MIN_BET).setRequired(false));

async function bj(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const playerId = slash ? ctx.user.id : ctx.author.id;

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

  const game = freshGame(playerId, bet);
  return ctx.reply(buildPayload(game));
}

bj.command = /^(bj|blackjack)$/i;
bj.help = ['bj'];
bj.tags = ['fun', 'economy'];
bj.desc = 'Gioca a Blackjack puntando soldi';

export default bj;

// ───────────── Pulsanti ─────────────
export const prefix = 'bj';
export async function onComponent(i) {
  const [, action, arg, extra] = i.customId.split(':');
  const hidden = (content) => i.reply({ content, flags: MessageFlags.Ephemeral });

  if (action === 'again') {
    if (i.user.id !== arg) return hidden('⛔ Questa partita non è tua.');
    const bet = parseInt(extra, 10) || 100;
    if (!eco.take(i.user.id, bet)) {
      return hidden(`💸 Non hai abbastanza soldi per puntare ${eco.fmt(bet)}: saldo **${eco.fmt(eco.balance(i.user.id))}**.`);
    }
    const game = freshGame(i.user.id, bet);
    return i.update(buildPayload(game));
  }

  const game = global.bjGames.get(arg);
  if (!game || game.finished) return hidden('⌛ Partita non trovata o già conclusa. Usa `/bj` per ricominciare.');
  if (i.user.id !== game.playerId) return hidden('⛔ Questa partita non è tua.');

  if (action === 'hit') {
    drawCard(game, game.player);
    const score = scoreOf(game.player);
    if (score > 21) { game.finished = true; game.result = 'player_bust'; }
    else if (score === 21) dealerPlay(game);
  } else if (action === 'stand') {
    dealerPlay(game);
  } else if (action === 'double') {
    if (game.player.length !== 2 || game.doubled) return hidden('⛔ Puoi raddoppiare solo alla prima mossa.');
    if (!eco.take(game.playerId, game.baseBet)) {
      return hidden(`💸 Non hai abbastanza soldi per raddoppiare (servono ${eco.fmt(game.baseBet)}).`);
    }
    game.bet += game.baseBet;
    game.doubled = true;
    drawCard(game, game.player);
    const score = scoreOf(game.player);
    if (score > 21) { game.finished = true; game.result = 'player_bust'; }
    else dealerPlay(game);
  }

  if (game.finished) global.bjGames.delete(arg);
  return i.update(buildPayload(game));
}
