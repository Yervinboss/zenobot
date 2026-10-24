'use strict'

// Plugin by Zeno, Lucifero & zenobot staff
// Adattato a ZENO ULTIMATE
//
//  • .tp <titolo>   → carosello con 5 risultati (scegli con "Seleziona N")
//  • dopo la scelta   → 🎧 audio · 🎥 video · 🎵 metti in coda (playlist .pl)
//  • dopo l'audio     → "Vuoi il testo?" con pulsante (15 secondi)
//  Richiede: yt-dlp, ffmpeg, yt-search

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const yts = require('yt-search')

global.tpChoice = global.tpChoice || {}
global.tpSelection = global.tpSelection || {}
global.tpLyrics = global.tpLyrics || {}
const pendingLyrics = {}
const busy = new Set()

const TMP = path.join(os.tmpdir(), 'zeno-play')
try { fs.mkdirSync(TMP, { recursive: true }) } catch {}

const playlistDbPath = path.join(__dirname, '../playlist_db.json')
const YT_OPTS = ['--js-runtimes', 'node', '--no-playlist']
const VIDEO_FORMAT = 'bestvideo[vcodec^=avc1][height<=480]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][height<=480]/best[height<=480]'
const MAX_VIDEO_SEC = 480      // max 8 minuti
const MAX_VIDEO_MB = 64

const getThumbnail = (video) => video?.thumbnail || video?.image || video?.images?.[0] || 'icone/zenobot.jpg'
const safeName = (s) => String(s || 'audio').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'audio'

// ── utilità file / processi ──
const sh = (cmd, args, timeout = 300000) => new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (e, so, se) => {
        if (e) { e.stderr = se; return reject(e) }
        resolve(so)
    })
})
const rmSafe = (f) => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f) } catch {} }
const findOut = (base) => {
    try {
        const n = fs.readdirSync(TMP).find(x => x.startsWith(base + '.'))
        return n ? path.join(TMP, n) : null
    } catch { return null }
}
const cleanBase = (base) => {
    try { fs.readdirSync(TMP).filter(x => x.startsWith(base)).forEach(x => rmSafe(path.join(TMP, x))) } catch {}
}
const readJson = (p) => {
    if (!fs.existsSync(p)) return {}
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {} } catch { return {} }
}
const writeJson = (p, data) => {
    const tmp = p + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, p)
}
const errTail = (e) => String((e && e.stderr) || (e && e.message) || '').trim().slice(-200)

// ── testi (lrclib.net, database pubblico) ──
const cleanTitle = (t) => String(t || '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/official\s*(music\s*)?(video|audio)|video ufficiale|lyrics?|testo|\bhd\b|\b4k\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()

async function getLyrics(q) {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'ZenoBot/4.5 (WhatsApp bot)' },
        signal: AbortSignal.timeout(9000)
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const list = await res.json()
    return (Array.isArray(list) ? list : [])
        .find(x => x && !x.instrumental && x.plainLyrics && x.plainLyrics.trim().length > 20) || null
}

function splitLyrics(text, size = 3000) {
    const paras = text.replace(/\r/g, '').trim().split(/\n{2,}/)
    const chunks = []
    let cur = ''
    for (const p of paras) {
        if (cur && (cur + '\n\n' + p).length > size) { chunks.push(cur); cur = p }
        else cur = cur ? cur + '\n\n' + p : p
    }
    if (cur) chunks.push(cur)
    return chunks.flatMap(c => c.length > 3800 ? c.match(/[\s\S]{1,3800}/g) : [c])
}

// ".tp_select 3" → { action: 'tp_select', rest: '3' }
const parseId = (id) => {
    const t = String(id || '').trim().replace(/^[^a-z0-9_]+/i, '')
    const [a, ...r] = t.split(/\s+/)
    return { action: (a || '').toLowerCase(), rest: r.join(' ') }
}

