import fs from 'fs';
import path from 'path';
import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';

const DB_PATH = path.resolve('database/mutati.json');

const readDb = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
};

const writeDb = (data) => {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('Errore scrittura mutati:', e.message); }
};

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// Parse durata: 10s, 5m, 2h, 1d -> millisecondi
function parseDuration(str) {
  if (!str) return null;
  const match = String(str).trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|sec|min|hour|day|secondi|minuti|ore|giorni)?$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2] || 'm';
  const map = {
    s: 1000, sec: 1000, secondi: 1000,
    m: 60_000, min: 60_000, minuti: 60_000,
    h: 3_600_000, hour: 3_600_000, ore: 3_600_000,
    d: 86_400_000, day: 86_400_000, giorni: 86_400_000,
  };
  return n * (map[unit] || 60_000);
}

// Formatta durata da ms a stringa leggibile
function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} secondi`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minuti`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} ore`;
  return `${Math.round(ms / 86_400_000)} giorni`;
}

// ───────────── COMANDO ─────────────
export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Silenzia un utente (timeout)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((s) => s
    .setName('utente')
    .setDescription('Applica un timeout a un utente')
    .addUserOption((o) => o.setName('target').setDescription('L\'utente da mutare').setRequired(true))
    .addStringOption((o) => o.setName('durata').setDescription('Es: 10m, 1h, 1d (default: 10m)').setRequired(false))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del timeout').setRequired(false)))
  .addSubcommand((s) => s
    .setName('rimuovi')
    .setDescription('Rimuove il timeout da un utente')
    .addUserOption((o) => o.setName('target').setDescription('L\'utente da smutare').setRequired(true)))
  .addSubcommand((s) => s
    .setName('lista')
    .setDescription('Mostra tutti gli utenti attualmente mutati nel server'));

async function muteCmd(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const guild = ctx.guild;
  const senderId = slash ? ctx.user.id : ctx.author.id;

  if (!guild) return ctx.reply('❌ Questo comando funziona solo nei server.');

  // 🔒 Controllo permessi (owner bypassa)
  const member = await guild.members.fetch(senderId).catch(() => null);
  const isAdmin = member?.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                  member?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isOwner(senderId) && !isAdmin) {
    return ctx.reply({ content: '❌ Non hai il permesso di **Moderare i membri**.', flags: MessageFlags.Ephemeral });
  }

  // Parsing argomenti
  let sub, target, duration, reason;

  if (slash) {
    sub = ctx.options.getSubcommand();
    target = ctx.options.getUser('target');
    duration = ctx.options.getString('durata');
    reason = ctx.options.getString('motivo');
  } else {
    const parts = text.trim().split(/\s+/);
    sub = (parts[0] || '').toLowerCase();

    // Se è "lista" o "list"
    if (['lista', 'list'].includes(sub)) {
      return muteList(ctx, guild);
    }

    // Rimuovi/Unmute
    const isUnmute = ['rimuovi', 'unmute', 'off'].includes(sub);
    sub = isUnmute ? 'rimuovi' : 'utente';

    // Parse menzione
    const mentionMatch = text.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      target = await guild.client.users.fetch(mentionMatch[1]).catch(() => null);
    } else {
      target = null;
    }

    // Parse durata e motivo (dopo la menzione)
    const afterMention = text.replace(/<@!?\d+>/g, '').trim();
    const tokens = afterMention.split(/\s+/).filter(Boolean);
    // Salta la prima parola (il sottocomando) se esiste
    const cleanedTokens = tokens.filter(t => !['mute', 'unmute', 'rimuovi', 'utente', 'lista', 'list'].includes(t.toLowerCase()));

    if (cleanedTokens[0] && /^\d+\s*(s|m|h|d|sec|min|hour|day|secondi|minuti|ore|giorni)?$/i.test(cleanedTokens[0])) {
      duration = cleanedTokens[0];
      reason = cleanedTokens.slice(1).join(' ') || null;
    } else {
      duration = null;
      reason = cleanedTokens.join(' ') || null;
    }
  }

  if (sub === 'lista') return muteList(ctx, guild);

  if (!target) {
    return ctx.reply({ content: '❌ Devi menzionare un utente! (Es: `/mute utente @utente 10m spam`)', flags: MessageFlags.Ephemeral });
  }

  // ───────────── UNMUTE ─────────────
  if (sub === 'rimuovi') {
    if (slash && !ctx.deferred) await ctx.deferReply();

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      const msg = '❌ Utente non trovato nel server.';
      return slash ? ctx.editReply(msg) : ctx.reply(msg);
    }

    try {
      await targetMember.timeout(null, `Smutato da ${senderId}`);
    } catch (e) {
      console.error('Errore rimozione timeout:', e.message);
      const msg = '❌ Non riesco a rimuovere il timeout (permessi insufficienti o utente troppo importante).';
      return slash ? ctx.editReply(msg) : ctx.reply(msg);
    }

    // Aggiorna DB
    const db = readDb();
    if (db[guild.id]) {
      db[guild.id] = db[guild.id].filter((e) => e.userId !== target.id);
      writeDb(db);
    }

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('🔊 Utente smutato')
      .setDescription(`**${target.tag}** può tornare a scrivere.`)
      .setFooter({ text: `Azione di ${ctx.user?.tag || ctx.author.tag}` })
      .setTimestamp();

    const payload = { embeds: [embed] };
    if (slash) return ctx.editReply(payload);
    return ctx.reply(payload);
  }

  // ───────────── MUTE ─────────────
  if (sub === 'utente') {
    // Anti-mute del proprietario del server e dell'owner del bot
    if (target.id === guild.ownerId) {
      return ctx.reply({ content: '🧠 Non puoi mutare il **proprietario del server**.', flags: MessageFlags.Ephemeral });
    }
    if (isOwner(target.id)) {
      return ctx.reply({ content: '🧠 Non puoi mutare il **creatore del bot**.', flags: MessageFlags.Ephemeral });
    }
    if (target.id === guild.client.user.id) {
      return ctx.reply({ content: '🤖 Non puoi mutare me stesso!', flags: MessageFlags.Ephemeral });
    }
    if (target.bot) {
      return ctx.reply({ content: '🤖 Non puoi mutare un altro bot.', flags: MessageFlags.Ephemeral });
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      return ctx.reply({ content: '❌ Utente non trovato nel server.', flags: MessageFlags.Ephemeral });
    }

    // Non mutare utenti con ruolo superiore
    const sender = await guild.members.fetch(senderId).catch(() => null);
    if (!isOwner(senderId) && sender && targetMember.roles.highest.position >= sender.roles.highest.position) {
      return ctx.reply({ content: '❌ Non puoi mutare un utente con un ruolo uguale o superiore al tuo.', flags: MessageFlags.Ephemeral });
    }

    if (!targetMember.moderatable) {
      return ctx.reply({ content: '❌ Non posso mutare questo utente (permessi insufficienti).', flags: MessageFlags.Ephemeral });
    }

    const durationMs = parseDuration(duration) || 10 * 60 * 1000; // Default: 10 minuti
    const maxMs = 28 * 24 * 60 * 60 * 1000; // 28 giorni (limite Discord)
    const finalMs = Math.min(durationMs, maxMs);
    const finalReason = reason || 'Nessun motivo specificato';

    if (slash && !ctx.deferred) await ctx.deferReply();

    try {
      await targetMember.timeout(finalMs, `${finalReason} | Mod: ${senderId}`);
    } catch (e) {
      console.error('Errore timeout:', e.message);
      const msg = '❌ Errore durante il timeout (permessi insufficienti?).';
      return slash ? ctx.editReply(msg) : ctx.reply(msg);
    }

    // Salva nel DB
    const db = readDb();
    if (!db[guild.id]) db[guild.id] = [];
    db[guild.id] = db[guild.id].filter((e) => e.userId !== target.id);
    db[guild.id].push({
      userId: target.id,
      userTag: target.tag,
      until: Date.now() + finalMs,
      reason: finalReason,
      by: senderId,
      byTag: ctx.user?.tag || ctx.author.tag,
      ts: Date.now(),
    });
    writeDb(db);

    const embed = new EmbedBuilder()
      .setColor(0xdc2626)
      .setTitle('🔇 Utente mutato')
      .setThumbnail(target.displayAvatarURL({ extension: 'png', size: 256 }))
      .addFields(
        { name: '👤 Utente', value: `${target} (\`${target.id}\`)`, inline: false },
        { name: '⏱️ Durata', value: formatDuration(finalMs), inline: true },
        { name: '📅 Scade', value: `<t:${Math.floor((Date.now() + finalMs) / 1000)}:R>`, inline: true },
        { name: '📝 Motivo', value: finalReason, inline: false },
        { name: '👮 Moderatore', value: `${ctx.user || ctx.author}`, inline: false },
      )
      .setFooter({ text: 'Zeno Bot • Moderazione' })
      .setTimestamp();

    const payload = { embeds: [embed] };
    if (slash) return ctx.editReply(payload);
    return ctx.reply(payload);
  }
}

