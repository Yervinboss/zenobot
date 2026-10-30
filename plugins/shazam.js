import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder, MessageFlags,
} from 'discord.js';

// --- IMPORTAZIONE SHAZAMIO-API ---
let yts, shazam;
try {
  const ytsModule = await import('yt-search');
  yts = ytsModule.default || ytsModule;

  const shazamModule = await import('shazamio-api');
  shazam = shazamModule.default;

  console.log("✅ Moduli Shazam (shazamio-api) e yt-search caricati correttamente");
} catch (e) {
  console.error("❌ ERRORE CRITICO DI IMPORTAZIONE in shazam.js:", e);
  throw e; 
}

const run = promisify(execFile);
const PLAYLIST_DB = path.resolve('playlist_db.json');
const MAX_UPLOAD = 10 * 1024 * 1024;
const YT_ID = /^[\w-]{11}$/;

global.shazamCache = global.shazamCache || new Map();

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (p) => { try { if (p && fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {} };
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';
const cid = (action, uid) => `shz:${action}:${uid}`;
const url = (id) => `https://www.youtube.com/watch?v=${id}`;

const readDb = () => {
  if (!fs.existsSync(PLAYLIST_DB)) return {};
  try { return JSON.parse(fs.readFileSync(PLAYLIST_DB, 'utf8')); } catch { return {}; }
};

async function findAttachment(ctx) {
  if (isInteraction(ctx)) return ctx.options.getAttachment('file');
  let att = ctx.attachments.first();
  if (!att && ctx.reference?.messageId) {
    const ref = await ctx.channel.messages.fetch(ctx.reference.messageId).catch(() => null);
    att = ref?.attachments.first();
  }
  return att;
}

async function downloadAudio(id) {
  const base = tmp(`zeno_shz_${id}_${Date.now()}`);
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

export const data = new SlashCommandBuilder()
  .setName('shazam')
  .setDescription('Riconosce una canzone da un audio o video')
  .addAttachmentOption((o) => o.setName('file').setDescription('Audio o video con la canzone').setRequired(true));

export async function execute(ctx) {
  const slash = isInteraction(ctx);
  const user = slash ? ctx.user : ctx.author;
  const say = (payload) => (slash ? ctx.editReply(payload) : ctx.reply(payload));

  const att = await findAttachment(ctx);
  if (!att) {
    return ctx.reply('🎧 **ZENO SHAZAM**\n\n❌ Rispondi a un audio o video con `.shazam`, oppure usa `/shazam` e allega il file!');
  }

  const type = att.contentType || '';
  if (!type.startsWith('audio') && !type.startsWith('video')) {
    return ctx.reply('❌ Devi allegare (o citare) un audio o un video.');
  }

  if (slash) await ctx.deferReply();
  else await ctx.react('🔎').catch(() => {});

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = type.startsWith('video') ? 'mp4' : path.extname(att.name || '.ogg') || '.ogg';
  const input = tmp(`zeno_shz_in_${id}${ext}`);
  const clip15 = tmp(`zeno_shz_clip_${id}.mp3`);

  try {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`download allegato: ${res.status}`);
    fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));

    const args = ['-y', '-i', input, '-t', '15', '-ar', '44100', '-ac', '1'];
    if (type.startsWith('video')) args.push('-vn');
    args.push(clip15);
    
    await run('ffmpeg', args, { timeout: 60 * 1000 });
    if (!fs.existsSync(clip15)) throw new Error('estrazione audio fallita');

    // --- RICONOSCIMENTO CON SHAZAMIO-API ---
    const result = await shazam.recognize(clip15);
    const track = result?.track;

    if (!track) {
      if (!slash) await ctx.react('❌').catch(() => {});
      return say('❌ Non sono riuscito a riconoscere questa canzone.');
    }

    const title = track.title || 'Sconosciuto';
    const artist = track.subtitle || 'Sconosciuto';
    const album = track.sections?.find((s) => s.metadata)?.metadata?.find((md) => md.title === 'Album')?.text;
    const coverArt = track.images?.coverart;

    const embed = new EmbedBuilder()
      .setTitle('🎧 ZENO SHAZAM')
      .setColor(0x5865f2)
      .addFields(
        { name: '🎵 Titolo', value: title },
        { name: '🎤 Artista', value: artist },
      );
    if (album) embed.addFields({ name: '💿 Album', value: album });
    if (coverArt) embed.setThumbnail(coverArt);

    let row = null;
    try {
      const search = await yts(`${artist} ${title}`);
      const v = search?.videos?.[0];
      if (v) {
        global.shazamCache.set(user.id, { title: `${artist} - ${title}`, url: v.url, duration: v.timestamp || '--:--' });
        row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(cid('play', user.id)).setLabel('🎧 Riproduci').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(cid('pl', user.id)).setLabel('➕ Aggiungi a .PL').setStyle(ButtonStyle.Success),
        );
      }
    } catch (e) {
      console.error('Errore ricerca YouTube per shazam:', e.message);
    }

    if (!slash) await ctx.react('🎵').catch(() => {});
    return say({ embeds: [embed], components: row ? [row] : [] });
  } catch (e) {
    console.error('Errore shazam:', e.message);
    if (!slash) await ctx.react('❌').catch(() => {});
    return say('❌ Errore durante il riconoscimento della canzone.');
  } finally {
    rm(input);
    rm(clip15);
  }
}

execute.command = /^shazam$/i;
execute.help = ['shazam'];
execute.tags = ['fun'];
execute.desc = 'Riconosce una canzone da un audio o video';
execute.data = data;

// ───────────── Pulsanti ─────────────
export const prefix = 'shz';
export async function onComponent(i) {
  const [, action, uid] = i.customId.split(':');
  if (i.user.id !== uid) {
    return i.reply({ content: '⛔ Questi pulsanti non sono tuoi: usa `/shazam` per fare il tuo riconoscimento.', flags: MessageFlags.Ephemeral });
  }

  const track = global.shazamCache.get(uid);
  if (!track?.url) {
    return i.reply({ content: '❌ Traccia non trovata o sessione scaduta. Fai di nuovo `/shazam`.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'pl') {
    const m = track.url.match(/[?&]v=([\w-]{11})/);
    if (!m || !YT_ID.test(m[1])) {
      return i.reply({ content: '❌ Link non valido.', flags: MessageFlags.Ephemeral });
    }
    const db = readDb();
    db[uid] = db[uid] || [];
    if (db[uid].some((t) => t.url === track.url)) {
      return i.reply({ content: '⚠️ Questo brano è già presente nella tua playlist (.PL)!', flags: MessageFlags.Ephemeral });
    }
    db[uid].push(track);
    global.saveJsonAtomic(PLAYLIST_DB, db);
    return i.reply({ content: `✅ Aggiunto alla tua playlist (.PL)!\n🎵 **${track.title}**`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'play') {
    await i.deferReply();
    const m = track.url.match(/[?&]v=([\w-]{11})/);
    if (!m) return i.editReply('❌ Link non valido.');
    let file = null;
    try {
      file = await downloadAudio(m[1]);
      if (fs.statSync(file).size > MAX_UPLOAD) {
        return await i.editReply('❌ Il file supera il limite di upload di Discord (10 MB).');
      }
      await i.editReply({
        content: `🎧 **${track.title}**`,
        files: [new AttachmentBuilder(file, { name: 'shazam.mp3' })],
      });
    } catch (e) {
      console.error('Errore download shazam:', e.stderr || e.message);
      await i.editReply('❌ Errore durante il download.').catch(() => {});
    } finally {
      rm(file);
    }
  }
}

execute.onComponent = onComponent;
export default execute;
