import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// ───────────── COMANDO ─────────────
export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Espelle un utente dal server')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) =>
    o.setName('utente').setDescription('L\'utente da espellere').setRequired(true))
  .addStringOption((o) =>
    o.setName('motivo').setDescription('Motivo del kick').setRequired(false));

async function kickCmd(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const guild = ctx.guild;
  const senderId = slash ? ctx.user.id : ctx.author.id;

  if (!guild) {
    return ctx.reply({ content: '❌ Questo comando funziona solo nei server.', flags: MessageFlags.Ephemeral });
  }

  // 🔒 Controllo permessi (owner bypassa)
  const sender = await guild.members.fetch(senderId).catch(() => null);
  const isAdmin = sender?.permissions.has(PermissionFlagsBits.KickMembers) ||
                  sender?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isOwner(senderId) && !isAdmin) {
    return ctx.reply({
      content: '❌ Non hai il permesso **Espelli membri**. Solo admin o owner possono usare questo comando.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // ───────────── PARSING ARGOMENTI ─────────────
  let target, reason;

  if (slash) {
    target = ctx.options.getUser('utente');
    reason = ctx.options.getString('motivo') || 'Nessun motivo specificato';
  } else {
    // 🔹 Comando con prefisso: prima cerca la menzione
    const mentionMatch = text.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      target = await guild.client.users.fetch(mentionMatch[1]).catch(() => null);
    }

    // 🔹 Se non c'è menzione, prova a leggere il messaggio a cui si risponde
    if (!target && ctx.reference?.messageId) {
      try {
        const refMsg = await ctx.channel.messages.fetch(ctx.reference.messageId);
        target = refMsg.author;
      } catch (e) {
        console.error('[KICK] Errore fetch reply:', e.message);
      }
    }

    // Il motivo è il testo dopo la menzione / la parola comando
    reason = text
      .replace(/<@!?\d+>/g, '')       // rimuove eventuali menzioni
      .replace(/^kick\s*/i, '')        // rimuove la parola "kick"
      .trim() || 'Nessun motivo specificato';
  }

  if (!target) {
    return ctx.reply({
      content: '❌ Devi menzionare un utente **o** rispondere a un suo messaggio.\n📌 **Esempi:**\n• `/kick @utente spam`\n• `.kick spam` (rispondendo a un messaggio)',
      flags: MessageFlags.Ephemeral,
    });
  }

  // ───────────── CONTROLLI DI SICUREZZA ─────────────

  // 1. Non espellere il proprietario del server
  if (target.id === guild.ownerId) {
    return ctx.reply({ content: '🧠 Non puoi espellere il **proprietario del server**.', flags: MessageFlags.Ephemeral });
  }

  // 2. Non espellere il creatore del bot
  if (isOwner(target.id)) {
    return ctx.reply({ content: '🧠 Non puoi espellere il **creatore del bot**.', flags: MessageFlags.Ephemeral });
  }

  // 3. Non espellere il bot stesso
  if (target.id === guild.client.user.id) {
    return ctx.reply({ content: '🤖 Non puoi espellere me stesso!', flags: MessageFlags.Ephemeral });
  }

  // 4. Non espellere se stesso
  if (target.id === senderId) {
    return ctx.reply({ content: '🤔 Non puoi espellere te stesso! Usa il pulsante "Esci dal server" se vuoi andartene.', flags: MessageFlags.Ephemeral });
  }

  // Recupera il membro target
  const targetMember = await guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return ctx.reply({ content: '❌ Utente non trovato nel server.', flags: MessageFlags.Ephemeral });
  }

  // 5. Controllo gerarchia ruoli: non espellere chi ha un ruolo superiore/uguale
  if (!isOwner(senderId) && sender && targetMember.roles.highest.position >= sender.roles.highest.position) {
    return ctx.reply({
      content: '❌ Non puoi espellere un utente con un ruolo uguale o superiore al tuo.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // 6. Controllo bot: il bot deve poter espellere questo utente
  if (!targetMember.kickable) {
    return ctx.reply({
      content: '❌ Non posso espellere questo utente (ha un ruolo superiore al mio o sono senza permessi).',
      flags: MessageFlags.Ephemeral,
    });
  }

  // ───────────── ESECUZIONE KICK ─────────────
  if (slash && !ctx.deferred) await ctx.deferReply();

  try {
    // Prova a mandare un DM all'utente prima di espellerlo
    try {
      const dm = await target.createDM();
      await dm.send(
        `🚫 **Sei stato espulso da ${guild.name}**\n\n`
        + `📝 **Motivo:** ${reason}\n`
        + `👮 **Moderatore:** ${ctx.user?.tag || ctx.author.tag}\n\n`
        + `Puoi rientrare con un nuovo invito se il server lo permette.`
      );
    } catch (e) {
      // Se ha DM chiusi, ignora
    }

    // Esegui il kick
    await targetMember.kick(`${reason} | Mod: ${senderId}`);

    // Embed di conferma
    const embed = new EmbedBuilder()
      .setColor(0xdc2626)
      .setTitle('🚫 Utente espulso')
      .setThumbnail(target.displayAvatarURL({ extension: 'png', size: 256 }))
      .addFields(
        { name: '👤 Utente', value: `${target} (\`${target.tag}\`)`, inline: false },
        { name: '🆔 ID', value: `\`${target.id}\``, inline: true },
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '👮 Moderatore', value: `${ctx.user || ctx.author}`, inline: true },
      )
      .setFooter({ text: 'Zeno Bot • Moderazione' })
      .setTimestamp();

    const payload = { embeds: [embed] };
    if (slash) return ctx.editReply(payload);
    return ctx.reply(payload);

  } catch (e) {
    console.error('[KICK] Errore:', e.message);
    const msg = '❌ Errore durante l\'espulsione. Controlla che io abbia il permesso **Espelli membri** e un ruolo superiore all\'utente.';
    if (slash) return ctx.editReply(msg);
    return ctx.reply(msg);
  }
}

kickCmd.command = /^kick$/i;
kickCmd.help = ['kick'];
kickCmd.tags = ['moderazione'];
kickCmd.desc = 'Espelle un utente dal server';
kickCmd.data = data;

export default kickCmd;

// ───────────── Fallback per comandi con prefisso ─────────────
export const prefix = 'kick';
export async function execute(ctx, args) {
  return kickCmd(ctx, args);
}
