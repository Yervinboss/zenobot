'use strict'

// ═══════════════════════════════════════════════════════════════════════════
//  💤  AFK SYSTEM v2
//  • .afk <motivo>           → mostra bottoni "solo questo gruppo" / "tutti"
//  • .afk_group / .afk_all   → attivano AFK (dai bottoni)
//  • .afk off                → rimuovi AFK
//  • .afklist                → chi è AFK in questo gruppo
//  • Quando ti taggano/rispondono → il bot avvisa che sei AFK
//  • Quando scrivi di nuovo  → ricevi DM di "bentornato"
// ═══════════════════════════════════════════════════════════════════════════

const fs   = require('fs')
const path = require('path')

// ─── Persistenza ────────────────────────────────────────────────────────────
const FILE = path.resolve('./data/afk.json')
let db = {}
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {} } catch {}
if (typeof db !== 'object' || Array.isArray(db)) db = {}

const save = () => {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true })
        fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
    } catch {}
}

// ─── Stato pending (scelta scope) ───────────────────────────────────────────
const pending = new Map() // jid → { reason, chat, at }
const PENDING_TTL = 5 * 60 * 1000 // 5 minuti

// ─── Anti-spam notifiche ────────────────────────────────────────────────────
const lastNotify = new Map()
const canNotify = (chatId, jid) => {
    const key = chatId + ':' + num(jid)
    const t = lastNotify.get(key) || 0
    if (Date.now() - t < 60000) return false
    lastNotify.set(key, Date.now())
    return true
}

// ─── Utility ────────────────────────────────────────────────────────────────
const num = (jid) => String(jid || '').split('@')[0].split(':')[0]

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

const findKey = (jid) => {
    const n = num(jid)
    for (const k of Object.keys(db)) {
        if (k === jid) return k
        if (db[k] && db[k].number === n) return k
    }
    return null
}

const getText = (m) => {
    const msg = m.message || {}
    return msg.conversation
        || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption
        || msg.videoMessage?.caption
        || ''
}

const getTargets = (m) => {
    const out = new Set()
    const msg = m.message || {}
    const ctx = msg.extendedTextMessage?.contextInfo
             || msg.imageMessage?.contextInfo
             || msg.videoMessage?.contextInfo
             || msg.audioMessage?.contextInfo
             || msg.documentMessage?.contextInfo
             || msg.stickerMessage?.contextInfo
             || msg.buttonsResponseMessage?.contextInfo
             || msg.listResponseMessage?.contextInfo
             || {}
    if (Array.isArray(ctx.mentionedJid)) for (const j of ctx.mentionedJid) out.add(j)
    if (Array.isArray(msg.mentionedJid)) for (const j of msg.mentionedJid) out.add(j)
    if (ctx.participant) out.add(ctx.participant)
    return [...out]
}

// ─── Ritorno: DM "bentornato", fallback nel gruppo ──────────────────────────
async function notifyBack(sock, jid, chatId, entry, quoted) {
    const n = num(jid)
    const text = `👋 *BENTORNATO!*\n\n✅ Non sei più in AFK.\n⏱️ Eri AFK da: *${fmtDur(entry.at)}*\n📝 Motivo: ${entry.reason}\n📍 Scope: ${entry.scope === 'all' ? 'tutti i gruppi' : 'solo un gruppo'}`

    try {
        await sock.sendMessage(`${n}@s.whatsapp.net`, { text })
        return true
    } catch {}

    if (chatId && chatId.endsWith('@g.us')) {
        try {
            await sock.sendMessage(chatId, {
                text: `👋 @${n} bentornato!\n✅ AFK rimosso (era da ${fmtDur(entry.at)})`,
                mentions: [jid]
            }, quoted ? { quoted } : {})
            return true
        } catch {}
    }
    return false
}

