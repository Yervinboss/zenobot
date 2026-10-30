const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const util = require('util');
const yts = require('yt-search');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { sendButtons } = require('../lib/utils');

const run = util.promisify(execFile);

const playlistDbPath = path.join(__dirname, '../playlist_db.json');
const shazamDbPath = path.join(__dirname, '../shazam_music_db.json');
const tmpDir = path.join(__dirname, '..', 'tmp_shazam');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// 🎧 Lazy init di shazamio-api (è ESM)
let shazamInstance = null;
async function getShazam() {
    if (shazamInstance) return shazamInstance;
    try {
        const mod = await import('shazamio-api');
        shazamInstance = mod.default || mod;
        console.log('✅ shazamio-api caricato (recognize:', typeof shazamInstance.recognize + ')');
        return shazamInstance;
    } catch (e) {
        console.error('❌ shazamio-api errore:', e.message);
        return null;
    }
}

function readDb(p) {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}
function writeDb(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8'); }

async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

module.exports = {
    commands: ['shazam', 'shazam_play', 'shazam_add_pl'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.participant || jid;

        // === Aggiungi a playlist ===
        if (cmd === 'shazam_add_pl') {
            const musicDb = readDb(shazamDbPath);
            const track = musicDb[jid];
            const url = typeof track === 'object' ? track.url : track;
            const title = typeof track === 'object' ? track.title : 'Brano da Shazam';
            const duration = typeof track === 'object' ? track.duration : '--:--';
            if (!url) return await sock.sendMessage(jid, { text: '❌ Traccia scaduta. Rifai `.shazam`.' }, { quoted: m });

            const plDb = readDb(playlistDbPath);
            if (!plDb[sender]) plDb[sender] = [];
            if (plDb[sender].some(t => t.url === url))
                return await sock.sendMessage(jid, { text: '⚠️ Già presente nella playlist!' }, { quoted: m });

            plDb[sender].push({ title, url, duration });
            writeDb(playlistDbPath, plDb);
            return await sock.sendMessage(jid, { text: `✅ Aggiunto a .pl!\n🎵 *${title}*` }, { quoted: m });
        }

        // === Riproduci ===
        if (cmd === 'shazam_play') {
            const musicDb = readDb(shazamDbPath);
            const track = musicDb[jid];
            const url = typeof track === 'object' ? track.url : track;
            if (!url) return await sock.sendMessage(jid, { text: '❌ Traccia scaduta. Rifai `.shazam`.' }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '🎧', key: m.key } });

            const inputMp3 = path.join(tmpDir, `_shazam_${Date.now()}.mp3`);
            const outputOgg = path.join(tmpDir, `shazam_${Date.now()}.ogg`);

            exec(`yt-dlp -x --audio-format mp3 --audio-quality 0 --extractor-args youtube:player-client=android,web -o "${inputMp3}" "${url}"`, (err) => {
                if (err) return sock.sendMessage(jid, { text: '❌ Errore download.' }, { quoted: m });
                exec(`ffmpeg -y -i "${inputMp3}" -c:a libopus -b:a 192k -ar 48000 -ac 1 -application voip -map_metadata -1 -f ogg "${outputOgg}"`, async (err2) => {
                    if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
                    if (err2 || !fs.existsSync(outputOgg))
                        return await sock.sendMessage(jid, { text: '❌ Errore conversione.' }, { quoted: m });

                    try {
                        const buf = fs.readFileSync(outputOgg);
                        await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                    } finally {
                        setTimeout(() => { if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg); }, 5000);
                    }
                });
            });
            return;
        }

        // === Shazam principale ===
        if (cmd === 'shazam') {
            const shazam = await getShazam();
            if (!shazam || typeof shazam.recognize !== 'function')
                return await sock.sendMessage(jid, { text: '❌ shazamio-api non disponibile. Esegui: `npm install shazamio-api`' }, { quoted: m });

            const msg = m.message || {};
            const ctx = msg.extendedTextMessage?.contextInfo || msg.audioMessage?.contextInfo || msg.videoMessage?.contextInfo || {};
            let quoted = ctx.quotedMessage;
            if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
            else if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;

            const audioMsg = quoted?.audioMessage || msg.audioMessage;
            const videoMsg = quoted?.videoMessage || msg.videoMessage;
            if (!audioMsg && !videoMsg)
                return await sock.sendMessage(jid, { text: '🎧 *ZENO SHAZAM*\n\n❌ Rispondi a un vocale/audio/video con `.shazam`!' }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '🔎', key: m.key } });

            const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const tmpIn = path.join(tmpDir, `sh_in_${id}`);
            const tmpMp3 = path.join(tmpDir, `sh_clip_${id}.mp3`);

            try {
                let buffer;
                if (audioMsg) {
                    buffer = await downloadMedia(audioMsg, 'audio');
                    fs.writeFileSync(tmpIn + '.ogg', buffer);
                } else {
                    buffer = await downloadMedia(videoMsg, 'video');
                    fs.writeFileSync(tmpIn + '.mp4', buffer);
                }

                // ffmpeg args come nel tuo Discord
                const inputFile = audioMsg ? tmpIn + '.ogg' : tmpIn + '.mp4';
                const ffArgs = ['-y', '-i', inputFile, '-t', '15', '-ar', '44100', '-ac', '1'];
                if (videoMsg) ffArgs.push('-vn');
                ffArgs.push(tmpMp3);

                await run('ffmpeg', ffArgs, { timeout: 60 * 1000 });
                if (!fs.existsSync(tmpMp3)) throw new Error('Estrazione audio fallita');

                // 🎧 Riconoscimento
                const result = await shazam.recognize(tmpMp3);
                const track = result?.track;

                if (!track || !track.title) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return await sock.sendMessage(jid, { text: '❌ Non ho riconosciuto la canzone.' }, { quoted: m });
                }

                const title = track.title || 'Sconosciuto';
                const artist = track.subtitle || 'Sconosciuto';
                const album = track.sections?.find(s => s.metadata)?.metadata?.find(md => md.title === 'Album')?.text;

                let txt = `🎧 *ZENO SHAZAM*\n\n🎵 *${title}*\n🎤 *${artist}*\n`;
                if (album) txt += `💿 *${album}*\n`;
                await sock.sendMessage(jid, { react: { text: '🎵', key: m.key } });

                try {
                    const search = await yts(`${artist} ${title}`);
                    const v = search?.videos?.[0];
                    if (v) {
                        const musicDb = readDb(shazamDbPath);
                        musicDb[jid] = { url: v.url, title: `${artist} - ${title}`, duration: v.timestamp || '--:--' };
                        writeDb(shazamDbPath, musicDb);

                        return await sendButtons(
                            sock, jid, txt, 'Zeno Bot - Shazam',
                            [
                                { text: '🎧 Riproduci', id: 'shazam_play' },
                                { text: '➕ Aggiungi a PL', id: 'shazam_add_pl' }
                            ],
                            m
                        );
                    }
                } catch (e) { console.error('yt-search:', e.message); }

                return await sock.sendMessage(jid, { text: txt }, { quoted: m });

            } catch (e) {
                console.error('[SHAZAM]', e.message);
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return await sock.sendMessage(jid, { text: '❌ Errore riconoscimento.' }, { quoted: m });
            } finally {
                for (const ext of ['.ogg', '.mp4']) {
                    const f = tmpIn + ext;
                    if (fs.existsSync(f)) fs.unlinkSync(f);
                }
                if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3);
            }
        }
    }
};
