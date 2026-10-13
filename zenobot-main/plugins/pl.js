const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yts = require('yt-search');

const playlistDbPath = path.join(__dirname, '../playlist_db.json');
global.plQueues = global.plQueues || {};

const readDb = (p) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
};
const writeDb = (p, data) => {
    try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { console.error('Errore scrittura DB:', e); }
};

const extractSpotifyTracksNoClient = async (url) => {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = await response.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (!titleMatch) return [];
        let title = titleMatch[1].replace(' - Spotify','').replace(' | Spotify','').replace('• Spotify','').trim();
        const isPlaylist = url.includes('playlist') || url.includes('album');
        if (isPlaylist) {
            const trackMatches = html.match(/<span class="track-name">(.*?)<\/span>/g) || html.match(/"name":"(.*?)"/g);
            if (trackMatches && trackMatches.length > 0) {
                const tracks = trackMatches.map(t => {
                    let name = t.replace(/<[^>]*>/g, '').replace(/"name":"/g, '').replace(/"$/g, '');
                    return { title: name };
                }).filter(t => t.title && t.title.length > 0);
                if (tracks.length > 0) return tracks;
            }
        }
        if (title) return [{ title: title }];
        return [];
    } catch (e) { console.error('Errore Spotify:', e.message); return []; }
};

function downloadAndConvert(trackUrl, timestamp) {
    return new Promise((resolve, reject) => {
        const inputMp3 = path.join(__dirname, `_temp_${timestamp}.mp3`);
        const outputOgg = path.join(__dirname, `_temp_${timestamp}.ogg`);
        const yt_command = `yt-dlp -x --audio-format mp3 --audio-quality 128k --no-part --extractor-args youtube:player-client=android,web -o "${inputMp3}" "${trackUrl}"`;
        exec(yt_command, (error) => {
            if (error || !fs.existsSync(inputMp3)) {
                if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
                return reject(new Error('Download fallito'));
            }
            const ffmpeg_command = `ffmpeg -y -i "${inputMp3}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1 -threads 0 -f ogg "${outputOgg}"`;
            exec(ffmpeg_command, (err2) => {
                if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
                if (err2 || !fs.existsSync(outputOgg)) {
                    if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                    return reject(new Error('Conversione fallita'));
                }
                resolve(outputOgg);
            });
        });
    });
}

