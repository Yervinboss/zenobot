const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yts = require('yt-search');

const dbPath = path.join(__dirname, '../zenomusic_db.json');
const playlistDbPath = path.join(__dirname, '../playlist_db.json');

const readDb = (p = dbPath) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
};
const writeDb = (data, p = dbPath) => {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
};

module.exports = {
    commands: ['song', 'play', 'sendnormal', 'sendvideo', 'addplaylist'],
    run: async (sock, m) => {
        let chatId = m.key.remoteJid;
        let sender = m.key.participant || m.participant || chatId;

        let text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        
        let buttonId = 
            m.message?.buttonsResponseMessage?.selectedButtonId ||
            m.message?.templateButtonReplyMessage?.selectedId ||
            m.msg?.selectedButtonId || '';

        let action = '';
        let query = '';

        if (buttonId) {
            action = buttonId.trim().toLowerCase();
        } else if (text.startsWith('.')) {
            let parts = text.slice(1).trim().split(/ +/);
            action = parts[0].toLowerCase();
            query = parts.slice(1).join(' ');
        } else {
            query = text.trim();
            if (query === 'sendnormal' || query === 'sendvideo' || query === 'addplaylist') {
                action = query;
                query = '';
            } else {
                action = 'song';
            }
        }

        console.log(`[DEBUG SONG FIXED] Azione: "${action}" | Query: "${query}" | ButtonId: "${buttonId}"`);

        // 1. COMANDO DI RICERCA (.song o .play)
        if (action === 'song' || action === 'play') {
            if (!query) {
                return sock.sendMessage(chatId, { text: '❌ Inserisci il titolo della canzone! (Esempio: `.song bistia 18K`)' }, { quoted: m });
            }
            await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

            let search = await yts(query);
            if (!search || search.videos.length === 0) {
                return sock.sendMessage(chatId, { text: `❌ Nessun risultato trovato per: "${query}"` }, { quoted: m });
            }

            let vid = search.videos[0];
            let txt = `🎶 *ZENO MUSIC* 🎶\n\n` +
                      `📌 *Titolo:* ${vid.title}\n` +
                      `⏱ *Durata:* ${vid.timestamp}\n` +
                      `👁️ *Visualizzazioni:* ${vid.views}\n`;

            let db = readDb(dbPath);
            // MODIFICATO: usa 'sender' invece di 'chatId' per non sovrascrivere le canzoni negli altri
            db[sender] = { url: vid.url, title: vid.title, duration: vid.timestamp };
            writeDb(db, dbPath);

            let thumbPath = path.join(__dirname, `thumb_${Date.now()}.jpg`);
            try {
                let response = await fetch(vid.thumbnail);
                let buffer = Buffer.from(await response.arrayBuffer());
                fs.writeFileSync(thumbPath, buffer);

                let buttons = [
                    { buttonId: 'sendnormal', buttonText: { displayText: '🎵 Audio Normale' }, type: 1 },
                    { buttonId: 'sendvideo', buttonText: { displayText: '🎬 Video MP4' }, type: 1 },
                    { buttonId: 'addplaylist', buttonText: { displayText: '➕ Aggiungi a .PL' }, type: 1 }
                ];

                let buttonMessage = {
                    image: fs.readFileSync(thumbPath),
                    caption: txt,
                    footer: '⚡ Zeno Bot - Music Player',
                    buttons: buttons,
                    headerType: 4
                };

                let sentMsg = await sock.sendMessage(chatId, buttonMessage, { quoted: m });
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
                return sentMsg;

            } catch (e) {
                console.error(e);
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
                return;
            }
        }

        await sock.sendMessage(chatId, { react: { text: '🔥', key: m.key } });

        // 2. DOWNLOAD AUDIO COME VOCALE VERDE (PTT)
        if (action === 'sendnormal' || query === 'sendnormal') {
            let db = readDb(dbPath);
            // MODIFICATO: usa 'sender'
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return await sock.sendMessage(chatId, { text: '❌ Errore: Cerca prima il brano con `.song`.' }, { quoted: m });

            await sock.sendMessage(chatId, { react: { text: '🎧', key: m.key } });

            let inputMp3 = path.join(__dirname, `_temp_${Date.now()}.mp3`);
            let outputOgg = path.join(__dirname, `vocale_${Date.now()}.ogg`);

            let yt_command = `yt-dlp -x --audio-format mp3 --audio-quality 192k --extractor-args youtube:player-client=android,web -o "${inputMp3}" "${videourl}"`;
            
            exec(yt_command, async (error, stdout, stderr) => {
                if (error) {
                    console.error('Errore yt-dlp:', stderr);
                    return await sock.sendMessage(chatId, { text: '❌ Errore durante il download.' }, { quoted: m });
                }

                let ffmpeg_command = `ffmpeg -i "${inputMp3}" -c:a libopus -b:a 128k -ar 48000 -ac 1 -f ogg "${outputOgg}"`;
                
                exec(ffmpeg_command, async (err2, stdout2, stderr2) => {
                    if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);

                    if (err2) {
                        console.error('Errore conversione ffmpeg:', stderr2);
                        return await sock.sendMessage(chatId, { text: '❌ Errore nella conversione del vocale.' }, { quoted: m });
                    }

                    if (fs.existsSync(outputOgg)) {
                        try {
                            let audioBuffer = fs.readFileSync(outputOgg);
                            await sock.sendMessage(chatId, {
                                audio: audioBuffer,
                                mimetype: 'audio/ogg; codecs=opus',
                                ptt: true
                            }, { quoted: m });

                            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
                        } catch (err) {
                            console.error('Errore durante invio audio:', err);
                        } finally {
                            setTimeout(() => {
                                if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                            }, 5000);
                        }
                    } else {
                        return await sock.sendMessage(chatId, { text: '❌ File vocale non generato.' }, { quoted: m });
                    }
                });
            });
            return;
        }

        // 3. AGGIUNGI ALLA PLAYLIST (.PL)
        if (action === 'addplaylist' || query === 'addplaylist') {
            let db = readDb(dbPath);
            // MODIFICATO: usa 'sender'
            let track = db[sender];
            if (!track || !track.url) {
                return await sock.sendMessage(chatId, { text: '❌ Errore: Nessun brano recente da aggiungere. Cerca prima con `.song`.' }, { quoted: m });
            }

            let plDb = readDb(playlistDbPath);
            if (!plDb[sender]) plDb[sender] = [];

            let exists = plDb[sender].some(t => t.url === track.url);
            if (exists) {
                return await sock.sendMessage(chatId, { text: `⚠️ Questo brano è *già presente* nella tua playlist (.PL)!` }, { quoted: m });
            }

            plDb[sender].push(track);
            writeDb(plDb, playlistDbPath);

            return await sock.sendMessage(chatId, { text: `✅ Brano aggiunto con successo alla tua playlist (.PL)!\n📌 *${track.title}*` }, { quoted: m });
        }

        // 4. DOWNLOAD VIDEO MP4
        if (action === 'sendvideo' || query === 'sendvideo') {
            let db = readDb(dbPath);
            // MODIFICATO: usa 'sender'
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return await sock.sendMessage(chatId, { text: '❌ Errore: Cerca prima il brano con `.song`.' }, { quoted: m });

            await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

            let outputPath = path.join(__dirname, `video_${Date.now()}.mp4`);
            let ytdlpVideoCommand = `yt-dlp -f "best[ext=mp4]/best" --extractor-args youtube:player-client=android,web -o "${outputPath}" "${videourl}"`;

            exec(ytdlpVideoCommand, async (error, stdout, stderr) => {
                if (error) {
                    console.error('Errore yt-dlp video:', stderr);
                    return await sock.sendMessage(chatId, { text: '❌ Errore durante il download del video.' }, { quoted: m });
                }

                if (fs.existsSync(outputPath)) {
                    try {
                        await sock.sendMessage(chatId, {
                            video: fs.readFileSync(outputPath),
                            caption: '🎬 Ecco il tuo video!',
                            mimetype: 'video/mp4'
                        }, { quoted: m });

                        await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        console.error(err);
                    } finally {
                        setTimeout(() => {
                            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        }, 5000);
                    }
                } else {
                    return await sock.sendMessage(chatId, { text: '❌ Il file video non è stato generato.' }, { quoted: m });
                }
            });
            return;
        }
    }
};
