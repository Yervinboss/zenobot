'use strict'

// ═══════════════════════════════════════════════════════════════
//  💤 AFK — Zeno
//  .afk <motivo>   scegli dove essere AFK (bottoni)
//  .afk off        torni disponibile
//  .afklist        chi è AFK qui
//  Se ti taggano o ti rispondono → il bot avvisa che sei AFK
//  Se scrivi di nuovo → AFK tolto e bentornato
// ═══════════════════════════════════════════════════════════════

const fs = require('fs')
const path = require('path')
let sendButtons = null
try { sendButtons = require('../lib/utils').sendButtons } catch {}

const FILE = path.join(__dirname, '../data/afk.json')
const FOOTER = 'Zeno Bot - AFK'
const TOP = '╭━━━━━━━━━━━━━━━╮'
const SEP = '┣━━━━━━━━━━━━━━━'
const END = '╰━━━━━━━━━━━━━━━╯'
const box = (title, lines) => [TOP, `┃ ${title}`, SEP, ...lines.map(l => `┃ ${l}`), END].join('\n')

function digits(jid) { return String(jid || '').split('@')[0].split(':')[0] }

// ── database ──
let db = {}
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {} } catch {}
if (typeof db !== 'object' || Array.isArray(db)) db = {}
for (const [k, e] of Object.entries(db)) {
    if (!e || typeof e !== 'object') { delete db[k]; continue }
    // vecchio formato: aggiungo l'elenco degli id
    if (!Array.isArray(e.ids)) e.ids = [...new Set([e.number, digits(e.jid), digits(k)].filter(Boolean))]
}
function save() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true })
        const tmp = FILE + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
        fs.renameSync(tmp, FILE)
    } catch {}
}

// ── identità: numero e LID della stessa persona ──
const ALT = new Map()
async function altOf(sock, jid) {
    const lm = sock.signalRepository && sock.signalRepository.lidMapping
    if (!lm) return null
    const hit = ALT.get(jid)
    if (hit && Date.now() - hit.ts < 600000) return hit.v
    let v = null
    try {
        const d = digits(jid)
        if (jid.endsWith('@lid')) {
            const pn = lm.getPNForLID ? await lm.getPNForLID(d + '@lid') : null
            if (pn) v = digits(pn)
        } else if (jid.endsWith('@s.whatsapp.net')) {
            const lid = lm.getLIDForPN ? await lm.getLIDForPN(d + '@s.whatsapp.net') : null
            if (lid) v = digits(lid)
        }
    } catch {}
    ALT.set(jid, { v, ts: Date.now() })
    if (ALT.size > 2000) ALT.clear()
    return v
}
async function idsOf(sock, ...jids) {
    const out = new Set()
    for (const j of jids.flat()) {
        if (!j || typeof j !== 'string') continue
        const d = digits(j)
        if (!d) continue
        out.add(d)
        const alt = await altOf(sock, j)
        if (alt) out.add(alt)
    }
    return out
}
function findKey(idSet) {
    for (const [k, e] of Object.entries(db)) {
        if (e.ids.some(x => idSet.has(x))) return k
    }
    return null
}
const inScope = (e, chatId) => e.scope === 'all' || e.group === chatId

// ── utility ──
const fmtDur = (from) => {
    const s = Math.max(0, Math.floor((Date.now() - from) / 1000))
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (d) return `${d}g ${h}h`
    if (h) return `${h}h ${m}m`
    if (m) return `${m}m ${sec}s`
    return `${sec}s`
}
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 100)

function unwrap(msg) {
    let cur = msg || {}
    for (let i = 0; i < 6; i++) {
        const next = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message || cur.viewOnceMessageV2Extension?.message ||
            cur.documentWithCaptionMessage?.message
        if (!next) break
        cur = next
    }
    return cur
}
// solo i messaggi "veri": niente reazioni, bottoni o messaggi di sistema
const REAL = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage',
    'stickerMessage', 'documentMessage', 'contactMessage', 'contactsArrayMessage', 'locationMessage',
    'liveLocationMessage', 'pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3', 'ptvMessage']

