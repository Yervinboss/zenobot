'use strict'

// ZENO MUSIC — .sp (Last.fm) con card in stile Kasane Teto
//  .sp set <utente lastfm> | .sp | .sp @utente | .sp <utente lastfm> | .sp unset
//  .sp top [@utente]        top 5 artisti (7 giorni)
//  .fuoco                   rispondi a una card, oppure .fuoco @utente
// Servono: lastfm_key.txt (chiave API) e teto.png (PNG trasparente di Teto) nella cartella del bot

const fs = require('fs')
const path = require('path')
const Jimp = require('jimp')
const os = require('os')
const { spawn } = require('child_process')

const spPath = path.join(__dirname, '../sp_db.json')
const likesPath = path.join(__dirname, '../sp_likes.json')
const cardsPath = path.join(__dirname, '../sp_cards.json')
const keyPath = path.join(__dirname, '../lastfm_key.txt')
const tetoPath = path.join(__dirname, '../teto.png')

const NO_IMG = '2a96cbd8b46e442fc41c2b86b821562f'

// sfondo animato della card (scaricato una volta sola)
const BG_URL = 'https://i.postimg.cc/Px76V7HP/873d41099e78464bde2bd3f211572ed3.gif'
const bgPath = path.join(__dirname, '../sp_bg.gif')
const imgBgPath = path.join(__dirname, '../sp_bg.jpg')
const VIDEO_SECS = 6

const readJson = (p) => {
    if (!fs.existsSync(p)) return {}
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {} } catch { return {} }
}
const writeJson = (p, data) => {
    const tmp = p + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, p)
}
const getKey = () => process.env.LASTFM_API_KEY ||
    (fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').trim() : '')

async function lfmGet(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const d = await res.json().catch(() => ({}))
    if (d.error) { const e = new Error(d.message || 'errore Last.fm'); e.code = d.error; throw e }
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return d
}

async function nowPlaying(user, key) {
    const d = await lfmGet(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${key}&format=json&limit=1`)
    const rt = d.recenttracks || {}
    let t = rt.track
    if (Array.isArray(t)) t = t[0]
    if (!t) return null
    const imgs = Array.isArray(t.image) ? t.image : []
    const big = imgs.find(i => i.size === 'extralarge') || imgs[imgs.length - 1]
    let img = big && big['#text']
    if (!img || img.includes(NO_IMG)) img = null
    return {
        title: t.name,
        artist: (t.artist && (t.artist['#text'] || t.artist.name)) || 'Sconosciuto',
        album: t.album && t.album['#text'],
        image: img,
        live: !!(t['@attr'] && t['@attr'].nowplaying === 'true')
    }
}

async function topArtists(user, key) {
    const d = await lfmGet(`https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${encodeURIComponent(user)}&api_key=${key}&format=json&period=7day&limit=5`)
    const a = d.topartists && d.topartists.artist
    return Array.isArray(a) ? a : []
}

async function getCover(artist, title) {
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`, { signal: AbortSignal.timeout(9000) })
        const d = await res.json()
        const u = d.results && d.results[0] && d.results[0].artworkUrl100
        return u ? u.replace('100x100bb', '600x600bb') : null
    } catch { return null }
}

async function fetchBuf(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) return null
        return Buffer.from(await res.arrayBuffer())
    } catch { return null }
}

const songId = (user, artist, title) => `${user}_${artist}_${title}`.toLowerCase().replace(/\s+/g, '')

// ═══════════ CARD STILE TETO ═══════════
const W = 1100
const H = 620

const rgba = (r, g, b, a) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0

// i font bitmap di Jimp non hanno emoji, giapponese ecc.: li tolgo dalla card
const clean = (s) => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '').replace(/\s+/g, ' ').trim()

const fonts = {}
async function font(size, color) {
    const k = size + color
    if (!fonts[k]) fonts[k] = await Jimp.loadFont(Jimp[`FONT_SANS_${size}_${color}`])
    return fonts[k]
}

function fit(f, text, maxW) {
    let t = text
    if (Jimp.measureText(f, t) <= maxW) return t
    while (t.length > 1 && Jimp.measureText(f, t + '...') > maxW) t = t.slice(0, -1)
    return t.trim() + '...'
}

