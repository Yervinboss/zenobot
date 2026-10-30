import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// ───────────── COMANDO ─────────────
export const data = new SlashCommandBuilder()
  .setName('invita')
  .setDescription('Invia un invito al server a un utente (via ID o menzione)')
  .setDefaultMemberPermissions(PermissionFlagsBits.CreateInstantInvite)
  .addUserOption((o) =>
    o.setName('utente').setDescription('Menziona l\'utente da invitare').setRequired(false))
  .addStringOption((o) =>
    o.setName('id').setDescription('ID Discord dell\'utente da invitare').setRequired(false))
  .addChannelOption((o) =>
    o.setName('canale').setDescription('Canale a cui invitare (default: #generale)').setRequired(false))
  .addIntegerOption((o) =>
    o.setName('scadenza').setDescription('Scadenza in ore (default: 24h, max 168h)').setMinValue(1).setMaxValue(168).setRequired(false))
  .addIntegerOption((o) =>
    o.setName('usi').setDescription('Numero max di utilizzi (default: 1, max 100)').setMinValue(1).setMaxValue(100).setRequired(false));

async function invitaCmd(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const guild = ctx.guild;
  const senderId = slash ? ctx.user.id : ctx.author.id;

  if (!guild) {
    return ctx.reply({ content: '❌ Questo comando funziona solo nei server.', flags: MessageFlags.Ephemeral });
  }

  // 🔒 Controllo permessi (owner bypassa)
  const sender = await guild.members.fetch(senderId).catch(() => null);
  const isAdmin = sender?.permissions.has(PermissionFlagsBits.CreateInstantInvite) ||
                  sender?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isOwner(senderId) && !isAdmin) {
    return ctx.reply({
      content: '❌ Non hai il permesso **Crea invito istantaneo**.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // ───────────── PARSING ARGOMENTI ─────────────
  let targetUser = null;
  let channel = null;
  let expiresInHours = 24;
  let maxUses = 1;

  if (slash) {
    targetUser = ctx.options.getUser('utente');
    const idInput = ctx.options.getString('id');
    channel = ctx.options.getChannel('canale');
    expiresInHours = ctx.options.getInteger('scadenza') || 24;
    maxUses = ctx.options.getInteger('usi') || 1;

    // Se è stato dato un ID testuale, prova a recuperarlo
    if (!targetUser && idInput) {
      if (!/^\d{17,20}$/.test(idInput.trim())) {
        return ctx.reply({ content: '❌ ID non valido. Deve essere di 17-20 cifre.', flags: MessageFlags.Ephemeral });
      }
      targetUser = await guild.client.users.fetch(idInput.trim()).catch(() => null);
      if (!targetUser) {
        return ctx.reply({ content: '❌ Utente non trovato con questo ID.', flags: MessageFlags.Ephemeral });
      }
    }
  } else {
    // Comando con prefisso: parsing manuale
    // Cerca menzione
    const mentionMatch = text.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      targetUser = await guild.client.users.fetch(mentionMatch[1]).catch(() => null);
    }

    // Cerca ID numerico nel testo (dopo "id:" o ID puro)
    if (!targetUser) {
      const idMatch = text.match(/(?:id[:\s]+)?(\d{17,20})/);
      if (idMatch) {
        targetUser = await guild.client.users.fetch(idMatch[1]).catch(() => null);
      }
    }

    // Cerca menzione di canale <#id>
    const channelMatch = text.match(/<#(\d+)>/);
    if (channelMatch) {
      channel = await guild.channels.fetch(channelMatch[1]).catch(() => null);
    }

    // Parsing opzioni extra (scadenza=Xh usi=N)
    const expiryMatch = text.match(/(?:scadenza|sc|exp)[:\s]*(\d+)\s*(h|ore|hour|hours)?/i);
    if (expiryMatch) expiresInHours = Math.min(Math.max(parseInt(expiryMatch[1], 10), 1), 168);

    const usesMatch = text.match(/(?:usi|us|max)[:\s]*(\d+)/i);
    if (usesMatch) maxUses = Math.min(Math.max(parseInt(usesMatch[1], 10), 1), 100);
  }

  if (!targetUser) {
    return ctx.reply({
      content: '❌ Devi specificare un utente da invitare.\n📌 **Esempi:**\n• `/invita utente:@utente`\n• `/invita id:123456789012345678`\n• `.invita @utente`\n• `.invita id:123456789012345678`',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Se non specificato, usa il canale corrente
  if (!channel) channel = ctx.channel;

  // ───────────── CONTROLLI ─────────────

  // Non invitare il bot stesso
  if (targetUser.id === guild.client.user.id) {
    return ctx.reply({ content: '🤖 Non posso invitare me stesso (sono già qui!).', flags: MessageFlags.Ephemeral });
  }

  // Controlla se l'utente è già nel server
  const alreadyMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (alreadyMember) {
    return ctx.reply({
      content: `ℹ️ **${targetUser.tag}** è già membro di questo server!`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Verifica che il bot possa creare inviti nel canale
  const botMember = await guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.CreateInstantInvite)) {
    return ctx.reply({
      content: `❌ Non posso creare inviti in ${channel}. Dammi il permesso **Crea invito istantaneo** in quel canale.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // ───────────── CREAZIONE INVITO ─────────────
  if (slash && !ctx.deferred) await ctx.deferReply({ flags: MessageFlags.Ephemeral });

  let invite;
  try {
    invite = await channel.createInvite({
      maxAge: expiresInHours * 3600, // convertito in secondi
      maxUses: maxUses,
      unique: true,
      reason: `Invito inviato da ${ctx.user?.tag || ctx.author.tag} a ${targetUser.tag}`,
    });
  } catch (e) {
    console.error('[INVITA] Errore creazione invito:', e.message);
    const msg = '❌ Errore durante la creazione dell\'invito. Controlla i permessi del bot.';
    return slash ? ctx.editReply(msg) : ctx.reply(msg);
  }

  // ───────────── INVIO DM ALL'UTENTE ─────────────
  let dmSent = false;
  let dmError = null;

  try {
    const dm = await targetUser.createDM();
    await dm.send(
      `╔═══════ ✦ ⚡ ✦ ═══════╗\n\n`
      + `   🎉 **SEI STATO INVITATO!** 🎉\n\n`
      + `👤 **Da:** ${ctx.user?.tag || ctx.author.tag}\n`
      + `🏠 **Server:** **${guild.name}**\n\n`
      + `🔗 **Il tuo invito:**\n${invite.url}\n\n`
      + `⏱️ **Scade tra:** ${expiresInHours} ore\n`
      + `👥 **Utilizzi disponibili:** ${maxUses}\n\n`
      + `╚═══════ ✦ ⚡ ✦ ═══════╝`
    );
    dmSent = true;
  } catch (e) {
    dmError = e.message;
    console.error('[INVITA] Errore DM:', e.message);
  }

  // ───────────── EMBED DI CONFERMA ─────────────
  const embed = new EmbedBuilder()
    .setColor(dmSent ? 0x22c55e : 0xfacc15)
    .setTitle(dmSent ? '✅ Invito inviato' : '⚠️ Invito creato (DM fallito)')
    .setDescription(
      dmSent
        ? `Invito inviato con successo a **${targetUser.tag}** in DM!`
        : `Non sono riuscito a mandare il DM a **${targetUser.tag}** (potrebbe avere i DM chiusi).\n\nEcco il link da condividere manualmente:`
    )
    .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
    .addFields(
      { name: '👤 Utente', value: `${targetUser} (\`${targetUser.id}\`)`, inline: false },
      { name: '🔗 Invito', value: `${invite.url}`, inline: false },
      { name: '📍 Canale', value: `${channel}`, inline: true },
      { name: '⏱️ Scade', value: `<t:${Math.floor((Date.now() + expiresInHours * 3600000) / 1000)}:R>`, inline: true },
      { name: '👥 Usi max', value: `\`${maxUses}\``, inline: true },
    )
    .setFooter({ text: `Zeno Bot • Inviato da ${ctx.user?.tag || ctx.author.tag}` })
    .setTimestamp();

  const payload = { embeds: [embed] };
  if (slash) return ctx.editReply(payload);
  return ctx.reply(payload);
}

invitaCmd.command = /^(invita|invite|inv)$/i;
invitaCmd.help = ['invita'];
invitaCmd.tags = ['utility'];
invitaCmd.desc = 'Invia un invito al server via DM a un utente';
invitaCmd.data = data;

export default invitaCmd;

// ───────────── Fallback per comandi con prefisso ─────────────
export const prefix = 'invita';
export async function execute(ctx, args) {
  return invitaCmd(ctx, args);
}
