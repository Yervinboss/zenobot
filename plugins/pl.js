// ╔════════════════════════════════════════════════╗
// ║   🎵  ZEUS BOT  •  PLUGIN PLAYLIST  (.pl)      ║
// ║   Vocali • Coda • Fusione • Menu interattivo   ║
// ╚════════════════════════════════════════════════╝

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const yts = require('yt-search');

// ━━━━━━━━━━━━━━━━━━━ CONFIG ━━━━━━━━━━━━━━━━━━━
const CFG = {
    dbPath: path.join(__dirname, '../playlist_db.json'),
    maxTracks: 100,
    perPage: 4,
    voiceKbps: 96,
    mergeKbps: 64,
    maxMediaMB: 15,
    footer: 'Zeus Bot • Music Playlist',
    fallbackPfp: 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
const OPUS_MIME = 'audio/ogg; codecs=opus';
global.plQueues = global.plQueues || {};

// ━━━━━━━━━━━━━━━━━━ UTILITY ━━━━━━━━━━━━━━━━━━━
const SAFE_URL = /^https?:\/\/[^\s"'`$\\;|<>(){}\[\]^]+$/i;
const isSafeUrl = (u) => typeof u === 'string' && u.length <= 600 && SAFE_URL.test(u);
const safeUrl = (u) => (isSafeUrl(u) ? u : 'https://invalid.invalid/');

const rm = (...files) => files.flat().forEach((f) => {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
});
const clean = (s, n = 40) => String(s || 'Sconosciuto').replace(/\s+/g, ' ').trim().substring(0, n);
const pad = (n) => String(n).padStart(2, '0');
const mmss = (sec) => {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
const bar = (i, n, w = 10) => {
    const f = n ? Math.round((i / n) * w) : 0;
    return '▰'.repeat(f) + '▱'.repeat(w - f);
};
const panel = (titolo, righe = []) =>
    `╭━━━『 ${titolo} 』━━━╮\n${righe.map((r) => `┃ ${r}`).join('\n')}\n╰━━━━━━━━━━━━━━━━━━━╯`;

const run = (cmd, args) => new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
        if (err) { err.stderr = String(stderr || ''); return reject(err); }
        resolve(String(stdout));
    });
});

// ━━━━━━━━━━━━━━━━━━ DATABASE ━━━━━━━━━━━━━━━━━━
const readDb = (p) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
};
const writeDb = (p, data) => {
    try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { console.error('Errore scrittura DB:', e); }
};

// ━━━━━━━━━━━━━━━━━━ SPOTIFY ━━━━━━━━━━━━━━━━━━━
async function extractSpotifyTracks(url) {
    try {
        const html = await (await fetch(url, { headers: { 'User-Agent': CFG.ua } })).text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (!titleMatch) return [];
        const title = titleMatch[1].replace(' - Spotify', '').replace(' | Spotify', '').replace('• Spotify', '').trim();
        if (url.includes('playlist') || url.includes('album')) {
            const found = html.match(/<span class="track-name">(.*?)<\/span>/g) || html.match(/"name":"(.*?)"/g);
            if (found && found.length) {
                const tracks = found
                    .map((t) => ({ title: t.replace(/<[^>]*>/g, '').replace(/"name":"/g, '').replace(/"$/g, '') }))
                    .filter((t) => t.title && t.title.length > 0)
                    .slice(0, 50);
                if (tracks.length) return tracks;
            }
        }
        return title ? [{ title }] : [];
    } catch (e) { console.error('Errore Spotify:', e.message); return []; }
}

// ━━━━━━━━━━━━━━━━ MOTORE AUDIO ━━━━━━━━━━━━━━━━
async function ytdlp(url, out) {
    const base = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--no-part', '--no-playlist', '-o', out];
    try {
        await run('yt-dlp', [...base, '--extractor-args', 'youtube:player-client=android,web', '--', safeUrl(url)]);
    } catch (e) {
        console.error('⚠️ yt-dlp 1° tentativo:', String(e.stderr).slice(-300));
        await run('yt-dlp', [...base, '--', safeUrl(url)]);
    }
    if (!fs.existsSync(out)) throw new Error('Download fallito');
}

