import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

global.trisGames = global.trisGames || new Map(); // gameId -> stato partita/invito

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';
const genId = () => Math.random().toString(36).slice(2, 8);

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function checkResult(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line };
  }
  if (board.every((v) => v)) return 'draw';
  return null;
}

// AI semplice: vinci se puoi, blocca se devi, altrimenti centro > angolo > casuale
function botMove(board) {
  const empties = board.map((v, i) => (v ? null : i)).filter((i) => i !== null);

  const tryMark = (mark) => {
    for (const i of empties) {
      const copy = board.slice();
      copy[i] = mark;
      const r = checkResult(copy);
      if (r && r !== 'draw' && r.winner === mark) return i;
    }
    return null;
  };

  let mv = tryMark('O');
  if (mv !== null) return mv;
  mv = tryMark('X');
  if (mv !== null) return mv;
  if (!board[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return empties[Math.floor(Math.random() * empties.length)];
}

function startGame(id, xId, oId, vsBot) {
  const game = { id, board: Array(9).fill(null), turn: 'X', players: { X: xId, O: oId }, vsBot };
  global.trisGames.set(id, game);
  return game;
}

const cellLabel = (v) => (v === 'X' ? '❌' : v === 'O' ? '⭕' : '➖');
const cellStyle = (v) => (v === 'X' ? ButtonStyle.Success : v === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary);

function buildBoardPayload(game) {
  const xName = game.players.X === 'BOT' ? '🤖 Zeno Bot' : `<@${game.players.X}>`;
  const oName = game.players.O === 'BOT' ? '🤖 Zeno Bot' : `<@${game.players.O}>`;

  const result = checkResult(game.board);
  let status;
  if (result === 'draw') status = '🤝 **Pareggio!**';
  else if (result) status = `🏆 Ha vinto ${result.winner === 'X' ? `❌ ${xName}` : `⭕ ${oName}`}!`;
  else status = `Turno di: ${game.turn === 'X' ? `❌ ${xName}` : `⭕ ${oName}`}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⭕❌ Tris')
    .setDescription(`❌ ${xName}  vs  ⭕ ${oName}\n\n${status}`)
    .setFooter({ text: 'Zeno Bot • Tris' });

  const ended = !!result;
  const winLine = result && result !== 'draw' ? result.line : [];

  const rows = [0, 1, 2].map((r) => new ActionRowBuilder().addComponents(
    [0, 1, 2].map((c) => {
      const idx = r * 3 + c;
      const v = game.board[idx];
      return new ButtonBuilder()
        .setCustomId(`tris:move:${game.id}:${idx}`)
        .setLabel(cellLabel(v))
        .setStyle(winLine.includes(idx) ? ButtonStyle.Primary : cellStyle(v))
        .setDisabled(ended || Boolean(v));
    }),
  ));

  // A fine partita: pulsanti di rivincita
  if (ended) {
    const comps = [
      new ButtonBuilder()
        .setCustomId(`tris:again:bot:${game.players.X}:${game.players.O}`)
        .setLabel('🤖 Gioca ancora (bot)')
        .setStyle(ButtonStyle.Primary),
    ];
    if (game.players.O !== 'BOT') {
      comps.push(
        new ButtonBuilder()
          .setCustomId(`tris:again:pvp:${game.players.X}:${game.players.O}`)
          .setLabel('👥 Gioca ancora (giocatore)')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(new ActionRowBuilder().addComponents(comps));
  }

  return { content: '', embeds: [embed], components: rows };
}

// Costruisce il messaggio di invito (usato sia per il primo invito sia per la rivincita)
function buildInvitePayload(challengerId, opponentId, id) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⭕❌ Sfida a Tris!')
    .setDescription(`<@${challengerId}> ha sfidato <@${opponentId}> a Tris!\n\nHai **40 secondi** per accettare.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tris:accept:${id}`).setLabel('✅ Accetta').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tris:decline:${id}`).setLabel('❌ Rifiuta').setStyle(ButtonStyle.Danger),
  );
  return { embed, payload: { content: `<@${opponentId}>`, embeds: [embed], components: [row] } };
}

// Programma la scadenza (40s) di un invito, modificando il messaggio se nessuno risponde
function armInviteTimeout(id, embed, msg) {
  const game = global.trisGames.get(id);
  if (!game) return;
  game.timer = setTimeout(async () => {
    const g = global.trisGames.get(id);
    if (!g || g.mode !== 'invite') return; // già accettato/rifiutato
    global.trisGames.delete(id);
    try {
      await msg.edit({
        embeds: [EmbedBuilder.from(embed).setDescription('⌛ Invito scaduto.').setColor(0x747f8d)],
        components: [],
      });
    } catch (e) { /* messaggio già cancellato o non modificabile */ }
  }, 40_000);
}

async function sendInvite(ctx, challengerId, opponentId) {
  const id = genId();
  const { embed, payload } = buildInvitePayload(challengerId, opponentId, id);

  let msg;
  if (isInteraction(ctx)) { await ctx.reply(payload); msg = await ctx.fetchReply(); }
  else { msg = await ctx.reply(payload); }

  global.trisGames.set(id, { id, mode: 'invite', challengerId, opponentId });
  armInviteTimeout(id, embed, msg);
}

// ───────────── Comando: /tris [avversario]  oppure  .tris [@utente] ─────────────
export const data = new SlashCommandBuilder()
  .setName('tris')
  .setDescription('Gioca a tris: contro il bot o sfidando un altro utente')
  .addUserOption((o) => o.setName('avversario').setDescription('Sfida questo utente (facoltativo)'));