const getText = (inner) => inner.conversation || inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption || inner.videoMessage?.caption || inner.documentMessage?.caption || ''

function contextOf(inner) {
    for (const v of Object.values(inner)) {
        if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo
    }
    return {}
}
function getTargets(inner) {
    const ci = contextOf(inner)
    const out = new Set()
    if (Array.isArray(ci.mentionedJid)) for (const j of ci.mentionedJid) out.add(j)
    if (ci.participant) out.add(ci.participant)
    return [...out]
}

// avvisi al massimo una volta al minuto per persona e chat
const lastNotify = new Map()
function canNotify(chatId, idSet) {
    const key = chatId + ':' + [...idSet][0]
    if (Date.now() - (lastNotify.get(key) || 0) < 60000) return false
    lastNotify.set(key, Date.now())
    if (lastNotify.size > 1000) lastNotify.clear()
    return true
}

// ── attiva l'AFK ──
async function activate(sock, m, me, scope, reason) {
    const chatId = m.key.remoteJid
    const sender = m.key.participant || chatId
    const old = findKey(me)
    if (old) delete db[old]
    db[[...me][0]] = {
        reason,
        at: Date.now(),
        scope,
        group: scope === 'group' ? chatId : null,
        ids: [...me],
        jid: sender
    }
    save()
    return sock.sendMessage(chatId, {
        text: box('✅ *AFK ATTIVATO*', [`📍 ${scope === 'all' ? 'Tutti i gruppi' : 'Solo questo gruppo'}`, `📝 ${reason}`, '_Buon riposo!_ 💤']),
        mentions: [sender]
    }, { quoted: m })
}

// bottoni in stile Zeno, con messaggio di scorta
async function ask(sock, m, text, buttons, P) {
    const chatId = m.key.remoteJid
    if (sendButtons) {
        try { return await sendButtons(sock, chatId, text, FOOTER, buttons, m) } catch {}
    }
    const alt = buttons.map(b => `▸ *${P}${b.id}*`).join('\n')
    return sock.sendMessage(chatId, { text: `${text}\n\nScrivi:\n${alt}` }, { quoted: m })
}

