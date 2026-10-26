'use strict'

// ZENO MUSIC — .testo <canzone o cantante>
// Un unico messaggio: copertina + info + testo + bottone Riproduci
// Fonti testi: lrclib.net (2 tentativi) -> riserva: Deezer + lyrics.ovh

const fs = require('fs')
const path = require('path')
const yts = require('yt-search')

const dbPath = path.join(__dirname, '../zenomusic_db.json')
const HEADERS = { 'User-Agent': 'ZenoBot/4.5 (WhatsApp bot)' }
const CAPTION_MAX = 1000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const readDb = () => {
    if (!fs.existsSync(dbPath)) return {}
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')) || {} } catch { return {} }
}
const writeDb = (data) => {
    const tmp = dbPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, dbPath)
}

async function getJson(url, ms = 12000) {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
}

// fonte principale: lrclib, con un secondo tentativo
async function lrclibSearch(q) {
    let lastErr
    for (let i = 0; i < 2; i++) {
        try {
            const list = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
            return (Array.isArray(list) ? list : [])
                .filter(x => x && !x.instrumental && x.plainLyrics && x.plainLyrics.trim().length > 20)
        } catch (e) {
            lastErr = e
            await sleep(900)
        }
    }
    throw lastErr
}

// riserva: Deezer (info + copertina) + lyrics.ovh (testo)
async function fallbackSearch(q) {
    const d = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`)
    const tracks = Array.isArray(d.data) ? d.data : []
    for (const t of tracks) {
        const artist = t.artist && t.artist.name
        const title = t.title_short || t.title
        if (!artist || !title) continue
        try {
            const l = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`)
            let lyr = l && l.lyrics ? String(l.lyrics) : ''
            lyr = lyr.replace(/^Paroles de la chanson[^\n]*\n+/i, '').trim()
            if (lyr.length > 20) {
                return [{
                    artistName: artist,
                    trackName: title,
                    albumName: t.album && t.album.title,
                    duration: t.duration,
                    plainLyrics: lyr,
                    cover: t.album && (t.album.cover_xl || t.album.cover_big)
                }]
            }
        } catch {}
    }
    return []
}

async function searchLyrics(q) {
    try {
        const r = await lrclibSearch(q)
        if (r.length) return r
    } catch (e) {
        console.error('[testo] lrclib:', e && e.message)
    }
    return fallbackSearch(q)
}