function paintBackground(img) {
    const c1 = [122, 12, 38]
    const c2 = [236, 52, 82]
    img.scan(0, 0, W, H, function (x, y, idx) {
        const t = (x / W) * 0.45 + (y / H) * 0.55
        for (let i = 0; i < 3; i++) this.bitmap.data[idx + i] = Math.round(c1[i] + (c2[i] - c1[i]) * t)
        this.bitmap.data[idx + 3] = 255
    })
}

// "trivella" dei codini di Teto: anelli concentrici chiari
function drill(img, cx, cy, maxR, step) {
    const x0 = Math.max(0, cx - maxR)
    const y0 = Math.max(0, cy - maxR)
    const x1 = Math.min(W - 1, cx + maxR)
    const y1 = Math.min(H - 1, cy + maxR)
    img.scan(x0, y0, x1 - x0 + 1, y1 - y0 + 1, function (x, y, idx) {
        const d = Math.hypot(x - cx, y - cy)
        if (d > maxR) return
        if (Math.floor(d / step) % 2 === 0) {
            const a = 0.18
            for (let i = 0; i < 3; i++) this.bitmap.data[idx + i] = Math.round(this.bitmap.data[idx + i] * (1 - a) + 255 * a)
        }
    })
}

function rectOld(img, x, y, w, h, rgb, a) {
    img.scan(x, y, w, h, function (px, py, idx) {
        for (let i = 0; i < 3; i++) this.bitmap.data[idx + i] = Math.round(this.bitmap.data[idx + i] * (1 - a) + rgb[i] * a)
    })
}

function roundCorners(img, r) {
    const w = img.bitmap.width
    const h = img.bitmap.height
    img.scan(0, 0, w, h, function (x, y, idx) {
        const dx = x < r ? r - x : x >= w - r ? x - (w - r - 1) : 0
        const dy = y < r ? r - y : y >= h - r ? y - (h - r - 1) : 0
        if (dx * dx + dy * dy > r * r) this.bitmap.data[idx + 3] = 0
    })
}

// rect che gestisce anche lo sfondo trasparente (per la card animata)
function rect(img, x, y, w, h, rgb, a) {
    img.scan(x, y, w, h, function (px, py, idx) {
        const d = this.bitmap.data
        const A = d[idx + 3] / 255
        const outA = a + A * (1 - a)
        if (outA <= 0) return
        for (let i = 0; i < 3; i++) d[idx + i] = Math.round((rgb[i] * a + d[idx + i] * A * (1 - a)) / outA)
        d[idx + 3] = Math.round(outA * 255)
    })
}

async function ensureBg() {
    if (fs.existsSync(bgPath) && fs.statSync(bgPath).size > 1000) return true
    const res = await fetch(BG_URL, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) throw new Error('sfondo non valido')
    fs.writeFileSync(bgPath, buf)
    return true
}

// sfondo della card statica: primo fotogramma della GIF, altrimenti il gradiente rosso
async function paintBg(img) {
    if (await ensureBg().catch(() => false)) {
        try {
            const g = await Jimp.read(bgPath)
            g.cover(W, H)
            img.composite(g, 0, 0)
            return
        } catch (e) { console.error('[sp] sfondo gif:', e && e.message) }
    }
    if (!o.overlay) await paintBg(img)
}

function runBin(bin, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args)
        let err = ''
        p.stderr.on('data', d => { err += d })
        p.on('error', reject)
        p.on('close', code => code === 0 ? resolve() : reject(new Error(err.slice(-300) || (bin + ' exit ' + code))))
    })
}

