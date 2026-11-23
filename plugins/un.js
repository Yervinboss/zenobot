// creato da Zeus
module.exports = {
  commands: ['un'],
  name: 'un',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'Gioco di tiro al bersaglio: indovina la distanza del bersaglio.',
  usage: '[distanza in metri (opzionale)]',
  cooldown: 3000,
  async run(sock, m, args, cmd, ctx) {
    try {
      // Genera la distanza del bersaglio (0-100 metri)
      const targetDistance = Math.floor(Math.random() * 101);
      // Leggi la distanza fornita dall'utente, altrimenti scegli casuale
      const userDistance = ctx.argsText
        ? parseInt(ctx.argsText.trim())
        : Math.floor(Math.random() * 101);
      if (isNaN(userDistance) || userDistance < 0 || userDistance > 100) {
        return ctx.err('Inserisci una distanza valida tra 0 e 100 metri.');
      }
      const diff = Math.abs(targetDistance - userDistance);
      let result, emoji;
      if (diff <= 10) {
        result = 'colpito';
        emoji = '✅';
      } else if (diff <= 30) {
        result = 'quasi colpito';
        emoji = '🤏';
      } else {
        result = 'mancato';
        emoji = '❌';
      }
      const reply = `🎯 Hai sparato a *${userDistance}* metri.\n🎯 Il bersaglio era a *${targetDistance}* metri.\n🔹 Risultato: *${result}*!`;
      ctx.reply(reply);
      ctx.react(emoji);
    } catch (e) {
      console.error(e);
      ctx.err('Si è verificato un errore durante il gioco di tiro al bersaglio.');
    }
  },
};