// ═══════════════════════════════════════════════════════════════════════════
//  ESPORTAZIONE
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
    commands: ['afk', 'afk_group', 'afk_all', 'afklist'],
    aliases: ['brb', 'assente'],

    async run(sock, m, args, cmd) {
        const chatId = m.key.remoteJid
        const jid    = m.key.participant || chatId
        const n      = num(jid)
        const text   = args.join(' ').trim()
        const PREFIX = global.ZENO?.CONFIG?.prefix || '.'

        // ─── .afklist ──────────────────────────────────────────────────────
        if (cmd === 'afklist') {
            if (!chatId.endsWith('@g.us')) {
                return sock.sendMessage(chatId, { text: '⚠️ Solo nei gruppi.' }, { quoted: m })
            }
            const entries = Object.values(db).filter(e =>
                e.scope === 'all' || e.group === chatId
            )
            if (!entries.length) {
                return sock.sendMessage(chatId, { text: '✅ Nessuno AFK in questo gruppo.' }, { quoted: m })
            }
            const list = entries
                .map(e => `• @${e.number} — ⏱️ ${fmtDur(e.at)}\n  _${e.reason}_`)
                .join('\n')
            return sock.sendMessage(chatId, {
                text: `💤 *UTENTI AFK*\n\n${list}`,
                mentions: entries.map(e => e.jid)
            }, { quoted: m })
        }

        // ─── .afk off ──────────────────────────────────────────────────────
        const lower = text.toLowerCase()
        if (lower === 'off' || lower === 'stop' || lower === 'del' || lower === 'delete') {
            const k = findKey(jid)
            if (!k) return sock.sendMessage(chatId, { text: '⚠️ Non sei AFK.' }, { quoted: m })
            const old = db[k]
            delete db[k]; save()
            pending.delete(jid)
            return sock.sendMessage(chatId, {
                text: `✅ AFK rimosso (era da ${fmtDur(old.at)})\n📝 Motivo: ${old.reason}`
            }, { quoted: m })
        }

        // ─── .afk_group / .afk_all (dai bottoni) ──────────────────────────
        if (cmd === 'afk_group' || cmd === 'afk_all') {
            const p = pending.get(jid)
            if (!p) {
                return sock.sendMessage(chatId, { text: '⚠️ Nessuna richiesta AFK in corso. Usa `.afk <motivo>`' }, { quoted: m })
            }
            if (Date.now() - p.at > PENDING_TTL) {
                pending.delete(jid)
                return sock.sendMessage(chatId, { text: '⌛ Richiesta scaduta. Rifai `.afk <motivo>`' }, { quoted: m })
            }

            const scope = cmd === 'afk_all' ? 'all' : 'group'

            // rimuovi eventuale AFK precedente
            const oldKey = findKey(jid)
            if (oldKey) delete db[oldKey]

            db[jid] = {
                reason: p.reason,
                at: Date.now(),
                scope,
                group: scope === 'group' ? chatId : null,
                number: n,
                jid
            }
            pending.delete(jid)
            save()

            return sock.sendMessage(chatId, {
                text: `✅ *AFK ATTIVATO*\n\n📍 Scope: *${scope === 'all' ? 'tutti i gruppi' : 'solo questo gruppo'}*\n📝 Motivo: ${p.reason}\n\n_Buon riposo!_ 💤`,
                mentions: [jid]
            }, { quoted: m })
        }

        // ─── .afk <motivo> ─────────────────────────────────────────────────
        // se già AFK, mostra stato
        const existingKey = findKey(jid)
        if (existingKey) {
            const e = db[existingKey]
            return sock.sendMessage(chatId, {
                text: `ℹ️ Sei già AFK da *${fmtDur(e.at)}*\n📝 Motivo: ${e.reason}\n📍 Scope: ${e.scope === 'all' ? 'tutti i gruppi' : 'questo gruppo'}\n\nScrivi *.afk off* per rimuovere.`
            }, { quoted: m })
        }

        const reason = text || 'Nessun motivo specificato'
        pending.set(jid, { reason, chat: chatId, at: Date.now() })

        // Prova con bottoni
        try {
            await sock.sendMessage(chatId, {
                text: `🛌 *DOVE VUOI ESSERE AFK?*\n\n📝 Motivo: ${reason}`,
                footer: 'AFK System',
                buttons: [
                    { buttonId: 'afk_group', buttonText: { displayText: '📍 Solo questo gruppo' }, type: 1 },
                    { buttonId: 'afk_all',   buttonText: { displayText: '🌍 Tutti i gruppi' },     type: 1 }
                ],
                headerType: 1
            }, { quoted: m })
        } catch (e) {
            // Fallback testuale
            await sock.sendMessage(chatId, {
                text: `🛌 *AFK*\n\n📝 Motivo: ${reason}\n\nRispondi con:\n• *${PREFIX}afk_group* → solo questo gruppo\n• *${PREFIX}afk_all*   → tutti i gruppi`
            }, { quoted: m })
        }
    },

    // ─── HOOK: intercetta ogni messaggio ────────────────────────────────────
    async hook(sock, m) {
        if (!m.message) return
        const chatId = m.key.remoteJid
        const jid    = m.key.participant || chatId
        const n      = num(jid)
        const text   = getText(m)
        const PREFIX = global.ZENO?.CONFIG?.prefix || '.'
        const isCommand = text.startsWith(PREFIX)

        // 1) Se il mittente era AFK e scrive qualcosa di normale → rimuovi AFK
        if (!isCommand) {
            const k = findKey(jid)
            if (k) {
                const entry = db[k]
                delete db[k]; save()
                pending.delete(jid)
                await notifyBack(sock, jid, chatId, entry, m)
            }
        }

        // 2) Solo nei gruppi controlliamo tag/reply
        if (!chatId.endsWith('@g.us')) return
        if (m.key.fromMe) return

        const targets = getTargets(m)
        if (!targets.length) return

        for (const t of targets) {
            const tn = num(t)
            if (!tn || tn === n) continue
            const k = findKey(t)
            if (!k) continue

            const e = db[k]
            const okScope = e.scope === 'all' || e.group === chatId
            if (!okScope) continue
            if (!canNotify(chatId, t)) continue

            try {
                await sock.sendMessage(chatId, {
                    text: `💤 @${e.number} è AFK\n📝 Motivo: ${e.reason}\n⏱️ Da: ${fmtDur(e.at)}`,
                    mentions: [e.jid]
                }, { quoted: m })
            } catch {}
        }
    }
}
