// creato da Zeus
module.exports = {
  commands: ['una'],
  name: 'una',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'Mostra la classifica dei 10 membri più attivi del gruppo',
  usage: '',
  cooldown: 3000,
  async run(sock, m, args, cmd, ctx) {
    try {
      const chatId = m.key.remoteJid;
      if (!ctx.isGroup) return ctx.err('⚠️ Questo comando è disponibile solo nei gruppi.');
      const groupCounts = (global.messageCounts && global.messageCounts[chatId]) || {};
      const entries = Object.entries(groupCounts);
      if (entries.length === 0) return ctx.info('Nessun dato disponibile per la classifica.', '📊 Classifica');

      const top = entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, cnt], i) => {
          const tag = id.split('@')[0];
          return `${i + 1}. @${tag} - ${cnt} messaggi`;
        })
        .join('\n');

      const text = `📈 *Classifica Top 10 dei più attivi* 📈\n\n${top}`;
      await ctx.reply(text);
    } catch (e) {
      console.error(e);
      ctx.err('❌ Si è verificato un errore durante la generazione della classifica.');
    }
  },
};