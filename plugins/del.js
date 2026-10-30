import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// ───────────── COMANDO SLASH ─────────────
export const data = new SlashCommandBuilder()
  .setName('del')
  .setDescription('Cancella un messaggio (il tuo e/o quello a cui rispondi)')
  .addStringOption((o) =>
    o.setName('id')
      .setDescription('ID del messaggio da cancellare (opzionale)')
      .setRequired(false))
  .addIntegerOption((o) =>
    o.setName('quantita')
      .setDescription('Numero di messaggi recenti da cancellare (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

async function delCmd(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const channel = ctx.channel;

  if (!channel) return ctx.reply({ content: '❌ Canale non valido.', flags: MessageFlags.Ephemeral });

  // ─────────── CASO SLASH COMMAND ───────────
  if (slash) {
    const msgId = ctx.options.getString('id');
    const quantita = ctx.options.getInteger('quantita');

    // Cancella N messaggi recenti
    if (quantita) {
      if (!ctx.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return ctx.reply({ content: '❌ Ti serve il permesso **Gestisci messaggi**.', flags: MessageFlags.Ephemeral });
      }
      await ctx.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const deleted = await channel.bulkDelete(quantita, true);
        return ctx.editReply(`🗑️ Cancellati **${deleted.size}** messaggi.`);
      } catch (e) {
        return ctx.editReply(`❌ Errore: ${e.message} (i messaggi più vecchi di 14 giorni non possono essere cancellati in blocco).`);
      }
    }

    // Cancella un messaggio specifico via ID
    if (msgId) {
      await ctx.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const target = await channel.messages.fetch(msgId);
        // Controllo permessi: puoi cancellare i tuoi messaggi, o se hai Manage Messages, anche gli altri
        const canDelete = target.author.id === ctx.user.id ||
                         ctx.member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
                         target.author.id === ctx.client.user.id;

        if (!canDelete) {
          return ctx.editReply('❌ Non puoi cancellare questo messaggio (non è tuo e non hai **Gestisci messaggi**).');
        }

        await target.delete();
        // Prova anche a cancellare la risposta del comando slash (il messaggio che ha inviato l'interazione)
        try { await ctx.deleteReply(); } catch {}
        return;
      } catch (e) {
        return ctx.editReply('❌ Messaggio non trovato o già cancellato.');
      }
    }

    // Nessun argomento → istruzioni
    return ctx.reply({
      content: '🗑️ **Elimina Messaggio**\n\n'
        + '**Come si usa:**\n'
        + '• Rispondi a un messaggio con `.del` per eliminarlo insieme al tuo comando\n'
        + '• `/del id:<ID>` — cancella un messaggio specifico tramite ID\n'
        + '• `/del quantita:<N>` — cancella N messaggi recenti (1-100)\n\n'
        + '⚠️ Per cancellare messaggi di altri utenti serve il permesso **Gestisci messaggi**.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─────────── CASO PREFISSO (.del) ───────────
  const msg = ctx; // ctx è già il messaggio
  const referenced = msg.reference?.messageId;

  // Se non c'è un reply e non c'è testo con ID, mostra istruzioni
  const args = text.trim().split(/\s+/).filter(Boolean);

  if (!referenced && !args.length) {
    // Cancella solo il messaggio del comando se possibile
    try {
      if (msg.deletable) await msg.delete();
    } catch {}
    // Manda istruzioni in privato (o nel canale se DM chiusi)
    try {
      const dm = await msg.author.createDM();
      await dm.send('🗑️ **Elimina Messaggio**\n\n**Come si usa:**\n• Rispondi a un messaggio con `.del` per eliminarlo insieme al tuo comando\n• `.del id:<ID>` — cancella un messaggio specifico\n• `.del <N>` — cancella N messaggi recenti');
    } catch {
      const info = await msg.channel.send('🗑️ Rispondi a un messaggio con `.del` per eliminarlo!');
      setTimeout(() => info.delete().catch(() => {}), 8000);
    }
    return;
  }

  // Cancellazione di N messaggi recenti con .del <numero>
  if (args.length && /^\d+$/.test(args[0]) && !referenced) {
    const n = Math.min(Math.max(parseInt(args[0], 10), 1), 100);
    if (!msg.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return msg.reply('❌ Ti serve il permesso **Gestisci messaggi**.');
    }
    try {
      await msg.delete().catch(() => {});
      const deleted = await msg.channel.bulkDelete(n, true);
      const info = await msg.channel.send(`🗑️ Cancellati **${deleted.size}** messaggi.`);
      setTimeout(() => info.delete().catch(() => {}), 4000);
    } catch (e) {
      console.error('[DEL] bulkDelete errore:', e.message);
    }
    return;
  }

  // Cancellazione di un messaggio via ID con .del id:<ID>
  if (args.length && args[0].startsWith('id:')) {
    const id = args[0].slice(3);
    if (!/^\d{17,20}$/.test(id)) {
      return msg.reply('❌ ID non valido.');
    }
    try {
      const target = await msg.channel.messages.fetch(id);
      const canDelete = target.author.id === msg.author.id ||
                        msg.member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
                        target.author.id === msg.client.user.id;
      if (!canDelete) return msg.reply('❌ Non puoi cancellare questo messaggio.');
      await target.delete();
      if (msg.deletable) await msg.delete().catch(() => {});
    } catch {
      return msg.reply('❌ Messaggio non trovato.');
    }
    return;
  }

  // Cancellazione del messaggio a cui si risponde + il comando (.del)
  if (referenced) {
    const canDeleteRef = msg.member?.permissions.has(PermissionFlagsBits.ManageMessages);

    // Prova prima a cancellare il target
    try {
      const target = await msg.channel.messages.fetch(referenced);
      const canDeleteTarget = target.author.id === msg.author.id ||
                             canDeleteRef ||
                             target.author.id === msg.client.user.id;

      if (canDeleteTarget) {
        await target.delete().catch((e) => console.error('[DEL] target delete:', e.message));
      } else {
        return msg.reply('❌ Non puoi cancellare quel messaggio (non è tuo e non hai **Gestisci messaggi**).');
      }
    } catch (e) {
      console.error('[DEL] fetch target:', e.message);
    }

    // Poi cancella il comando .del stesso
    try {
      if (msg.deletable) await msg.delete();
    } catch (e) {
      console.error('[DEL] delete command:', e.message);
    }
  }
}

delCmd.command = /^(del|delete)$/i;
delCmd.help = ['del', 'delete'];
delCmd.tags = ['tools'];
delCmd.desc = 'Cancella un messaggio o più messaggi';
delCmd.data = data;

export default delCmd;

// ───────────── Fallback per comandi con prefisso ─────────────
export const prefix = 'del';
export async function execute(ctx, args) {
  return delCmd(ctx, args);
}
