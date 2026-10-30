import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import yts from 'yt-search';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
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
const PAGE_SIZE = 10;

global.plQueues = global.plQueues || {};
global.plMerging = global.plMerging || new Set();
global.plSetup = global.plSetup || new Map();

const PROFILES = path.resolve('playlist_profiles.json');
const THEMES = {
  viola:    { label: 'Viola Notte',  emoji: '💜', color: 0x9b59ff },
  rosa:     { label: 'Rosa-Viola',   emoji: '🌸', color: 0xd36bd6 },
  oceano:   { label: 'Blu Oceano',   emoji: '🌊', color: 0x3b82f6 },
  neon:     { label: 'Verde Neon',   emoji: '🍀', color: 0x22c55e },
  fuoco:    { label: 'Fuoco',        emoji: '🔥', color: 0xf97316 },
  sangue:   { label: 'Rosso Sangue', emoji: '🩸', color: 0xdc2626 },
  oro:      { label: 'Oro',          emoji: '✨', color: 0xfacc15 },
  ghiaccio: { label: 'Ghiaccio',     emoji: '❄️', color: 0x7dd3fc },
};

const readProfiles = () => {
  if (!fs.existsSync(PROFILES)) return {};
  try { return JSON.parse(fs.readFileSync(PROFILES, 'utf8')); } catch { return {}; }
};
const getProfile = (uid) => readProfiles()[uid] || null;
const saveProfile = (uid, profile) => {
  const all = readProfiles();
  all[uid] = profile;
  global.saveJsonAtomic(PROFILES, all);
};
const setupTheme = (uid) => {
  const id = global.plSetup.get(uid) || getProfile(uid)?.theme || 'viola';
  return THEMES[id] ? id : 'viola';
};

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (p) => { try { if (p && fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch {} };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const safeName = (t) => (t || '').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'zeno';
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';
const cid = (action, uid, extra) => `pl:${action}:${uid}${extra !== undefined ? `:${extra}` : ''}`;

const fmt = (s) => {
  s = Math.round(s || 0);
  if (!s) return '--:--';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const readDb = () => {
  if (!fs.existsSync(PLAYLIST_DB)) return {};
  try { return JSON.parse(fs.readFileSync(PLAYLIST_DB, 'utf8')); } catch { return {}; }
};
const saveDb = (data) => global.saveJsonAtomic(PLAYLIST_DB, data);

async function openStatus(ctx, text) {
  if (isInteraction(ctx)) {
    if (!ctx.deferred && !ctx.replied) await ctx.reply(text);
    else await ctx.editReply(text);
    return (payload) => ctx.editReply(payload);
  }
  const msg = await ctx.reply(text);
  return (payload) => msg.edit(payload);
}

function buildSetup(uid) {
  const cur = setupTheme(uid);
  const th = THEMES[cur];
  const prof = getProfile(uid);

  const embed = new EmbedBuilder()
    .setColor(th.color)
    .setTitle(prof ? '🎨 Personalizza la tua playlist' : '🎨 Crea la tua playlist')
    .setDescription(
      (prof
        ? `Nome attuale: **${prof.name}**\n\n`
        : 'Benvenuto! Prima di iniziare, dai un tocco personale alla tua playlist.\n\n')
      + `**1.** Scegli la decorazione dal menu\n**2.** Premi il pulsante per scegliere il nome\n\n`
      + `Decorazione scelta: ${th.emoji} **${th.label}**`,
    )
    .setFooter({ text: 'Zeno Bot • Music Playlist' });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pl:theme:${uid}`)
    .setPlaceholder('🎨 Scegli la decorazione')
    .addOptions(Object.entries(THEMES).map(([id, t]) => ({
      label: t.label, value: id, emoji: t.emoji, default: id === cur,
    })));

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pl:setup:${uid}`).setLabel('✏️ Scegli il nome').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pl:skip:${uid}`).setLabel(prof ? '✅ Tieni il nome' : '⏭️ Salta').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

const extractSpotifyTracksNoClient = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const html = await response.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (!titleMatch) return [];

    const title = titleMatch[1]
      .replace(' - Spotify', '')
      .replace(' | Spotify', '')
      .replace('• Spotify', '')
      .trim();

    if (url.includes('playlist') || url.includes('album')) {
      const trackMatches = html.match(/<span class="track-name">(.*?)<\/span>/g)
        || html.match(/"name":"(.*?)"/g);

      if (trackMatches?.length) {
        const seen = new Set();
        const tracks = trackMatches
          .map((t) => t.replace(/<[^>]*>/g, '').replace(/"name":"/g, '').replace(/"$/g, ''))
          .filter((name) => name && !seen.has(name) && seen.add(name))
          .map((name) => ({ title: name }));
        if (tracks.length) return tracks;
      }
    }
    return title ? [{ title }] : [];
  } catch (e) {
    console.error('Errore Spotify:', e.message);
    return [];
  }
};

async function fetchLinkTracks(link) {
  if (link.includes('spotify.com')) {
    const found = await extractSpotifyTracksNoClient(link);
    const out = [];
    for (const t of found.slice(0, 50)) {
      try {
        const { videos } = await yts(t.title);
        const v = videos?.[0];
        if (v) out.push({ title: v.title, url: v.url, duration: v.timestamp || '--:--' });
      } catch (e) {
        console.error('Errore ricerca YouTube:', e.message);
      }
    }
    return out;
  }

  const { stdout } = await run(
    'yt-dlp', ['--flat-playlist', '--dump-json', '--no-warnings', link],
    { maxBuffer: 20 * 1024 * 1024, timeout: 2 * 60 * 1000 },
  );

  return stdout.trim().split('\n').map((line) => {
    try {
      const info = JSON.parse(line);
      let url = info.url || (info.id ? `https://www.youtube.com/watch?v=${info.id}` : null);
      if (url && !url.startsWith('http')) url = `https://www.youtube.com/watch?v=${info.id}`;
      return url ? { title: info.title || 'Brano importato', url, duration: fmt(info.duration) } : null;
    } catch { return null; }
  }).filter(Boolean);
}