async function mergePlaylist(sock, jid, sender, userTracks, m) {
    const sessionDir = path.join(__dirname, `_merge_${Date.now()}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    const finalM4a = path.join(__dirname, `playlist_${Date.now()}.m4a`);
    const listFile = path.join(sessionDir, 'list.txt');
    const metaFile = path.join(sessionDir, 'meta.txt');

    let statusMsg = await sock.sendMessage(jid, { text: `🎛️ *Fusione playlist avviata*\n\n📊 Brano 0/${userTracks.length}...` });
    let successFiles = [], successTitles = [], durations = [];

    for (let i = 0; i < userTracks.length; i++) {
        const track = userTracks[i];
        try {
            const oggFile = await downloadAndConvert(track.url, `${Date.now()}_${i}`);
            const destFile = path.join(sessionDir, `track_${String(i).padStart(3, '0')}.ogg`);
            fs.copyFileSync(oggFile, destFile);
            fs.unlinkSync(oggFile);
            const duration = await new Promise((resolve) => {
                exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${destFile}"`, (err, stdout) => {
                    if (err) return resolve(0);
                    resolve(parseFloat(stdout.trim()) || 0);
                });
            });
            successFiles.push(destFile);
            successTitles.push(track.title || `Brano ${i + 1}`);
            durations.push(duration);
            await sock.sendMessage(jid, {
                text: `🎛️ *Fusione playlist in corso...*\n\n📊 Brano ${i + 1}/${userTracks.length} ✅\n🎵 _${track.title?.substring(0, 50) || 'Sconosciuto'}_`,
                edit: statusMsg.key
            }).catch(() => {});
        } catch (e) {
            console.error(`Errore brano ${i + 1}:`, e.message);
            await sock.sendMessage(jid, {
                text: `🎛️ *Fusione in corso...*\n\n📊 Brano ${i + 1}/${userTracks.length} ⚠️ saltato\n🎵 _${track.title?.substring(0, 50) || 'Sconosciuto'}_`,
                edit: statusMsg.key
            }).catch(() => {});
        }
    }

    if (successFiles.length === 0) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        return await sock.sendMessage(jid, { text: '❌ Nessun brano è stato scaricato con successo. Riprova più tardi.' }, { quoted: m });
    }

    const listContent = successFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFile, listContent, 'utf8');
    let currentTime = 0;
    let metaContent = ';FFMETADATA1\ntitle=Playlist Zeno Bot\nartist=Zeno Bot\n\n';
    for (let i = 0; i < successFiles.length; i++) {
        const startMs = Math.floor(currentTime * 1000);
        const endMs = Math.floor((currentTime + durations[i]) * 1000);
        metaContent += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${startMs}\nEND=${endMs}\ntitle=${successTitles[i].replace(/[\n=;]/g, ' ')}\n\n`;
        currentTime += durations[i];
    }
    fs.writeFileSync(metaFile, metaContent, 'utf8');

    const mergeCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -i "${metaFile}" -map_metadata 1 -c:a aac -b:a 96k -ar 44100 -ac 2 -movflags +faststart "${finalM4a}"`;
    exec(mergeCmd, async (err) => {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        if (err || !fs.existsSync(finalM4a)) {
            if (fs.existsSync(finalM4a)) fs.unlinkSync(finalM4a);
            return await sock.sendMessage(jid, { text: '❌ Errore durante la fusione dei brani.' }, { quoted: m });
        }
        const stats = fs.statSync(finalM4a);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        try {
            const audioBuffer = fs.readFileSync(finalM4a);
            await sock.sendMessage(jid, {
                audio: audioBuffer, mimetype: 'audio/mp4', ptt: false,
                fileName: `Playlist_Zeno_${new Date().toISOString().slice(0,10)}.m4a`
            }, { quoted: m });
            await sock.sendMessage(jid, {
                text: `✅ *Playlist fusa con successo!*\n\n🎵 *${successFiles.length}* brani con capitoli\n📦 Dimensione: *${sizeMB} MB*\n\n💾 Salva il file e aprilo con VLC / Musicolet per vedere le tracce separate!`,
                edit: statusMsg.key
            }).catch(() => {});
        } catch (e) {
            console.error('Errore invio file:', e);
            await sock.sendMessage(jid, { text: '❌ Errore durante l\'invio del file.' }, { quoted: m });
        } finally {
            setTimeout(() => { if (fs.existsSync(finalM4a)) fs.unlinkSync(finalM4a); }, 10000);
        }
    });
}

async function processQueue(sock, jid, sender) {
    let queueData = global.plQueues[sender];
    if (!queueData || queueData.tracks.length === 0) {
        if (queueData) delete global.plQueues[sender];
        await sock.sendMessage(jid, { text: '✅ Playlist completata!' }).catch(() => {});
        return;
    }
    let track = queueData.tracks.shift();
    let timestamp = Date.now();
    let inputMp3 = path.join(__dirname, `_temp_pl_${timestamp}.mp3`);
    let outputOgg = path.join(__dirname, `vocale_pl_${timestamp}.ogg`);
    let yt_command = `yt-dlp -x --audio-format mp3 --audio-quality 128k --no-part --extractor-args youtube:player-client=android,web -o "${inputMp3}" "${track.url}"`;

    exec(yt_command, async (error) => {
        if (error) {
            if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
            return processQueue(sock, jid, sender);
        }
        let ffmpeg_command = `ffmpeg -y -i "${inputMp3}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1 -threads 0 -f ogg "${outputOgg}"`;
        exec(ffmpeg_command, async (err2) => {
            if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
            if (err2 || !fs.existsSync(outputOgg)) {
                if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                return processQueue(sock, jid, sender);
            }
            if (!global.plQueues[sender]) {
                if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                return;
            }
            try {
                let audioBuffer = fs.readFileSync(outputOgg);
                await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
            } catch (e) { console.error(e); }
            finally {
                if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                if (global.plQueues[sender]) processQueue(sock, jid, sender);
            }
        });
    });
}

