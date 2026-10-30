import fs from 'fs';
import path from 'path';
import axios from 'axios';
import yts from 'yt-search';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import {
  COLORS, box, say, fail, isSlash, rnd, store,
} from '../lib/ui.js';

const GENRES = ['rap italiano', 'trap', 'pop italiano', 'indie italiano', 'rock', 'r&b', 'lofi', 'elettronica', 'reggaeton', 'drill'];
const ARTISTS = ['Sfera Ebbasta', 'Lazza', 'Marracash', 'Salmo', 'Geolier', 'Tedua', 'Anna', 'Ultimo', 'Måneskin', 'Mahmood', 'Blanco', 'Fedez', 'Articolo 31', 'Vasco Rossi', '18K'];
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

const quizDb = store('quiz.json');
const active = global.zenoQuizActive || (global.zenoQuizActive = new Set());

export const datas = [
  new SlashCommandBuilder().setName('consiglia').setDescription('Ti consiglio una canzone')
    .addStringOption((o) => o.setName('genere').setDescription('Genere o mood (es. trap, lofi, estate)')),
  new SlashCommandBuilder().setName('classifica').setDescription('Top ascoltatori, canzoni e campioni del quiz'),
  new SlashCommandBuilder().setName('quiz').setDescription('Indovina la canzone dal testo')
    .addStringOption((o) => o.setName('artista').setDescription('Artista (default: a caso)')),
];