module.exports = {
    name: 'tp',
    commands: ['tp', 'tp_select', 'tp_audio', 'tp_video', 'tp_queue', 'tp_lyrics'],
    category: 'musica',
    description: 'Cerca una canzone, scegli tra 5 risultati e scarica audio o video',
    usage: '<titolo>',
    author: 'Zeno, Lucifero & zenobot staff',

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.participant || chatId
        const P = (ctx && ctx.prefix) || '.'

        const reply = (c) => (ctx && typeof ctx.reply === 'function')
            ? ctx.reply(c)
            : sock.sendMessage(chatId, typeof c === 'string' ? { text: c } : c, { quoted: m })
        const react = (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: m.key } }).catch(() => {})

        // ── quale azione? (comando scritto, oppure pulsante/carosello premuto) ──
        let btn = m.message?.buttonsResponseMessage?.selectedButtonId ||
            m.message?.templateButtonReplyMessage?.selectedId || ''
        try {
            const pj = m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
            if (!btn && pj) btn = JSON.parse(pj).id || ''
        } catch {}

        let action, text
        if (btn) {
            const p = parseId(btn)
            action = p.action
            text = p.rest
        } else {
            action = String(cmd || 'tp').toLowerCase().replace(/^[^a-z0-9_]+/, '')
            text = Array.isArray(args) ? args.join(' ').trim() : ''
        }

        // ═════════════ .tp <titolo> → carosello ═════════════
        if (action === 'tp') {
            if (!text) return reply('🎧 ꜱᴄʀɪᴠɪ ɪʟ ᴛɪᴛᴏʟᴏ!')
            await react('🔎')

            let search
            try { search = await yts(text) } catch (e) {
                console.error('[tp] ricerca:', e && e.message)
                return reply('✖️ Ricerca non riuscita, riprova tra poco.')
            }
            const results = ((search && search.videos) || []).slice(0, 5)
            if (!results.length) return reply('✖️ Nessun risultato')

            global.tpSelection[sender] = results

            const titleOf = (video) => `🎵 ${video.title.substring(0, 60)}${video.title.length > 60 ? '…' : ''}`
            const infoOf = (video) => `📺 ${video.author?.name || 'Sconosciuto'}\n⏱️ ${video.timestamp || '—'}\n👁️ ${video.views?.toLocaleString('it-IT') || '—'}`
            const intro = `🔎 ᴛʀᴏᴠᴀᴛɪ ${results.length} ʀɪꜱᴜʟᴛᴀᴛɪ per "*${text}*".\n\nScrolla e scegli la canzone adatta alla tua richiesta.`

            let lastErr = null
            // carosello del core: sceglie da solo il formato giusto per Android e iPhone
            if (ctx && typeof ctx.sendCards === 'function') {
                try {
                    return await ctx.sendCards({
                        text: intro,
                        footer: 'ZENOBOT',
                        title: 'ZENOBOT',
                        cards: results.map((video, index) => ({
                            title: titleOf(video),
                            body: infoOf(video),
                            image: getThumbnail(video),
                            footer: 'ZENOBOT',
                            buttons: [{ text: `🎧 Seleziona ${index + 1}`, id: `tp_select ${index + 1}` }]
                        }))
                    })
                } catch (e) {
                    lastErr = e
                    console.error('[tp] carosello:', e && e.message)
                }
            }

            // ultima spiaggia: lista di testo (all'owner mostro anche l'errore)
            const lines = results.map((v, i) => `*${i + 1}.* ${v.title}\n     📺 ${v.author?.name || 'Sconosciuto'} • ⏱️ ${v.timestamp || '—'}`)
            let out = `🔎 Risultati per "*${text}*":\n\n${lines.join('\n\n')}\n\nScegli con *${P}tp_select <numero>*`
            if (ctx && ctx.isOwner && lastErr) out += `\n\n⚠️ Carosello non partito: ${String((lastErr && lastErr.message) || lastErr).slice(0, 160)}`
            return reply(out)
        }

        // ═════════════ scelta del risultato ═════════════
        if (action === 'tp_select') {
            const index = Number(String(text || '').trim())
            const results = global.tpSelection[sender]

            if (!results?.length) return reply('✖️ Nessuna selezione attiva')
            if (!Number.isInteger(index) || index < 1 || index > results.length) {
                return reply('✖️ Seleziona un numero valido tra i risultati mostrati')
            }
            const video = results[index - 1]
            if (!video) return reply('✖️ Risultato non valido')

            global.tpChoice[sender] = video
            delete global.tpSelection[sender]

            const actionText = `🎶 *${video.title}*\n\n📺 Canale: ${video.author?.name || 'Sconosciuto'}\n⏱️ Durata: ${video.timestamp || '—'}\n👁️ Ascolti: ${video.views?.toLocaleString('it-IT') || '—'}`

            try {
                if (ctx && typeof ctx.sendButtons === 'function') {
                    await ctx.sendButtons({
                        title: 'ZENOBOT',
                        text: `${actionText}\n\n🎧 Scegli un'azione per questo brano:`,
                        image: getThumbnail(video),
                        footer: 'ZENOBOT',
                        buttons: [
                            { text: '🎧 Scegli audio', id: 'tp_audio' },
                            { text: '🎥 Scegli video', id: 'tp_video' },
                            { text: '🎵 Metti in coda', id: 'tp_queue' }
                        ]
                    })
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: getThumbnail(video) },
                        caption: `${actionText}\n\n🎧 Scegli un'azione per questo brano:`,
                        footer: 'ZENOBOT',
                        buttons: [
                            { buttonId: `${P}tp_audio`, buttonText: { displayText: '🎧 Scegli audio' }, type: 1 },
                            { buttonId: `${P}tp_video`, buttonText: { displayText: '🎥 Scegli video' }, type: 1 },
                            { buttonId: `${P}tp_queue`, buttonText: { displayText: '🎵 Metti in coda' }, type: 1 }
                        ],
                        headerType: 1
                    }, { quoted: m })
                }
            } catch (e) {
                console.error('[tp] pulsanti:', e && e.message)
                await reply(`${actionText}\n\nScrivi: *${P}tp_audio* • *${P}tp_video* • *${P}tp_queue*`)
            }
            return
        }

        // ═════════════ "Vuoi il testo?" → sì ═════════════
        if (action === 'tp_lyrics') {
            const title = global.tpLyrics[sender]
            if (!title) return reply(`⌛ Tempo scaduto! Per il testo scrivi *${P}testo <titolo>*`)

            if (pendingLyrics[sender]) clearTimeout(pendingLyrics[sender])
            delete pendingLyrics[sender]
            delete global.tpLyrics[sender]

            await react('📜')
            let found
            try { found = await getLyrics(cleanTitle(title)) } catch (e) {
                console.error('[tp] testo:', e && e.message)
                return reply('✖️ Il servizio dei testi non risponde, riprova tra poco.')
            }
            if (!found) return reply(`✖️ Testo non trovato per:\n*${title}*`)

            const chunks = splitLyrics(found.plainLyrics)
            const shown = chunks.slice(0, 3)
            for (let i = 0; i < shown.length; i++) {
                let t = shown[i]
                if (i === 0) t = `📜 *${found.trackName}* — ${found.artistName}\n\n${t}`
                if (i === shown.length - 1 && chunks.length > shown.length) t += '\n\n_… testo troncato_'
                await sock.sendMessage(chatId, { text: t })
            }
            return
        }

        // ═════════════ da qui serve un brano scelto ═════════════
        const video = global.tpChoice[sender]
        if (!video) return reply('✖️ Nessuna richiesta attiva')

        // ── 🎵 metti in coda (= playlist .pl) ──
        if (action === 'tp_queue') {
            const plDb = readJson(playlistDbPath)
            if (!Array.isArray(plDb[sender])) plDb[sender] = []
            if (plDb[sender].some(t => t.url === video.url)) return reply('⚠️ Questo brano è *già* in coda!')
            plDb[sender].push({
                url: video.url,
                title: video.title,
                duration: video.timestamp,
                seconds: video.seconds,
                author: video.author?.name,
                thumbnail: video.thumbnail
            })
            try { writeJson(playlistDbPath, plDb) } catch (e) {
                console.error('[tp] coda:', e && e.message)
                return reply('✖️ Non sono riuscito a salvare la coda.')
            }
            await react('✅')
            return reply(`✅ Aggiunto in coda!\n🎵 *${video.title}*\n📚 Brani in coda: ${plDb[sender].length}`)
        }

        // ── 🎧 audio ──
        if (action === 'tp_audio') {
            if (busy.has(sender)) return reply('⏳ Sto ancora scaricando il brano di prima, aspetta un attimo…')
            busy.add(sender)

            await reply(`\nℹ️ ʀɪꜱᴜʟᴛᴀᴛᴏ:\n\n*${video.title}*\n\n⌛️ ꜱᴄᴀʀɪᴄᴏ ʟ’ᴀᴜᴅɪᴏ...\n\n> ᴢᴇɴᴏʙᴏᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ\n`)

            const base = `a_${Date.now()}_${Math.floor(Math.random() * 1e4)}`
            try {
                await sh('yt-dlp', [...YT_OPTS, '-x', '--audio-format', 'mp3',
                    '-o', path.join(TMP, base + '.%(ext)s'), video.url])
                const file = findOut(base)
                if (!file) throw new Error('file audio non generato')

                await sock.sendMessage(chatId, {
                    audio: fs.readFileSync(file),
                    mimetype: 'audio/mpeg',
                    fileName: safeName(video.title) + '.mp3'
                }, { quoted: m })

                // "Vuoi il testo?" — 15 secondi per rispondere
                global.tpLyrics[sender] = video.title
                if (pendingLyrics[sender]) clearTimeout(pendingLyrics[sender])
                pendingLyrics[sender] = setTimeout(() => {
                    delete pendingLyrics[sender]
                    delete global.tpLyrics[sender]
                }, 15000)

                if (ctx && typeof ctx.sendButtons === 'function') {
                    await ctx.sendButtons({
                        title: 'ZENOBOT',
                        text: `📜 Vuoi il testo?\n\n*${video.title}*`,
                        footer: 'Hai 15 secondi',
                        buttons: [{ text: '✔️ ꜱɪ', id: 'tp_lyrics' }]
                    })
                } else {
                    await sock.sendMessage(chatId, {
                        text: `📜 Vuoi il testo?\n\n*${video.title}*`,
                        footer: 'Hai 15 secondi',
                        buttons: [{ buttonId: `${P}tp_lyrics`, buttonText: { displayText: '✔️ ꜱɪ' }, type: 1 }],
                        headerType: 1
                    }, { quoted: m })
                }
            } catch (e) {
                console.error('[tp] audio:', (e && e.stderr) || (e && e.message) || e)
                const miss = e && e.code === 'ENOENT'
                await reply(miss
                    ? '✖️ Manca yt-dlp o ffmpeg.\nSu Termux: *pkg install ffmpeg* e *pip install -U yt-dlp*'
                    : `✖️ Errore audio:\n\n${errTail(e)}`)
            } finally {
                busy.delete(sender)
                cleanBase(base)
            }
            return
        }

        // ── 🎥 video ──
        if (action === 'tp_video') {
            if (video.seconds > MAX_VIDEO_SEC) return reply('✖️ Max 8 minuti')
            if (busy.has(sender)) return reply('⏳ Sto ancora scaricando il brano di prima, aspetta un attimo…')
            busy.add(sender)

            await reply('🎬 ꜱᴄᴀʀɪᴄᴏ ᴠɪᴅᴇᴏ...\n> ᴢᴇɴᴏʙᴏᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ')

            const base = `v_${Date.now()}_${Math.floor(Math.random() * 1e4)}`
            const raw = path.join(TMP, base + '_raw.mp4')
            const out = path.join(TMP, base + '_out.mp4')
            try {
                await sh('yt-dlp', [...YT_OPTS, '-f', VIDEO_FORMAT, '--merge-output-format', 'mp4',
                    '--no-part', '--retries', '3', '-o', raw, video.url])

                await sh('ffmpeg', ['-y', '-i', raw, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30',
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '96k',
                    '-movflags', '+faststart', out], 600000)

                if (!fs.existsSync(out)) throw new Error('video non generato')
                if (fs.statSync(out).size / (1024 * 1024) > MAX_VIDEO_MB) return reply('✖️ Video troppo pesante')

                await sock.sendMessage(chatId, {
                    video: fs.readFileSync(out),
                    mimetype: 'video/mp4',
                    caption: `🎬 ${video.title}`
                }, { quoted: m })
            } catch (e) {
                console.error('[tp] video:', (e && e.stderr) || (e && e.message) || e)
                const miss = e && e.code === 'ENOENT'
                await reply(miss
                    ? '✖️ Manca yt-dlp o ffmpeg.\nSu Termux: *pkg install ffmpeg* e *pip install -U yt-dlp*'
                    : '✖️ Errore video')
            } finally {
                busy.delete(sender)
                cleanBase(base)
            }
            return
        }
    }
}
