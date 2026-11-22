const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_AUDIO_SEC = 900;
const MAX_VIDEO_SEC = 480;
let busy = 0;

global.tpSongs = global.tpSongs || {};

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const baseTitle = (s) => norm(String(s).replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s-\s.*$/, ''));
const fmtTime = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const keyOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '') || String(jid || '');

async function itunes(term, artistOnly) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=50${artistOnly ? '&attribute=artistTerm' : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  return (await res.json()).results || [];
}

function pick(list, artist, strict) {
  const a = norm(artist);
  const seen = new Set(), out = [];
  for (const t of list) {
    if (!t.trackName) continue;
    if (strict && !norm(t.artistName).includes(a)) continue;
    const key = baseTitle(t.trackName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === 5) break;
  }
  return out;
}

async function ytFill(artist, have) {
  try {
    const out = await run('yt-dlp', ['--no-warnings', '--flat-playlist', '-j', '--extractor-args', 'youtube:player_client=default', `ytsearch12:${artist}`], 60000);
    const a = norm(artist);
    const seen = new Set(have.map((t) => baseTitle(t.trackName)));
    const res = [...have];
    for (const line of out.split('\n').filter(Boolean)) {
      if (res.length >= 5) break;
      let v;
      try { v = JSON.parse(line); } catch { continue; }
      if (!v.id || v.is_live || !(v.duration >= 60 && v.duration <= 600)) continue;
      if (!norm(`${v.title} ${v.channel || v.uploader || ''}`).includes(a)) continue;
      const parts = String(v.title).split(/\s[-–]\s/);
      let name = parts.length > 1 ? parts.slice(1).join(' - ') : String(v.title);
      name = name.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/, '').trim() || String(v.title);
      const key = baseTitle(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      res.push({
        trackName: cut(name, 50),
        artistName: have[0]?.artistName || artist,
        collectionName: '',
        trackTimeMillis: v.duration * 1000,
        artworkUrl100: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        query: cut(String(v.title), 120)
      });
    }
    return res;
  } catch (e) { return have; }
}

async function topSongs(artist) {
  let list = await itunes(artist, true).catch(() => []);
  if (!list.length) list = await itunes(artist, false);
  const strict = pick(list, artist, true);
  const base = strict.length ? strict : pick(list, artist, false);
  return base.length >= 5 ? base : await ytFill(artist, base);
}

function run(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code !== 101) { err.stderr = stderr; return reject(err); }
      resolve(stdout);
    });
  });
}

function cleanup(stamp) {
  const dir = os.tmpdir();
  try { for (const f of fs.readdirSync(dir)) if (f.startsWith(stamp + '.')) fs.unlinkSync(path.join(dir, f)); } catch {}
}

async function toVoiceOgg(inputFile, stamp) {
  const outFile = path.join(os.tmpdir(), `${stamp}_ptt.ogg`);
  try {
    await run('ffmpeg', [
      '-y', '-i', inputFile,
      '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1',
      outFile
    ], 2 * 60 * 1000);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
      return { buf: fs.readFileSync(outFile), mimetype: 'audio/ogg; codecs=opus', ptt: true };
    }
  } catch {}
  return { buf: fs.readFileSync(inputFile), mimetype: 'audio/mp4', ptt: true };
}