async function downloadAudio(url, quality = '128K') {
  const base = tmp(`zeno_pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await run('yt-dlp', [
    '--no-playlist', '-q', '--no-warnings', '--no-progress',
    '-x', '--audio-format', 'mp3', '--audio-quality', quality,
    '--postprocessor-args', 'ffmpeg:-ar 44100 -ac 2',
    '--extractor-args', 'youtube:player-client=android,web',
    '-o', `${base}.%(ext)s`, url,
  ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

  const file = `${base}.mp3`;
  if (!fs.existsSync(file)) throw new Error('file non generato');
  return file;
}

function buildPanel(uid, page = 0) {
  const tracks = readDb()[uid] || [];
  if (!tracks.length) {
    return {
      content: '❌ La tua playlist (.PL) è vuota! Aggiungi un brano o una playlist con `/pl add` oppure col pulsante ➕ di `/song`.',
      embeds: [],
      components: [],
    };
  }

  const pages = Math.ceil(tracks.length / PAGE_SIZE);
  page = Math.min(Math.max(page, 0), pages - 1);
  const start = page * PAGE_SIZE;
  const slice = tracks.slice(start, start + PAGE_SIZE);

  const prof = getProfile(uid);
  const th = THEMES[prof?.theme] || THEMES.viola;
  const embed = new EmbedBuilder()
    .setTitle(`${th.emoji} ${clip(prof?.name || 'LA TUA PLAYLIST', 60)} ${th.emoji}`)
    .setColor(th.color)
    .setDescription(slice.map((t, i) =>
      `**${start + i + 1}.** ${clip(t.title || 'Sconosciuto', 80)}${t.duration ? ` \`${t.duration}\`` : ''}`).join('\n'))
    .setFooter({ text: `Totale brani: ${tracks.length} • Pagina ${page + 1}/${pages} • Zeno Bot • Music Playlist` });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid('sel', uid))
    .setPlaceholder('🎧 Ascolta un brano singolarmente')
    .addOptions(slice.map((t, i) => ({
      label: clip(`${start + i + 1}. ${t.title || 'Sconosciuto'}`, 100),
      value: String(start + i),
      description: 'Ascolta singolarmente questo brano',
    })));

  const rows = [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(cid('all', uid)).setLabel('▶️ Avvia Coda').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(cid('stop', uid)).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cid('merge', uid)).setLabel('🎛️ Fondi Playlist').setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (pages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(cid('page', uid, page - 1)).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(cid('page', uid, page + 1)).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
    ));
  }

  return { content: '', embeds: [embed], components: rows };
}

async function addLink(ctx, uid, link) {
  if (!/^https?:\/\//i.test(link || '')) {
    return ctx.reply('❌ Inserisci un link valido dopo `add` (Esempio: `.pl add [link]`).');
  }

  const status = await openStatus(ctx, link.includes('spotify.com')
    ? '⏳ Analisi link Spotify in corso...'
    : '⏳ Lettura del link in corso...');

  let found;
  try {
    found = await fetchLinkTracks(link);
  } catch (e) {
    console.error('Errore lettura link:', e.stderr || e.message);
    return status('❌ Errore durante la lettura del link. Assicurati che sia un link valido.');
  }
  if (!found.length) return status('❌ Nessun brano trovato in questo link.');

  const db = readDb();
  db[uid] = db[uid] || [];
  let added = 0;
  for (const t of found) {
    if (!db[uid].some((x) => x.url === t.url)) { db[uid].push(t); added++; }
  }
  if (!added) return status('⚠️ Questi brani sono già presenti nella tua playlist!');

  saveDb(db);
  return status(`✅ Aggiunti **${added}** brani alla tua playlist!\nUsa \`/pl lista\` per vederla o \`/pl all\` per avviare l'ascolto.`);
}