async function getCover(artist, title) {
    try {
        const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`, 9000)
        const u = d.results && d.results[0] && d.results[0].artworkUrl100
        return u ? u.replace('100x100bb', '600x600bb') : null
    } catch { return null }
}

const fmtDur = (s) => {
    s = Math.round(Number(s) || 0)
    return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '?'
}

function cutLyrics(text, max) {
    const clean = text.replace(/\r/g, '').trim().replace(/\n{3,}/g, '\n\n')
    if (clean.length <= max) return { text: clean, cut: false }
    let part = clean.slice(0, max)
    const nl = part.lastIndexOf('\n')
    if (nl > max * 0.5) part = part.slice(0, nl)
    return { text: part.trim(), cut: true }
}

module.exports = {
    name: 'testo',
    commands: ['testo', 'lyrics'],
    category: 'musica',
    description: 'Testo di una canzone con copertina e pulsante per riprodurla',
    usage: '<canzone o cantante>',
    author: 'ZENO',

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.participant || chatId
        const P = (ctx && ctx.prefix) || '.'

        const reply = (c) => (ctx && typeof ctx.reply === 'function')
            ? ctx.reply(c)
            : sock.sendMessage(chatId, typeof c === 'string' ? { text: c } : c, { quoted: m })
        const err = (t) => (ctx && typeof ctx.err === 'function') ? ctx.err(t) : reply(t)
        const react = (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: m.key } }).catch(() => {})

        let query = (Array.isArray(args) ? args.join(' ') : '').trim()
        if (!query) {
            const last = readDb()[sender]
            if (last && typeof last === 'object' && last.title) query = last.title
        }
        if (!query) return err(`Scrivi il nome della canzone o del cantante!\nEsempio: *${P}testo bistia 18K*`)

        await react('🔎')

        let results
        try { results = await searchLyrics(query) } catch (e) {
            console.error('[testo] ricerca:', e && e.message)
            return err('Il servizio dei testi non risponde, riprova tra poco.')
        }
        if (!results.length) return err(`Nessun testo trovato per: *${query}*\nProva con "artista - titolo".`)

        const best = results[0]
        const artist = best.artistName || 'Sconosciuto'
        const title = best.trackName || query

        const [cover, vres] = await Promise.all([
            best.cover || getCover(artist, title),
            yts(`${artist} ${title}`).catch(() => null)
        ])
        const vid = vres && vres.videos && vres.videos[0]
        const image = cover || (vid && vid.thumbnail) || null

        const header =
            `🎤 *${title}*\n` +
            `👤 ${artist}\n` +
            (best.albumName ? `💿 ${best.albumName}\n` : '') +
            `⏱ ${fmtDur(best.duration)}\n\n` +
            `📝 *Testo*\n\n`
        const suffix = '\n\n_… continua sotto 👇_'
        const room = CAPTION_MAX - header.length - suffix.length

        // testo normalizzato: parte nella didascalia + resto in messaggi separati
        const clean = best.plainLyrics.replace(/\r/g, '').trim().replace(/\n{3,}/g, '\n\n')
        const lyr = cutLyrics(clean, Math.max(room, 200))
        const caption = header + lyr.text + (lyr.cut ? suffix : '')

        const restChunks = []
        if (lyr.cut) {
            let rest = clean.slice(lyr.text.length).trim()
            while (rest.length) {
                if (rest.length <= 3000) { restChunks.push(rest); break }
                let cut = rest.lastIndexOf('\n\n', 3000)
                if (cut < 1000) cut = rest.lastIndexOf('\n', 3000)
                if (cut < 1000) cut = 3000
                restChunks.push(rest.slice(0, cut).trim())
                rest = rest.slice(cut).trim()
            }
        }

        let canPlay = false
        if (vid) {
            try {
                const db = readDb()
                db[sender] = {
                    url: vid.url,
                    title: vid.title,
                    duration: vid.timestamp,
                    seconds: vid.seconds,
                    author: vid.author && vid.author.name,
                    thumbnail: vid.thumbnail
                }
                writeDb(db)
                canPlay = true
            } catch (e) { console.error('[testo] db:', e && e.message) }
        }

        const buttons = canPlay
            ? [{ buttonId: 'sendnormal', buttonText: { displayText: '🎵 Riproduci' }, type: 1 }]
            : undefined

        // 1) copertina + info + inizio testo + bottone
        try {
            if (image) {
                await sock.sendMessage(chatId, {
                    image: { url: image },
                    caption,
                    footer: '⚡ Zeno Bot - Music Player',
                    ...(buttons ? { buttons, headerType: 4 } : {})
                }, { quoted: m })
            } else {
                await sock.sendMessage(chatId, {
                    text: caption,
                    footer: '⚡ Zeno Bot - Music Player',
                    ...(buttons ? { buttons, headerType: 1 } : {})
                }, { quoted: m })
            }
        } catch (e) {
            console.error('[testo] invio:', e && e.message)
            try {
                if (image) await sock.sendMessage(chatId, { image: { url: image }, caption }, { quoted: m })
                else await reply(caption)
                if (canPlay) await reply(`🎧 Per ascoltarla scrivi *${P}sendnormal*`)
            } catch (e2) {
                console.error('[testo] fallback:', e2 && e2.message)
                await react('❌')
                return err('Errore durante l\'invio del testo.')
            }
        }

        // 2) resto del testo
        for (const chunk of restChunks) {
            try { await sock.sendMessage(chatId, { text: chunk }) }
            catch (e) { console.error('[testo] resto:', e && e.message); break }
        }

        await react('✅')
    }
}
