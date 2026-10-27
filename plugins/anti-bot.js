'use strict'

// ZENO — Antibot
//  .antibot                 pannello con tendina
//  .antibot on | off
//  .antibot kick | warn     rimuove i bot / cancella e avvisa
//  .antibot web on | off    include o ignora i WebBot
//  .antibot wl [@utente]    whitelist (aggiungi o togli) oppure elenco

const fs = require('fs')
const path = require('path')
const { pureId, isImmune, sendButtons } = require('../lib/utils')
const { isOwner } = require('../lib/owner')

const dbPath = path.join(__dirname, '../database/antibot.json')
const FOOTER = 'Zeno Bot - Moderazione'
const TOP = '╭━━━━━━━━━━━━━━━╮'
const SEP = '┣━━━━━━━━━━━━━━━'
const END = '╰━━━━━━━━━━━━━━━╯'
const panel = (title, lines) => [TOP, `┃ ${title}`, SEP, ...lines.map(l => `┃ ${l}`), END].join('\n')

// ── database: in memoria, scritto su file solo quando cambia ──
let DB = null
function load() {
    if (DB) return DB
    try { DB = JSON.parse(fs.readFileSync(dbPath, 'utf8')) || {} } catch { DB = {} }
    return DB
}
function save() {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.writeFileSync(dbPath, JSON.stringify(DB || {}, null, 2), 'utf8')
}
// il vecchio formato era semplicemente "true"
function norm(v) {
    if (!v) return null
    const o = v === true ? {} : v
    return {
        enabled: o.enabled !== false,
        mode: o.mode === 'warn' ? 'warn' : 'kick',
        web: o.web !== false,
        whitelist: Array.isArray(o.whitelist) ? o.whitelist : [],
        removed: Number(o.removed) || 0
    }
}
function ensure(chatId) {
    const db = load()
    db[chatId] = norm(db[chatId]) || { enabled: false, mode: 'kick', web: true, whitelist: [], removed: 0 }
    return db[chatId]
}

// ── rilevamento ──
const BOT_TYPES = ['interactiveMessage', 'buttonsMessage', 'templateMessage', 'listMessage']

function unwrap(msg) {
    let cur = msg || {}
    for (let i = 0; i < 6; i++) {
        const next = cur.viewOnceMessage?.message || cur.viewOnceMessageV2?.message ||
            cur.viewOnceMessageV2Extension?.message || cur.ephemeralMessage?.message ||
            cur.documentWithCaptionMessage?.message || cur.editedMessage?.message
        if (!next) break
        cur = next
    }
    return cur
}

function tipoBot(id = '') {
    if (!id) return null
    if (/^BAE5[A-F0-9]{12}$/i.test(id)) return 'bot'
    if (/^[a-zA-Z]+-[a-fA-F0-9]+$/.test(id)) return 'bot'
    if (id.startsWith('false_') || id.startsWith('true_')) return null
    if (id.startsWith('3EB0') && /^[A-Z0-9]+$/.test(id)) return id.length >= 30 ? 'bot' : 'webbot'
    return null
}

function detect(m, includeWeb) {
    const raw = m.message || {}
    const inner = unwrap(raw)
    // un utente vero non può mandare bottoni, card o liste
    if (BOT_TYPES.some(k => inner[k] || raw[k])) return { tipo: 'bot', motivo: 'bottoni / card' }
    const t = tipoBot(m.key.id)
    if (t === 'bot') return { tipo: 'bot', motivo: 'ID messaggio' }
    if (t === 'webbot' && includeWeb) return { tipo: 'webbot', motivo: 'ID messaggio web' }
    return null
}

// ── hook: gira su ogni messaggio dei gruppi ──
const recent = new Map()      // chat|utente -> ultimo intervento
const immuneCache = new Map() // chat|utente -> { ts, v }
const noAdmin = new Map()     // chat -> ultimo avviso "non sono admin"

async function hook(sock, m) {
    try {
        if (!m.message || m.key.fromMe) return
        const chatId = m.key.remoteJid
        if (!chatId || !chatId.endsWith('@g.us')) return
        const cfg = norm(load()[chatId])
        if (!cfg || !cfg.enabled) return
        const sender = m.key.participant
        if (!sender) return

        // controllo leggero per primo: sui messaggi normali finisce qui
        const det = detect(m, cfg.web)
        if (!det) return

        const sp = pureId(sender)
        const botId = (sock.user?.id || '').split(':')[0].split('@')[0]
        if (sp === botId || cfg.whitelist.includes(sp)) return

        // admin e owner sono immuni (risultato ricordato 5 minuti)
        const k = chatId + '|' + sp
        let imm = immuneCache.get(k)
        if (!imm || Date.now() - imm.ts > 300000) {
            imm = { ts: Date.now(), v: await isImmune(sock, chatId, sender) }
            immuneCache.set(k, imm)
            if (immuneCache.size > 500) immuneCache.clear()
        }
        if (imm.v) return

        // il messaggio del bot si cancella sempre
        try { await sock.sendMessage(chatId, { delete: m.key }) } catch {}

        // ma si agisce e si avvisa al massimo una volta al minuto
        const now = Date.now()
        if (now - (recent.get(k) || 0) < 60000) return
        recent.set(k, now)
        if (recent.size > 500) recent.clear()

        let fatto = true
        if (cfg.mode === 'kick') {
            fatto = false
            try { await sock.groupParticipantsUpdate(chatId, [sender], 'remove'); fatto = true } catch {}
        }

        if (!fatto) {
            if (now - (noAdmin.get(chatId) || 0) > 600000) {
                noAdmin.set(chatId, now)
                await sock.sendMessage(chatId, {
                    text: panel('⚠️ *ANTIBOT*', [`🤖 Bot rilevato: @${sp}`, '❌ Non riesco a rimuoverlo', '👑 Dammi i permessi da admin']),
                    mentions: [sender]
                })
            }
            return
        }

        const live = ensure(chatId)
        live.removed = (live.removed || 0) + 1
        save()

        await sock.sendMessage(chatId, {
            text: panel('🚫 *ANTIBOT*', [
                `👤 @${sp}`,
                `📱 ${det.tipo.toUpperCase()} • ${det.motivo}`,
                cfg.mode === 'kick' ? '🛑 Rimosso dal gruppo' : '🗑 Messaggio eliminato'
            ]),
            mentions: [sender]
        })
    } catch {}
}

