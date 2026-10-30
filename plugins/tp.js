import yts from 'yt-search';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder, MessageFlags,
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
const MAX_VIDEO_SEC = 480;
const YT_ID = /^[\w-]{11}$/;
const COLOR = 0x5865f2;

global.tpCache = global.tpCache || new Map();

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (p) => { try { if (p && fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {} };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const safeName = (t) => (t || '').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'zeno';
const thumb = (v) => v?.thumbnail || v?.image || null;
const views = (v) => (v?.views ?? 0).toLocaleString('it-IT');
const cid = (action, uid, arg) => `tp:${action}:${uid}:${arg}`;
const url = (id) => `https://www.youtube.com/watch?v=${id}`;

const norm = (s) => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const BAD = /\b(mix|compilation|karaoke|reaction|cover|remix|slowed|sped up|nightcore|1 hour|playlist|best of|greatest hits|full album|live|tutorial|instrumental)\b/;

const readDb = () => {
  if (!fs.existsSync(PLAYLIST_DB)) return {};
  try { return JSON.parse(fs.readFileSync(PLAYLIST_DB, 'utf8')); } catch { return {}; }
};

async function probe(file) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch { return 0; }
}

async function topSongs(artist) {
  const queries = [`${artist} official audio`, `${artist} official video`, artist];
  const results = await Promise.all(
    queries.map((q) => yts(q).then((r) => r.videos || []).catch(() => [])),
  );

  const seen = new Set();
  const all = results.flat().filter((v) => v?.videoId && !seen.has(v.videoId) && seen.add(v.videoId));

  const na = norm(artist);
  const usable = all.filter((v) => v.seconds >= 60 && v.seconds <= 600 && !BAD.test(norm(v.title)));
  const strict = usable.filter((v) => norm(v.title).includes(na) || norm(v.author?.name).includes(na));
  const pool = (strict.length ? strict : usable).sort((a, b) => (b.views || 0) - (a.views || 0));

  const keyOf = (v) => norm(v.title.replace(/[(\[].*?[)\]]/g, ''))
    .replace(na, '')
    .replace(/\b(official|audio|video|lyrics?|hd|4k|ft|feat|prod)\b.*$/, '')
    .trim() || v.videoId;

  const keys = new Set();
  const top = [];
  for (const v of pool) {
    const k = keyOf(v);
    if (keys.has(k)) continue;
    keys.add(k);
    top.push(v);
    if (top.length === 5) break;
  }
  return top;
}

async function getVideo(uid, id) {
  const hit = global.tpCache.get(uid)?.videos.find((v) => v.videoId === id);
  if (hit) return hit;
  try { return await yts({ videoId: id }); } catch { return null; }
}

async function downloadAudio(id) {
  const base = tmp(`zeno_tp_${id}_${Date.now()}`);
  await run('yt-dlp', [
    '--no-playlist', '-q', '--no-warnings', '--no-progress',
    '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
    '--extractor-args', 'youtube:player-client=android,web',
    '-o', `${base}.%(ext)s`, url(id),
  ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
  const file = `${base}.mp3`;
  if (!fs.existsSync(file)) throw new Error('file non generato');
  return file;
}

async function downloadVideo(id, raw) {
  await run('yt-dlp', [
    '--no-playlist', '-q', '--no-warnings', '--no-progress',
    '-f', 'bestvideo[vcodec^=avc1][height<=480]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][height<=480]/best[height<=480]/best',
    '--merge-output-format', 'mp4', '--no-part', '--retries', '3',
    '--extractor-args', 'youtube:player-client=android,web',
    '-o', raw, url(id),
  ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
  if (!fs.existsSync(raw)) throw new Error('file non generato');
}

function buildCard(uid, index) {
  const entry = global.tpCache.get(uid);
  if (!entry?.videos?.length) return null;

  const { videos, artist } = entry;
  const n = videos.length;
  const idx = ((index % n) + n) % n;
  const v = videos[idx];

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(clip(`${idx + 1}. ${v.title}`, 250))
    .setURL(v.url || url(v.videoId))
    .setDescription(`📺 **Canale:** ${v.author?.name || 'Sconosciuto'}\n⏱️ **Durata:** ${v.timestamp || '—'}\n👁️ **Ascolti:** ${views(v)}`)
    .setFooter({ text: '⚡ Zeno Bot • Top Player' });
  if (thumb(v)) embed.setImage(thumb(v));

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(cid('nav', uid, idx - 1)).setLabel('◀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tp:count').setLabel(`${idx + 1} / ${n}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(cid('nav', uid, idx + 1)).setLabel('▶️').setStyle(ButtonStyle.Secondary),
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(cid('audio', uid, v.videoId)).setLabel('🎧 Audio').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(cid('video', uid, v.videoId)).setLabel('🎥 Video').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(cid('pl', uid, v.videoId)).setLabel('🎵 Aggiungi a .PL').setStyle(ButtonStyle.Success),
  );

  return {
    content: `🏆 **Top ${n} di ${clip(artist, 60)}**\n_Scorri con le frecce e scegli la canzone:_`,
    embeds: [embed],
    components: [nav, actions],
  };
}

async function sendAudio(i, uid, id) {
  await i.deferReply();
  const v = await getVideo(uid, id);
  const title = v?.title || 'Brano';
  let file = null;
  try {
    file = await downloadAudio(id);
    if (fs.statSync(file).size > MAX_UPLOAD) {
      return await i.editReply('❌ Il file supera il limite di upload di Discord (10 MB).');
    }
    trackPlay(uid, title, v?.author?.name);
    await i.editReply({
      content: `🎧 **${title}**`,
      files: [new AttachmentBuilder(file, { name: `${safeName(title)}.mp3` })],
    });
  } catch (e) {
    console.error('Errore audio:', e.stderr || e.message);
    await i.editReply('❌ Errore audio').catch(() => {});
  } finally {
    rm(file);
  }
}

async function sendVideo(i, uid, id) {
  await i.deferReply();
  const v = await getVideo(uid, id);
  if (v?.seconds > MAX_VIDEO_SEC) return i.editReply('❌ Max 8 minuti');

  await i.editReply('🎬 Scarico il video...');
  const base = tmp(`zeno_tpv_${id}_${Date.now()}`);
  const raw = `${base}_raw.mp4`;
  const out = `${base}_out.mp4`;

  try {
    await downloadVideo(id, raw);
    let file = raw;

    if (fs.statSync(raw).size > MAX_UPLOAD) {
      const dur = (await probe(raw)) || v?.seconds || 240;
      const videoKbps = Math.floor((MAX_UPLOAD * 0.9 * 8) / dur / 1000) - 64;
      if (videoKbps < 120) {
        return await i.editReply('❌ Video troppo pesante per il limite di Discord (10 MB).');
      }
      await i.editReply('🎬 Comprimo il video per Discord...');
      await run('ffmpeg', [
        '-y', '-i', raw,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
        '-vf', 'scale=-2:360',
        '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out,
      ], { timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
      file = out;
      if (fs.statSync(out).size > MAX_UPLOAD) {
        return await i.editReply('❌ Video troppo pesante per il limite di Discord (10 MB).');
      }
    }

    const title = v?.title || 'Video';
    await i.editReply({
      content: `🎬 **${title}**`,
      files: [new AttachmentBuilder(file, { name: `${safeName(title)}.mp4` })],
    });
  } catch (e) {
    console.error('Errore video:', e.stderr || e.message);
    await i.editReply('❌ Errore video').catch(() => {});
  } finally {
    rm(raw);
    rm(out);
  }
}

async function addToPlaylist(i, uid, id) {
  const v = await getVideo(uid, id);
  const link = url(id);
  const db = readDb();
  db[uid] = db[uid] || [];

  if (db[uid].some((t) => t.url === link)) {
    return i.reply({ content: '⚠️ Questo brano è già presente nella tua playlist (.PL)!', flags: MessageFlags.Ephemeral });
  }
  db[uid].push({ url: link, title: v?.title || 'Brano', duration: v?.timestamp || '--:--' });
  global.saveJsonAtomic(PLAYLIST_DB, db);

  return i.reply({ content: `✅ Aggiunto alla tua playlist (.PL)!\n📌 **${v?.title || 'Brano'}**`, flags: MessageFlags.Ephemeral });
}

export const data = new SlashCommandBuilder()
  .setName('tp')
  .setDescription('Le 5 canzoni più ascoltate di un cantante')
  .addStringOption((o) => o.setName('cantante').setDescription('Nome del cantante o del gruppo').setRequired(true));

async function tp(ctx, { text = '' } = {}) {
  const slash = typeof ctx.isChatInputCommand === 'function';
  const artist = (slash ? ctx.options.getString('cantante') : text).trim();
  if (!artist) return ctx.reply('🎧 Scrivi il nome del cantante! (Esempio: `.tp 18K`)');

  const uid = slash ? ctx.user.id : ctx.author.id;
  if (slash) await ctx.deferReply();
  else ctx.channel.sendTyping().catch(() => {});
  const send = (payload) => (slash ? ctx.editReply(payload) : ctx.reply(payload));

  let videos;
  try {
    videos = await topSongs(artist);
  } catch (e) {
    console.error('Errore ricerca top:', e.message);
    return send('❌ Errore durante la ricerca, riprova tra poco.');
  }
  if (!videos.length) return send(`❌ Nessun risultato per "${clip(artist, 60)}".`);

  const now = Date.now();
  for (const [k, val] of global.tpCache) if (now - val.ts > 3600_000) global.tpCache.delete(k);
  global.tpCache.set(uid, { ts: now, artist, videos });

  return send(buildCard(uid, 0));
}

tp.command = /^tp$/i;
tp.help = ['tp'];
tp.tags = ['fun'];
tp.desc = 'Le 5 canzoni più ascoltate di un cantante';

export default tp;

export const prefix = 'tp';
export async function onComponent(i) {
  const [, action, uid, arg] = i.customId.split(':');

  if (i.user.id !== uid) {
    return i.reply({ content: '⛔ Questi pulsanti non sono tuoi: usa `/tp` per fare la tua ricerca.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'nav') {
    const card = buildCard(uid, parseInt(arg, 10) || 0);
    if (!card) return i.reply({ content: '⌛ Ricerca scaduta, rifai `/tp`.', flags: MessageFlags.Ephemeral });
    return i.update(card);
  }

  if (!YT_ID.test(arg || '')) {
    return i.reply({ content: '⌛ Pulsante scaduto, rifai `/tp`.', flags: MessageFlags.Ephemeral });
  }

  switch (action) {
    case 'audio': return sendAudio(i, uid, arg);
    case 'video': return sendVideo(i, uid, arg);
    case 'pl': return addToPlaylist(i, uid, arg);
    default: return i.reply({ content: '⌛ Pulsante scaduto, rifai `/tp`.', flags: MessageFlags.Ephemeral });
  }
}
