'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO MUSIC — .testo <canzone o cantante>
//  • cerca il testo, mostra copertina + info + testo
//  • sotto i bottoni: 🎵 Riproduci · 🎬 Video · ➕ Aggiungi a .PL
//    (i bottoni usano il plugin song.js, quindi serve anche quello)
//  • .testo da solo → testo dell'ultimo brano cercato con .song
//  Richiede: yt-search (già usato da song.js) e Node 18+
// ═══════════════════════════════════════════════════════════════

const fs = require('fs')
const path = require('path')
const yts = require('yt-search')

// stesso database di song.js: così "Riproduci" sa quale brano scaricare
const dbPath = path.join(__dirname, '../zenomusic_db.json')

const HEADERS = { 'User-Agent': 'ZenoBot/4.5 (WhatsApp bot)' }
const CHUNK = 3000        // caratteri per messaggio di testo
const MAX_CHUNKS = 3      // oltre questo il testo viene troncato

const readDb = () => {
    if (!fs.existsSync(dbPath)) return {}
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')) || {} } catch { return {} }
}
const writeDb = (data) => {
    const tmp = dbPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, dbPath)
}

async function getJson(url) {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(9000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
}

// cerca i testi (lrclib.net: database pubblico, nessuna chiave)
async function searchLyrics(q) {
    const list = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
    return (Array.isArray(list) ? list : [])
        .filter(x => x && !x.instrumental && x.plainLyrics && x.plainLyrics.trim().length > 20)
}

// copertina dell'album (iTunes), se non c'è si userà la miniatura YouTube
async function getCover(artist, title) {
    try {
        const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`)
        const u = d.results && d.results[0] && d.results[0].artworkUrl100
        return u ? u.replace('100x100bb', '600x600bb') : null
    } catch { return null }
}

const fmtDur = (s) => {
    s = Math.round(Number(s) || 0)
    return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '?'
}

// spezza il testo in messaggi (rispettando le strofe)
function splitLyrics(text) {
    const paras = text.replace(/\r/g, '').trim().split(/\n{2,}/)
    const chunks = []
    let cur = ''
    for (const p of paras) {
        if (cur && (cur + '\n\n' + p).length > CHUNK) { chunks.push(cur); cur = p }
        else cur = cur ? cur + '\n\n' + p : p
    }
    if (cur) chunks.push(cur)
    return chunks.flatMap(c => c.length > 3800 ? c.match(/[\s\S]{1,3800}/g) : [c])
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
            // nessun testo: uso l'ultimo brano cercato con .song
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

        // copertina + video (per il pulsante Riproduci) in parallelo
        const [cover, vres] = await Promise.all([
            getCover(artist, title),
            yts(`${artist} ${title}`).catch(() => null)
        ])
        const vid = vres && vres.videos && vres.videos[0]
        const image = cover || (vid && vid.thumbnail) || null

        // altri risultati simili (senza doppioni)
        const seen = new Set([`${artist}|${title}`.toLowerCase()])
        const others = []
        for (const r of results.slice(1)) {
            const k = `${r.artistName}|${r.trackName}`.toLowerCase()
            if (seen.has(k)) continue
            seen.add(k)
            others.push(`• ${r.artistName} - ${r.trackName}`)
            if (others.length >= 3) break
        }

        let header =
            `🎤 *${title}*\n` +
            `👤 ${artist}\n` +
            (best.albumName ? `💿 ${best.albumName}\n` : '') +
            `⏱ ${fmtDur(best.duration)}`
        if (others.length) header += `\n\n📚 *Altri risultati:*\n${others.join('\n')}\n_Cercali con ${P}testo artista - titolo_`

        // 1) copertina + info
        try {
            if (image) await sock.sendMessage(chatId, { image: { url: image }, caption: header }, { quoted: m })
            else await reply(header)
        } catch { await reply(header) }

        // 2) testo
        const chunks = splitLyrics(best.plainLyrics)
        const shown = chunks.slice(0, MAX_CHUNKS)
        for (let i = 0; i < shown.length; i++) {
            let t = shown[i]
            if (i === 0) t = `📝 *Testo*\n\n${t}`
            if (i === shown.length - 1 && chunks.length > MAX_CHUNKS) t += '\n\n_… testo troncato_'
            await sock.sendMessage(chatId, { text: t })
        }
        await react('✅')

        // 3) bottoni sotto il testo (usano il plugin song)
        if (!vid) return
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
        } catch (e) { console.error('[testo] db:', e && e.message); return }

        try {
            await sock.sendMessage(chatId, {
                text: '🎧 Vuoi ascoltarla?',
                footer: '⚡ Zeno Bot - Music Player',
                buttons: [
                    { buttonId: 'sendnormal', buttonText: { displayText: '🎵 Riproduci' }, type: 1 },
                    { buttonId: 'sendvideo', buttonText: { displayText: '🎬 Video MP4' }, type: 1 },
                    { buttonId: 'addplaylist', buttonText: { displayText: '➕ Aggiungi a .PL' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: m })
        } catch (e) {
            console.error('[testo] bottoni:', e && e.message)
            await reply(`🎧 Per ascoltarla scrivi *${P}sendnormal* (vocale), *${P}sendmp3* o *${P}sendvideo*`)
        }
    }
}