async function tris(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const challengerId = slash ? ctx.user.id : ctx.author.id;

  let opponent = slash ? ctx.options.getUser('avversario') : null;
  if (!opponent && !slash) {
    const mention = text.match(/<@!?(\d+)>/);
    if (mention) {
      opponent = await ctx.client.users.fetch(mention[1]).catch(() => null);
    } else if (ctx.reference?.messageId) {
      const ref = await ctx.channel.messages.fetch(ctx.reference.messageId).catch(() => null);
      opponent = ref && !ref.author.bot ? ref.author : null;
    }
  }

  if (opponent) {
    if (opponent.id === challengerId) {
      return ctx.reply('❌ Non puoi sfidare te stesso! Usa `/tris` senza avversario per giocare contro il bot.');
    }
    if (opponent.bot) {
      return ctx.reply('❌ Non puoi sfidare un bot con un invito: usa `/tris` senza avversario per giocare contro di me.');
    }
    return sendInvite(ctx, challengerId, opponent.id);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⭕❌ Tris')
    .setDescription(
      'Scegli come giocare:\n\n'
      + '🤖 **Gioca contro il bot** — partita immediata\n'
      + '👥 **Sfida un giocatore** — tagga qualcuno con `/tris avversario:@utente`',
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tris:bot:${challengerId}`).setLabel('🤖 Gioca contro il bot').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tris:howto:${challengerId}`).setLabel('👥 Sfida un giocatore').setStyle(ButtonStyle.Secondary),
  );
  return ctx.reply({ embeds: [embed], components: [row] });
}

tris.command = /^tris$/i;
tris.help = ['tris'];
tris.tags = ['fun'];
tris.desc = 'Gioca a tris contro il bot o sfidando un altro utente';

export default tris;

// ───────────── Pulsanti ─────────────
export const prefix = 'tris';
export async function onComponent(i) {
  const parts = i.customId.split(':');
  const action = parts[1];

  // Menu iniziale: 🤖 Gioca contro il bot / 👥 Sfida un giocatore
  if (action === 'bot' || action === 'howto') {
    const uid = parts[2];
    if (i.user.id !== uid) {
      return i.reply({ content: '⛔ Questo pulsante non è tuo: usa `/tris`.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'howto') {
      return i.reply({
        content: '👥 Per sfidare qualcuno usa `/tris avversario:@utente`, oppure rispondi a un suo messaggio scrivendo `.tris`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const id = genId();
    const game = startGame(id, i.user.id, 'BOT', true);
    return i.update(buildBoardPayload(game));
  }

  // Rivincita a fine partita: 🤖 vs bot oppure 👥 stesso avversario
  if (action === 'again') {
    const mode = parts[2];
    const xId = parts[3];
    const oId = parts[4];

    if (i.user.id !== xId && i.user.id !== oId) {
      return i.reply({ content: '⛔ Questa partita non è tua.', flags: MessageFlags.Ephemeral });
    }

    if (mode === 'bot') {
      const id = genId();
      const game = startGame(id, i.user.id, 'BOT', true);
      return i.update(buildBoardPayload(game));
    }

    if (mode === 'pvp') {
      if (oId === 'BOT') {
        return i.reply({ content: '❌ Non c\'è nessun giocatore con cui fare la rivincita.', flags: MessageFlags.Ephemeral });
      }
      const other = i.user.id === xId ? oId : xId;
      const id = genId();
      const { embed, payload } = buildInvitePayload(i.user.id, other, id);
      global.trisGames.set(id, { id, mode: 'invite', challengerId: i.user.id, opponentId: other });
      await i.update(payload);
      armInviteTimeout(id, embed, i.message);
    }
    return;
  }

  const gameId = parts[2];
  const extra = parts[3];
  const game = global.trisGames.get(gameId);

  if (action === 'accept' || action === 'decline') {
    if (!game || game.mode !== 'invite') {
      return i.reply({ content: '⌛ Invito scaduto o non più valido.', flags: MessageFlags.Ephemeral });
    }
    if (i.user.id !== game.opponentId) {
      return i.reply({ content: '⛔ Questo invito non è per te.', flags: MessageFlags.Ephemeral });
    }
    clearTimeout(game.timer);

    if (action === 'decline') {
      global.trisGames.delete(gameId);
      return i.update({
        embeds: [EmbedBuilder.from(i.message.embeds[0]).setDescription('❌ Invito rifiutato.').setColor(0x747f8d)],
        components: [],
      });
    }
    const newGame = startGame(gameId, game.challengerId, game.opponentId, false);
    return i.update(buildBoardPayload(newGame));
  }

  if (action === 'move') {
    if (!game || game.mode === 'invite') {
      return i.reply({ content: '⌛ Partita non trovata o già conclusa.', flags: MessageFlags.Ephemeral });
    }
    const idx = parseInt(extra, 10);
    const currentPlayerId = game.turn === 'X' ? game.players.X : game.players.O;

    if (i.user.id !== currentPlayerId) {
      return i.reply({ content: '⛔ Non è il tuo turno.', flags: MessageFlags.Ephemeral });
    }
    if (game.board[idx]) {
      return i.reply({ content: '⛔ Casella già occupata.', flags: MessageFlags.Ephemeral });
    }

    game.board[idx] = game.turn;
    let result = checkResult(game.board);

    if (!result) {
      game.turn = game.turn === 'X' ? 'O' : 'X';
      if (game.vsBot && game.turn === 'O') {
        const botIdx = botMove(game.board);
        if (botIdx !== undefined) game.board[botIdx] = 'O';
        result = checkResult(game.board);
        if (!result) game.turn = 'X';
      }
    }

    if (result) global.trisGames.delete(gameId);
    return i.update(buildBoardPayload(game));
  }
}