async function playSingle(sock, jid, sender, track, m) {
    await sock.sendMessage(jid, { react: { text: '🎧', key: m.key } });
    let timestamp = Date.now();
    let inputMp3 = path.join(__dirname, `_temp_pl_${timestamp}.mp3`);
    let outputOgg = path.join(__dirname, `vocale_pl_${timestamp}.ogg`);
    let yt_command = `yt-dlp -x --audio-format mp3 --audio-quality 128k --no-part --extractor-args youtube:player-client=android,web -o "${inputMp3}" "${track.url}"`;
    exec(yt_command, async (error) => {
        if (error) {
            if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
            return await sock.sendMessage(jid, { text: '❌ Errore download.' }, { quoted: m });
        }
        let ffmpeg_command = `ffmpeg -y -i "${inputMp3}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1 -threads 0 -f ogg "${outputOgg}"`;
        exec(ffmpeg_command, async (err2) => {
            if (fs.existsSync(inputMp3)) fs.unlinkSync(inputMp3);
            if (err2 || !fs.existsSync(outputOgg)) {
                if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg);
                return await sock.sendMessage(jid, { text: '❌ Errore conversione.' }, { quoted: m });
            }
            try {
                let audioBuffer = fs.readFileSync(outputOgg);
                await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
            } catch (e) { console.error(e); }
            finally { setTimeout(() => { if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg); }, 5000); }
        });
    });
}

async function askDelete(sock, jid, sender, m) {
    const plDb = readDb(playlistDbPath);
    const userTracks = plDb[sender] || [];
    if (userTracks.length === 0) {
        return await sock.sendMessage(jid, { text: '❌ La tua playlist è vuota.' }, { quoted: m });
    }

    const rows = userTracks.slice(0, 25).map((t, i) => ({
        title: `🗑️ ${i + 1}. ${String(t.title || 'Sconosciuto').substring(0, 40)}`,
        description: 'Tocca per eliminare questo brano',
        id: `pl_del_${i}`
    }));

    return await sock.sendMessage(jid, {
        text: `🗑️ *ELIMINA UN BRANO*\n\nTocca il pulsante e scegli il brano da rimuovere.\n📀 Brani totali: ${userTracks.length}` + (userTracks.length > 10 ? '\n_Per gli altri usa_ `.pl del 12`' : ''),
        footer: 'Zeno Ultimate • Playlist',
        title: '🗑️ Elimina brano',
        buttonText: '🗑️ Scegli brano',
        sections: [{ title: 'I tuoi brani', rows: rows.slice(0, 10).map(r => ({ title: r.title, rowId: r.id, description: r.description })) }],
        mentions: [sender]
    }, { quoted: m });
}

const allCommands = ['pl', 'pl_add', 'pl_all', 'pl_stop', 'pl_merge', 'pl_fusion', 'pl_del', 'pl_clear', 'pl_askdel'];
for (let i = 0; i < 30; i++) {
    allCommands.push(`pl_select_${i}`);
    allCommands.push(`pl_del_${i}`);
}