// ── comando ──
const modeLabel = (c) => (c.mode === 'kick' ? '🦵 KICK (rimuove)' : '⚠️ AVVISO (cancella)')
const statusText = (c) => panel('🛡️ *GESTIONE ANTIBOT*', [
    `Stato: ${c.enabled ? '✅ ATTIVO' : '❌ DISATTIVO'}`,
    `Modalità: ${modeLabel(c)}`,
    `WebBot: ${c.web ? '✅ inclusi' : '⏸ ignorati'}`,
    `Whitelist: *${c.whitelist.length}* utenti`,
    `Bot fermati: *${c.removed}*`
])

module.exports = {
    commands: ['antibot'],
    hook,
    run: async (sock, m, args, cmd, ctx) => {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.key.remoteJid
        const P = (ctx && ctx.prefix) || '.'
        const say = (text, extra = {}) => sock.sendMessage(chatId, { text, ...extra }, { quoted: m })

        if (!chatId.endsWith('@g.us')) return say('❌ Solo nei gruppi.')
        if (!isOwner(sender) && !(await isImmune(sock, chatId, sender))) return say('❌ Solo admin.')

        const sub = (args[0] || '').toLowerCase()
        const cfg = ensure(chatId)

        if (sub === 'on') {
            cfg.enabled = true
            save()
            return say(panel('🛡️ *ANTIBOT ATTIVATO*', [`Modalità: ${modeLabel(cfg)}`, `WebBot: ${cfg.web ? 'inclusi' : 'ignorati'}`, 'Ricordati di darmi admin!']))
        }
        if (sub === 'off') {
            cfg.enabled = false
            save()
            return say(panel('🛡️ *ANTIBOT DISATTIVATO*', ['La protezione è spenta.']))
        }
        if (sub === 'kick' || sub === 'warn') {
            cfg.mode = sub
            save()
            return say(panel('🛡️ *MODALITÀ IMPOSTATA*', [modeLabel(cfg), cfg.enabled ? 'Antibot attivo.' : `Antibot spento: usa *${P}antibot on*`]))
        }
        if (sub === 'web') {
            const v = (args[1] || '').toLowerCase()
            cfg.web = v === 'on' ? true : v === 'off' ? false : !cfg.web
            save()
            return say(panel('🌐 *WEBBOT*', [cfg.web ? '✅ Verranno fermati anche i WebBot' : '⏸ I WebBot vengono ignorati']))
        }
        if (sub === 'wl' || sub === 'whitelist') {
            const info = m.message?.extendedTextMessage?.contextInfo || {}
            const jid = (info.mentionedJid || [])[0] || info.participant
            const num = jid ? pureId(jid) : (args[1] || '').replace(/\D/g, '')
            if (!num) {
                if (!cfg.whitelist.length) return say(panel('📋 *WHITELIST*', ['Nessuno in lista.', `Aggiungi: *${P}antibot wl @utente*`]))
                return say(panel('📋 *WHITELIST*', cfg.whitelist.map(n => `▸ @${n}`)), { mentions: cfg.whitelist.map(n => n + '@s.whatsapp.net') })
            }
            const i = cfg.whitelist.indexOf(num)
            if (i >= 0) cfg.whitelist.splice(i, 1)
            else cfg.whitelist.push(num)
            save()
            return say(panel('📋 *WHITELIST*', [i >= 0 ? `➖ Rimosso @${num}` : `➕ Aggiunto @${num}`, 'Non verrà mai fermato.']), { mentions: [num + '@s.whatsapp.net'] })
        }

        // pannello
        const rows = [
            { title: '🟢 Attiva antibot', description: 'Ferma i bot nel gruppo', id: 'antibot on' },
            { title: '🔴 Disattiva antibot', description: 'Spegne la protezione', id: 'antibot off' },
            { title: '🦵 Modalità KICK', description: 'Cancella il messaggio e rimuove il bot', id: 'antibot kick' },
            { title: '⚠️ Modalità AVVISO', description: 'Cancella e avvisa, senza rimuovere', id: 'antibot warn' },
            { title: cfg.web ? '🌐 Ignora i WebBot' : '🌐 Includi i WebBot', description: 'Evita di colpire utenti su WhatsApp Web', id: 'antibot web ' + (cfg.web ? 'off' : 'on') },
            { title: '📋 Whitelist', description: 'Chi non viene mai fermato', id: 'antibot wl' }
        ]
        if (ctx && typeof ctx.sendList === 'function') {
            return ctx.sendList({ title: '🛡️ ANTIBOT', text: statusText(cfg), footer: FOOTER, buttonText: 'Impostazioni', sections: [{ title: 'Azioni', rows }] })
        }
        return sendButtons(sock, chatId, statusText(cfg), FOOTER, [
            { text: cfg.enabled ? '🔴 Disattiva' : '🟢 Attiva', id: cfg.enabled ? 'antibot off' : 'antibot on' },
            { text: '🦵 Kick', id: 'antibot kick' },
            { text: '⚠️ Avviso', id: 'antibot warn' }
        ], m)
    }
}