// scarica da YouTube e converte in vocale opus (.ogg)
async function scaricaVocale(url, tag, kbps = CFG.voiceKbps) {
    const mp3 = path.join(__dirname, `_pl_${tag}.mp3`);
    const ogg = path.join(__dirname, `_pl_${tag}.ogg`);
    try {
        await ytdlp(url, mp3);
        await run('ffmpeg', ['-y', '-i', mp3, '-vn', '-c:a', 'libopus', '-b:a', `${kbps}k`,
            '-vbr', 'on', '-application', 'audio', '-ar', '48000', '-ac', '1', '-f', 'ogg', ogg]);
        if (!fs.existsSync(ogg)) throw new Error('Conversione fallita');
        return ogg;
    } catch (e) { rm(ogg); throw e; }
    finally { rm(mp3); }
}

async function durata(file) {
    try {
        const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', file]);
        return parseFloat(out.trim()) || 0;
    } catch { return 0; }
}

// invia il file come VOCALE (nota vocale)
const mandaVocale = (sock, jid, file, m) =>
    sock.sendMessage(jid, { audio: fs.readFileSync(file), mimetype: OPUS_MIME, ptt: true }, m ? { quoted: m } : {});

// ━━━━━━━━━━━━━━━━━━━ CODA ━━━━━━━━━━━━━━━━━━━━
async function processQueue(sock, jid, sender) {
    const q = global.plQueues[sender];
    if (!q || q.tracks.length === 0) {
        if (q) delete global.plQueues[sender];
        await sock.sendMessage(jid, { text: '✅ *Playlist completata!* 🎶' }).catch(() => {});
        return;
    }
    const track = q.tracks.shift();
    const n = q.total - q.tracks.length;
    await sock.sendMessage(jid, {
        text: `▶️ *${n}/${q.total}*  ${bar(n, q.total)}\n🎵 _${clean(track.title, 50)}_`
    }).catch(() => {});

    let file;
    try { file = await scaricaVocale(track.url, `q_${Date.now()}`); }
    catch (e) { console.error('❌ Coda:', e.message); return processQueue(sock, jid, sender); }

    if (!global.plQueues[sender]) return rm(file); // fermata nel frattempo
    try { await mandaVocale(sock, jid, file); }
    catch (e) { console.error(e); }
    finally { rm(file); }
    if (global.plQueues[sender]) return processQueue(sock, jid, sender);
}

// ━━━━━━━━━━━━━━━━ BRANO SINGOLO ━━━━━━━━━━━━━━━
async function playSingle(sock, jid, track, m) {
    const react = (text) => sock.sendMessage(jid, { react: { text, key: m.key } }).catch(() => {});
    await react('🎧');
    let file;
    try { file = await scaricaVocale(track.url, `s_${Date.now()}`); }
    catch (e) {
        console.error('❌ Brano singolo:', e.message);
        await react('❌');
        return sock.sendMessage(jid, { text: '❌ Errore durante il download del brano.' }, { quoted: m });
    }
    try { await mandaVocale(sock, jid, file, m); await react('✅'); }
    catch (e) { console.error(e); await react('❌'); }
    finally { rm(file); }
}

