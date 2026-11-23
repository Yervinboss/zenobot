const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const run = promisify(execFile);

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  commands: ['call'],
  name: 'call',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'Zeus ti "chiama" e ti canta una canzone',
  usage: '<canzone>',
  cooldown: 15000,

  async run(sock, m, args, cmd, ctx) {
    const chat = ctx.chat;
    const q = args.join(' ').trim();
    if (!q) return ctx.err('Scrivi la canzone. Es: *.call Despacito*');

    const base = path.join(os.tmpdir(), 'call_' + Date.now());
    const mp3 = base + '.mp3';
    const ogg = base + '.ogg';

    const msg = await sock.sendMessage(chat, { text: '📞 *ZEUS ti sta chiamando…*\n⚡ squillo, squillo…' }, { quoted: m });
    const aggiorna = (t) => sock.sendMessage(chat, { text: t, edit: msg.key }).catch(() => {});

    try {
      await pausa(2500);
      await aggiorna('📲 *Chiamata risposta*\n🎵 Zeus sta cercando: _' + q + '_');
      await run('yt-dlp', ['-x', '--audio-format', 'mp3', '--no-playlist', '-o', base + '.%(ext)s', 'ytsearch1:' + q], { timeout: 180000 });
      await run('ffmpeg', ['-y', '-i', mp3, '-t', '180', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', ogg], { timeout: 120000 });
      await aggiorna('🔊 *In chiamata con Zeus*\n🎶 ' + q);
      await sock.sendMessage(chat, { audio: fs.readFileSync(ogg), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
      await aggiorna('📴 *Chiamata terminata*\n⚡ Zeus ti ha cantato: ' + q);
    } catch (e) {
      await aggiorna('📴 *Chiamata persa*\n' + String(e.message).slice(0, 150));
    } finally {
      for (const f of [mp3, ogg]) try { fs.unlinkSync(f); } catch {}
    }
  },
};
