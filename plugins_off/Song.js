const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yts = require('yt-search');

const dbPath = path.join(__dirname, '../zenomusic_db.json');
const playlistDbPath = path.join(__dirname, '../playlist_db.json');

/* ═══════════════════ UTILITY DB ═══════════════════ */
const readDb = (p = dbPath) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
};
const writeDb = (data, p = dbPath) => {
    try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { console.error('[DB WRITE]', e); }
};

/* ═══════════════════ UTILITY GENERALI ═══════════════════ */
const cleanFile = (p, delay = 0) => {
    const remove = () => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} };
    delay > 0 ? setTimeout(remove, delay) : remove();
};

const formatNumber = (n) => {
    if (!n && n !== 0) return 'N/D';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
};

const userKey = (chatId, sender) => `${chatId}::${sender}`;
const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━';
const TITLE = `🎵 *Z E N O   M U S I C* 🎵\n${DIV}`;

const msgError = (t) =>
    `${TITLE}\n\n❌  ${t}\n\n${DIV}`;
const msgOk = (t) =>
    `${TITLE}\n\n✅  ${t}\n\n${DIV}`;
const msgWarn = (t) =>
    `${TITLE}\n\n⚠️  ${t}\n\n${DIV}`;

/* ═══════════════════ COMANDI RICONOSCIUTI ═══════════════════ */
const KNOWN = [
    'song', 'play',
    'sendnormal', 'sendvideo', 'addplaylist',
    'playlist', 'pl', 'clearpl'
];