async function delTrack(ctx, uid, arg) {
  const idx = parseInt(arg, 10) - 1;
  const db = readDb();
  const tracks = db[uid] || [];
  if (Number.isNaN(idx) || idx < 0 || idx >= tracks.length) {
    return ctx.reply('❌ Specifica un numero di traccia valido da eliminare (Esempio: `.pl del 2`).');
  }
  const [removed] = tracks.splice(idx, 1);
  db[uid] = tracks;
  saveDb(db);
  return ctx.reply(`🗑️ Brano rimosso con successo:\n**${removed.title || 'Sconosciuto'}**`);
}

async function playOne(i, index) {
  const track = (readDb()[i.user.id] || [])[index];
  if (!track?.url) return i.reply({ content: '❌ Brano non trovato.', flags: MessageFlags.Ephemeral });

  await i.deferReply();
  let file = null;
  try {
    file = await downloadAudio(track.url);
    if (fs.statSync(file).size > MAX_UPLOAD) {
      return i.editReply('❌ Il file supera il limite di upload di Discord (10 MB).');
    }
    trackPlay(i.user.id, track.title || 'Brano');
    await i.editReply({
      content: `🎧 **${track.title || 'Brano'}**`,
      files: [new AttachmentBuilder(file, { name: `${safeName(track.title)}.mp3` })],
    });
  } catch (e) {
    console.error('Errore download brano:', e.stderr || e.message);
    await i.editReply('❌ Errore download.').catch(() => {});
  } finally {
    rm(file);
  }
}

async function processQueue(uid) {
  const q = global.plQueues[uid];
  if (!q) return;
  let n = 0;

  while (global.plQueues[uid] === q && q.tracks.length) {
    const track = q.tracks.shift();
    n++;
    let file = null;
    try {
      file = await downloadAudio(track.url);
      if (global.plQueues[uid] !== q) break;

      if (fs.statSync(file).size > MAX_UPLOAD) {
        await q.channel.send(`⚠️ Saltato (supera i 10 MB): **${track.title}**`);
        continue;
      }
      trackPlay(uid, track.title || 'Brano');
      await q.channel.send({
        content: `🎧 **${n}/${q.total}** • ${track.title || 'Brano'}`,
        files: [new AttachmentBuilder(file, { name: `${safeName(track.title)}.mp3` })],
      });
    } catch (e) {
      console.error(`Errore coda (${track.title}):`, e.stderr || e.message);
    } finally {
      rm(file);
    }
  }

  if (global.plQueues[uid] === q) {
    delete global.plQueues[uid];
    await q.channel.send('✅ Playlist completata!').catch(() => {});
  }
}

async function startQueue(ctx, uid) {
  const tracks = readDb()[uid] || [];
  if (!tracks.length) return ctx.reply('❌ La tua playlist è vuota.');
  if (global.plQueues[uid]) return ctx.reply('⚠️ Coda già attiva! Usa `/pl stop` per fermarla.');

  const channel = ctx.channel ?? await ctx.client.channels.fetch(ctx.channelId);
  global.plQueues[uid] = { tracks: [...tracks], total: tracks.length, channel };
  await ctx.reply(`▶️ Avvio riproduzione continua di ${tracks.length} brani!`);
  processQueue(uid);
}

