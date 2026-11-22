// ZEUS ULTIMATE — .dl : scarica video o audio da un link
// Uso: .dl <link>   |   .dl audio <link>   |   .dla <link>   (anche rispondendo a un messaggio con un link)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);
const MAX_MB = 60;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_DURATION = 900; // secondi (15 min)
const URL_RE = /https?:\/\/[^\s<>"']+/i;
const busy = new Set();

const unwrap = (x) =>
    x?.ephemeralMessage?.message ||
    x?.viewOnceMessage?.message ||
    x?.viewOnceMessageV2?.message ||
    x?.documentWithCaptionMessage?.message || x;

function isBlockedHost(u) {
    let h;
    try { h = new URL(u).hostname.toLowerCase(); } catch { return true; }
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (h.includes(':')) return true;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const [a, b] = h.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
    }
    return false;
}

const isTikTok = (u) => {
    try { return /(^|\.)tiktok\.com$/i.test(new URL(u).hostname); } catch { return false; }
};

function findUrl(m, args) {
    const clean = (s) => s.replace(/[)\].,;!?]+$/, '');
    const direct = (args || []).join(' ').match(URL_RE);
    if (direct) return clean(direct[0]);
    const msg = unwrap(unwrap(m.message)) || {};
    const ctx = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || msg.videoMessage?.contextInfo || {};
    const q = unwrap(unwrap(ctx.quotedMessage)) || {};
    const qt = q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '';
    const f = qt.match(URL_RE);
    return f ? clean(f[0]) : null;
}

function findOutput(prefix) {
    return fs.readdirSync(os.tmpdir())
        .filter((f) => f.startsWith(prefix) && !/\.(part|ytdl|tmp)$/.test(f))
        .map((f) => path.join(os.tmpdir(), f))[0] || null;
}

async function download(url, audio, base) {
    const common = [
        '--no-playlist', '-q', '--no-warnings', '--no-progress',
        '--print', '%(title)s', '--no-simulate',
        '--max-filesize', `${MAX_MB}M`,
        '--match-filter', `duration<=${MAX_DURATION}?`,
        '-o', `${base}.%(ext)s`,
    ];
    const fmt = audio
        ? ['-x', '--audio-format', 'mp3', '--audio-quality', '128K']
        : ['-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b', '--merge-output-format', 'mp4'];

    const attempts = [
        ['--extractor-args', 'youtube:player-client=android,web'],
        [],
    ];
    let lastErr;
    for (const extra of attempts) {
        try {
            const { stdout } = await run('yt-dlp', [...extra, ...common, ...fmt, url], {
                timeout: 5 * 60 * 1000,
                maxBuffer: 10 * 1024 * 1024,
            });
            const file = findOutput(path.basename(base));
            if (file) return { file, title: (stdout || '').split('\n')[0].trim() };
            lastErr = new Error('nessun file (troppo lungo/pesante o non supportato)');
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

// ───── metodo alternativo per TikTok (quando yt-dlp chiede il login) ─────
async function fetchToFile(url, dest) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error('download HTTP ' + r.status);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('file troppo grande');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('file troppo grande');
    fs.writeFileSync(dest, buf);
}

async function tiktokFallback(url, audio, base) {
    const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    if (!j || j.code !== 0 || !j.data) throw new Error('tikwm: ' + ((j && j.msg) || 'risposta non valida'));
    const d = j.data;
    const abs = (p) => (p && p.startsWith('/') ? 'https://www.tikwm.com' + p : p);
    const title = (d.title || '').trim();

    if (audio) {
        const src = abs(d.music);
        if (!src) throw new Error('tikwm: audio non disponibile');
        const dest = `${base}.mp3`;
        await fetchToFile(src, dest);
        return { file: dest, title };
    }
    const src = abs(d.play) || abs(d.hdplay);
    if (!src) throw new Error('tikwm: video non disponibile (forse è una raccolta di foto)');
    const dest = `${base}.mp4`;
    await fetchToFile(src, dest);
    return { file: dest, title };
}

async function toMp4(file, base) {
    const out = `${base}_conv.mp4`;
    await run('ffmpeg', ['-y', '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-movflags', '+faststart', out], { timeout: 5 * 60 * 1000 });
    return out;
}

module.exports = {
    commands: ['dl', 'dla', 'scarica'],
    name: 'dl',
    category: 'funzioni',
    description: 'Scarica video o audio da un link',
    usage: '[audio] <link>',
    cooldown: 5000,

    run: async (sock, m, args, cmd) => {
        const chat = m.key.remoteJid;
        const sender = m.key.participant || m.participant || chat;
        const say = (t) => sock.sendMessage(chat, { text: t }, { quoted: m });
        const react = (e) => sock.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {});

        args = Array.isArray(args) ? args : [];
        const first = (args[0] || '').toLowerCase();
        const audioWord = /^(audio|mp3|a)$/.test(first);
        const audio = cmd === 'dla' || audioWord;
        const rest = audioWord ? args.slice(1) : args;

        const url = findUrl(m, rest);
        if (!url) {
            return say('📥 *DOWNLOAD*\n\n📌 Uso:\n• `.dl <link>` → video\n• `.dl audio <link>` oppure `.dla <link>` → mp3\n\nFunziona con TikTok, Instagram, YouTube, Facebook, X e altri.\nPuoi anche rispondere a un messaggio che contiene il link.');
        }
        if (isBlockedHost(url)) return say('❌ Link non valido.');
        if (busy.has(sender)) return say('⏳ Sto ancora scaricando il tuo link precedente, aspetta un attimo.');

        busy.add(sender);
        await react('⏳');

        // lavoro in background, così il core non va in timeout sui download lunghi
        (async () => {
            const prefix = `zeus_dl_${Date.now()}`;
            const base = path.join(os.tmpdir(), prefix);
            try {
                let file, title;
                try {
                    ({ file, title } = await download(url, audio, base));
                } catch (err) {
                    if (!isTikTok(url)) throw err;
                    console.error('[DL] yt-dlp fallito su TikTok, provo il metodo alternativo');
                    ({ file, title } = await tiktokFallback(url, audio, base));
                }

                if (!audio && !/\.mp4$/i.test(file)) file = await toMp4(file, base);

                const size = fs.statSync(file).size;
                if (size > MAX_BYTES) {
                    await react('❌');
                    return say(`❌ Il file è troppo grande per WhatsApp (max ${MAX_MB} MB).`);
                }

                const name = (title || (audio ? 'audio' : 'video')).replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
                if (audio) {
                    await sock.sendMessage(chat, {
                        audio: fs.readFileSync(file),
                        mimetype: 'audio/mpeg',
                        fileName: `${name}.mp3`,
                    }, { quoted: m });
                } else {
                    await sock.sendMessage(chat, {
                        video: fs.readFileSync(file),
                        mimetype: 'video/mp4',
                        caption: `🎬 ${name}`,
                    }, { quoted: m });
                }
                await react('✅');
            } catch (e) {
                console.error('[DL]', String(e.stderr || e.message).slice(-600));
                await react('❌');
                await say(`❌ Non riesco a scaricare questo link.\nPotrebbe essere privato, troppo lungo (max ${MAX_DURATION / 60} min), troppo pesante (max ${MAX_MB} MB) o non supportato.`);
            } finally {
                try {
                    for (const f of fs.readdirSync(os.tmpdir())) {
                        if (f.startsWith(prefix)) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
                    }
                } catch {}
                busy.delete(sender);
            }
        })();
    }
};