// ── CONSIGLIA ── stesso formato di .song, così i bottoni di song.js funzionano
async function buildPick(genre) {
  const g = genre || rnd(GENRES);
  const { videos } = await yts(`${g} canzoni popolari`);
  const ok = (videos || [])
    .filter((v) => v.seconds >= 100 && v.seconds <= 420 && !/\b(mix|compilation|playlist|hits|hour|hours|ore)\b/i.test(v.title))
    .slice(0, 15);
  const vid = rnd(ok.length ? ok : (videos || []));
  if (!vid) return null;
  const embed = new EmbedBuilder()
    .setColor(COLORS.pink)
    .setAuthor({ name: `🎲 Consiglio per te • ${g}` })
    .setTitle(vid.title)
    .setURL(vid.url)
    .setImage(vid.thumbnail || vid.image)
    .addFields(
      { name: '⏱️ Durata', value: vid.timestamp || 'N/D', inline: true },
      { name: '👁️ Visualizzazioni', value: (vid.views ?? 0).toLocaleString('it-IT'), inline: true },
      { name: '📺 Canale', value: vid.author?.name || 'N/D', inline: true },
    )
    .setFooter({ text: '⚡ ZENO BOT • consiglia' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`song:audio:${vid.videoId}`).setLabel('🎵 Audio').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`song:video:${vid.videoId}`).setLabel('🎬 Video MP4').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`song:pl:${vid.videoId}`).setLabel('➕ Aggiungi a .PL').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mus:again:${encodeURIComponent(genre || '').slice(0, 60)}`).setLabel('Un\'altra').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

async function consiglia(ctx, text) {
  const genre = (isSlash(ctx) ? ctx.options.getString('genere') : text.trim()) || '';
  if (isSlash(ctx)) await ctx.deferReply(); else ctx.channel.sendTyping().catch(() => {});
  const p = await buildPick(genre);
  if (!p) return fail(ctx, 'Non ho trovato nulla, riprova!');
  return say(ctx, p);
}

// ── CLASSIFICA ──
async function classifica(ctx) {
  if (!ctx.guild) return fail(ctx, 'Funziona solo nei server.');
  let db = {};
  try { db = JSON.parse(fs.readFileSync(path.resolve('profiles_db.json'), 'utf8')); } catch (e) { /* vuoto */ }
  const members = await ctx.guild.members.fetch().catch(() => null);
  const inGuild = (id) => !members || members.has(id);

  const users = Object.entries(db).filter(([id]) => inGuild(id))
    .map(([id, p]) => ({ id, plays: (p.topSongs || []).reduce((s, t) => s + (t.count || 0), 0), stars: p.stars || 0 }))
    .filter((u) => u.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5);

  const songs = new Map();
  for (const [id, p] of Object.entries(db)) {
    if (!inGuild(id)) continue;
    for (const t of p.topSongs || []) {
      const k = `${t.title} — ${t.artist}`;
      songs.set(k, (songs.get(k) || 0) + (t.count || 0));
    }
  }
  const topSongs = [...songs].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const wins = Object.entries(quizDb.read()[ctx.guild.id] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!users.length && !wins.length) return say(ctx, { embeds: [box(COLORS.info, '🏆 Classifica', 'Ancora nessun dato: ascolta qualcosa con `.song` o gioca a `.quiz`!')] });

  const e = box(COLORS.gold, `🏆 Classifica di ${ctx.guild.name}`);
  if (users.length) e.addFields({ name: '🎧 Top ascoltatori', value: users.map((u, i) => `${MEDALS[i]} <@${u.id}> — **${u.plays}** ascolti${u.stars ? ` • ⭐ ${u.stars}` : ''}`).join('\n') });
  if (topSongs.length) e.addFields({ name: '🎶 Canzoni più ascoltate', value: topSongs.map(([k, n], i) => `${MEDALS[i]} ${k.slice(0, 70)} (×${n})`).join('\n') });
  if (wins.length) e.addFields({ name: '🧠 Campioni del quiz', value: wins.map(([id, n], i) => `${MEDALS[i]} <@${id}> — **${n}** vittorie`).join('\n') });
  return say(ctx, { embeds: [e] });
}

// ── QUIZ ──
const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft)\b.*$/, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function quiz(ctx, text) {
  if (!ctx.guild) return fail(ctx, 'Funziona solo nei server.');
  const ch = ctx.channel;
  if (active.has(ch.id)) return fail(ctx, 'C\'è già un quiz in corso in questo canale!');
  const artist = (isSlash(ctx) ? ctx.options.getString('artista') : text.trim()) || rnd(ARTISTS);
  if (isSlash(ctx)) await ctx.deferReply();
  active.add(ch.id);
  let hint;
  try {
    const { data } = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(artist)}`, { timeout: 10000 });
    const pool = (Array.isArray(data) ? data : []).filter((t) => t.plainLyrics && !t.instrumental && t.plainLyrics.length > 200 && norm(t.trackName).length >= 2);
    if (!pool.length) return await fail(ctx, `Non trovo testi per **${artist}**. Prova un altro artista!`);
    const t = rnd(pool);
    const lines = t.plainLyrics.split('\n').map((l) => l.trim()).filter((l) => l.length > 12);
    if (lines.length < 4) return await fail(ctx, 'Testo troppo corto, riprova!');
    const start = Math.floor(Math.random() * (lines.length - 3));
    const snippet = lines.slice(start, start + 3).join('\n> ');
    const answer = norm(t.trackName);

    await say(ctx, {
      embeds: [box(COLORS.main, '🎤 INDOVINA LA CANZONE',
        `Di che canzone è questo testo?\n\n> ${snippet}\n\n🎙️ Artista: **${t.artistName}**\n🎯 Scrivi il **titolo** in chat • ⏱️ 40 secondi`)],
    });
    hint = setTimeout(() => ch.send(`💡 Indizio: il titolo inizia con **${t.trackName[0].toUpperCase()}** e ha **${t.trackName.length}** caratteri`).catch(() => {}), 20000);

    const filter = (m) => {
      if (m.author.bot) return false;
      const g = norm(m.content);
      return g.length >= 3 && (g === answer || (answer.length > 3 && g.includes(answer)) || (g.length >= 5 && answer.includes(g)));
    };
    const got = await ch.awaitMessages({ filter, max: 1, time: 40000 });
    const win = got.first();
    if (!win) return ch.send({ embeds: [box(COLORS.err, '⌛ Tempo scaduto!', `Era **${t.trackName}** di **${t.artistName}**`)] });

    const db = quizDb.read();
    db[ctx.guild.id] ||= {};
    db[ctx.guild.id][win.author.id] = (db[ctx.guild.id][win.author.id] || 0) + 1;
    quizDb.write(db);
    win.react('🎉').catch(() => {});
    return ch.send({ embeds: [box(COLORS.ok, '🏆 Esatto!', `${win.author} ha indovinato: **${t.trackName}** di **${t.artistName}**\n🧠 Vittorie quiz: **${db[ctx.guild.id][win.author.id]}**`)] });
  } catch (e) {
    console.error('[quiz]', e.message);
    return fail(ctx, 'Qualcosa è andato storto col quiz, riprova.');
  } finally {
    clearTimeout(hint);
    active.delete(ch.id);
  }
}

async function musica(ctx, { text = '', command = '' } = {}) {
  const cmd = command.toLowerCase();
  if (cmd === 'consiglia') return consiglia(ctx, text);
  if (cmd === 'classifica') return classifica(ctx);
  return quiz(ctx, text);
}

musica.command = /^(consiglia|classifica|quiz)$/i;
musica.help = ['consiglia', 'classifica', 'quiz'];
musica.tags = ['musica'];
musica.desc = 'Consigli, quiz e classifica musicale';
musica.cooldown = 3;
export default musica;

export const prefix = 'mus';
export async function onComponent(i) {
  let genre = '';
  try { genre = decodeURIComponent(i.customId.split(':')[2] || ''); } catch (e) { /* genere vuoto */ }
  await i.deferUpdate();
  const p = await buildPick(genre);
  if (!p) return i.followUp({ content: '❌ Nessun risultato, riprova.', flags: MessageFlags.Ephemeral });
  return i.editReply(p);
}
