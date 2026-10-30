import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

export const data = new SlashCommandBuilder()
  .setName('bot')
  .setDescription('[Owner] Gestisci identità del bot')
  .addSubcommand((s) => s
    .setName('nome')
    .setDescription('Cambia il nome del bot')
    .addStringOption((o) => o.setName('nuovo').setDescription('Il nuovo nome (2-32 caratteri)').setMinLength(2).setMaxLength(32).setRequired(true)))
  .addSubcommand((s) => s
    .setName('avatar')
    .setDescription('Cambia la foto profilo del bot')
    .addAttachmentOption((o) => o.setName('immagine').setDescription('Allegato immagine').setRequired(false))
    .addStringOption((o) => o.setName('url').setDescription('URL dell\'immagine').setRequired(false)))
  .addSubcommand((s) => s
    .setName('info')
    .setDescription('Mostra le info attuali del bot'));

async function botCmd(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const user = slash ? ctx.user : ctx.author;

  // 🔒 Controllo owner tramite la funzione importata
  if (!isOwner(user.id)) {
    return ctx.reply({
      content: '⛔ Questo comando è riservato solo al **creatore del bot**.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const client = ctx.client;
  let sub, args;

  if (slash) {
    sub = ctx.options.getSubcommand();
    args = {
      nuovo: ctx.options.getString('nuovo'),
      immagine: ctx.options.getAttachment('immagine'),
      url: ctx.options.getString('url'),
    };
  } else {
    const parts = text.trim().split(/\s+/);
    sub = (parts[0] || 'info').toLowerCase();
    args = { nuovo: parts.slice(1).join(' ') || null, immagine: null, url: parts[1] || null };
  }

  // ───────────── /bot info ─────────────
  if (sub === 'info' || !sub) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 Info Bot')
      .setThumbnail(client.user.displayAvatarURL({ extension: 'png', size: 256 }))
      .addFields(
        { name: '📛 Nome attuale', value: `\`${client.user.username}\``, inline: true },
        { name: '🆔 ID Bot', value: `\`${client.user.id}\``, inline: true },
        { name: '📅 Creato il', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '🌍 Server', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: '👥 Utenti', value: `\`${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}\``, inline: true },
      )
      .setFooter({ text: 'Zeno Bot • Pannello Owner' })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ───────────── /bot nome ─────────────
  if (sub === 'nome' || sub === 'name') {
    if (!args.nuovo || args.nuovo.length < 2 || args.nuovo.length > 32) {
      return ctx.reply({ content: '❌ Il nome deve essere tra 2 e 32 caratteri.', flags: MessageFlags.Ephemeral });
    }

    if (slash && !ctx.deferred) await ctx.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await client.user.setUsername(args.nuovo);
      const msg = `✅ Nome aggiornato a: **${args.nuovo}**\n\n⚠️ Discord limita il cambio nome a **2 volte all'ora**.`;
      if (slash) return ctx.editReply(msg);
      return ctx.reply(msg);
    } catch (e) {
      console.error('Errore setUsername:', e);
      const errMsg = e.code === 50035
        ? '❌ Nome rifiutato da Discord (potrebbe contenere parole non permesse).'
        : `❌ Errore: ${e.message || 'riprova più tardi (rate limit?).'}`;
      if (slash) return ctx.editReply(errMsg);
      return ctx.reply(errMsg);
    }
  }

  // ───────────── /bot avatar ─────────────
  if (sub === 'avatar' || sub === 'foto') {
    if (slash && !ctx.deferred) await ctx.deferReply({ flags: MessageFlags.Ephemeral });

    let imageUrl = null;

    if (args.immagine?.url) {
      imageUrl = args.immagine.url;
    } else if (args.url) {
      imageUrl = args.url;
    } else if (!slash && ctx.message?.attachments?.size > 0) {
      imageUrl = ctx.message.attachments.first().url;
    }

    if (!imageUrl) {
      const help = '❌ Devi allegare un\'immagine o fornire un URL.\n\n**Esempi:**\n• `/bot avatar immagine:<allegato>`\n• `/bot avatar url:https://...`\n• `.bot avatar https://...`';
      if (slash) return ctx.editReply(help);
      return ctx.reply(help);
    }

    try {
      await client.user.setAvatar(imageUrl);
      const msg = `✅ Foto profilo aggiornata!\n\n⚠️ Discord limita il cambio avatar a **2 volte all'ora**.`;
      if (slash) return ctx.editReply(msg);
      return ctx.reply(msg);
    } catch (e) {
      console.error('Errore setAvatar:', e);
      let errMsg = `❌ Errore: ${e.message || 'riprova più tardi (rate limit?).'}`;
      if (e.code === 50035 || e.message?.includes('rate limit')) {
        errMsg = '❌ Discord ha bloccato il cambio (rate limit). Riprova tra qualche minuto.';
      } else if (e.message?.includes('Invalid Form Body')) {
        errMsg = '❌ URL immagine non valido. Assicurati che sia un\'immagine valida (PNG/JPG/GIF).';
      }
      if (slash) return ctx.editReply(errMsg);
      return ctx.reply(errMsg);
    }
  }
}

botCmd.command = /^(bot|owner)$/i;
botCmd.help = ['bot'];
botCmd.tags = ['owner'];
botCmd.desc = '[Owner] Cambia nome e avatar del bot';

export default botCmd;