// ── hook: ogni messaggio ──
async function hook(sock, m) {
    try {
        if (!m.message || !m.key || m.key.fromMe) return
        if (!Object.keys(db).length) return   // nessuno è AFK: niente da fare

        const chatId = m.key.remoteJid || ''
        const isGroup = chatId.endsWith('@g.us')
        const isDm = chatId.endsWith('@s.whatsapp.net') || chatId.endsWith('@lid')
        if (!isGroup && !isDm) return          // storie, canali, broadcast: ignorati

        const inner = unwrap(m.message)
        if (!REAL.some(k => inner[k])) return  // reazioni, bottoni, messaggi di sistema

        const sender = isGroup ? m.key.participant : chatId
        if (!sender) return
        const text = getText(inner)
        const isCommand = /^[.!\/#][a-zA-Z0-9_]/.test(text)
        const me = await idsOf(sock, sender, m.key.participantAlt)

        // 1) chi era AFK e scrive di nuovo (solo nel suo "raggio" di AFK)
        if (!isCommand) {
            const k = findKey(me)
            if (k && inScope(db[k], chatId)) {
                const e = db[k]
                delete db[k]
                save()
                await sock.sendMessage(chatId, {
                    text: box('👋 *BENTORNATO*', [`@${digits(sender)}`, `⏱ Eri AFK da ${fmtDur(e.at)}`, `📝 ${e.reason}`]),
                    mentions: [sender]
                }, { quoted: m })
            }
        }

        // 2) tag e risposte a chi è AFK (solo nei gruppi)
        if (!isGroup) return
        const notes = []
        for (const t of getTargets(inner)) {
            const ids = await idsOf(sock, t)
            if ([...ids].some(x => me.has(x))) continue
            const k = findKey(ids)
            if (!k) continue
            const e = db[k]
            if (!inScope(e, chatId) || !canNotify(chatId, ids)) continue
            notes.push({ t, e })
            if (notes.length >= 5) break
        }
        if (!notes.length) return

        const lines = notes.flatMap(({ t, e }, i) => [
            ...(i ? ['┈┈┈┈┈┈┈┈┈┈'] : []),
            `💤 @${digits(t)}`,
            `📝 ${e.reason}`,
            `⏱ da ${fmtDur(e.at)}`
        ])
        await sock.sendMessage(chatId, {
            text: box(notes.length > 1 ? '💤 *SONO AFK*' : '💤 *È AFK*', lines),
            mentions: notes.map(n => n.t)
        }, { quoted: m })
    } catch {}
}

// ── comandi ──
module.exports = {
    commands: ['afk', 'afk_group', 'afk_all', 'afklist'],
    aliases: ['brb', 'assente'],
    hook,

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        const isGroup = chatId.endsWith('@g.us')
        const sender = m.key.participant || chatId
        const P = (ctx && ctx.prefix) || '.'
        const say = (text, extra = {}) => sock.sendMessage(chatId, { text, ...extra }, { quoted: m })
        const text = clean(args.join(' '))
        const lower = text.toLowerCase()
        const me = await idsOf(sock, sender, m.key.participantAlt)

        // .afklist
        if (cmd === 'afklist') {
            if (!isGroup) return say('⚠️ Solo nei gruppi.')
            const list = Object.values(db).filter(e => inScope(e, chatId))
            if (!list.length) return say(box('💤 *UTENTI AFK*', ['✅ Nessuno è AFK qui.']))
            const lines = list.flatMap((e, i) => [
                ...(i ? ['┈┈┈┈┈┈┈┈┈┈'] : []),
                `▸ @${digits(e.jid)} • ${fmtDur(e.at)}`,
                `   📝 ${e.reason}`
            ])
            return say(box('💤 *UTENTI AFK*', lines), { mentions: list.map(e => e.jid).filter(Boolean) })
        }

        // .afk off
        if (['off', 'stop', 'del', 'delete', 'back'].includes(lower)) {
            const k = findKey(me)
            if (!k) return say(box('💤 *AFK*', ['Non sei AFK.']))
            const old = db[k]
            delete db[k]
            save()
            return say(box('✅ *AFK RIMOSSO*', [`⏱ Eri AFK da ${fmtDur(old.at)}`, `📝 ${old.reason}`]))
        }

        // dai bottoni: il motivo arriva nel comando
        if (cmd === 'afk_group' || cmd === 'afk_all') {
            const scope = cmd === 'afk_all' || !isGroup ? 'all' : 'group'
            return activate(sock, m, me, scope, text || 'Nessun motivo')
        }

        // .afk <motivo>
        const reason = text || 'Nessun motivo'
        const exist = findKey(me)
        if (exist) {
            const e = db[exist]
            return ask(sock, m, box('💤 *SEI GIÀ AFK*', [`⏱ Da ${fmtDur(e.at)}`, `📝 ${e.reason}`, `📍 ${e.scope === 'all' ? 'Tutti i gruppi' : 'Solo un gruppo'}`]),
                [{ text: '🔙 Torna online', id: 'afk off' }], P)
        }
        if (!isGroup) return activate(sock, m, me, 'all', reason)

        return ask(sock, m, box('🛌 *DOVE VUOI ESSERE AFK?*', [`📝 ${reason}`]), [
            { text: '📍 Solo questo gruppo', id: 'afk_group ' + reason },
            { text: '🌍 Tutti i gruppi', id: 'afk_all ' + reason }
        ], P)
    }
}
