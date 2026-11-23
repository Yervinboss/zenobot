// creato da Zeus
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const execAsync = promisify(exec);

module.exports = {
  commands: ['mp4'],
  name: 'mp4',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'Cerca una canzone per nome e invia il file video/audio in formato MP4',
  usage: '<nome della canzone>',
  cooldown: 3000,
  async run(sock, m, args, cmd, ctx) {
    try {
      const query = ctx.argsText?.trim();
      if (!query) {
        return ctx.reply(`⚠️ Usa: ${ctx.prefix}${ctx.command} ${ctx.usage}`);
      }

      ctx.react('⏳');
      const tempPath = path.join(os.tmpdir(), `song_${Date.now()}.mp4`);
      const ytSearch = `ytsearch1:${query}`;

      // Scarica il primo risultato in MP4
      const command = `yt-dlp "${ytSearch}" -f "best[ext=mp4]" -o "${tempPath}" --no-warnings --quiet`;
      await execAsync(command);

      // Verifica che il file sia stato creato
      if (!fs.existsSync(tempPath)) {
        return ctx.err('❌ Impossibile scaricare la canzone. Riprova più tardi.');
      }

      // Invia il video/audio
      await sock.sendMessage(
        ctx.chat,
        {
          video: { url: tempPath },
          caption: `🎵 *${query}*`,
        },
        { quoted: m }
      );

      ctx.react('✅');
      ctx.ok('✅ Canzone inviata con successo!');
    } catch (e) {
      console.error(e);
      ctx.err('⚠️ Si è verificato un errore durante il download. Controlla il nome della canzone e riprova.');
    }
  },
};