// GIF di sfondo + card trasparente sopra -> video in loop
async function makeVideo(png) {
    await ensureBg()
    const id = Date.now() + '_' + Math.random().toString(36).slice(2)
    const pPng = path.join(os.tmpdir(), 'sp_' + id + '.png')
    const pMp4 = path.join(os.tmpdir(), 'sp_' + id + '.mp4')
    const pJpg = path.join(os.tmpdir(), 'sp_' + id + '.jpg')
    fs.writeFileSync(pPng, png)
    try {
        await runBin('ffmpeg', ['-y', '-loglevel', 'error',
            '-stream_loop', '-1', '-i', bgPath,
            '-loop', '1', '-i', pPng,
            '-filter_complex', '[0:v]fps=20,scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + '[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
            '-map', '[v]', '-t', String(VIDEO_SECS), '-an',
            '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast', '-crf', '26',
            '-movflags', '+faststart', pMp4])
        await runBin('ffmpeg', ['-y', '-loglevel', 'error', '-i', pMp4, '-frames:v', '1', '-vf', 'scale=160:-2', '-q:v', '6', pJpg]).catch(() => {})
        return { video: fs.readFileSync(pMp4), thumb: fs.existsSync(pJpg) ? fs.readFileSync(pJpg) : null }
    } finally {
        for (const f of [pPng, pMp4, pJpg]) { try { fs.unlinkSync(f) } catch {} }
    }
}

async function makeCardClassic(o) {
    const img = new Jimp(W, H, o.overlay ? 0x00000000 : 0xffffffff)
    paintBackground(img)
    drill(img, 1030, 70, 270, 30)
    drill(img, 60, 600, 240, 28)

    // pannello scuro traslucido arrotondato
    const panel = new Jimp(W - 72, H - 72, rgba(0, 0, 0, 110))
    roundCorners(panel, 44)
    img.composite(panel, 36, 36)

    // copertina con cornice bianca
    const cs = 340
    const cx = 80
    const cy = 90
    const frame = new Jimp(cs + 20, cs + 20, 0xffffffff)
    roundCorners(frame, 36)
    img.composite(frame, cx - 10, cy - 10)
    let placed = false
    if (o.cover) {
        try {
            const c = await Jimp.read(o.cover)
            c.cover(cs, cs)
            roundCorners(c, 28)
            img.composite(c, cx, cy)
            placed = true
        } catch {}
    }
    if (!placed) {
        const ph = new Jimp(cs, cs, rgba(255, 92, 122, 255))
        roundCorners(ph, 28)
        img.composite(ph, cx, cy)
    }

    const f64 = await font(64, 'WHITE')
    const f32 = await font(32, 'WHITE')
    const f16 = await font(16, 'WHITE')

    // testi a destra
    const tx = 480
    const tw = W - tx - 80
    rect(img, tx, 98, 14, 14, [255, 255, 255], o.live ? 1 : 0.4)
    img.print(f16, tx + 26, 94, o.live ? 'IN ASCOLTO ADESSO' : 'ULTIMO BRANO')
    rect(img, tx, 126, 90, 4, [255, 241, 240], 0.9)
    const title = clean(o.title) || 'Brano'
    const ft = Jimp.measureText(f64, title) > tw ? f32 : f64
    img.print(ft, tx, 142, fit(ft, title, tw))
    img.print(f32, tx, 232, fit(f32, clean(o.artist) || 'Artista', tw))
    if (o.album && clean(o.album)) img.print(f16, tx, 284, fit(f16, clean(o.album), tw))

    // barre da equalizzatore (forma diversa per ogni brano)
    let s = 0
    for (const ch of String(o.title) + String(o.artist)) s = (s * 31 + ch.charCodeAt(0)) >>> 0
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    for (let i = 0; i < 18; i++) {
        const h = 24 + Math.round(rand() * 96)
        rect(img, tx + i * 22, 430 - h, 14, h, [255, 241, 240], o.live ? 0.85 : 0.4)
    }

    // pillole: utente e fuochi
    const pill = async (x, y, text, color) => {
        const w = Jimp.measureText(f32, text) + 44
        const p = new Jimp(w, 52, color)
        roundCorners(p, 26)
        img.composite(p, x, y)
        img.print(f32, x + 22, y + 7, text)
        return w
    }
    const w1 = await pill(cx - 10, 470, fit(f32, clean(o.user) || 'ascoltatore', 250), rgba(255, 255, 255, 80))
    await pill(cx - 10 + w1 + 14, 470, `FUOCO x${o.fires || 0}`, rgba(255, 140, 30, 235))
    img.print(f16, cx - 10, 545, 'ZENO x KASANE TETO')

    // Teto in basso a destra
    if (fs.existsSync(tetoPath)) {
        try {
            const t = await Jimp.read(tetoPath)
            t.resize(Jimp.AUTO, 340)
            if (t.bitmap.width > 520) t.resize(520, Jimp.AUTO)
            img.composite(t, W - t.bitmap.width - 30, H - t.bitmap.height)
        } catch (e) { console.error('[sp] teto.png:', e && e.message) }
    } else {
        console.error('[sp] teto.png non trovato in', tetoPath)
    }

    if (o.overlay) return { png: await img.getBufferAsync(Jimp.MIME_PNG) }
    const buffer = await img.clone().quality(92).getBufferAsync(Jimp.MIME_JPEG)
    const thumb = await img.clone().resize(160, Jimp.AUTO).quality(60).getBufferAsync(Jimp.MIME_JPEG)
    return { buffer, thumb }
}

// ═══════════ CARD CON IMMAGINE DI SFONDO (sp_bg.jpg) ═══════════
async function makeCardPoster(o) {
    const img = new Jimp(W, H, 0xffffffff)
    try {
        const bg = await Jimp.read(imgBgPath)
        bg.cover(W, H)
        img.composite(bg, 0, 0)
    } catch (e) {
        console.error('[sp] sp_bg.jpg:', e && e.message)
        paintBackground(img)
    }

    const f64 = await font(64, 'WHITE')
    const f32 = await font(32, 'WHITE')
    const f16 = await font(16, 'WHITE')
    const DARK = rgba(58, 6, 20, 214)

    const pill = (x, y, w, h, color) => {
        const p = new Jimp(w, h, color)
        roundCorners(p, Math.floor(h / 2))
        img.composite(p, x, y)
    }

    // etichetta in alto a sinistra
    const brand = 'ZENO-BOT'
    pill(40, 40, Jimp.measureText(f16, brand) + 44, 44, DARK)
    img.print(f16, 62, 52, brand)

    // etichetta in alto a destra
    const label = o.live ? 'IN ASCOLTO ADESSO' : 'ULTIMO BRANO'
    const lw = Jimp.measureText(f16, label) + 64
    const lx = W - 40 - lw
    pill(lx, 40, lw, 44, DARK)
    rect(img, lx + 20, 56, 12, 12, [255, 92, 122], o.live ? 1 : 0.5)
    img.print(f16, lx + 42, 52, label)

    // equalizzatore (forma diversa per ogni brano)
    let s = 0
    for (const ch of String(o.title) + String(o.artist)) s = (s * 31 + ch.charCodeAt(0)) >>> 0
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    for (let i = 0; i < 14; i++) {
        const h = 26 + Math.round(rand() * 84)
        rect(img, 730 + i * 24, 400 - h, 14, h, [236, 52, 82], o.live ? 0.95 : 0.5)
    }

    // barra in basso
    const bx = 40
    const by = 428
    const bw = W - 80
    const bar = new Jimp(bw, 164, DARK)
    roundCorners(bar, 38)
    img.composite(bar, bx, by)

    // copertina con cornice bianca
    const cs = 124
    const cx = bx + 24
    const cy = by + 20
    const frame = new Jimp(cs + 12, cs + 12, 0xffffffff)
    roundCorners(frame, 26)
    img.composite(frame, cx - 6, cy - 6)
    let placed = false
    if (o.cover) {
        try {
            const c = await Jimp.read(o.cover)
            c.cover(cs, cs)
            roundCorners(c, 20)
            img.composite(c, cx, cy)
            placed = true
        } catch {}
    }
    if (!placed) {
        const ph = new Jimp(cs, cs, rgba(255, 92, 122, 255))
        roundCorners(ph, 20)
        img.composite(ph, cx, cy)
    }

    // titolo, artista, album
    const pw = 240
    const px = bx + bw - 24 - pw
    const tx = cx + cs + 34
    const tw = px - 24 - tx
    const title = clean(o.title) || 'Brano'
    const ft = Jimp.measureText(f64, title) > tw ? f32 : f64
    img.print(ft, tx, ft === f64 ? 434 : 448, fit(ft, title, tw))
    img.print(f32, tx, 516, fit(f32, clean(o.artist) || 'Artista', tw))
    if (o.album && clean(o.album)) img.print(f16, tx, 560, fit(f16, clean(o.album), tw))

    // utente e fuochi a destra
    const un = fit(f32, clean(o.user) || 'ascoltatore', pw - 44)
    pill(px, by + 22, Jimp.measureText(f32, un) + 44, 52, rgba(255, 255, 255, 80))
    img.print(f32, px + 22, by + 29, un)
    const fu = 'FUOCO x' + (o.fires || 0)
    pill(px, by + 90, Jimp.measureText(f32, fu) + 44, 52, rgba(255, 140, 30, 235))
    img.print(f32, px + 22, by + 97, fu)

    const buffer = await img.clone().quality(92).getBufferAsync(Jimp.MIME_JPEG)
    const thumb = await img.clone().resize(160, Jimp.AUTO).quality(60).getBufferAsync(Jimp.MIME_JPEG)
    return { buffer, thumb }
}

// se c'è sp_bg.jpg uso la card con immagine, altrimenti quella di prima
async function makeCard(o) {
    if (!o.overlay && fs.existsSync(imgBgPath)) return makeCardPoster(o)
    return makeCardClassic(o)
}

module.exports = {
    name: 'sp',
    commands: ['sp', 'sptop', 'fuoco'],
    category: 'musica',
    description: 'Brano in ascolto da Last.fm con card Teto, fuoco e top artisti',
    usage: 'set <utente lastfm> | @utente | top',
    author: 'ZENO',

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.participant || chatId
        const P = (ctx && ctx.prefix) || '.'
        const c = String(cmd || '').toLowerCase()

        const reply = (x) => (ctx && typeof ctx.reply === 'function')
            ? ctx.reply(x)
            : sock.sendMessage(chatId, typeof x === 'string' ? { text: x } : x, { quoted: m })
        const err = (t) => (ctx && typeof ctx.err === 'function') ? ctx.err(t) : reply(t)
        const react = (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: m.key } }).catch(() => {})

        const key = getKey()
        if (!key) return err('Manca la chiave API di Last.fm!\nSalvala con: echo "LA_TUA_CHIAVE" > lastfm_key.txt')

        const db = readJson(spPath)
        const info = (m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo) || {}
        const mentioned = (info.mentionedJid || [])[0]
        const quotedJid = info.participant
        const isJid = (s) => /@(s\.whatsapp\.net|lid)$/.test(s || '')

        // ── 🔥 fuoco ──
        if (c === 'fuoco') {
            const cards = readJson(cardsPath)
            const ref = info.stanzaId && cards[info.stanzaId]
            let target
            let lfUser
            if (ref) {
                target = ref.jid
                lfUser = ref.lf
            } else {
                target = mentioned || (isJid(args[0]) ? args[0] : null) || quotedJid
                lfUser = target && db[target]
            }
            if (!lfUser) return err(`Rispondi a una card con *${P}fuoco*, oppure menziona qualcuno: *${P}fuoco @utente*`)
            if (target && target === sender) return err('Non puoi mettere fuoco a te stesso 🔥!')
            let t
            try { t = await nowPlaying(lfUser, key) } catch (e) {
                console.error('[sp] fuoco:', e && e.message)
                return err('Last.fm non risponde, riprova tra poco.')
            }
            if (!t) return err('Nessun brano trovato.')
            const likes = readJson(likesPath)
            const id = songId(lfUser, t.artist, t.title)
            if (!Array.isArray(likes[id])) likes[id] = []
            if (likes[id].includes(sender)) return err(`Hai già messo fuoco a "${t.title}" di ${lfUser}!`)
            likes[id].push(sender)
            writeJson(likesPath, likes)
            await react('🔥')
            return reply(`🔥 Hai messo fuoco a *${t.title}* di *${lfUser}*! (${likes[id].length} 🔥)`)
        }

        const sub = c === 'sptop' ? 'top' : (args[0] || '').toLowerCase()

        // ── collega / scollega ──
        if (sub === 'set') {
            const name = (args[1] || '').trim()
            if (!/^[A-Za-z][A-Za-z0-9_-]{1,14}$/.test(name)) return err(`Scrivi il tuo nome utente Last.fm.\nEsempio: *${P}sp set mario_rossi*`)
            try { await nowPlaying(name, key) } catch (e) {
                if (e.code === 6) return err(`Utente Last.fm *${name}* non trovato.`)
                console.error('[sp] set:', e && e.message)
                return err('Last.fm non risponde, riprova tra poco.')
            }
            db[sender] = name
            writeJson(spPath, db)
            return reply(`✅ Collegato a Last.fm come *${name}*!\nOra scrivi *${P}sp* mentre ascolti qualcosa.`)
        }
        if (sub === 'unset') {
            if (!db[sender]) return err('Non hai nessun Last.fm collegato.')
            delete db[sender]
            writeJson(spPath, db)
            return reply('🗑 Last.fm scollegato.')
        }

        // ── top artisti ──
        if (sub === 'top') {
            const who = c === 'sptop' ? args[0] : args[1]
            const lfUser = (who && !who.startsWith('@') && !isJid(who)) ? who : db[mentioned || quotedJid || sender]
            if (!lfUser) return err(`Prima collega Last.fm: *${P}sp set tuo_nome_lastfm*`)
            let artists
            try { artists = await topArtists(lfUser, key) } catch (e) {
                if (e.code === 6) return err(`Utente Last.fm *${lfUser}* non trovato.`)
                console.error('[sp] top:', e && e.message)
                return err('Last.fm non risponde, riprova tra poco.')
            }
            if (!artists.length) return err('Nessun dato negli ultimi 7 giorni.')
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
            const list = artists.map((a, i) => `${medals[i]} *${a.name}*\n   📊 ${a.playcount} scrobble`).join('\n\n')
            return reply(`🏆 *Top artisti di ${lfUser}* (ultimi 7 giorni)\n\n${list}`)
        }

        // ── card del brano ──
        let lfUser
        let targetJid = null
        const direct = args[0] && !args[0].startsWith('@') && !isJid(args[0]) ? args[0] : null
        if (direct && !mentioned) {
            lfUser = direct
        } else {
            targetJid = mentioned || quotedJid || sender
            lfUser = db[targetJid]
            if (!lfUser) {
                return err(targetJid === sender
                    ? `Prima collega Last.fm: *${P}sp set tuo_nome_lastfm*`
                    : `Questo utente non ha collegato Last.fm (deve scrivere *${P}sp set nome*).`)
            }
        }

        await react('🎧')

        let t
        try { t = await nowPlaying(lfUser, key) } catch (e) {
            if (e.code === 6) return err(`Utente Last.fm *${lfUser}* non trovato.`)
            console.error('[sp] ricerca:', e && e.message)
            return err('Last.fm non risponde, riprova tra poco.')
        }
        if (!t) return err(`*${lfUser}* non ha ancora ascoltato niente su Last.fm.`)

        const coverUrl = t.image || await getCover(t.artist, t.title)
        const coverBuf = coverUrl ? await fetchBuf(coverUrl) : null

        const likes = readJson(likesPath)
        const fires = (likes[songId(lfUser, t.artist, t.title)] || []).length

        let card = null
        let video = null
        try {
            try {
                if (fs.existsSync(imgBgPath)) throw new Error('sfondo immagine')
                const ov = await makeCard({
                    title: t.title, artist: t.artist, album: t.album,
                    cover: coverBuf, live: t.live, user: lfUser, fires, overlay: true
                })
                video = await makeVideo(ov.png); console.log('[sp] video ok', Math.round(video.video.length / 1024) + ' KB')
            } catch (e) { if (!fs.existsSync(imgBgPath)) console.error('[sp] video:', e && e.message) }
            if (!video) card = await makeCard({
                title: t.title, artist: t.artist, album: t.album,
                cover: coverBuf, live: t.live, user: lfUser, fires
            })
        } catch (e) { console.error('[sp] card:', e && e.message) }

        try {
            const sent = video
                ? await sock.sendMessage(chatId, { video: video.video, gifPlayback: true, mimetype: 'video/mp4', ...(video.thumb ? { jpegThumbnail: video.thumb } : {}), width: W, height: H }, { quoted: m })
                : card
                ? await sock.sendMessage(chatId, { image: card.buffer, jpegThumbnail: card.thumb, width: W, height: H }, { quoted: m })
                : await sock.sendMessage(chatId, { text: `🎧 *${lfUser}* — *${t.title}* — ${t.artist}` }, { quoted: m })

            // ricordo a chi appartiene la card, così .fuoco in risposta funziona
            const id = sent && sent.key && sent.key.id
            if (id) {
                const cards = readJson(cardsPath)
                cards[id] = { jid: targetJid, lf: lfUser }
                const ids = Object.keys(cards)
                if (ids.length > 300) for (const old of ids.slice(0, ids.length - 300)) delete cards[old]
                writeJson(cardsPath, cards)
            }
            await react('✅')
        } catch (e) {
            console.error('[sp] invio:', e && e.message)
            await react('❌')
            return err('Errore durante l\'invio.')
        }
    }
}
