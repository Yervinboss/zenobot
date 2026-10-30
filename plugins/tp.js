'use strict'

// ═══════════════════════════════════════════════════════════════════════════
//  🎧  TP PLAYER v4 — formato LIST CLASSICO (title + sections)
// ═══════════════════════════════════════════════════════════════════════════

const yts = require('yt-search')
const { exec } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const PREFIX = global.ZENO?.CONFIG?.prefix || '.'

const pendingLyrics  = {}
global.tpChoice      = global.tpChoice    || {}
global.tpSelection   = global.tpSelection || {}

const execPromise = (cmd) => new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
    })
})

const short = (s, n = 55) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s)

module.exports = {
    commands: ['tp', 'tp_select', 'tp_audio', 'tp_video'],
    cooldown: 2000,

    async run(sock, m, args, cmd) {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || chatId
        const text   = args.join(' ').trim()

        // ═════════════════════════════════════════════════════════════════
        //  .tp <query>
        // ═════════════════════════════════════════════════════════════════
        if (cmd === 'tp') {
            if (!text) return sock.sendMessage(chatId, { text: '🎧 Scrivi il titolo!' }, { quoted: m })

            let search
            try { search = await yts(text) }
            catch { return sock.sendMessage(chatId, { text: '❌ Errore nella ricerca' }, { quoted: m }) }

            const results = (search.videos || []).slice(0, 5)
            if (!results.length) return sock.sendMessage(chatId, { text: '❌ Nessun risultato' }, { quoted: m })

            global.tpSelection[sender] = results

            const rows = results.map((v, i) => ({
                title: `${i + 1}. ${short(v.title, 50)}`,
                description: `⏱️ ${v.timestamp || '—'} • 📺 ${short(v.author?.name || '—', 30)} • 👁️ ${v.views?.toLocaleString() || '—'}`,
                rowId: `${PREFIX}tp_select ${i + 1}`
            }))

            // ── FORMATO LIST CLASSICO (funziona su 99% dei fork)
            try {
                await sock.sendMessage(chatId, {
                    text: `🔎 *TOP ${results.length}*\n_${text}_\n\n👇 Apri il menu e scegli il brano`,
                    footer: 'TP BOT',
                    title: '🎵 Risultati',
                    buttonText: '📂 Apri menu',
                    sections: [{
                        title: '🎵 Brani trovati',
                        rows
                    }]
                }, { quoted: m })
                console.log('[TP] listMessage inviato per', sender)
                return
            } catch (e) {
                console.log('[TP] listMessage KO:', e.message)
            }

            // ── Fallback testuale
            const list = results
                .map((v, i) => `*${i + 1}.* ${short(v.title, 60)}\n   ⏱️ ${v.timestamp || '—'} • 📺 ${short(v.author?.name || '—', 30)}`)
                .join('\n\n')
            await sock.sendMessage(chatId, {
                text: `🔎 *Risultati per* "${text}"\n\n${list}\n\n👉 Scrivi *${PREFIX}tp_select <numero>*`
            }, { quoted: m })
            return
        }

        // ═════════════════════════════════════════════════════════════════
        //  .tp_select <n>
        // ═════════════════════════════════════════════════════════════════
        if (cmd === 'tp_select') {
            const index = Number((args[0] || '').trim())
            const results = global.tpSelection[sender]

            if (!results?.length)
                return sock.sendMessage(chatId, { text: '❌ Nessuna selezione attiva' }, { quoted: m })

            if (!Number.isInteger(index) || index < 1 || index > results.length)
                return sock.sendMessage(chatId, { text: `❌ Numero non valido (1-${results.length})` }, { quoted: m })

            const video = results[index - 1]
            global.tpChoice[sender] = video
            delete global.tpSelection[sender]

            const caption =
                `🎶 *${short(video.title, 80)}*\n\n` +
                `📺 Canale: ${video.author?.name || 'Sconosciuto'}\n` +
                `⏱️ Durata: ${video.timestamp || '—'}\n` +
                `👁️ Ascolti: ${video.views?.toLocaleString() || '—'}`

            // ── LIST formato scelta formato
            try {
                await sock.sendMessage(chatId, {
                    text: caption,
                    footer: 'TP BOT',
                    title: '🎬 Scegli formato',
                    buttonText: '📂 Scegli',
                    sections: [{
                        title: '🎬 Formato',
                        rows: [
                            {
                                title: '🎧 Audio (MP3)',
                                description: 'Leggero, veloce',
                                rowId: `${PREFIX}tp_audio`
                            },
                            {
                                title: '🎥 Video (MP4 480p)',
                                description: 'Max 8 minuti, 64MB',
                                rowId: `${PREFIX}tp_video`
                            }
                        ]
                    }]
                }, { quoted: m })
                return
            } catch (e) {
                console.log('[TP] list format KO:', e.message)
            }

            // ── Fallback: bottoni
            try {
                await sock.sendMessage(chatId, {
                    text: caption + `\n\n🎧 Audio\n🎥 Video`,
                    footer: 'TP BOT',
                    buttons: [
                        { buttonId: `${PREFIX}tp_audio`, buttonText: { displayText: '🎧 Audio' }, type: 1 },
                        { buttonId: `${PREFIX}tp_video`, buttonText: { displayText: '🎥 Video' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m })
                return
            } catch (e) {
                console.log('[TP] buttons KO:', e.message)
            }

            // ── Fallback testo
            await sock.sendMessage(chatId, {
                text: `${caption}\n\nRispondi con:\n• *${PREFIX}tp_audio*\n• *${PREFIX}tp_video*`
            }, { quoted: m })
            return
        }

        // ═════════════════════════════════════════════════════════════════
        //  .tp_audio / .tp_video
        // ═════════════════════════════════════════════════════════════════
        const video = global.tpChoice[sender]
        if (!video)
            return sock.sendMessage(chatId, { text: '❌ Nessuna richiesta attiva. Usa `.tp <titolo>`' }, { quoted: m })

        if (cmd === 'tp_audio') {
            await sock.sendMessage(chatId, {
                text: `ℹ️ *${short(video.title, 80)}*\n\n⌛️ Scarico l'audio...\n> TP BOT downloader`
            }, { quoted: m })

            const file = path.join(os.tmpdir(), `tp_${Date.now()}.mp3`)

            exec(`yt-dlp -x --audio-format mp3 -o "${file}" "${video.url}"`, async (err) => {
                if (err) return sock.sendMessage(chatId, { text: '❌ Errore download audio' }, { quoted: m }).catch(() => {})

                try {
                    await sock.sendMessage(chatId, {
                        audio: fs.readFileSync(file),
                        mimetype: 'audio/mpeg',
                        ptt: false
                    }, { quoted: m })
                } catch (e) {
                    await sock.sendMessage(chatId, { text: `❌ Invio fallito: ${e.message}` }, { quoted: m }).catch(() => {})
                }

                try { fs.unlinkSync(file) } catch {}

                global.tpLyricsRequest = global.tpLyricsRequest || {}
                global.tpLyricsRequest[sender] = video.title

                if (pendingLyrics[sender]) clearTimeout(pendingLyrics[sender])
                pendingLyrics[sender] = setTimeout(() => {
                    delete pendingLyrics[sender]
                    delete global.tpLyricsRequest[sender]
                }, 15000)

                try {
                    await sock.sendMessage(chatId, {
                        text: `📜 Vuoi il testo di questa canzone?\n\n*${short(video.title, 80)}*`,
                        footer: 'TP BOT',
                        buttons: [
                            { buttonId: `${PREFIX}lyrics_yes`, buttonText: { displayText: '✅ Sì' }, type: 1 }
                        ],
                        headerType: 1
                    }, { quoted: m })
                } catch {
                    await sock.sendMessage(chatId, {
                        text: `📜 Vuoi il testo?\nScrivi *${PREFIX}lyrics* entro 15s`
                    }, { quoted: m })
                }

                delete global.tpChoice[sender]
            })
            return
        }

        if (cmd === 'tp_video') {
            if ((video.seconds || 0) > 480)
                return sock.sendMessage(chatId, { text: '❌ Max 8 minuti' }, { quoted: m })

            await sock.sendMessage(chatId, {
                text: `🎬 Scarico video...\n> TP BOT downloader`
            }, { quoted: m })

            const ts  = Date.now()
            const raw = path.join(os.tmpdir(), `tp_raw_${ts}.mp4`)
            const out = path.join(os.tmpdir(), `tp_out_${ts}.mp4`)

            try {
                await execPromise(
                    `yt-dlp --no-playlist ` +
                    `-f "bestvideo[vcodec^=avc1][height<=480]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][height<=480]/best[height<=480]" ` +
                    `--merge-output-format mp4 --ffmpeg-location /usr/bin/ffmpeg ` +
                    `--no-part --retries 3 ` +
                    `-o "${raw}" "${video.url}"`
                )

                await execPromise(
                    `/usr/bin/ffmpeg -y -i "${raw}" ` +
                    `-c:v libx264 -preset ultrafast -crf 30 ` +
                    `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ` +
                    `-c:a aac -b:a 96k -movflags +faststart "${out}"`
                )

                try { fs.unlinkSync(raw) } catch {}

                const sizeMB = fs.statSync(out).size / (1024 * 1024)
                if (sizeMB > 64) {
                    try { fs.unlinkSync(out) } catch {}
                    return sock.sendMessage(chatId, { text: '❌ Video troppo pesante (>64MB)' }, { quoted: m })
                }

                await sock.sendMessage(chatId, {
                    video: fs.readFileSync(out),
                    mimetype: 'video/mp4',
                    caption: `🎬 ${short(video.title, 80)}`
                }, { quoted: m })

                try { fs.unlinkSync(out) } catch {}
                delete global.tpChoice[sender]

            } catch (e) {
                try { fs.existsSync(raw) && fs.unlinkSync(raw) } catch {}
                try { fs.existsSync(out) && fs.unlinkSync(out) } catch {}
                await sock.sendMessage(chatId, { text: `❌ Errore video: ${e.message}` }, { quoted: m })
            }
        }
    }
}
