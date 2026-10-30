import {
  SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import { isOwner } from './owner.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

function canTag(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator)
    || member.permissions.has(PermissionFlagsBits.MentionEveryone);
}

// Divide gli ID in blocchi che stanno dentro al limite di 2000 caratteri di un messaggio
function buildChunks(ids, maxLen = 1900) {
  const chunks = [];
  let current = [];
  let len = 0;
  for (const id of ids) {
    const token = `<@${id}>`;
    const extra = token.length + (current.length ? 1 : 0);
    if (current.length && len + extra > maxLen) {
      chunks.push(current.join(' '));
      current = [];
      len = 0;
    }
    current.push(token);
    len += token.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

// ───────────── Comando: /tag  oppure  .tag ─────────────
export const data = new SlashCommandBuilder()
  .setName('tag')
  .setDescription('Manda un messaggio taggando tutti, in modo pulito (solo admin)')
  .addStringOption((o) => o.setName('testo').setDescription('Testo del messaggio'))
  .addAttachmentOption((o) => o.setName('allegato').setDescription('Foto, video o audio da allegare'));

async function tag(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);

  if (!ctx.guild) {
    const msg = '❌ Questo comando può essere usato solo nei server!';
    return slash ? ctx.reply({ content: msg, flags: MessageFlags.Ephemeral }) : ctx.reply(msg);
  }

  const authorId = slash ? ctx.user.id : ctx.author.id;
  if (!isOwner(authorId) && !canTag(ctx.member)) {
    const msg = '❌ Solo gli amministratori possono usare `.tag`.';
    return slash ? ctx.reply({ content: msg, flags: MessageFlags.Ephemeral }) : ctx.reply(msg);
  }

  let content = slash ? (ctx.options.getString('testo') || '') : text.trim();
  const files = [];

  const attachment = slash ? ctx.options.getAttachment('allegato') : null;
  if (attachment) files.push(new AttachmentBuilder(attachment.url, { name: attachment.name || 'file' }));

  // Prefisso senza testo/allegato: prova a prendere il messaggio citato
  if (!slash && !content && !files.length && ctx.reference?.messageId) {
    const ref = await ctx.channel.messages.fetch(ctx.reference.messageId).catch(() => null);
    if (ref) {
      content = ref.content || '';
      for (const att of ref.attachments.values()) {
        files.push(new AttachmentBuilder(att.url, { name: att.name || 'file' }));
      }
    }
  }

  if (!content && !files.length) {
    const msg = '❌ Scrivi un messaggio dopo `.tag`, oppure rispondi a un messaggio/foto/video/audio con `.tag`.';
    return slash ? ctx.reply({ content: msg, flags: MessageFlags.Ephemeral }) : ctx.reply(msg);
  }

  let members;
  try {
    members = await ctx.guild.members.fetch();
  } catch (e) {
    console.error('Errore fetch membri per tag:', e.message);
    const msg = '❌ Non riesco a leggere l\'elenco dei membri. Serve l\'intent "Server Members" attivo sul bot.';
    return slash ? ctx.reply({ content: msg, flags: MessageFlags.Ephemeral }) : ctx.reply(msg);
  }

  const ids = [...members.values()].filter((m) => !m.user.bot).map((m) => m.id);
  if (!ids.length) {
    const msg = '❌ Non ho trovato nessun membro da taggare.';
    return slash ? ctx.reply({ content: msg, flags: MessageFlags.Ephemeral }) : ctx.reply(msg);
  }

  const chunks = buildChunks(ids);

  if (slash) await ctx.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    for (let i = 0; i < chunks.length; i++) {
      // Le menzioni stanno in uno spoiler: il messaggio resta pulito, ma tagga comunque tutti
      const payload = {
        content: i === 0 ? `${content ? `${content}\n\n` : ''}||${chunks[i]}||` : `||${chunks[i]}||`,
        allowedMentions: { parse: ['users'] },
      };
      if (i === 0 && files.length) payload.files = files;
      await ctx.channel.send(payload);
    }
    if (slash) await ctx.editReply(`✅ Messaggio inviato a ${ids.length} membri!`);
  } catch (e) {
    console.error('Errore comando tag:', e);
    const msg = '❌ Errore durante l\'invio del tag.';
    if (slash) await ctx.editReply(msg).catch(() => {});
    else await ctx.reply(msg).catch(() => {});
  }
}

tag.command = /^tag$/i;
tag.help = ['tag'];
tag.tags = ['moderazione'];
tag.desc = 'Manda un messaggio taggando tutti, in modo pulito (solo admin)';

export default tag;
