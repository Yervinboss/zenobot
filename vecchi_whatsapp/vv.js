'use strict'

// VV — apre le visualizzazioni singole (foto, video, audio)
//  .vv                  rispondendo a una visualizzazione singola
//  .vv cache on | off   (owner) salvataggio temporaneo automatico

const fs = require('fs')
const os = require('os')
const path = require('path')
const { isOwner } = require('../lib/owner')
const { pureId } = require('../lib/utils')

const CACHE_DIR = path.join(os.tmpdir(), 'zeno_vv')
const CFG_PATH = path.join(__dirname, '../database/vv.json')
const TTL_MS = 2 * 60 * 60 * 1000   // le copie durano 2 ore
const MAX_ITEMS = 60
const MAX_BYTES = 40 * 1024 * 1024

const TOP = '╭━━━━━━━━━━━━━━━╮'
const SEP = '┣━━━━━━━━━━━━━━━'
const END = '╰━━━━━━━━━━━━━━━╯'
const panel = (title, lines) => [TOP, `┃ ${title}`, SEP, ...lines.map(l => `┃ ${l}`), END].join('\n')

// ── impostazioni ──
let CFG = null
function cfg() {
    if (CFG) return CFG
    try { CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) || {} } catch { CFG = {} }
    return CFG
}
const cacheOn = () => cfg().cache !== false
function setCache(v) {
    cfg().cache = v
    fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true })
    fs.writeFileSync(CFG_PATH, JSON.stringify(CFG, null, 2), 'utf8')
}

// ── download (con la stessa libreria del socket) ──
let BAILEYS = null
function baileys() {
    if (BAILEYS) return BAILEYS
    for (const n of ['@itsliaaa/baileys', '@whiskeysockets/baileys', 'baileys']) {
        try {
            const b = require(n)
            if (b && typeof b.downloadContentFromMessage === 'function') return (BAILEYS = b)
        } catch {}
    }
    throw new Error('libreria Baileys non trovata')
}
async function download(node, type) {
    const stream = await baileys().downloadContentFromMessage(node, type)
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}
async function downloadRetry(node, type) {
    let err
    for (let i = 0; i < 2; i++) {
        try {
            const b = await download(node, type)
            if (b.length) return b
        } catch (e) { err = e }
        await new Promise(r => setTimeout(r, 700))
    }
    throw err || new Error('file vuoto')
}

// ── lettura dei messaggi (anche annidati) ──
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage']
function unwrap(msg) {
    let cur = msg || {}
    let viewOnce = false
    for (let i = 0; i < 8; i++) {
        let next = null
        for (const w of WRAPPERS) {
            if (cur[w] && cur[w].message) {
                next = cur[w].message
                if (w.startsWith('viewOnce')) viewOnce = true
                break
            }
        }
        if (!next) break
        cur = next
    }
    return { msg: cur, viewOnce }
}
const TYPES = [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio']]
function mediaOf(msg) {
    const { msg: inner, viewOnce } = unwrap(msg)
    for (const [key, type] of TYPES) {
        const node = inner[key]
        if (node) return { node, type, viewOnce: viewOnce || node.viewOnce === true }
    }
    return null
}
function contextOf(msg) {
    const { msg: inner } = unwrap(msg)
    for (const v of Object.values(inner)) {
        if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo
    }
    return {}
}

// ── copie temporanee su disco ──
let INDEX = null
const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_')
const binPath = (id) => path.join(CACHE_DIR, safeId(id) + '.bin')
const metaPath = (id) => path.join(CACHE_DIR, safeId(id) + '.json')

function loadIndex() {
    if (INDEX) return INDEX
    INDEX = new Map()
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
        for (const f of fs.readdirSync(CACHE_DIR)) {
            if (!f.endsWith('.json')) continue
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'))
                if (meta && meta.id && fs.existsSync(binPath(meta.id))) INDEX.set(meta.id, meta)
            } catch {}
        }
    } catch {}
    return INDEX
}
function forget(id) {
    try { fs.unlinkSync(binPath(id)) } catch {}
    try { fs.unlinkSync(metaPath(id)) } catch {}
    loadIndex().delete(id)
}
function purge() {
    const idx = loadIndex()
    const now = Date.now()
    for (const [id, meta] of [...idx]) if (now - meta.ts > TTL_MS) forget(id)
    const left = [...idx.values()].sort((a, b) => a.ts - b.ts)
    while (left.length > MAX_ITEMS) forget(left.shift().id)
}
function remember(id, buffer, info) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const meta = { id, ts: Date.now(), ...info }
    fs.writeFileSync(binPath(id), buffer)
    fs.writeFileSync(metaPath(id), JSON.stringify(meta))
    loadIndex().set(id, meta)
    purge()
}
function readCached(id) {
    const meta = loadIndex().get(id)
    if (!meta) return null
    if (Date.now() - meta.ts > TTL_MS) { forget(id); return null }
    try { return { meta, buffer: fs.readFileSync(binPath(id)) } } catch { loadIndex().delete(id); return null }
}
function clearAll() {
    for (const id of [...loadIndex().keys()]) forget(id)
}

if (!global.__zenoVvTimer) {
    global.__zenoVvTimer = setInterval(() => { try { purge() } catch {} }, 10 * 60 * 1000)
    if (global.__zenoVvTimer.unref) global.__zenoVvTimer.unref()
}