async function download(query, kind) {
  const stamp = `zeus_tp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const dir = os.tmpdir();
  const common = [
    '--no-warnings', '--no-playlist', '-q', '--socket-timeout', '20', '--retries', '3',
    '--extractor-args', 'youtube:player_client=default',
    '--max-downloads', '1', '--max-filesize', '50M',
    '-o', path.join(dir, `${stamp}.%(ext)s`)
  ];
  const args = kind === 'video'
    ? [...common, '--match-filter', `duration<=${MAX_VIDEO_SEC}`,
        '-f', 'b[height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[ext=mp4]',
        '--merge-output-format', 'mp4', `ytsearch3:${query} official video`]
    : [...common, '--match-filter', `duration<=${MAX_AUDIO_SEC}`,
        '-f', 'bestaudio[ext=m4a]/bestaudio/best', `ytsearch3:${query} official audio`];
  try {
    await run('yt-dlp', args, 5 * 60 * 1000);
  } catch (e) { cleanup(stamp); throw e; }
  const file = fs.readdirSync(dir).find((f) => f.startsWith(stamp + '.') && !f.endsWith('.part') && !f.endsWith('_ptt.ogg'));
  return { file: file ? path.join(dir, file) : null, stamp };
}

module.exports = {
  name: 'tp',
  commands: ['tp', 'top5', 'tpplay', 'tpvideo'],
  category: 'musica',
  description: 'Top 5 canzoni di un artista con bottoni diretti Riproduci e Manda video',
  usage: '<artista>',
  cooldown: 1500,
  run: async (sock, m, args, command, ctx) => {
    const jid = ctx.chat, prefix = ctx.prefix, sender = ctx.sender;
    const reply = ctx.reply, react = ctx.react, btn = ctx.btn;
    const P = prefix || '.';
    const query = args.join(' ').trim();
    const skey = keyOf(sender);

    if (command === 'tpplay' || command === 'tpvideo') {
      const kind = command === 'tpvideo' ? 'video' : 'audio';
      const index = parseInt(args[0], 10);
      const songs = global.tpSongs[skey];
      const song = !Number.isNaN(index) && songs?.[index] ? songs[index] : null;

      if (!song) return reply({ text: `⚠️ Selezione non valida o scaduta. Fai di nuovo *${P}tp artista*.` });

      const targetQuery = song.query || `${song.artistName} - ${song.trackName}`;
      if (busy >= 2) return reply({ text: '⏳ Sto già scaricando altre canzoni, riprova tra poco.' });

      busy++;
      await react('⏳');
      let job = null;
      try {
        for (let i = 0; i < 2 && !job?.file; i++) {
          try { job = await download(targetQuery, kind); }
          catch (e) {
            const txt = String(e.stderr || e.message);
            if (i === 1 || !/403|timed out|HTTP Error/i.test(txt)) throw e;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (!job?.file) {
          await react('❌');
          return reply({ text: `❌ Non ho trovato una versione adatta di *${targetQuery}* (max ${kind === 'video' ? MAX_VIDEO_SEC / 60 : MAX_AUDIO_SEC / 60} minuti).` });
        }
        if (kind === 'video') {
          const buf = fs.readFileSync(job.file);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: `🎬 ${song.trackName}` }, { quoted: m });
        } else {
          const voice = await toVoiceOgg(job.file, job.stamp);
          await sock.sendMessage(jid, { audio: voice.buf, mimetype: voice.mimetype, ptt: voice.ptt }, { quoted: m });
        }
        await react('✅');
      } catch (e) {
        console.error(`Errore ${command}:`, String(e.stderr || e.message).slice(0, 300));
        await react('❌');
        const txt = String(e.stderr || e.message);
        const msg = e.code === 'ENOENT' ? '⚠️ yt-dlp non è installato (pkg install yt-dlp ffmpeg).'
          : /403/.test(txt) ? '⚠️ YouTube ha rifiutato il download (403). Riprova tra poco.'
          : '⚠️ Download non riuscito, riprova.';
        await reply({ text: msg });
      } finally {
        busy--;
        if (job?.stamp) cleanup(job.stamp);
      }
      return;
    }

    if (!query) return reply({ text: `🎤 Scrivi il nome dell'artista.\nEsempio: ${P}tp Sfera Ebbasta` });
    await react('🔎');
    let songs;
    try { songs = await topSongs(query); }
    catch (e) { await react('❌'); return reply({ text: '⚠️ Ricerca non riuscita, riprova tra poco.' }); }
    if (!songs.length) { await react('❌'); return reply({ text: `❌ Nessuna canzone trovata per *${query}*.` }); }

    global.tpSongs[skey] = songs;

    const artistName = songs[0].artistName;
    const imgOf = (t) => (t.artworkUrl100 || '').replace('100x100bb', '600x600bb') || 'https://picsum.photos/600/600';

    const cards = songs.map((t, i) => ({
      image: imgOf(t),
      title: cut(`${i + 1}. ${t.trackName}`, 60),
      body: [t.artistName, t.collectionName ? `💿 ${cut(t.collectionName, 40)}` : '', `⏱️ ${fmtTime(t.trackTimeMillis)}`].filter(Boolean).join(' · '),
      footer: 'Zeus Music',
      buttons: [
        btn.reply('▶️ Riproduci', `${P}tpplay ${i}`),
        btn.reply('🎬 Manda video', `${P}tpvideo ${i}`)
      ]
    }));

    const nativeCards = cards.map((c) => ({
      image: { url: c.image },
      title: c.title,
      body: c.body,
      footer: c.footer,
      nativeFlow: c.buttons.map((b) => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id })
      }))
    }));
    let sent = false, lastErr = null;
    for (let attempt = 0; attempt < 2 && !sent; attempt++) {
      try {
        await sock.sendMessage(jid, {
          text: `🎤 *Top 5 — ${artistName}*\nScegli direttamente sulla card 👉`,
          footer: 'Zeus Music',
          cards: nativeCards
        }, { quoted: m });
        sent = true;
      } catch (err) {
        lastErr = err;
        console.error('Carosello .tp non inviato:', err.message);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (!sent) {
      try {
        await ctx.sendCards({ text: `🎤 *Top 5 — ${artistName}*`, footer: 'Zeus Music', title: `Top 5 — ${artistName}`, cards });
        sent = true;
      } catch (err) { lastErr = err; }
    }
    if (!sent) {
      await react('❌');
      return reply({ text: `⚠️ Carosello non inviato.\n${String(lastErr?.message || lastErr).slice(0, 150)}` });
    }
    await react('✅');
  }
};