// ───────────── LISTA MUTATI ─────────────
async function muteList(ctx, guild) {
  const slash = isInteraction(ctx);
  if (slash && !ctx.deferred) await ctx.deferReply({ flags: MessageFlags.Ephemeral });

  const db = readDb();
  const muted = (db[guild.id] || []).filter((e) => e.until > Date.now());

  if (!muted.length) {
    const msg = '✅ Nessun utente attualmente mutato nel server.';
    return slash ? ctx.editReply(msg) : ctx.reply(msg);
  }

  const list = muted
    .sort((a, b) => b.until - a.until)
    .slice(0, 25) // Limite Discord
    .map((e, i) => `**${i + 1}.** <@${e.userId}> — <t:${Math.floor(e.until / 1000)}:R>\n  └ 📝 ${e.reason || 'Nessun motivo'}`)
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle(`🔇 Utenti mutati — ${muted.length}`)
    .setDescription(list)
    .setFooter({ text: 'Zeno Bot • Moderazione' })
    .setTimestamp();

  const payload = { embeds: [embed] };
  if (slash) return ctx.editReply(payload);
  return ctx.reply(payload);
}

muteCmd.command = /^(mute|unmute)$/i;
muteCmd.help = ['mute', 'unmute'];
muteCmd.tags = ['admin'];
muteCmd.desc = 'Silenzia/riattiva un utente nel server';
muteCmd.data = data;

export default muteCmd;

// ───────────── Fallback per comandi con prefisso ─────────────
export const prefix = 'mute';
export async function execute(ctx, args) {
  return muteCmd(ctx, args);
}
