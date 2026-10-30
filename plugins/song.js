import yts from 'yt-search';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, AttachmentBuilder, MessageFlags,
} from 'discord.js';

// ───────────── TRACKER PROFILO ─────────────
function trackPlay(userId, title, artist = 'Sconosciuto') {
  try {
    const PROFILES_DB = path.resolve('profiles_db.json');
    let db = fs.existsSync(PROFILES_DB) ? JSON.parse(fs.readFileSync(PROFILES_DB, 'utf8')) : {};
    if (!db[userId]) db[userId] = { stars: 0, topSongs: [] };

    let cleanTitle = (title || 'Sconosciuto').trim();
    let cleanArtist = (artist || 'Sconosciuto').trim();

    if ((cleanArtist === 'Sconosciuto' || !cleanArtist) && cleanTitle.includes(' - ')) {
      const parts = cleanTitle.split(' - ');
      cleanArtist = parts[0].trim();
      cleanTitle = parts.slice(1).join(' - ').trim();
    }

    const existing = db[userId].topSongs.find(s => s.title === cleanTitle && s.artist === cleanArtist);
    if (existing) existing.count = (existing.count || 0) + 1;
    else db[userId].topSongs.push({ title: cleanTitle, artist: cleanArtist, count: 1 });

    if (typeof global.saveJsonAtomic === 'function') global.saveJsonAtomic(PROFILES_DB, db);
    else fs.writeFileSync(PROFILES_DB, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Errore tracking play:', e.message);
  }
}
// ───────────── FINE TRACKER ─────────────

const run = promisify(execFile);
const PLAYLIST_DB = path.resolve('playlist_db.json');
const MAX_UPLOAD = 10 * 1024 * 1024;
const YT_ID = /^[\w-]{11}$/;

const readDb = (p) => {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
};

const safeName = (t) => t.replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'zeno';

export const data = new SlashCommandBuilder()
  .setName('song')
  .setDescription('Cerca una canzone')
  .addStringOption((o) =>
    o.setName('query').setDescription('Titolo e artista').setRequired(true));

async function song(ctx, { text } = {}) {
  const isSlash = Boolean(ctx.isChatInputCommand?.());
  const query = (isSlash ? ctx.options.getString('query') : text || '').trim();

  if (!query) return ctx.reply('❌ Inserisci il titolo della canzone! (Esempio: `.song bistia 18K`)');

  if (isSlash) await ctx.deferReply();
  else ctx.channel.sendTyping().catch(() => {});
  const send = (payload) => (isSlash ? ctx.editReply(payload) : ctx.reply(payload));

  const { videos } = await yts(query);
  const vid = videos?.[0];
  if (!vid) return send(`❌ Nessun risultato trovato per: "${query}"`);

  const embed = new EmbedBuilder()
    .setTitle(vid.title)
    .setURL(vid.url)
    .setColor(0x5865f2)
    .setImage(vid.thumbnail || vid.image)
    .addFields(
      { name: '⏱️ Durata', value: vid.timestamp || 'N/D', inline: true },
      { name: '👁️ Visualizzazioni', value: (vid.views ?? 0).toLocaleString('it-IT'), inline: true },
      { name: '📺 Canale', value: vid.author?.name || 'N/D', inline: true },
    )
    .setFooter({ text: '⚡ Zeno Bot - Music Player' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`song:audio:${vid.videoId}`).setLabel('🎵 Audio').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`song:video:${vid.videoId}`).setLabel('🎬 Video MP4').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`song:pl:${vid.videoId}`).setLabel('➕ Aggiungi a .PL').setStyle(ButtonStyle.Success),
  );

  return send({ embeds: [embed], components: [row] });
}

song.command = /^(song|play)$/i;
song.help = ['song'];
song.tags = ['downloader'];
song.desc = 'Cerca una canzone e scaricala';

export default song;

async function download(id, kind) {
  const base = path.join(os.tmpdir(), `zeno_${id}_${Date.now()}`);
  const common = [
    '--no-playlist', '-q', '--no-warnings', '--no-progress',
    '--extractor-args', 'youtube:player-client=android,web',
    '-o', `${base}.%(ext)s`,
  ];
  const url = `https://www.youtube.com/watch?v=${id}`;
  const args = kind === 'audio'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '96K', ...common, url]
    : ['-f', 'best[ext=mp4][height<=480]/best[ext=mp4]/best', ...common, url];

  await run('yt-dlp', args, { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

  const found = fs.readdirSync(os.tmpdir()).find((f) => f.startsWith(path.basename(base)));
  return found ? path.join(os.tmpdir(), found) : null;
}

export const prefix = 'song';
export async function onComponent(i) {
  const [, action, id] = i.customId.split(':');
  if (!YT_ID.test(id || '')) {
    return i.reply({ content: '❌ Pulsante non valido.', flags: MessageFlags.Ephemeral });
  }

  const embed = i.message.embeds[0];
  const title = embed?.title || 'Brano';

  if (action === 'pl') {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const duration = embed?.fields?.find((f) => f.name.includes('Durata'))?.value || '';

    const db = readDb(PLAYLIST_DB);
    if (!db[i.user.id]) db[i.user.id] = [];

    if (db[i.user.id].some((t) => t.url === url)) {
      return i.reply({ content: '⚠️ Questo brano è già presente nella tua playlist (.PL)!', flags: MessageFlags.Ephemeral });
    }
    db[i.user.id].push({ url, title, duration });
    global.saveJsonAtomic(PLAYLIST_DB, db);

    return i.reply({ content: `✅ Aggiunto alla tua playlist (.PL)!\n📌 **${title}**`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'audio' || action === 'video') {
    await i.deferReply();
    let file = null;
    try {
      file = await download(id, action);
      if (!file) throw new Error('file non generato');
      console.log('[song] file pronto, invio a Discord...');

      if (fs.statSync(file).size > MAX_UPLOAD) {
        return i.editReply('❌ Il file supera il limite di upload di Discord (10 MB).');
      }

      if (action === 'audio') trackPlay(i.user.id, title);

      await i.editReply({
        content: `${action === 'audio' ? '🎵' : '🎬'} **${title}**`,
        files: [new AttachmentBuilder(file, { name: `${safeName(title)}${path.extname(file)}` })],
      });
    } catch (e) {
      console.error(`Errore download ${action}:`, e.stderr || e.message);
      await i.editReply('❌ Errore durante il download.').catch(() => {});
    } finally {
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}