module.exports = {
    commands: KNOWN,

    run: async (sock, m) => {
        const chatId = m.key.remoteJid;
        const sender = m.key.participant || m.participant || chatId;
        const key = userKey(chatId, sender);

        /* ─── 1. Estrazione comando / query ─── */
        const rawText = (m.message?.conversation
            || m.message?.extendedTextMessage?.text
            || '').trim();

        let command = '';
        let query = '';

        if (/^[./!#]/.test(rawText)) {
            const parts = rawText.slice(1).trim().split(/\s+/);
            command = (parts.shift() || '').toLowerCase();
            query = parts.join(' ').trim();
        } else {
            query = rawText;
        }

        /* ─── 2. Bottone premuto (priorità massima) ─── */
        const buttonId =
            m.message?.buttonsResponseMessage?.selectedButtonId ||
            m.message?.templateButtonReplyMessage?.selectedId ||
            m.msg?.selectedButtonId;

        let action = buttonId ? buttonId.trim().toLowerCase() : command;

        /* ─── 3. Fallback: comando sconosciuto → ricerca ─── */
        if (action && !KNOWN.includes(action)) {
            query = (command ? command + ' ' + query : query).trim();
            action = 'song';
        }
        if (!action && query) action = 'song';

        console.log(`[ZENO-MUSIC] azione="${action}" query="${query}" chat=${chatId}`);

        /* ══════════════════════════════════════════════
           ① RICERCA BRANO (.song / .play / fallback)
        ══════════════════════════════════════════════ */
        if (action === 'song' || action === 'play') {
            if (!query) {
                return sock.sendMessage(chatId, {
                    text: msgError(`Inserisci il titolo della canzone!\n\n💡 _Esempio:_ \`.song Believer\``)
                }, { quoted: m });
            }

            await sock.sendMessage(chatId, { react: { text: '🔍', key: m.key } });

            let search = null;
            try { search = await yts(query); } catch (e) { console.error('[YTS]', e); }

            if (!search || !search.videos?.length) {
                return sock.sendMessage(chatId, {
                    text: msgError(`Nessun risultato per:\n_"${query}"_`)
                }, { quoted: m });
            }

            const vid = search.videos[0];

            /* Salva il brano PER-UTENTE-PER-CHAT (fix collisioni nei gruppi) */
            const db = readDb();
            db[key] = {
                url: vid.url,
                title: vid.title,
                duration: vid.timestamp,
                thumbnail: vid.thumbnail,
                author: vid.author?.name || 'N/D',
                views: vid.views,
                savedAt: Date.now()
            };
            writeDb(db);

            const caption =
                `${TITLE}\n\n` +
                `🎼 *${vid.title}*\n\n` +
                `👤 *Artista:* ${vid.author?.name || 'N/D'}\n` +
                `⏱️ *Durata:* ${vid.timestamp}\n` +
                `👁️ *Views:* ${formatNumber(vid.views)}\n` +
                `📅 *Pubblicato:* ${vid.ago || 'N/D'}\n\n` +
                `${DIV}\n✨ _Scegli un'opzione qui sotto_ 👇`;

            /* Thumbnail + bottoni */
            const thumbPath = path.join(__dirname, `thumb_${Date.now()}.jpg`);
            try {
                const res = await fetch(vid.thumbnail);
                const buf = Buffer.from(await res.arrayBuffer());
                fs.writeFileSync(thumbPath, buf);

                const buttons = [
                    { buttonId: 'sendnormal',  buttonText: { displayText: '🎵  Audio HQ' },       type: 1 },
                    { buttonId: 'sendvideo',   buttonText: { displayText: '🎬  Video MP4' },      type: 1 },
                    { buttonId: 'addplaylist', buttonText: { displayText: '➕  Aggiungi a .PL' }, type: 1 }
                ];

                await sock.sendMessage(chatId, {
                    image: fs.readFileSync(thumbPath),
                    caption,
                    footer: '⚡ Zeno Bot • Music Player',
                    buttons,
                    headerType: 4
                }, { quoted: m });

                cleanFile(thumbPath);
            } catch (e) {
                console.error('[THUMB]', e);
                cleanFile(thumbPath);
                /* Fallback: invia solo testo se la thumbnail fallisce */
                await sock.sendMessage(chatId, { text: caption }, { quoted: m });
            }
            return;
        }

        /* ══════════════════════════════════════════════
           ② AUDIO VOCALE (.sendnormal)
        ══════════════════════════════════════════════ */
        if (action === 'sendnormal') {
            const track = readDb()[key];
            if (!track?.url) {
                return sock.sendMessage(chatId, {
                    text: msgError('Nessun brano selezionato.\nUsa prima `.song <titolo>`')
                }, { quoted: m });
            }

            await sock.sendMessage(chatId, { react: { text: '🎧', key: m.key } });

            const inputMp3  = path.join(__dirname, `_tmp_${Date.now()}.mp3`);
            const outputOgg = path.join(__dirname, `voice_${Date.now()}.ogg`);

            const cmdDownload =
                `yt-dlp -x --audio-format mp3 --audio-quality 192K ` +
                `--extractor-args youtube:player-client=android,web ` +
                `--no-playlist --no-warnings ` +
                `-o "${inputMp3}" "${track.url}"`;

            exec(cmdDownload, { maxBuffer: 1024 * 1024 * 20 }, (err, _out, stderr) => {
                if (err) {
                    console.error('[YT-DLP]', stderr);
                    cleanFile(inputMp3);
                    return sock.sendMessage(chatId, {
                        text: msgError('Download audio fallito 😢\nRiprova tra qualche secondo.')
                    }, { quoted: m });
                }

                const cmdConvert =
                    `ffmpeg -y -i "${inputMp3}" -vn -c:a libopus ` +
                    `-b:a 128k -ar 48000 -ac 1 -f ogg "${outputOgg}"`;

                exec(cmdConvert, { maxBuffer: 1024 * 1024 * 20 }, async (err2, _o2, stderr2) => {
                    cleanFile(inputMp3);

                    if (err2) {
                        console.error('[FFMPEG]', stderr2);
                        cleanFile(outputOgg);
                        return sock.sendMessage(chatId, {
                            text: msgError('Conversione vocale fallita 😢')
                        }, { quoted: m });
                    }

                    try {
                        await sock.sendMessage(chatId, {
                            audio: fs.readFileSync(outputOgg),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: m });
                        await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
                    } catch (e) {
                        console.error('[SEND AUDIO]', e);
                        await sock.sendMessage(chatId, {
                            text: msgError('Invio audio fallito 😢')
                        }, { quoted: m });
                    } finally {
                        cleanFile(outputOgg, 8000);
                    }
                });
            });
            return;
        }

        /* ══════════════════════════════════════════════
           ③ VIDEO MP4 (.sendvideo)
        ══════════════════════════════════════════════ */
        if (action === 'sendvideo') {
            const track = readDb()[key];
            if (!track?.url) {
                return sock.sendMessage(chatId, {
                    text: msgError('Nessun brano selezionato.\nUsa prima `.song <titolo>`')
                }, { quoted: m });
            }

            await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

            const outputPath = path.join(__dirname, `video_${Date.now()}.mp4`);
            const cmdVideo =
                `yt-dlp -f "best[ext=mp4][height<=720]/best[ext=mp4]/best" ` +
                `--extractor-args youtube:player-client=android,web ` +
                `--no-playlist --no-warnings ` +
                `-o "${outputPath}" "${track.url}"`;

            exec(cmdVideo, { maxBuffer: 1024 * 1024 * 100 }, async (err, _o, stderr) => {
                if (err) {
                    console.error('[YT-DLP VIDEO]', stderr);
                    cleanFile(outputPath);
                    return sock.sendMessage(chatId, {
                        text: msgError('Download video fallito 😢')
                    }, { quoted: m });
                }

                if (!fs.existsSync(outputPath)) {
                    return sock.sendMessage(chatId, {
                        text: msgError('File video non generato 😢')
                    }, { quoted: m });
                }

                /* Controllo dimensione (WhatsApp ~100MB) */
                const sizeMB = fs.statSync(outputPath).size / (1024 * 1024);
                if (sizeMB > 100) {
                    cleanFile(outputPath);
                    return sock.sendMessage(chatId, {
                        text: msgError(`Video troppo grande (${sizeMB.toFixed(1)} MB).\nLimite: 100 MB`)
                    }, { quoted: m });
                }

                try {
                    await sock.sendMessage(chatId, {
                        video: fs.readFileSync(outputPath),
                        caption: `🎬 *${track.title}*\n\n⚡ _Zeno Music_`,
                        mimetype: 'video/mp4'
                    }, { quoted: m });
                    await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    console.error('[SEND VIDEO]', e);
                    await sock.sendMessage(chatId, {
                        text: msgError('Invio video fallito 😢')
                    }, { quoted: m });
                } finally {
                    cleanFile(outputPath, 8000);
                }
            });
            return;
        }

        /* ══════════════════════════════════════════════
           ④ AGGIUNGI A PLAYLIST (.addplaylist)
        ══════════════════════════════════════════════ */
        if (action === 'addplaylist') {
            const track = readDb()[key];
            if (!track?.url) {
                return sock.sendMessage(chatId, {
                    text: msgError('Nessun brano selezionato.\nUsa prima `.song <titolo>`')
                }, { quoted: m });
            }

            const plDb = readDb(playlistDbPath);
            if (!plDb[sender]) plDb[sender] = [];

            if (plDb[sender].some(t => t.url === track.url)) {
                return sock.sendMessage(chatId, {
                    text: msgWarn(`*Già in playlist!*\n\n🎼 _${track.title}_`)
                }, { quoted: m });
            }

            plDb[sender].push({
                url: track.url,
                title: track.title,
                duration: track.duration,
                addedAt: Date.now()
            });
            writeDb(plDb, playlistDbPath);

            return sock.sendMessage(chatId, {
                text: msgOk(
                    `*Aggiunto alla playlist!*\n\n` +
                    `🎼 _${track.title}_\n` +
                    `⏱️ ${track.duration || 'N/D'}\n\n` +
                    `📊 Brani totali: *${plDb[sender].length}*`
                )
            }, { quoted: m });
        }

        /* ══════════════════════════════════════════════
           ⑤ VISUALIZZA PLAYLIST (.playlist / .pl)
        ══════════════════════════════════════════════ */
        if (action === 'playlist' || action === 'pl') {
            const list = readDb(playlistDbPath)[sender] || [];

            if (!list.length) {
                return sock.sendMessage(chatId, {
                    text: msgError(
                        `*Playlist vuota*\n\n` +
                        `Aggiungi brani con il bottone\n*➕ Aggiungi a .PL* dopo una ricerca.`
                    )
                }, { quoted: m });
            }

            const items = list.slice(0, 30).map((t, i) => {
                const title = t.title.length > 42 ? t.title.slice(0, 39) + '...' : t.title;
                return `*${String(i + 1).padStart(2, '0')}.* ${title}\n     ⏱️ ${t.duration || 'N/D'}`;
            }).join('\n\n');

            const more = list.length > 30
                ? `\n\n_...e altri ${list.length - 30} brani_`
                : '';

            return sock.sendMessage(chatId, {
                text:
                    `${TITLE}\n\n` +
                    `🎧 *LA TUA PLAYLIST*\n\n` +
                    `${items}${more}\n\n` +
                    `${DIV}\n📊 *Totale:* ${list.length} brani`
            }, { quoted: m });
        }

        /* ══════════════════════════════════════════════
           ⑥ CANCELLA PLAYLIST (.clearpl)
        ══════════════════════════════════════════════ */
        if (action === 'clearpl') {
            const plDb = readDb(playlistDbPath);
            const count = plDb[sender]?.length || 0;

            if (!count) {
                return sock.sendMessage(chatId, {
                    text: msgError('La tua playlist è già vuota 🤷')
                }, { quoted: m });
            }

            delete plDb[sender];
            writeDb(plDb, playlistDbPath);

            return sock.sendMessage(chatId, {
                text: msgOk(`*Playlist svuotata*\n\n🗑️ Rimossi *${count}* brani.`)
            }, { quoted: m });
        }
    }
};
