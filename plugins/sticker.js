import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';

const run = promisify(execFile);
const MAX_INPUT = 25 * 1024 * 1024; // file di partenza
const MAX_STICKER = 500 * 1024;     // limite Discord per gli sticker: 512 KB

// Ritaglio quadrato centrato + 320x320 (misura degli sticker di Discord)
const square = (size) =>
  `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos,crop=${size}:${size}`;

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (p) => { try { if (p && fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {} };
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// ───────────── Conversione ─────────────
async function convertStatic(input, out) {
  for (const size of [320, 256]) {
    await run('ffmpeg', [
      '-y', '-i', input, '-frames:v', '1',
      '-vf', square(size), '-compression_level', '9', out,
    ], { timeout: 60 * 1000 });
    if (fs.statSync(out).size <= MAX_STICKER) return;
  }
  throw new Error('immagine troppo pesante');
}

async function convertAnimated(input, out) {
  const attempts = [
    { fps: 12, colors: 64, t: 3 },
    { fps: 10, colors: 48, t: 3 },
    { fps: 8, colors: 32, t: 2.5 },
    { fps: 8, colors: 24, t: 2 },
  ];
  for (const a of attempts) {
    await run('ffmpeg', [
      '-y', '-t', String(a.t), '-i', input,
      '-vf', `fps=${a.fps},${square(320)},split[a][b];[a]palettegen=max_colors=${a.colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`,
      '-loop', '0', out,
    ], { timeout: 2 * 60 * 1000 });
    if (fs.statSync(out).size <= MAX_STICKER) return;
  }
  throw new Error('animazione troppo pesante');
}

// Allegato: nello stesso messaggio, oppure in quello a cui stai rispondendo
async function findAttachment(m) {
  let att = m.attachments.first();
  if (!att && m.reference?.messageId) {
    const ref = await m.channel.messages.fetch(m.reference.messageId).catch(() => null);
    att = ref?.attachments.first();
  }
  return att;
}

// ───────────── Comando: /sticker  oppure  .s ─────────────
export const data = new SlashCommandBuilder()
  .setName('sticker')
  .setDescription('Trasforma una foto, GIF o breve video in uno sticker quadrato')
  .addAttachmentOption((o) => o.setName('file').setDescription('Foto, GIF o video').setRequired(true))
  .addStringOption((o) => o.setName('nome').setDescription('Nome dello sticker (2-30 caratteri)'))
  .addBooleanOption((o) => o.setName('salva').setDescription('Aggiungilo agli sticker del server (default: sì)'));

async function sticker(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const user = slash ? ctx.user : ctx.author;
  const say = (payload) => (slash ? ctx.editReply(payload) : ctx.reply(payload));

  const att = slash ? ctx.options.getAttachment('file') : await findAttachment(ctx);
  if (!att) {
    return ctx.reply('❌ *Istruzioni:* invia una foto/GIF/video con la didascalia `.s`, rispondi a un messaggio con un allegato, oppure usa `/sticker`.');
  }

  const type = att.contentType || '';
  const animated = type.includes('gif') || type.startsWith('video');
  if (!animated && !type.startsWith('image')) {
    return ctx.reply('❌ Puoi convertire solo foto, GIF o brevi video!');
  }
  if (att.size > MAX_INPUT) return ctx.reply('❌ File troppo grande (max 25 MB).');

  if (slash) await ctx.deferReply();
  else await ctx.react('⏳').catch(() => {});

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const input = tmp(`zeno_st_in_${id}`);
  const ext = animated ? 'gif' : 'png';
  const out = tmp(`zeno_st_out_${id}.${ext}`);

  try {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`download allegato: ${res.status}`);
    fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));

    if (animated) await convertAnimated(input, out);
    else await convertStatic(input, out);

    // Nome dello sticker (2-30 caratteri)
    let name = (slash ? ctx.options.getString('nome') : text) || '';
    name = name.replace(/[^\w ]/g, '').trim().slice(0, 30);
    if (name.length < 2) name = `zeno_${Date.now().toString().slice(-5)}`;

    const save = slash ? (ctx.options.getBoolean('salva') ?? true) : true;
    let created = null;
    let reason = '';

    if (save && ctx.guild) {
      try {
        created = await ctx.guild.stickers.create({
          file: new AttachmentBuilder(out, { name: `sticker.${ext}` }),
          name,
          tags: 'zeno',
          description: 'Creato da Zeno Bot',
          reason: `Sticker creato da ${user.username}`,
        });
      } catch (e) {
        console.error('Errore creazione sticker:', e.message);
        if (e.code === 30039) reason = 'gli slot sticker del server sono pieni';
        else if (e.code === 50013 || e.code === 50001) reason = 'mi manca il permesso "Gestisci espressioni"';
        else reason = 'non sono riuscito a crearlo nel server';
      }
    }

    if (created) {
      await ctx.channel.send({ stickers: [created.id] });
      await say(`✅ Sticker **${created.name}** creato!`);
    } else {
      await say({
        content: reason ? `⚠️ Sticker non salvato nel server: ${reason}. Ecco il file quadrato:` : '✅ Ecco il tuo sticker!',
        files: [new AttachmentBuilder(out, { name: `zeno_sticker.${ext}` })],
      });
    }

    if (!slash) {
      ctx.reactions.resolve('⏳')?.users.remove(ctx.client.user.id).catch(() => {});
      await ctx.react('✅').catch(() => {});
    }
  } catch (e) {
    console.error('Errore sticker:', e.stderr || e.message);
    if (slash) await ctx.editReply('❌ Non sono riuscito a convertire il file.').catch(() => {});
    else {
      ctx.reactions.resolve('⏳')?.users.remove(ctx.client.user.id).catch(() => {});
      await ctx.react('❌').catch(() => {});
    }
  } finally {
    rm(input);
    rm(out);
  }
}

sticker.command = /^(s|sticker)$/i;
sticker.help = ['s'];
sticker.tags = ['media'];
sticker.desc = 'Trasforma foto, GIF o video in uno sticker';

export default sticker;