// ── hook: salva la visualizzazione singola appena arriva ──
async function hook(sock, m) {
    try {
        if (!m.message || !m.key || !m.key.id || m.key.fromMe) return
        const f = mediaOf(m.message)
        if (!f || !f.viewOnce || !cacheOn()) return
        const id = m.key.id
        if (loadIndex().has(id)) return
        if (!f.node.mediaKey) return
        const len = f.node.fileLength
        const size = Number(len && len.toString ? len.toString() : len) || 0
        if (size > MAX_BYTES) return
        const buffer = await downloadRetry(f.node, f.type)
        if (buffer.length > MAX_BYTES) return
        remember(id, buffer, {
            type: f.type,
            mimetype: f.node.mimetype || '',
            caption: f.node.caption || '',
            ptt: !!f.node.ptt,
            from: m.key.participant || m.key.remoteJid
        })
    } catch {}
}

// ── comando ──
module.exports = {
    commands: ['vv'],
    hook,
    run: async (sock, m, args, cmd, ctx) => {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.key.remoteJid
        const P = (ctx && ctx.prefix) || '.'
        const say = (text, extra = {}) => sock.sendMessage(chatId, { text, ...extra }, { quoted: m })
        const react = (t) => sock.sendMessage(chatId, { react: { text: t, key: m.key } }).catch(() => {})

        // .vv cache on|off (solo owner)
        if ((args[0] || '').toLowerCase() === 'cache') {
            if (!isOwner(sender)) return say('❌ Solo l\'owner può cambiare questa impostazione.')
            const v = (args[1] || '').toLowerCase()
            if (v === 'on' || v === 'off') {
                setCache(v === 'on')
                if (v === 'off') clearAll()
            }
            return say(panel('👁️ *VV — SALVATAGGIO*', [
                `Stato: ${cacheOn() ? '✅ ATTIVO' : '❌ DISATTIVO'}`,
                'Le visualizzazioni singole ricevute',
                'restano salvate 2 ore, poi spariscono.',
                `Cambia: *${P}vv cache on* / *${P}vv cache off*`
            ]))
        }

        const info = contextOf(m.message)
        const stanzaId = info.stanzaId
        const quoted = info.quotedMessage
        const self = mediaOf(m.message)
        const fromQuote = quoted ? mediaOf(quoted) : null

        if (!stanzaId && !(self && self.viewOnce)) {
            return say(panel('👁️ *VV — VISUALIZZAZIONE SINGOLA*', [
                'Rispondi a una foto, un video o un audio',
                `a visualizzazione singola con *${P}vv*`
            ]))
        }

        await react('⏳')
        try {
            let buffer = null
            let meta = null

            // 1) copia salvata quando il messaggio è arrivato
            const hit = readCached(stanzaId || m.key.id)
            if (hit) { buffer = hit.buffer; meta = hit.meta }

            // 2) download diretto, poi richiesta di nuovo upload
            if (!buffer) {
                const f = fromQuote || (self && self.viewOnce ? self : null)
                if (!f) {
                    await react('❌')
                    return say(panel('❌ *VV*', ['Il messaggio non contiene foto,', 'video o audio a visualizzazione singola.']))
                }
                meta = {
                    type: f.type,
                    mimetype: f.node.mimetype || '',
                    caption: f.node.caption || '',
                    ptt: !!f.node.ptt,
                    from: info.participant || sender
                }
                if (f.node.mediaKey) {
                    try { buffer = await downloadRetry(f.node, f.type) } catch {}
                    if (!buffer && stanzaId && typeof sock.updateMediaMessage === 'function') {
                        try {
                            const fresh = await sock.updateMediaMessage({
                                key: { remoteJid: chatId, id: stanzaId, participant: info.participant, fromMe: false },
                                message: quoted
                            })
                            const f2 = fresh && fresh.message ? mediaOf(fresh.message) : null
                            if (f2) buffer = await download(f2.node, f2.type)
                        } catch {}
                    }
                }
            }

            if (!buffer || !buffer.length) {
                await react('❌')
                return say(panel('❌ *VV — NON DISPONIBILE*', [
                    'Il bot non l\'aveva salvata e WhatsApp',
                    'non la rende più scaricabile.',
                    cacheOn() ? 'Le prossime le salvo io: riprova.' : `Il salvataggio è spento: *${P}vv cache on*`
                ]))
            }

            const tag = meta.from ? `👁️ _VV • @${pureId(meta.from)}_` : ''
            const mentions = meta.from ? [meta.from] : []
            const caption = [meta.caption, tag].filter(Boolean).join('\n\n')

            if (meta.type === 'image') {
                await sock.sendMessage(chatId, { image: buffer, caption, mentions }, { quoted: m })
            } else if (meta.type === 'video') {
                await sock.sendMessage(chatId, { video: buffer, caption, mimetype: meta.mimetype || 'video/mp4', mentions }, { quoted: m })
            } else {
                await sock.sendMessage(chatId, { audio: buffer, mimetype: meta.mimetype || 'audio/mp4', ptt: !!meta.ptt }, { quoted: m })
            }
            await react('✅')
        } catch (e) {
            console.error('[VV]', e && e.message)
            await react('❌')
            return say('❌ Errore durante l\'apertura della visualizzazione singola.')
        }
    }
}
