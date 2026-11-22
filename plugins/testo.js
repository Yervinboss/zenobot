const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const run = promisify(execFile);
const COMMANDS = ['testo', 'text', 'lyrics', 'testoplay'];
const MAX_AUDIO = 16 * 1024 * 1024;
const MAX_CHARS = 3500;
const pending = new Map();

async function getJson(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'ZeusBot/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

const stripSynced = (s) => s.replace(/\[\d+:\d+(?:\.\d+)?\]\s?/g, '').trim();

async function getLyrics(query) {
    try {
        const data = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        const song = data.find((s) => s.plainLyrics || s.syncedLyrics);
        if (song) {
            return {
                lyrics: song.plainLyrics || stripSynced(song.syncedLyrics),
                source: `${song.artistName} - ${song.trackName}`,
            };
        }
    } catch (e) { console.error('Errore LrcLib:', e.message); }

    if (query.includes(' - ')) {
        const [artist, ...rest] = query.split(' - ');
        const a = artist.trim();
        const t = rest.join(' - ').trim();
        try {
            const d = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`);
            if (d.lyrics) return { lyrics: d.lyrics.trim(), source: `${a} - ${t}` };
        } catch (e) { console.error('Errore Lyrics.ovh:', e.message); }
    }
    return null;
}

async function findYt(query) {
    try {
        const r = await yts(query);
        const v = r.videos && r.videos[0];
        if (v) return { id: v.videoId, title: v.title, thumb: v.thumbnail || v.image };
    } catch (e) { console.error('Errore ricerca YT:', e.message); }
    return null;
}

async function getCover(yt) {
    const urls = [
        `https://images.weserv.nl/?url=${encodeURIComponent(`i.ytimg.com/vi/${yt.id}/hqdefault.jpg`)}&w=500&h=500&fit=cover`,
        yt.thumb,
    ].filter(Boolean);
    for (const u of urls) {
        try {
            const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
            if (r.ok) return Buffer.from(await r.arrayBuffer());
        } catch {}
    }
    return null;
}

function chunk(str, max = MAX_CHARS) {
    const out = [];
    let cur = '';
    for (const line of str.split('\n')) {
        if (cur && cur.length + line.length + 1 > max) { out.push(cur); cur = line; }
        else cur = cur ? cur + '\n' + line : line;
    }
    if (cur) out.push(cur);
    return out;
}

async function downloadAudio(id) {
    const base = path.join(__dirname, `testo_${id}_${Date.now()}`);
    await run('yt-dlp', [
        '--no-playlist', '-q', '--no-warnings', '--no-progress',
        '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
        '--extractor-args', 'youtube:player-client=android,web',
        '-o', `${base}.%(ext)s`, `https://www.youtube.com/watch?v=${id}`,
    ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    const file = `${base}.mp3`;
    if (!fs.existsSync(file)) throw new Error('file non generato');
    return file;
}

module.exports = {
    commands: COMMANDS,
    run: async (sock, m) => {
        const chatId = m.key.remoteJid;
        const sender = m.key.participant || m.participant || chatId;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const buttonId =
            m.message?.buttonsResponseMessage?.selectedButtonId ||
            m.message?.templateButtonReplyMessage?.selectedId ||
            m.msg?.selectedButtonId || '';

        const say = (t) => sock.sendMessage(chatId, { text: t }, { quoted: m });
        const react = (e) => sock.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});

        let action = 'testo';
        let query = '';
        if (buttonId) {
            action = buttonId.trim().toLowerCase();
        } else {
            const parts = text.trim().replace(/^[.!\/#]/, '').split(/\s+/);
            const first = (parts[0] || '').toLowerCase();
            if (COMMANDS.includes(first)) { action = first; query = parts.slice(1).join(' '); }
            else query = text.trim();
        }

        // ───── PULSANTE RIPRODUCI ─────
        if (action === 'testoplay') {
            const track = pending.get(sender) || pending.get(chatId);
            if (!track) return say('❌ Cerca prima un testo con `.testo artista - titolo`.');
            await react('⏳');
            let file = null, ogg = null;
            try {
                file = await downloadAudio(track.id);
                ogg = file + '.ogg';
                await run('ffmpeg', ['-y', '-i', file, '-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '1', '-f', 'ogg', ogg]);
                if (fs.statSync(file).size > MAX_AUDIO) return say('❌ Il file è troppo grande per WhatsApp.');
                await sock.sendMessage(chatId, {
                    audio: fs.readFileSync(ogg),
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true,
                    fileName: `${track.title}.mp3`,
                }, { quoted: m });
                await react('✅');
            } catch (e) {
                console.error('Errore download testoplay:', e.stderr || e.message);
                await react('❌');
                await say('❌ Errore durante il download.');
            } finally {
                if (file && fs.existsSync(file)) fs.unlinkSync(file);
                if (ogg && fs.existsSync(ogg)) fs.unlinkSync(ogg);
            }
            return;
        }

        // ───── RICERCA TESTO ─────
        if (!query) {
            return say('📝 *CERCA TESTO CANZONE*\n\n📌 Uso: `.testo artista - titolo`\n📎 Esempio: `.testo Sfera Ebbasta - Visiera H`');
        }

        await react('🔍');
        try {
            const [result, yt] = await Promise.all([getLyrics(query), findYt(query)]);
            if (!result || !result.lyrics) {
                await react('❌');
                return say(`❌ Testo non trovato per: "${query}"`);
            }

            const caption = `📝 *TESTO*\n🎵 ${result.source}`;
            if (yt) {
                if (pending.size > 200) pending.delete(pending.keys().next().value);
                pending.set(sender, { id: yt.id, title: yt.title });
                pending.set(chatId, { id: yt.id, title: yt.title });

                const buttons = [{ buttonId: 'testoplay', buttonText: { displayText: '🎵 Riproduci' }, type: 1 }];
                const img = await getCover(yt);
                if (img) {
                    await sock.sendMessage(chatId, {
                        image: img, caption, footer: `🎵 ${yt.title}`, buttons, headerType: 4,
                    }, { quoted: m });
                } else {
                    await sock.sendMessage(chatId, {
                        text: caption, footer: `🎵 ${yt.title}`, buttons, headerType: 1,
                    }, { quoted: m });
                }
            } else {
                await say(caption);
            }

            for (const part of chunk(result.lyrics)) {
                await sock.sendMessage(chatId, { text: part });
            }
            await react('✅');
        } catch (e) {
            console.error('Errore testo:', e);
            await react('❌');
            await say('❌ Errore nella ricerca del testo.');
        }
    }
};