module.exports = {
    commands: allCommands,
    run: async (sock, m, args, cmd) => {
        let jid = m.key.remoteJid;
        let sender = m.key.participant || m.participant || jid;

        let sub = '';
        let rest = '';
        if (cmd === 'pl') {
            sub = args[0] ? args[0].toLowerCase() : '';
            rest = args.slice(1).join(' ');
        } else {
            sub = cmd.replace(/^pl_/, '').toLowerCase();
            rest = args.join(' ');
        }

        if (/^del_\d+$/.test(sub)) {
            const idx = parseInt(sub.replace('del_', ''));
            const plDb = readDb(playlistDbPath);
            const userTracks = plDb[sender] || [];
            if (isNaN(idx) || idx < 0 || idx >= userTracks.length) {
                return await sock.sendMessage(jid, { text: '❌ Brano non trovato.' }, { quoted: m });
            }
            const removed = userTracks.splice(idx, 1);
            plDb[sender] = userTracks;
            writeDb(playlistDbPath, plDb);
            return await sock.sendMessage(jid, {
                text: `🗑️ *Brano rimosso:*\n_${removed[0].title || 'Sconosciuto'}_\n\n📀 Rimasti: *${userTracks.length}* brani`,
                mentions: [sender]
            }, { quoted: m });
        }

        if (sub === 'askdel') {
            return askDelete(sock, jid, sender, m);
        }

        if (sub === 'clear') {
            const plDb = readDb(playlistDbPath);
            if (!plDb[sender] || plDb[sender].length === 0) {
                return await sock.sendMessage(jid, { text: '❌ La tua playlist è già vuota.' }, { quoted: m });
            }
            const count = plDb[sender].length;
            plDb[sender] = [];
            writeDb(playlistDbPath, plDb);
            return await sock.sendMessage(jid, { text: `🗑️ Playlist svuotata! Rimossi *${count}* brani.` }, { quoted: m });
        }

        if (sub === 'merge' || sub === 'fusion') {
            let plDb = readDb(playlistDbPath);
            let userTracks = plDb[sender] || [];
            if (userTracks.length === 0)
                return await sock.sendMessage(jid, { text: '❌ La tua playlist è vuota. Aggiungi brani con `.pl add [link]`.' }, { quoted: m });
            return await mergePlaylist(sock, jid, sender, userTracks, m);
        }

        if (sub === 'stop') {
            if (global.plQueues[sender]) {
                delete global.plQueues[sender];
                return await sock.sendMessage(jid, { text: '⏹️ Riproduzione della playlist interrotta.' }, { quoted: m });
            }
            return await sock.sendMessage(jid, { text: '⚠️ Nessuna riproduzione in corso al momento.' }, { quoted: m });
        }

        if (sub === 'del') {
            let indexNum = parseInt(rest.trim()) - 1;
            let plDb = readDb(playlistDbPath);
            let userTracks = plDb[sender] || [];
            if (isNaN(indexNum) || indexNum < 0 || indexNum >= userTracks.length)
                return await sock.sendMessage(jid, { text: '❌ Specifica un numero valido da eliminare (Esempio: `.pl del 2`).' }, { quoted: m });
            let removed = userTracks.splice(indexNum, 1);
            plDb[sender] = userTracks;
            writeDb(playlistDbPath, plDb);
            return await sock.sendMessage(jid, { text: `🗑️ Brano rimosso:\n*${removed[0].title || 'Sconosciuto'}*` }, { quoted: m });
        }

        if (sub === 'add') {
            let link = rest.trim();
            if (!link.startsWith('http'))
                return await sock.sendMessage(jid, { text: '❌ Inserisci un link valido dopo `add` (Esempio: `.pl add [link]`).' }, { quoted: m });

            if (link.includes('spotify.com')) {
                await sock.sendMessage(jid, { text: '⏳ Analisi link Spotify in corso...' }, { quoted: m });
                const tracks = await extractSpotifyTracksNoClient(link);
                if (tracks.length === 0)
                    return await sock.sendMessage(jid, { text: '❌ Nessun brano trovato su Spotify.' }, { quoted: m });
                let plDb = readDb(playlistDbPath);
                plDb[sender] = plDb[sender] || [];
                let added = 0;
                for (let track of tracks) {
                    try {
                        const search = await yts(track.title);
                        if (search && search.videos && search.videos.length > 0) {
                            const video = search.videos[0];
                            plDb[sender].push({ title: video.title, url: video.url, duration: video.timestamp || '--:--' });
                            added++;
                        }
                    } catch (e) { console.error('Errore ricerca YouTube:', e); }
                }
                if (added === 0)
                    return await sock.sendMessage(jid, { text: '❌ Nessun brano trovato su YouTube per questi titoli.' }, { quoted: m });
                writeDb(playlistDbPath, plDb);
                return await sock.sendMessage(jid, { text: `✅ Aggiunti *${added}* brani da Spotify alla playlist!` }, { quoted: m });
            }

            let dumpCmd = `yt-dlp --flat-playlist --dump-json "${link}"`;
            exec(dumpCmd, { maxBuffer: 1024 * 1024 * 10 }, async (err, stdout) => {
                if (err)
                    return await sock.sendMessage(jid, { text: '❌ Errore durante la lettura del link.' }, { quoted: m });
                let lines = stdout.trim().split('\n');
                let addedTracks = [];
                let plDb = readDb(playlistDbPath);
                plDb[sender] = plDb[sender] || [];
                for (let line of lines) {
                    try {
                        let info = JSON.parse(line);
                        let trackUrl = info.url || (info.id ? `https://www.youtube.com/watch?v=${info.id}` : null);
                        let trackTitle = info.title || 'Brano importato';
                        if (trackUrl) {
                            if (!trackUrl.startsWith('http')) trackUrl = `https://www.youtube.com/watch?v=${info.id}`;
                            plDb[sender].push({ title: trackTitle, url: trackUrl });
                            addedTracks.push(trackTitle);
                        }
                    } catch (e) {}
                }
                if (addedTracks.length === 0)
                    return await sock.sendMessage(jid, { text: '❌ Nessun brano trovato in questo link.' }, { quoted: m });
                writeDb(playlistDbPath, plDb);
                return await sock.sendMessage(jid, { text: `✅ Aggiunti *${addedTracks.length}* brani alla playlist!\nUsa \`.pl\` per vederla o \`.pl all\` per ascoltarli.` }, { quoted: m });
            });
            return;
        }

        if (sub === 'all') {
            let plDb = readDb(playlistDbPath);
            let userTracks = plDb[sender] || [];
            if (userTracks.length === 0)
                return await sock.sendMessage(jid, { text: '❌ La tua playlist è vuota.' }, { quoted: m });
            if (global.plQueues[sender])
                return await sock.sendMessage(jid, { text: '⚠️ Coda già attiva! Usa `.pl stop` per fermarla.' }, { quoted: m });
            global.plQueues[sender] = { tracks: [...userTracks], currentIndex: 1, total: userTracks.length };
            await sock.sendMessage(jid, { text: `▶️ Avvio riproduzione continua di ${userTracks.length} brani!` }, { quoted: m });
            return processQueue(sock, jid, sender);
        }

        let playIdx = null;
        if (sub === 'play' && /^\d+$/.test(rest.trim())) playIdx = parseInt(rest.trim()) - 1;
        else if (sub.startsWith('select_')) playIdx = parseInt(sub.replace('select_', ''));

        if (playIdx !== null && !isNaN(playIdx)) {
            let plDb = readDb(playlistDbPath);
            let userTracks = plDb[sender] || [];
            let track = userTracks[playIdx];
            if (!track || !track.url)
                return await sock.sendMessage(jid, { text: '❌ Brano non trovato.' }, { quoted: m });
            return playSingle(sock, jid, sender, track, m);
        }

        // === MENU PLAYLIST ===
        let plDb = readDb(playlistDbPath);
        let userTracks = plDb[sender] || [];
        if (userTracks.length === 0)
            return await sock.sendMessage(jid, { text: '❌ La tua playlist (.pl) è vuota! Aggiungi un brano col bottone ➕ di `.song` oppure con `.pl add [link]`.' }, { quoted: m });

        let name = m.pushName || 'Utente';
        let total = userTracks.length;

        let rows = userTracks.slice(0, 20).map((t, i) => ({
            title: `${i + 1}. ${String(t.title || 'Sconosciuto').substring(0, 40)}`,
            description: t.duration ? `⏱️ ${t.duration} • tocca per ascoltare` : 'Tocca per ascoltare',
            id: `pl_select_${i}`
        }));

        rows.push({
            title: '🗑️ Elimina un brano...',
            description: 'Scegli quale brano rimuovere',
            id: 'pl_askdel'
        });
        rows.push({
            title: '❌ Svuota playlist',
            description: `Cancella tutti i ${total} brani`,
            id: 'pl_clear'
        });

        let selectBtn = {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: '📂 Apri playlist',
                sections: [
                    { title: 'Azioni', rows: [
                        { title: '▶️ Riproduci tutto', description: 'Tutti i brani in sequenza', id: 'pl_all' },
                        { title: '🎛️ Fondi playlist', description: 'Un unico file con tutte le tracce', id: 'pl_merge' },
                        { title: '⏹️ Stop', description: 'Ferma la riproduzione', id: 'pl_stop' }
                    ] },
                    { title: 'I tuoi brani', rows }
                ]
            })
        };

        let pfp;
        try { pfp = await sock.profilePictureUrl(sender, 'image'); }
        catch { pfp = 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg'; }

        try {
            const azioni = [
                { title: '▶️ Riproduci tutto', rowId: 'pl_all', description: 'Tutti i brani in sequenza' },
                { title: '🎛️ Fondi playlist', rowId: 'pl_merge', description: 'Un unico file con tutte le tracce' },
                { title: '⏹️ Stop', rowId: 'pl_stop', description: 'Ferma la riproduzione' }
            ];
            const brani = rows.slice(0, 7).map(r => ({ title: r.title, rowId: r.id, description: r.description }));
            let card = null;
            try {
                let thumb = null;
                try {
                    let u; try { u = await sock.profilePictureUrl(sender, 'image'); } catch { u = await sock.profilePictureUrl(sender, 'preview'); }
                    const r = await fetch(u);
                    const grande = Buffer.from(await r.arrayBuffer());
                    const piccola = await new Promise((resolve) => {
                        try {
                            const ff = require('child_process').spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=300:-1', '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', 'pipe:1']);
                            const out = [];
                            ff.stdout.on('data', d => out.push(d));
                            ff.on('close', () => resolve(Buffer.concat(out)));
                            ff.on('error', () => resolve(null));
                            ff.stdin.on('error', () => {});
                            ff.stdin.end(grande);
                        } catch { resolve(null); }
                    });
                    if (piccola && piccola.length > 500) thumb = piccola;
                    else {
                        const u2 = await sock.profilePictureUrl(sender, 'preview');
                        thumb = Buffer.from(await (await fetch(u2)).arrayBuffer());
                    }
                } catch {}
                const loc = { name: 'PLAYLIST' };
                if (thumb) loc.jpegThumbnail = thumb;
                card = { key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'Halo' }, message: { locationMessage: loc }, participant: '0@s.whatsapp.net' };
            } catch {}
            return await sock.sendMessage(jid, {
                text: `🎵 *PLAYLIST DI ${name.toUpperCase()}*\n📀 Brani salvati: *${total}*\n\nTocca il pulsante e scegli cosa fare.` + (total > 7 ? '\n_Per i brani dal numero 8 in poi usa_ `.pl play 8`' : ''),
                footer: 'Zeno Bot • Music Playlist',
                title: '🎵 Playlist',
                buttonText: '📂 Apri playlist',
                sections: [{ title: 'Azioni', rows: azioni }, { title: 'I tuoi brani', rows: brani }]
            }, { quoted: card || m });
        } catch (e) {
            console.log('pl: lista fallita, provo la card:', e.message);
        }

        try {
            return await sock.sendMessage(jid, {
                text: `🎵 *PLAYLIST DI ${name.toUpperCase()}*`,
                footer: 'Zeno Bot',
                cards: [{
                    image: { url: pfp },
                    title: `🎵 Playlist di ${name}`,
                    body: `Brani salvati: ${total}\nTocca "Apri playlist" per ascoltare, fondere o eliminare brani.`,
                    footer: 'Zeno Bot • Music Playlist',
                    buttons: [selectBtn]
                }],
                mentions: [sender]
            }, { quoted: m });
        } catch (e) {
            console.error('Errore card playlist, uso i bottoni:', e);
            let buttons = [
                { buttonId: 'pl_all', buttonText: { displayText: '▶️ Riproduci tutto' }, type: 1 },
                { buttonId: 'pl_merge', buttonText: { displayText: '🎛️ Fondi playlist' }, type: 1 },
                { buttonId: 'pl_askdel', buttonText: { displayText: '🗑️ Elimina brano' }, type: 1 }
            ];
            return await sock.sendMessage(jid, { image: { url: pfp }, caption: `🎵 *PLAYLIST DI ${name.toUpperCase()}*\n📀 Brani: ${total}`, footer: '⚡ Zeno Bot • Music Playlist', buttons, headerType: 4 }, { quoted: m });
        }
    }
};