// ━━━━━━━━━━━━━━━ FUSIONE PLAYLIST ━━━━━━━━━━━━━━
async function mergePlaylist(sock, jid, tracks, m) {
    const stamp = Date.now();
    const dir = path.join(__dirname, `_merge_${stamp}`);
    const out = path.join(__dirname, `playlist_${stamp}.ogg`);
    fs.mkdirSync(dir, { recursive: true });

    const n = tracks.length;
    const stato = (i, titolo, esito) =>
        panel('🎛️ FUSIONE PLAYLIST', [`${bar(i, n)}  *${i}/${n}*`, `${esito} _${clean(titolo, 45)}_`]);
    const status = await sock.sendMessage(jid, { text: stato(0, 'Avvio...', '⏳') });
    const aggiorna = (txt) => sock.sendMessage(jid, { text: txt, edit: status.key }).catch(() => {});

    const ok = [];
    for (let i = 0; i < n; i++) {
        const titolo = tracks[i].title || `Brano ${i + 1}`;
        try {
            const tmp = await scaricaVocale(tracks[i].url, `${stamp}_${i}`, CFG.mergeKbps);
            const dest = path.join(dir, `track_${String(i).padStart(3, '0')}.ogg`);
            fs.renameSync(tmp, dest);
            ok.push({ file: dest, title: titolo, dur: await durata(dest) });
            await aggiorna(stato(i + 1, titolo, '✅'));
        } catch (e) {
            console.error(`Errore brano ${i + 1}:`, e.message);
            await aggiorna(stato(i + 1, titolo, '⚠️ saltato:'));
        }
    }

    if (!ok.length) {
        fs.rmSync(dir, { recursive: true, force: true });
        return sock.sendMessage(jid, { text: '❌ Nessun brano scaricato. Riprova più tardi.' }, { quoted: m });
    }

    try {
        const listFile = path.join(dir, 'list.txt');
        fs.writeFileSync(listFile, ok.map((t) => `file '${t.file.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
        await aggiorna(panel('🎛️ FUSIONE PLAYLIST', ['🔧 Unisco i brani in un unico vocale...']));
        await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vn', '-c:a', 'libopus',
            '-b:a', `${CFG.mergeKbps}k`, '-ar', '48000', '-ac', '1', '-f', 'ogg', out]);

        const mb = fs.statSync(out).size / 1048576;
        const buf = fs.readFileSync(out);
        if (mb > CFG.maxMediaMB) {
            await sock.sendMessage(jid, { document: buf, mimetype: 'audio/ogg', fileName: `Playlist_Zeus_${new Date().toISOString().slice(0, 10)}.ogg` }, { quoted: m });
        } else {
            await sock.sendMessage(jid, { audio: buf, mimetype: OPUS_MIME, ptt: true }, { quoted: m });
        }

        let t0 = 0;
        const elenco = ok.map((t, i) => {
            const riga = `${pad(i + 1)} • ${mmss(t0)} — ${clean(t.title, 35)}`;
            t0 += t.dur;
            return riga;
        });
        const righe = [
            '✅ *Playlist fusa con successo!*',
            `🎵 Brani: *${ok.length}/${n}*`,
            `⏱️ Durata: *${mmss(t0)}*`,
            `📦 Dimensione: *${mb.toFixed(2)} MB*`,
            '',
            '📜 *Tracklist*',
            ...elenco.slice(0, 40)
        ];
        if (elenco.length > 40) righe.push(`… e altri ${elenco.length - 40} brani`);
        await aggiorna(panel('🎛️ PLAYLIST PRONTA', righe));
    } catch (e) {
        console.error('Errore fusione:', e);
        await sock.sendMessage(jid, { text: '❌ Errore durante la fusione dei brani.' }, { quoted: m });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        setTimeout(() => rm(out), 10000);
    }
}

// ━━━━━━━━━━━━━━━━━━ MENU / UI ━━━━━━━━━━━━━━━━━━
async function askDelete(c) {
    const tracks = c.lista();
    if (!tracks.length) return c.reply('❌ La tua playlist è vuota.');
    const rows = tracks.slice(0, 10).map((t, i) => ({
        title: `🗑️ ${i + 1}. ${clean(t.title)}`,
        rowId: `pl_del_${i}`,
        description: 'Tocca per eliminare questo brano'
    }));
    return c.sock.sendMessage(c.jid, {
        text: panel('🗑️ ELIMINA BRANO', [`📀 Brani totali: *${tracks.length}*`, 'Scegli quello da rimuovere.'])
            + (tracks.length > 10 ? '\n_Per gli altri usa_ `.pl del 12`' : ''),
        footer: CFG.footer,
        title: '🗑️ Elimina brano',
        buttonText: '🗑️ Scegli brano',
        sections: [{ title: 'I tuoi brani', rows }],
        mentions: [c.sender]
    }, { quoted: c.m });
}

const ridimensiona = (buf) => new Promise((resolve) => {
    try {
        const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=300:-1', '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', 'pipe:1']);
        const out = [];
        ff.stdout.on('data', (d) => out.push(d));
        ff.on('close', () => resolve(Buffer.concat(out)));
        ff.on('error', () => resolve(null));
        ff.stdin.on('error', () => {});
        ff.stdin.end(buf);
    } catch { resolve(null); }
});

// messaggio "citato" con la foto profilo come anteprima
async function cardUtente(sock, sender) {
    try {
        let thumb = null;
        try {
            let u; try { u = await sock.profilePictureUrl(sender, 'image'); } catch { u = await sock.profilePictureUrl(sender, 'preview'); }
            const grande = Buffer.from(await (await fetch(u)).arrayBuffer());
            thumb = await ridimensiona(grande);
            if (!thumb || thumb.length <= 500) {
                const u2 = await sock.profilePictureUrl(sender, 'preview');
                thumb = Buffer.from(await (await fetch(u2)).arrayBuffer());
            }
        } catch {}
        const loc = { name: 'PLAYLIST' };
        if (thumb) loc.jpegThumbnail = thumb;
        return { key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'Halo' }, message: { locationMessage: loc }, participant: '0@s.whatsapp.net' };
    } catch { return null; }
}

const bottoneApri = (tracks) => ({
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
        title: '📂 Apri playlist',
        sections: [
            { title: 'Azioni', rows: [
                { title: '▶️ Riproduci tutto', description: 'Tutti i brani in sequenza', id: 'pl_all' },
                { title: '🎛️ Fondi playlist', description: 'Un unico vocale con tutte le tracce', id: 'pl_merge' },
                { title: '⏹️ Stop', description: 'Ferma la riproduzione', id: 'pl_stop' }
            ] },
            { title: 'I tuoi brani', rows: [
                ...tracks.slice(0, 20).map((t, i) => ({
                    title: `${i + 1}. ${clean(t.title)}`,
                    description: t.duration ? `⏱️ ${t.duration} • tocca per ascoltare` : 'Tocca per ascoltare',
                    id: `pl_select_${i}`
                })),
                { title: '🗑️ Elimina un brano...', description: 'Scegli quale brano rimuovere', id: 'pl_askdel' },
                { title: '❌ Svuota playlist', description: `Cancella tutti i ${tracks.length} brani`, id: 'pl_clear' }
            ] }
        ]
    })
});

async function mostraMenu(c, pageReq) {
    const { sock, jid, sender, m } = c;
    const tracks = c.lista();
    if (!tracks.length)
        return c.reply('❌ La tua playlist (.pl) è vuota! Aggiungi un brano col bottone ➕ di `.song` oppure con `.pl add [link]`.');

    const name = (m.pushName || 'Utente').toUpperCase();
    const total = tracks.length;
    const pages = Math.max(1, Math.ceil(total / CFG.perPage));
    const page = Math.min(Math.max(pageReq, 0), pages - 1);
    const testo = panel(`🎵 PLAYLIST DI ${name}`, [
        `📀 Brani salvati: *${total}*`,
        `📄 Pagina: *${page + 1}/${pages}*`,
        '',
        'Tocca il pulsante e scegli cosa fare.'
    ]);

    // 1) lista classica (la più compatibile)
    try {
        const azioni = [
            { title: '▶️ Riproduci tutto', rowId: 'pl_all', description: 'Tutti i brani in sequenza' },
            { title: '🎛️ Fondi playlist', rowId: 'pl_merge', description: 'Un unico vocale con tutte le tracce' },
            { title: '⏹️ Stop', rowId: 'pl_stop', description: 'Ferma la riproduzione' },
            { title: '⚙️ Altre azioni', rowId: 'pl_more', description: 'Mischia, info, doppioni, esporta...' }
        ];
        const brani = tracks.slice(page * CFG.perPage, page * CFG.perPage + CFG.perPage).map((t, k) => {
            const i = page * CFG.perPage + k;
            return {
                title: `${i + 1}. ${clean(t.title)}`,
                rowId: `pl_select_${i}`,
                description: t.duration ? `⏱️ ${t.duration} • tocca per ascoltare` : 'Tocca per ascoltare'
            };
        });
        if (page > 0) brani.push({ title: '⬅️ Pagina precedente', rowId: `pl_page_${page - 1}`, description: `Vai a pagina ${page}/${pages}` });
        if (page < pages - 1) brani.push({ title: '➡️ Pagina successiva', rowId: `pl_page_${page + 1}`, description: `Vai a pagina ${page + 2}/${pages}` });

        const card = await cardUtente(sock, sender);
        return await sock.sendMessage(jid, {
            text: testo,
            footer: CFG.footer,
            title: '🎵 Playlist',
            buttonText: '📂 Apri playlist',
            sections: [{ title: 'Azioni', rows: azioni }, { title: `I tuoi brani (${page + 1}/${pages})`, rows: brani }]
        }, { quoted: card || m });
    } catch (e) { console.log('pl: lista fallita, provo la card:', e.message); }

    let pfp;
    try { pfp = await sock.profilePictureUrl(sender, 'image'); } catch { pfp = CFG.fallbackPfp; }

    // 2) carousel con una card
    try {
        return await sock.sendMessage(jid, {
            text: `🎵 *PLAYLIST DI ${name}*`,
            footer: CFG.footer,
            cards: [{
                image: { url: pfp },
                title: `🎵 Playlist di ${m.pushName || 'Utente'}`,
                body: `Brani salvati: ${total}\nTocca "Apri playlist" per ascoltare, fondere o eliminare brani.`,
                footer: CFG.footer,
                buttons: [bottoneApri(tracks)]
            }],
            mentions: [sender]
        }, { quoted: m });
    } catch (e) { console.error('Errore card playlist, uso i bottoni:', e); }

    // 3) bottoni semplici
    return sock.sendMessage(jid, {
        image: { url: pfp },
        caption: `🎵 *PLAYLIST DI ${name}*\n📀 Brani: ${total}`,
        footer: `⚡ ${CFG.footer}`,
        buttons: [
            { buttonId: 'pl_all', buttonText: { displayText: '▶️ Riproduci tutto' }, type: 1 },
            { buttonId: 'pl_merge', buttonText: { displayText: '🎛️ Fondi playlist' }, type: 1 },
            { buttonId: 'pl_askdel', buttonText: { displayText: '🗑️ Elimina brano' }, type: 1 }
        ],
        headerType: 4
    }, { quoted: m });
}

// ━━━━━━━━━━━━━━━━━━ COMANDI ━━━━━━━━━━━━━━━━━━━
async function cmdDel(c, idx) {
    const tracks = c.lista();
    if (isNaN(idx) || idx < 0 || idx >= tracks.length)
        return c.reply('❌ Brano non trovato. Esempio: `.pl del 2`');
    const [rimosso] = tracks.splice(idx, 1);
    c.salva(tracks);
    return c.reply(panel('🗑️ BRANO RIMOSSO', [`_${clean(rimosso.title, 60)}_`, `📀 Rimasti: *${tracks.length}*`]), { mentions: [c.sender] });
}

async function cmdClear(c) {
    const tracks = c.lista();
    if (!tracks.length) return c.reply('❌ La tua playlist è già vuota.');
    c.salva([]);
    return c.reply(`🗑️ Playlist svuotata! Rimossi *${tracks.length}* brani.`);
}

async function cmdMerge(c) {
    const tracks = c.lista();
    if (!tracks.length) return c.reply('❌ La tua playlist è vuota. Aggiungi brani con `.pl add [link]`.');
    return mergePlaylist(c.sock, c.jid, tracks, c.m);
}

async function cmdStop(c) {
    if (global.plQueues[c.sender]) {
        delete global.plQueues[c.sender];
        return c.reply('⏹️ Riproduzione della playlist interrotta.');
    }
    return c.reply('⚠️ Nessuna riproduzione in corso al momento.');
}

async function cmdAll(c) {
    const tracks = c.lista();
    if (!tracks.length) return c.reply('❌ La tua playlist è vuota.');
    if (global.plQueues[c.sender]) return c.reply('⚠️ Coda già attiva! Usa `.pl stop` per fermarla.');
    global.plQueues[c.sender] = { tracks: [...tracks], currentIndex: 1, total: tracks.length };
    await c.reply(`▶️ Avvio riproduzione continua di *${tracks.length}* brani in vocale!`);
    return processQueue(c.sock, c.jid, c.sender);
}

async function addSpotify(c, link) {
    await c.reply('⏳ Analisi link Spotify in corso...');
    const trovati = await extractSpotifyTracks(link);
    if (!trovati.length) return c.reply('❌ Nessun brano trovato su Spotify.');
    const tracks = c.lista();
    let added = 0;
    for (const t of trovati) {
        if (tracks.length >= CFG.maxTracks) break;
        try {
            const v = ((await yts(t.title)).videos || [])[0];
            if (v && !tracks.some((x) => x.url === v.url)) {
                tracks.push({ title: v.title, url: v.url, duration: v.timestamp || '--:--' });
                added++;
            }
        } catch (e) { console.error('Errore ricerca YouTube:', e); }
    }
    if (!added) return c.reply('❌ Nessun brano trovato su YouTube per questi titoli.');
    c.salva(tracks);
    return c.reply(`✅ Aggiunti *${added}* brani da Spotify alla playlist!`);
}

async function addLink(c, link) {
    let out;
    try { out = await run('yt-dlp', ['--flat-playlist', '--dump-json', '--', link]); }
    catch { return c.reply('❌ Errore durante la lettura del link.'); }
    const tracks = c.lista();
    let added = 0;
    for (const line of out.trim().split('\n')) {
        try {
            const info = JSON.parse(line);
            let url = info.url || (info.id ? `https://www.youtube.com/watch?v=${info.id}` : null);
            if (!url) continue;
            if (!url.startsWith('http')) url = `https://www.youtube.com/watch?v=${info.id}`;
            if (tracks.some((t) => t.url === url) || tracks.length >= CFG.maxTracks) continue;
            tracks.push({ title: info.title || 'Brano importato', url, duration: info.duration_string || undefined });
            added++;
        } catch {}
    }
    if (!added) return c.reply('❌ Nessun brano trovato in questo link.');
    c.salva(tracks);
    return c.reply(`✅ Aggiunti *${added}* brani alla playlist!\nUsa \`.pl\` per vederla o \`.pl all\` per ascoltarli.`);
}

async function cmdAdd(c) {
    const link = c.rest.trim();
    if (!isSafeUrl(link)) return c.reply('❌ Inserisci un link valido dopo `add` (Esempio: `.pl add [link]`).');
    return link.includes('spotify.com') ? addSpotify(c, link) : addLink(c, link);
}

// ━━━━━━━━━━━━━━━━━ REGISTRAZIONE ━━━━━━━━━━━━━━━
const HANDLERS = {
    askdel: askDelete,
    clear: cmdClear,
    merge: cmdMerge,
    fusion: cmdMerge,
    stop: cmdStop,
    del: (c) => cmdDel(c, parseInt(c.rest.trim()) - 1),
    add: cmdAdd,
    all: cmdAll
};

const allCommands = ['pl', 'pl_add', 'pl_all', 'pl_stop', 'pl_merge', 'pl_fusion', 'pl_del', 'pl_clear', 'pl_askdel',
    'pl_shuffle', 'pl_info', 'pl_help', 'pl_skip', 'pl_dedupe', 'pl_more', 'pl_export', 'pl_allshuffle'];
for (let i = 0; i < 100; i++) allCommands.push(`pl_select_${i}`, `pl_del_${i}`, `pl_page_${i}`);

const parseCmd = (cmd, args) => (cmd === 'pl'
    ? { sub: (args[0] || '').toLowerCase(), rest: args.slice(1).join(' ') }
    : { sub: cmd.replace(/^pl_/, '').toLowerCase(), rest: args.join(' ') });

const handleExtra = async (ctx) => {
    try { return await require('../pl_extra.js').handle(ctx); }
    catch (e) { if (e.code === 'MODULE_NOT_FOUND') return false; throw e; }
};

module.exports = {
    commands: allCommands,
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.participant || jid;
        const { sub, rest } = parseCmd(cmd, args);

        const c = {
            sock, m, jid, sender, rest,
            reply: (text, extra = {}) => sock.sendMessage(jid, { text, ...extra }, { quoted: m }),
            lista: () => readDb(CFG.dbPath)[sender] || [],
            salva: (tracks) => { const db = readDb(CFG.dbPath); db[sender] = tracks; writeDb(CFG.dbPath, db); }
        };

        // elimina brano dal menu (pl_del_3)
        const del = sub.match(/^del_(\d+)$/);
        if (del) return cmdDel(c, parseInt(del[1]));

        // comandi extra (shuffle, info, skip, dedupe, export...)
        if (await handleExtra({ sock, m, jid, sender, sub, rest, readDb, writeDb, playlistDbPath: CFG.dbPath, yts, processQueue })) return;

        // comandi principali
        if (HANDLERS[sub]) return HANDLERS[sub](c);

        // riproduzione brano singolo
        let playIdx = null;
        if (sub === 'play' && /^\d+$/.test(rest.trim())) playIdx = parseInt(rest.trim()) - 1;
        else if (sub.startsWith('select_')) playIdx = parseInt(sub.replace('select_', ''));
        if (playIdx !== null && !isNaN(playIdx)) {
            const track = c.lista()[playIdx];
            if (!track || !track.url) return c.reply('❌ Brano non trovato.');
            return playSingle(sock, jid, track, m);
        }

        // menu playlist
        let page = 0;
        if (/^page_\d+$/.test(sub)) page = parseInt(sub.replace('page_', ''));
        else if (sub === 'page') page = (parseInt(rest) || 1) - 1;
        return mostraMenu(c, page);
    }
};