async function stopQueue(ctx, uid) {
  if (global.plQueues[uid]) {
    delete global.plQueues[uid];
    return ctx.reply('⏹️ Riproduzione della playlist interrotta.');
  }
  return ctx.reply('⚠️ Nessuna riproduzione in corso al momento.');
}

async function mergePlaylist(ctx, uid, tracks) {
  if (global.plMerging.has(uid)) return ctx.reply('⚠️ Hai già una fusione in corso, attendi che finisca.');
  global.plMerging.add(uid);

  const status = await openStatus(ctx, `🎛️ **Fusione playlist avviata**\n\n📊 Brano 0/${tracks.length}...`);
  const channel = ctx.channel;
  const work = fs.mkdtempSync(tmp('zeno_merge_'));
  const out = tmp(`zeno_playlist_${Date.now()}.m4a`);
  const files = [], titles = [], durs = [];

  try {
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const label = clip(t.title || 'Sconosciuto', 50);
      try {
        const src = await downloadAudio(t.url);
        const dest = path.join(work, `track_${String(i).padStart(3, '0')}.mp3`);
        fs.copyFileSync(src, dest);
        rm(src);

        let dur = 0;
        try {
          const { stdout } = await run('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', dest,
          ]);
          dur = parseFloat(stdout.trim()) || 0;
        } catch {}

        trackPlay(uid, t.title || `Brano ${i + 1}`);
        files.push(dest);
        titles.push(t.title || `Brano ${i + 1}`);
        durs.push(dur);
        await status(`🎛️ **Fusione playlist in corso...**\n\n📊 Brano ${i + 1}/${tracks.length} ✅\n🎵 _${label}_`).catch(() => {});
      } catch (e) {
        console.error(`Errore brano ${i + 1}:`, e.stderr || e.message);
        await status(`🎛️ **Fusione in corso...**\n\n📊 Brano ${i + 1}/${tracks.length} ⚠️ saltato\n🎵 _${label}_`).catch(() => {});
      }
    }

    if (!files.length) {
      return await status('❌ Nessun brano è stato scaricato con successo. Riprova più tardi.');
    }

    const totalSec = durs.reduce((a, b) => a + b, 0) || 1;
    const kbps = Math.min(96, Math.floor((MAX_UPLOAD * 0.93 * 8) / 1000 / totalSec));
    if (kbps < 32) {
      return await status(`❌ La playlist è troppo lunga (${fmt(totalSec)}) per stare nel limite di 10 MB. Elimina qualche brano e riprova.`);
    }

    const listFile = path.join(work, 'list.txt');
    const metaFile = path.join(work, 'meta.txt');
    fs.writeFileSync(listFile, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

    let cur = 0;
    let meta = ';FFMETADATA1\ntitle=Playlist Zeno Bot\nartist=Zeno Bot\n\n';
    for (let i = 0; i < files.length; i++) {
      const s = Math.floor(cur * 1000);
      const e = Math.floor((cur + durs[i]) * 1000);
      meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${s}\nEND=${e}\ntitle=${titles[i].replace(/[\n=;#\\]/g, ' ')}\n\n`;
      cur += durs[i];
    }
    fs.writeFileSync(metaFile, meta, 'utf8');

    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', metaFile,
      '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1',
      '-c:a', 'aac', '-b:a', `${kbps}k`, '-ar', '44100', '-ac', kbps < 64 ? '1' : '2',
      '-movflags', '+faststart', out,
    ], { timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

    if (!fs.existsSync(out)) throw new Error('file finale non generato');
    const size = fs.statSync(out).size;
    if (size > MAX_UPLOAD) {
      return await status(`❌ Il file finale (${(size / 1048576).toFixed(1)} MB) supera il limite di 10 MB. Elimina qualche brano e riprova.`);
    }

    const payload = {
      content: `✅ **Playlist fusa con successo!**\n\n🎵 **${files.length}** brani con capitoli\n📦 Dimensione: **${(size / 1048576).toFixed(2)} MB**\n\n💾 Salva il file e aprilo con VLC / Musicolet per vedere le tracce separate!`,
      files: [new AttachmentBuilder(out, { name: `Playlist_Zeno_${new Date().toISOString().slice(0, 10)}.m4a` })],
    };
    await status(payload).catch(() => channel?.send(payload));
  } catch (e) {
    console.error('Errore fusione:', e.stderr || e.message);
    await status('❌ Errore durante la fusione dei brani.').catch(() => channel?.send('❌ Errore durante la fusione dei brani.').catch(() => {}));
  } finally {
    global.plMerging.delete(uid);
    rm(work);
    rm(out);
  }
}

export const data = new SlashCommandBuilder()
  .setName('pl')
  .setDescription('La tua playlist personale')
  .addSubcommand((s) => s.setName('lista').setDescription('Apri la tua playlist'))
  .addSubcommand((s) => s.setName('add').setDescription('Aggiungi un brano o una playlist da un link')
    .addStringOption((o) => o.setName('link').setDescription('Link YouTube o Spotify').setRequired(true)))
  .addSubcommand((s) => s.setName('del').setDescription('Elimina un brano dalla playlist')
    .addIntegerOption((o) => o.setName('numero').setDescription('Numero del brano').setMinValue(1).setRequired(true)))
  .addSubcommand((s) => s.setName('all').setDescription('Avvia la coda continua di tutti i brani'))
  .addSubcommand((s) => s.setName('stop').setDescription('Ferma la coda continua'))
  .addSubcommand((s) => s.setName('merge').setDescription('Fondi tutti i brani in un unico file con capitoli'))
  .addSubcommand((s) => s.setName('personalizza').setDescription('Cambia nome e decorazione della tua playlist'));

async function pl(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const uid = slash ? ctx.user.id : ctx.author.id;

  let sub, arg;
  if (slash) {
    sub = ctx.options.getSubcommand();
    arg = ctx.options.getString('link') ?? String(ctx.options.getInteger('numero') ?? '');
  } else {
    const [first, ...rest] = text.trim().split(/\s+/);
    sub = (first || 'lista').toLowerCase();
    arg = rest.join(' ');
  }

  switch (sub) {
    case 'add': return addLink(ctx, uid, arg);
    case 'del': return delTrack(ctx, uid, arg);
    case 'all': return startQueue(ctx, uid);
    case 'stop': return stopQueue(ctx, uid);
    case 'merge':
    case 'fusion': {
      const tracks = readDb()[uid] || [];
      if (!tracks.length) return ctx.reply('❌ La tua playlist è vuota. Aggiungi brani con `/pl add`.');
      return mergePlaylist(ctx, uid, tracks);
    }
    case 'personalizza': return ctx.reply(buildSetup(uid));
    default:
      if (!getProfile(uid)) return ctx.reply(buildSetup(uid));
      return ctx.reply(buildPanel(uid, 0));
  }
}

pl.command = /^pl$/i;
pl.help = ['pl'];
pl.tags = ['downloader'];
pl.desc = 'Gestisci la tua playlist personale';

export default pl;

export const prefix = 'pl';
export async function onComponent(i) {
  const [, action, uid, extra] = i.customId.split(':');

  if (i.user.id !== uid) {
    return i.reply({ content: '⛔ Questo pannello non è tuo: usa `/pl` per aprire la tua playlist.', flags: MessageFlags.Ephemeral });
  }

  switch (action) {
    case 'theme': {
      global.plSetup.set(uid, i.values[0]);
      return i.update(buildSetup(uid));
    }
    case 'setup': {
      const modal = new ModalBuilder()
        .setCustomId(`pl:modal:${uid}`)
        .setTitle('Nome della tua playlist')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Come vuoi chiamarla?')
            .setPlaceholder('Es. Vibes di notte')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true),
        ));
      return i.showModal(modal);
    }
    case 'skip': {
      saveProfile(uid, { name: getProfile(uid)?.name || 'La mia playlist', theme: setupTheme(uid) });
      global.plSetup.delete(uid);
      return i.update(buildPanel(uid, 0));
    }
    case 'modal': {
      const name = i.fields.getTextInputValue('name').trim().slice(0, 32) || 'La mia playlist';
      saveProfile(uid, { name, theme: setupTheme(uid) });
      global.plSetup.delete(uid);
      const panel = buildPanel(uid, 0);
      return i.isFromMessage() ? i.update(panel) : i.reply(panel);
    }
    case 'page': return i.update(buildPanel(uid, parseInt(extra, 10) || 0));
    case 'sel': return playOne(i, parseInt(i.values[0], 10));
    case 'all': return startQueue(i, uid);
    case 'stop': return stopQueue(i, uid);
    case 'merge': {
      const tracks = readDb()[uid] || [];
      if (!tracks.length) return i.reply({ content: '❌ La tua playlist è vuota.', flags: MessageFlags.Ephemeral });
      return mergePlaylist(i, uid, tracks);
    }
  }
}
