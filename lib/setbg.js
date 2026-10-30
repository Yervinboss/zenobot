import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { hasCanvas, hasBg, bgPath, saveBg, removeBg } from './spcard.js';
import { hasAnim, animPath, saveAnim, removeAnim, hasFfmpeg } from './spanim.js';

const isAnimated = (type = '', url = '') =>
  /^video\//i.test(type) || /gif/i.test(type) || /\.(gif|mp4|webm|mov|mkv)(\?|$)/i.test(url);

export async function handleSetBg(ctx, text, { keyPrefix, cmd }) {
  const isSlash = typeof ctx.isChatInputCommand === 'function';
  const userId = isSlash ? ctx.user.id : ctx.author.id;
  const key = `${keyPrefix}${userId}`;
  const send = (p) => (isSlash && (ctx.deferred || ctx.replied) ? ctx.editReply(p) : ctx.reply(p));

  let url = null;
  let type = '';
  let reset = false;

  if (isSlash) {
    reset = Boolean(ctx.options.getBoolean('reset'));
    const a = ctx.options.getAttachment('immagine');
    if (a) { url = a.url; type = a.contentType || ''; }
  } else {
    reset = /\breset\b/i.test(text);
    let att = ctx.attachments?.first();
    if (!att && ctx.reference?.messageId) {
      const ref = await ctx.channel.messages.fetch(ctx.reference.messageId).catch(() => null);
      att = ref?.attachments.first();
    }
    if (att) { url = att.url; type = att.contentType || ''; }
    else {
      const m = text.match(/https?:\/\/\S+/);
      if (m) url = m[0];
    }
  }

  if (url && type && !/^(image|video)\//i.test(type)) {
    return send('❌ Il file deve essere un\'immagine, una GIF o un video.');
  }

  if (reset) {
    const a = removeBg(key);
    const b = removeAnim(key);
    return send(a || b
      ? '🗑️ Sfondo rimosso: la card userà lo sfondo automatico.'
      : 'ℹ️ Non avevi nessuno sfondo personalizzato.');
  }

  if (!url) {
    const stato = hasAnim(key) ? '🎞️ sfondo animato attivo'
      : hasBg(key) ? '✅ sfondo personalizzato attivo' : '▫️ sfondo automatico';
    return send(
      `🎨 **Personalizza la tua card**\n`
      + `• Allega un'immagine, una **GIF** o un **video** a \`.${cmd}\` (o usa \`/${cmd}\`)\n`
      + `• Oppure rispondi a un messaggio con l'immagine scrivendo \`.${cmd}\`\n`
      + `• \`.${cmd} reset\` per tornare allo sfondo automatico\n`
      + `\nStato attuale: ${stato}`,
    );
  }

  const animated = isAnimated(type, url);

  if (animated && !(await hasFfmpeg())) {
    return send('❌ Per gli sfondi animati serve ffmpeg sul bot (Termux: `pkg install ffmpeg`, Arch: `sudo pacman -S ffmpeg`).');
  }
  if (!animated && !hasCanvas) {
    return send('❌ Manca il modulo grafico: sul bot esegui `npm i @napi-rs/canvas` e riavvia.');
  }

  if (isSlash) await ctx.deferReply();

  try {
    if (animated) { await saveAnim(key, url); removeBg(key); }
    else { await saveBg(key, url); removeAnim(key); }
  } catch (e) {
    const msg = {
      TOO_BIG: '❌ File troppo pesante (immagini max 10 MB, video/GIF max 25 MB).',
      BAD_IMAGE: '❌ Non riesco a leggere questa immagine, prova un PNG o JPG.',
      DOWNLOAD: '❌ Non riesco a scaricare il file.',
      FFMPEG: '❌ Non riesco a convertire il video, prova con un altro file.',
    }[e.message] || '❌ Errore nel salvataggio dello sfondo.';
    return send(msg);
  }

  if (animated) {
    return send({
      content: '✅ **Sfondo animato impostato!** Ecco l\'anteprima del loop:',
      files: [new AttachmentBuilder(animPath(key), { name: 'sfondo.mp4' })],
    });
  }
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle('✅ Sfondo impostato')
    .setDescription('Ecco la tua nuova base!')
    .setImage('attachment://sfondo.jpg');
  return send({ embeds: [embed], files: [new AttachmentBuilder(bgPath(key), { name: 'sfondo.jpg' })] });
}
