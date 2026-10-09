'use strict'

// ═══════════════════════════════════════════════════════════════════════════
//  ███████╗███████╗███╗   ██╗ ██████╗    U L T I M A T E   B O T
//  ╚══███╔╝██╔════╝████╗  ██║██╔═══██╗   ─────────────────────────
//    ███╔╝ █████╗  ██╔██╗ ██║██║   ██║   Core v4.2 • Universal Cards (Android + iPhone)
//   ███╔╝  ██╔══╝  ██║╚██╗██║██║   ██║
//  ███████╗███████╗██║ ╚████║╚██████╔╝   Baileys (qualsiasi fork) • Termux
//  ╚══════╝╚══════╝╚═╝  ╚═══╝ ╚═════╝
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs')

// ── Libreria WhatsApp: scelta da config.json ("library"), con fallback automatico ──
//    Prova in ordine: la tua scelta → @itsliaaa/baileys → @whiskeysockets/baileys → baileys
const _early = (() => { try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch { return {} } })()
const LIB_CANDIDATES = [...new Set([].concat(_early.library || [], '@itsliaaa/baileys', '@whiskeysockets/baileys', 'baileys'))]
let baileys = null
let LIB_NAME = ''
const _libErrors = []
for (const name of LIB_CANDIDATES) {
    try { baileys = require(name); LIB_NAME = name; break }
    catch (e) { _libErrors.push(`${name}: ${e.message.split('\n')[0]}`) }
}
if (!baileys) {
    console.error('✖ Nessuna libreria Baileys trovata.\n  ' + _libErrors.join('\n  ') + '\n  Installa ad es.:  npm i @whiskeysockets/baileys')
    process.exit(1)
}
const makeWASocket = baileys.default || baileys.makeWASocket
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = baileys
const pino = require('pino')
const NodeCache = require('node-cache')
const path = require('path')
const os = require('os')
const { EventEmitter } = require('events')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ───────────────────────────────────────────────────────────────────────────
//  ⚙️  CONFIGURAZIONE
// ───────────────────────────────────────────────────────────────────────────
const CONFIG_FILE = './config.json'
const DEFAULTS = {
    numero: '573215721964',
    prefix: '.',
    prefixes: [],
    debug: false,
    markOnline: true,
    syncFullHistory: false,
    autoRead: true,
    autoPresence: true,
    autoTyping: true,
    autoReconnect: true,
    pairing: false,
    maxReconnectDelay: 60000,
    cooldownMs: 1200,
    commandTimeoutMs: 90000,
    ignoreOldMsgSec: 90,
    pluginsDir: './plugins',
    sessionDir: './session',
    statsFile: './data/stats.json',
    dbDir: './data/db',
    logsDir: './logs',
    backupDir: './backups',
    hotReload: true,
    ownerNotifyErrors: false,
    notifyOwnerOnline: false,
    replyDenied: true,
    replyCooldown: true,
    replyErrors: true,
    suggestCommands: true,
    logToFile: true,
    logMaxSizeMb: 5,
    floodWindowMs: 10000,
    floodMaxMsgs: 15,
    floodMuteMs: 30000,
    autoBackupIntervalMs: 6 * 60 * 60 * 1000,
    heartbeatIntervalMs: 60 * 1000,
    msgCacheTtlSec: 600,
    theme: 'zeno',
    cardMode: 'auto',             // auto | universal | carousel | album | stack | buttons | text
    library: '@itsliaaa/baileys', // libreria WhatsApp (cambiabile: @whiskeysockets/baileys, @itsukichan/baileys…)
    iosMode: 'universal',         // come mostrare le card su iPhone/Web/Desktop (universal | album | stack | text)
    nodeProfile: 'full',          // nodi "biz" iOS: full (biz+bot in privato) | biz | off
    universalTextFirst: true,     // su universal invia prima il testo normale (così su iPhone si vede sempre qualcosa)
    cardImage: 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg',
    cardFooter: 'ZENO ULTIMATE',
    cardsPerPage: 10,
    stackMax: 8,
    botName: 'ZENO ULTIMATE',
    version: '4.2.0'
}
let CONFIG = { ...DEFAULTS }
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
        CONFIG = { ...DEFAULTS, ...saved }
        CONFIG.version = DEFAULTS.version
        if (Object.keys(DEFAULTS).some(k => !(k in saved) && k !== 'version')) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4))
        }
    } else {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 4))
    }
} catch (e) { console.log('⚠️  config.json non leggibile:', e.message) }

const saveConfig = () => { try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4)) } catch {} }

const NUMERO      = CONFIG.numero
const DEBUG_LOG   = !!CONFIG.debug
const _pf         = [].concat(CONFIG.prefix || '.', CONFIG.prefixes || []).filter(x => typeof x === 'string' && x)
const PREFIX      = _pf[0] || '.'
const PREFIXES    = [...new Set(_pf.length ? _pf : ['.'])].sort((a, b) => b.length - a.length)
const PLUGINS_DIR = path.resolve(CONFIG.pluginsDir)

for (const d of [
    CONFIG.dbDir, CONFIG.logsDir, CONFIG.backupDir,
    path.dirname(path.resolve(CONFIG.statsFile)), CONFIG.sessionDir
]) {
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) } catch {}
}

const _rumore = /^(Closing |Removing old closed session|Opening session|Migrating session|Session already|Decrypted message with closed)/
for (const k of ['log', 'info', 'warn']) {
    const orig = console[k].bind(console)
    console[k] = (...a) => { if (typeof a[0] === 'string' && _rumore.test(a[0])) return; orig(...a) }
}

const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m', under: '\x1b[4m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
    white: '\x1b[37m', gray: '\x1b[90m',
    bgRed: '\x1b[41m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgMagenta: '\x1b[45m'
}
const fg = (n) => `\x1b[38;5;${n}m`
const ora = () => new Date().toLocaleTimeString('it-IT', { hour12: false })
const now = () => Date.now()

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '')
const vlen = (s) => [...stripAnsi(s)].length
const LOG_FILE = path.join(CONFIG.logsDir, `zeno-${new Date().toISOString().slice(0, 10)}.log`)

function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(LOG_FILE)) return
        const st = fs.statSync(LOG_FILE)
        if (st.size > CONFIG.logMaxSizeMb * 1024 * 1024) {
            fs.renameSync(LOG_FILE, LOG_FILE.replace(/\.log$/, `.${Date.now()}.log`))
        }
    } catch {}
}
function writeLogFile(line) {
    if (!CONFIG.logToFile) return
    try {
        rotateLogIfNeeded()
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${stripAnsi(line)}\n`)
    } catch {}
}
const LEVELS = {
    info: { c: 39,  l: 'INFO' },
    ok:   { c: 84,  l: ' OK ' },
    warn: { c: 214, l: 'WARN' },
    err:  { c: 203, l: 'FAIL' },
    dbg:  { c: 244, l: 'DBG ' }
}
function emit(level, msg) {
    const { c, l } = LEVELS[level]
    const body = level === 'dbg' ? `${C.gray}${msg}${C.reset}` : msg
    const line = `${C.gray}${ora()}${C.reset} ${fg(c)}${C.bold}${l}${C.reset} ${C.gray}│${C.reset} ${body}`
    console.log(line); writeLogFile(line)
}
function consoleBox(title, lines, color = 141) {
    const w = Math.max(vlen(title) + 6, ...lines.map(vlen)) + 2
    const c = fg(color)
    const top = `${c}╭─ ${C.bold}${title}${C.reset}${c} ${'─'.repeat(Math.max(1, w - vlen(title) - 3))}╮${C.reset}`
    const body = lines.map(l => `${c}│${C.reset} ${l}${' '.repeat(Math.max(0, w - vlen(l) - 1))}${c}│${C.reset}`)
    const bot = `${c}╰${'─'.repeat(w)}╯${C.reset}`
    return [top, ...body, bot].join('\n')
}
const log = {
    raw:  (m) => { console.log(m); writeLogFile(m) },
    info: (m) => emit('info', m),
    ok:   (m) => emit('ok', m),
    warn: (m) => emit('warn', m),
    err:  (m) => emit('err', m),
    dbg:  (m) => { if (DEBUG_LOG) emit('dbg', m) },
    box:  (title, lines, color) => log.raw(consoleBox(title, lines, color)),
    cmd:  (g, s, c, ok, ms) => {
        const i = ok ? `${fg(84)}✔${C.reset}` : `${fg(203)}✖${C.reset}`
        const t = ms != null ? ` ${C.dim}${ms}ms${C.reset}` : ''
        const l = `${C.gray}${ora()}${C.reset} ${i} ${C.gray}│${C.reset} ${fg(177)}${g}${C.reset} ${C.gray}‹${C.reset}${fg(87)}@${s}${C.reset}${C.gray}›${C.reset} ${C.gray}→${C.reset} ${fg(221)}${C.bold}${PREFIX}${c}${C.reset}${t}`
        console.log(l); writeLogFile(l)
    },
    event: (name, info = '') => {
        const l = `${C.gray}${ora()}${C.reset} ${fg(75)}◆${C.reset} ${C.bold}${name}${C.reset} ${C.dim}${info}${C.reset}`
        console.log(l); writeLogFile(l)
    }
}
const ASCII = [
    '███████╗███████╗███╗   ██╗ ██████╗ ',
    '╚══███╔╝██╔════╝████╗  ██║██╔═══██╗',
    '  ███╔╝ █████╗  ██╔██╗ ██║██║   ██║',
    ' ███╔╝  ██╔══╝  ██║╚██╗██║██║   ██║',
    '███████╗███████╗██║ ╚████║╚██████╔╝',
    '╚══════╝╚══════╝╚═╝  ╚═══╝ ╚═════╝ '
]
const GRAD = [213, 207, 171, 135, 99, 63]
const makeBanner = () => {
    const art = ASCII.map((l, i) => `   ${fg(GRAD[i])}${C.bold}${l}${C.reset}`).join('\n')
    const sub = `   ${fg(220)}${C.bold}U L T I M A T E   B O T${C.reset}  ${C.gray}core v${CONFIG.version} • universal cards${C.reset}`
    return `\n${art}\n${sub}\n`
}

class JsonDB {
    constructor(file, defaults = {}) {
        this.file = path.resolve(file)
        this._t = null
        this.data = { ...defaults }
        try {
            if (fs.existsSync(this.file)) {
                const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
                this.data = { ...defaults, ...raw }
            }
        } catch (e) { log.warn(`DB ${path.basename(this.file)} corrotto, riparto`) }
    }
    get(key, def) {
        const parts = String(key).split('.')
        let cur = this.data
        for (const p of parts) { if (cur == null || typeof cur !== 'object') return def; cur = cur[p] }
        return cur === undefined ? def : cur
    }
    set(key, val) {
        const parts = String(key).split('.')
        let cur = this.data
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}
            cur = cur[parts[i]]
        }
        cur[parts[parts.length - 1]] = val
        this.save()
        return val
    }
    inc(key, n = 1) { return this.set(key, (Number(this.get(key, 0)) || 0) + n) }
    has(key) { return this.get(key, '__∅__') !== '__∅__' }
    del(key) {
        const parts = String(key).split('.')
        let cur = this.data
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) return false
            cur = cur[parts[i]]
        }
        delete cur[parts[parts.length - 1]]
        this.save()
        return true
    }
    all() { return this.data }
    save() { clearTimeout(this._t); this._t = setTimeout(() => this.saveSync(), 500) }
    saveSync() {
        clearTimeout(this._t)
        try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)) } catch (e) { log.err(`DB save ${this.file}: ${e.message}`) }
    }
}
const db = {
    users:    new JsonDB(path.join(CONFIG.dbDir, 'users.json'),   {}),
    groups:   new JsonDB(path.join(CONFIG.dbDir, 'groups.json'),  {}),
    settings: new JsonDB(path.join(CONFIG.dbDir, 'settings.json'),{}),
    plugins:  new JsonDB(path.join(CONFIG.dbDir, 'plugins.json'), {}),
    premium:  new JsonDB(path.join(CONFIG.dbDir, 'premium.json'), {}),
    bans:     new JsonDB(path.join(CONFIG.dbDir, 'bans.json'),    { users: [], groups: [] }),
    notes:    new JsonDB(path.join(CONFIG.dbDir, 'notes.json'),   {})
}

const bus = new EventEmitter()
bus.setMaxListeners(200)

const scheduler = {
    tasks: new Map(),
    add(name, intervalMs, fn, { runNow = false } = {}) {
        if (this.tasks.has(name)) this.remove(name)
        const h = setInterval(() => { try { fn() } catch (e) { log.err(`task ${name}: ${e.message}`) } }, intervalMs)
        if (h.unref) h.unref()
        this.tasks.set(name, h)
        if (runNow) try { fn() } catch {}
        log.dbg(`Scheduler: + ${name} (${intervalMs}ms)`)
        return h
    },
    remove(name) {
        const h = this.tasks.get(name)
        if (h) { clearInterval(h); this.tasks.delete(name); log.dbg(`Scheduler: - ${name}`) }
    },
    stopAll() { for (const h of this.tasks.values()) clearInterval(h); this.tasks.clear() }
}

let stats = {
    startedAt: now(), bootCount: 0, commandsRun: 0, commandsFailed: 0,
    messagesSeen: 0, messagesBlocked: 0, reconnects: 0, pluginsLoaded: 0,
    perCommand: {}, perUser: {}, perCategory: {}
}
try {
    if (fs.existsSync(CONFIG.statsFile)) {
        const saved = JSON.parse(fs.readFileSync(CONFIG.statsFile, 'utf8'))
        stats = { ...stats, ...saved, startedAt: now() }
    }
} catch { log.warn('stats.json corrotto, riparto da zero') }
stats.bootCount = (stats.bootCount || 0) + 1

let _saveStatsT = null
const saveStats = () => {
    clearTimeout(_saveStatsT)
    _saveStatsT = setTimeout(() => {
        try { fs.writeFileSync(CONFIG.statsFile, JSON.stringify(stats, null, 2)) } catch {}
    }, 1500)
}
saveStats()

const getUptime = () => now() - stats.startedAt
const fmtUptime = (ms = getUptime()) => {
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60), sec = s % 60
    return `${d}g ${h}h ${m}m ${sec}s`
}
const fmtBytes = (b) => {
    if (b < 1024) return b + 'B'
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + 'KB'
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + 'MB'
    return (b / 1024 / 1024 / 1024).toFixed(2) + 'GB'
}

const THEMES = {
    zeno: {
        top: (t) => `╭━━━━〔 ✦ *${t}* ✦ 〕━━━━⬣`,
        sub: (t) => `┣━〔 ${t} 〕`,
        side: '┃', bullet: '✧',
        div: '┣━━━━━━━━━━━━━━⬣',
        bottom: '╰━━━━━━━━━━━━━━━━━━━⬣',
        foot: (t) => `   ✦ _${t}_ ✦`
    },
    neon: {
        top: (t) => `▛▀▀▀ ⚡ *${t}* ⚡ ▀▀▀▜`,
        sub: (t) => `▌◢ *${t}* ◣`,
        side: '▌', bullet: '▸',
        div: '▌──────────────',
        bottom: '▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟',
        foot: (t) => `   ⚡ _${t}_`
    },
    soft: {
        top: (t) => `꒰ ♡ *${t}* ♡ ꒱`,
        sub: (t) => ` ┊ ✿ *${t}*`,
        side: ' ┊', bullet: '˚₊‧',
        div: ' ┊┈┈┈┈┈┈┈┈┈┈',
        bottom: ' ╰┈┈┈┈┈┈┈┈┈┈┈➤',
        foot: (t) => `   ♡ _${t}_`
    },
    minimal: {
        top: (t) => `━━ *${t}* ━━`,
        sub: (t) => `▪ *${t}*`,
        side: '', bullet: '•',
        div: '──────────',
        bottom: '━━━━━━━━━━',
        foot: (t) => `_${t}_`
    }
}

const STATUS_STYLE = {
    ok:    { icon: '✅', title: 'FATTO' },
    error: { icon: '❌', title: 'ERRORE' },
    warn:  { icon: '⚠️', title: 'ATTENZIONE' },
    info:  { icon: 'ℹ️', title: 'INFO' }
}

const ui = {
    themes: THEMES,
    theme: () => THEMES[CONFIG.theme] || THEMES.zeno,

    box(title, lines = [], { footer, plain = false } = {}) {
        const t = ui.theme()
        const out = [t.top(title)]
        const push = (text, bullet) => {
            String(text).split('\n').forEach((ln, i) => {
                out.push([t.side, i === 0 ? bullet : '', ln].filter(Boolean).join(' '))
            })
        }
        for (const l of lines) {
            if (l == null || l === false) continue
            if (l === '---') out.push(t.div)
            else if (typeof l === 'object' && l.section) out.push(t.sub(l.section))
            else if (typeof l === 'object' && l.raw !== undefined) push(l.raw, '')
            else push(l, plain ? '' : t.bullet)
        }
        out.push(t.bottom)
        if (footer !== false) out.push(t.foot(footer ?? CONFIG.botName))
        return out.join('\n')
    },
    kv: (obj) => Object.entries(obj).map(([k, v]) => `${k}: *${v}*`),
    list: (items) => items.map(i => String(i)),
    bar(pct, w = 10) {
        const p = Math.max(0, Math.min(100, Number(pct) || 0))
        const f = Math.round(p / 100 * w)
        return `${'▰'.repeat(f)}${'▱'.repeat(w - f)} ${Math.round(p)}%`
    },
    table(rows) {
        if (!rows.length) return ''
        const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i] ?? '').length)))
        return '```\n' + rows.map(r => r.map((c, i) => String(c ?? '').padEnd(w[i])).join(' │ ')).join('\n') + '\n```'
    },
    status(type, msg, title) {
        const s = STATUS_STYLE[type] || STATUS_STYLE.info
        return ui.box(`${s.icon} ${title || s.title}`, [{ raw: msg }], { footer: false })
    }
}

const btn = {
    reply: (text, id) => ({ text, id }),
    url:   (text, url, useWebview = false) => (useWebview ? { text, url, useWebview: true } : { text, url }),
    copy:  (text, code) => ({ text, copy: code }),
    call:  (text, number) => ({ text, call: number }),
    list:  (text, sections) => ({ text, sections })
}

const MODES = ['auto', 'universal', 'carousel', 'album', 'stack', 'buttons', 'text']
const MODE_ALIAS = {
    carosello: 'carousel', card: 'stack', singole: 'stack', testo: 'text',
    plain: 'text', bottoni: 'buttons', foto: 'album', gallery: 'album',
    ios: 'universal', iphone: 'universal', native: 'universal', nativo: 'universal', universale: 'universal'
}
const FALLBACK = { universal: 'album', carousel: 'album', album: 'stack', stack: 'buttons', buttons: 'text', text: null }

function detectDevice(id = '') {
    const s = String(id || '').toUpperCase()
    if (!s) return 'unknown'
    if (s.startsWith('3A')) return 'ios'
    if (s.startsWith('3F')) return 'desktop'
    if (s.startsWith('3EB0') || s.startsWith('BAE5') || s.startsWith('3C')) return 'android'
    if (s.startsWith('3E')) return 'web'
    const L = s.length
    if (L >= 20 && L <= 22) return 'ios'
    if (L >= 22 && L <= 26) return 'android'
    return 'unknown'
}

function resolveCardMode(sender, device, forced) {
    let mode = forced || (sender ? db.users.get(`${sender}.cardMode`) : null) || CONFIG.cardMode || 'auto'
    mode = MODE_ALIAS[mode] || mode
    if (!MODES.includes(mode)) mode = 'auto'
    if (mode === 'auto') {
        const dev = device || (sender ? db.users.get(`${sender}.device`) : null)
        if (dev === 'android') return 'carousel'
        if (dev === 'ios' || dev === 'web' || dev === 'desktop') return MODE_ALIAS[CONFIG.iosMode] || CONFIG.iosMode || 'universal'
        return 'stack'
    }
    return mode
}

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const splitText = (s, max = 3500) => {
    if (s.length <= max) return [s]
    const out = []; let cur = ''
    for (const line of s.split('\n')) {
        if ((cur + '\n' + line).length > max) { out.push(cur); cur = line }
        else cur = cur ? cur + '\n' + line : line
    }
    if (cur) out.push(cur)
    return out
}
const toMedia = (x) => {
    if (!x) return null
    if (Buffer.isBuffer(x)) return x
    if (typeof x === 'string') return { url: x }
    return x
}
const normRows = (sections = []) => sections.map(s => ({
    ...s,
    rows: (s.rows || []).map(r => ({ header: '', description: '', ...r, id: r.id ?? r.rowId ?? r.title }))
}))
const normBtn = (b) => (b && b.sections ? { ...b, sections: normRows(b.sections) } : b)
const isReplyBtn = (b) => b && b.id !== undefined && !b.url && !b.copy && !b.call && !b.sections
const idToCmd = (id) => (/^[a-z0-9]/i.test(String(id)) ? PREFIX + id : String(id))
const cardCaption = (c) => [c.title ? `*${c.title}*` : '', c.body || c.caption || ''].filter(Boolean).join('\n\n')

function buildNativeFlow(bts = []) {
    return bts.map(b => {
        if (b.sections) return { text: b.text || 'Apri', sections: b.sections }
        if (b.url)   return { text: b.text, url: b.url, ...(b.useWebview ? { useWebview: true } : {}) }
        if (b.copy)  return { text: b.text, copy: b.copy }
        if (b.call)  return { text: b.text, call: b.call }
        return { text: b.text, id: b.id }
    })
}
function buildTemplateButtons(bts = []) {
    return bts.slice(0, 3).map((b, i) => {
        if (b.url)  return { index: i + 1, urlButton: { displayText: b.text, url: b.url } }
        if (b.call) return { index: i + 1, callButton: { displayText: b.text, phoneNumber: b.call } }
        return { index: i + 1, quickReplyButton: { displayText: b.text, id: String(b.id) } }
    })
}
function buildLegacyButtons(bts = []) {
    return bts.slice(0, 3).map(b => ({
        buttonId: String(b.id ?? b.text),
        buttonText: { displayText: b.text },
        type: 1
    }))
}

function btnToText(b) {
    if (b.url)  return `🔗 ${b.text}: ${b.url}`
    if (b.copy) return `📋 ${b.text}: ${b.copy}`
    if (b.call) return `📞 ${b.text}: ${b.call}`
    if (b.sections) {
        return normRows(b.sections).map(s => [
            s.title ? `▸ ${s.title}` : '',
            ...s.rows.map(r => `  ↳ ${r.title}${r.description ? ' — ' + r.description : ''}: *${idToCmd(r.id)}*`)
        ].filter(Boolean).join('\n')).join('\n')
    }
    if (b.id !== undefined) return `↳ ${b.text}: *${idToCmd(b.id)}*`
    return b.text || ''
}

function makeCard(c = {}) {
    const card = { caption: cardCaption(c), footer: c.footer ?? CONFIG.cardFooter }
    const vid = toMedia(c.video)
    const img = toMedia(c.image === undefined ? CONFIG.cardImage : c.image)
    if (vid) card.video = vid
    else if (img) card.image = img
    const bts = (c.buttons || []).slice(0, 3).map(normBtn)
    if (bts.length) card.nativeFlow = buildNativeFlow(bts)
    for (const k of ['offerText', 'offerCode', 'offerUrl', 'offerExpiration', 'optionText', 'optionTitle']) {
        if (c[k] !== undefined) card[k] = c[k]
    }
    return card
}
function makeStackContent(c = {}) {
    const caption = cardCaption(c)
    const footer = c.footer ?? CONFIG.cardFooter
    const vid = toMedia(c.video)
    const img = toMedia(c.image === undefined ? CONFIG.cardImage : c.image)
    const content = {}
    if (vid) { content.video = vid; content.caption = caption }
    else if (img) { content.image = img; content.caption = caption }
    else content.text = caption
    if (footer) content.footer = footer
    const bts = (c.buttons || []).slice(0, 3).map(normBtn)
    if (bts.length) content.nativeFlow = buildNativeFlow(bts)
    return content
}
function cardsToText(spec) {
    const lines = []
    if (spec.text) lines.push({ raw: spec.text })
    ;(spec.cards || []).forEach((c, i) => {
        lines.push({ section: `${i + 1}. ${c.title || 'Card'}` })
        const body = c.body || c.caption
        if (body) lines.push({ raw: String(body) })
        for (const b of c.buttons || []) { const t = btnToText(b); if (t) lines.push({ raw: t }) }
    })
    return ui.box(spec.title || CONFIG.botName, lines, { footer: spec.footer })
}

// ───────────────────────────────────────────────────────────────────────────
//  📱  UNIVERSAL — card/bottoni/liste per Android + iPhone, con QUALSIASI Baileys
//     Costruisce il messaggio "interactive" a basso livello e lo invia con i
//     nodi <biz> che WhatsApp richiede per mostrarlo (senza, iPhone non vede nulla).
// ───────────────────────────────────────────────────────────────────────────
function bizNodes(kind, jid) {
    const prof = CONFIG.nodeProfile || 'full'
    if (prof === 'off') return []
    if (kind === 'list') return [{ tag: 'biz', attrs: {}, content: [{ tag: 'list', attrs: { type: 'product_list', v: '2' } }] }]
    const nodes = [{
        tag: 'biz', attrs: {},
        content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
    }]
    if (prof === 'full' && !isGroupJid(jid)) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
    return nodes
}

function flowButton(b) {
    const j = (o) => JSON.stringify(o)
    if (b.sections) {
        return {
            name: 'single_select',
            buttonParamsJson: j({
                title: b.text || 'Apri',
                sections: normRows(b.sections).map(s => ({
                    title: s.title || '',
                    rows: s.rows.map(r => ({ header: r.header || '', title: r.title, description: r.description || '', id: String(r.id) }))
                }))
            })
        }
    }
    if (b.url)  return { name: 'cta_url',  buttonParamsJson: j({ display_text: b.text, url: b.url, merchant_url: b.url }) }
    if (b.copy) return { name: 'cta_copy', buttonParamsJson: j({ display_text: b.text, copy_code: String(b.copy) }) }
    if (b.call) return { name: 'cta_call', buttonParamsJson: j({ display_text: b.text, phone_number: String(b.call) }) }
    return { name: 'quick_reply', buttonParamsJson: j({ display_text: b.text, id: String(b.id ?? b.text) }) }
}

async function flowHeader(sock, c = {}) {
    const IM = baileys.proto.Message.InteractiveMessage
    const vid = toMedia(c.video)
    const img = toMedia(c.image === undefined ? CONFIG.cardImage : c.image)
    try {
        if (vid) {
            const { videoMessage } = await baileys.prepareWAMessageMedia({ video: vid }, { upload: sock.waUploadToServer })
            return IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, videoMessage })
        }
        if (img) {
            const { imageMessage } = await baileys.prepareWAMessageMedia({ image: img }, { upload: sock.waUploadToServer })
            return IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, imageMessage })
        }
    } catch (e) { log.dbg(`header media: ${e.message}`) }
    return IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false })
}

// spec: { body, footer, image|video, buttons }  oppure  { body, footer, cards:[card spec] }
async function buildInteractive(sock, jid, spec = {}, quoted) {
    const IM = baileys.proto.Message.InteractiveMessage
    const obj = {
        body: IM.Body.fromObject({ text: spec.body || ' ' }),
        footer: IM.Footer.fromObject({ text: spec.footer ?? CONFIG.cardFooter ?? '' })
    }
    if (spec.cards) {
        const cards = []
        for (const c of spec.cards) {
            cards.push(IM.fromObject({
                header: await flowHeader(sock, c),
                body: IM.Body.fromObject({ text: cardCaption(c) || ' ' }),
                footer: IM.Footer.fromObject({ text: c.footer ?? CONFIG.cardFooter ?? '' }),
                nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons: (c.buttons || []).slice(0, 3).map(flowButton) })
            }))
        }
        obj.header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false })
        obj.carouselMessage = IM.CarouselMessage.fromObject({ cards, messageVersion: 1 })
    } else {
        obj.header = await flowHeader(sock, { image: spec.image ?? null, video: spec.video })
        obj.nativeFlowMessage = IM.NativeFlowMessage.fromObject({ buttons: (spec.buttons || []).map(flowButton) })
    }
    return baileys.generateWAMessageFromContent(jid, {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: IM.fromObject(obj)
    }, { userJid: sock.user?.id, quoted })
}

// Lista "legacy": è l'unica che si vede anche su iPhone
async function buildLegacyList(sock, jid, spec = {}, quoted) {
    const LM = baileys.proto.Message.ListMessage
    return baileys.generateWAMessageFromContent(jid, {
        listMessage: LM.fromObject({
            title: spec.title || '',
            description: spec.text || ' ',
            buttonText: spec.buttonText || 'Apri menu',
            listType: 1,
            footerText: spec.footer ?? CONFIG.cardFooter ?? '',
            sections: normRows(spec.sections).map(s => ({
                title: s.title || '',
                rows: s.rows.map(r => ({ title: r.title, description: r.description || '', rowId: String(r.id) }))
            }))
        })
    }, { userJid: sock.user?.id, quoted })
}

async function relayInteractive(sock, jid, msg, kind) {
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: bizNodes(kind, jid) })
    try { if (msg.key?.id) msgStore.set(msg.key.id, msg.message) } catch {}
    return msg
}

async function sendCards(sock, jid, spec = {}, o = {}) {
    const all = (spec.cards || []).filter(Boolean)
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    if (!all.length) return sock.sendMessage(jid, { text: spec.text || '' }, sendOpts)

    const runCarousel = async () => {
        const pages = chunk(all, Math.max(1, CONFIG.cardsPerPage))
        let last
        for (let i = 0; i < pages.length; i++) {
            last = await sock.sendMessage(jid, {
                text: i === 0 ? (spec.text || '✦') : `✦ ${i + 1}/${pages.length}`,
                footer: spec.footer ?? CONFIG.cardFooter,
                cards: pages[i].map(makeCard)
            }, sendOpts)
            if (i < pages.length - 1) await sleep(400)
        }
        return last
    }
    const runUniversal = async () => {
        let last
        const textFirst = CONFIG.universalTextFirst && spec.text
        if (textFirst) last = await sock.sendMessage(jid, { text: spec.text }, sendOpts)
        const pages = chunk(all, Math.max(1, CONFIG.cardsPerPage))
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i]
            const spec2 = page.length === 1
                ? { body: cardCaption(page[0]), footer: page[0].footer, image: page[0].image === undefined ? CONFIG.cardImage : page[0].image, video: page[0].video, buttons: (page[0].buttons || []).slice(0, 3) }
                : { body: textFirst ? '✦' : (spec.text || '✦'), footer: spec.footer, cards: page }
            const msg = await buildInteractive(sock, jid, spec2, o.quoted)
            last = await relayInteractive(sock, jid, msg, 'interactive')
            if (i < pages.length - 1) await sleep(400)
        }
        return last
    }
    const runAlbum = async () => {
        let last
        if (spec.text) last = await sock.sendMessage(jid, { text: spec.text }, sendOpts)
        for (const c of all) {
            last = await sock.sendMessage(jid, makeStackContent(c), sendOpts)
            await sleep(300)
        }
        return last
    }
    const runStack = async () => {
        let last
        if (spec.text) last = await sock.sendMessage(jid, { text: spec.text }, sendOpts)
        const shown = all.slice(0, Math.max(1, CONFIG.stackMax))
        for (const c of shown) {
            last = await sock.sendMessage(jid, makeStackContent(c), sendOpts)
            await sleep(350)
        }
        if (all.length > shown.length) {
            for (const part of splitText(cardsToText({ title: `ALTRE ${all.length - shown.length}`, cards: all.slice(shown.length) }))) {
                last = await sock.sendMessage(jid, { text: part }, sendOpts)
            }
        }
        return last
    }
    const runButtons = async () => sendButtons(sock, jid, {
        title: spec.title, text: spec.text,
        image: all[0]?.image, footer: spec.footer,
        buttons: all[0]?.buttons || []
    }, o)
    const runText = async () => {
        let last
        for (const part of splitText(cardsToText(spec))) last = await sock.sendMessage(jid, { text: part }, sendOpts)
        return last
    }

    const runners = { universal: runUniversal, carousel: runCarousel, album: runAlbum, stack: runStack, buttons: runButtons, text: runText }
    let mode = resolveCardMode(o.sender, o.device, o.mode)
    for (let guard = 0; guard < 6 && mode; guard++) {
        try { return await runners[mode]() }
        catch (e) {
            const next = FALLBACK[mode]
            log.dbg(`cards[${mode}] fallito (${e.message}) → ${next || 'stop'}`)
            mode = next
        }
    }
    return sock.sendMessage(jid, { text: cardsToText(spec) }, sendOpts)
}

async function sendButtons(sock, jid, spec = {}, o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    const bts = (spec.buttons || []).map(normBtn)
    const footer = spec.footer ?? CONFIG.cardFooter
    const img = toMedia(spec.image)
    const base = {}
    if (img) { base.image = img; base.caption = spec.text || '' } else base.text = spec.text || ''
    if (footer) base.footer = footer

    const bmode = resolveCardMode(o.sender, o.device, o.mode)
    if (bmode === 'text') {
        return sock.sendMessage(jid, {
            text: cardsToText({ title: spec.title, text: spec.text, cards: [{ title: '', buttons: bts }] })
        }, sendOpts)
    }
    if (bmode === 'universal') {
        try {
            const msg = await buildInteractive(sock, jid, { body: spec.text || ' ', footer, image: spec.image ?? null, buttons: bts }, o.quoted)
            return await relayInteractive(sock, jid, msg, 'interactive')
        } catch (e) { log.dbg(`buttons universal fallito (${e.message})`) }
    }
    const attempts = [
        { ...base, nativeFlow: buildNativeFlow(bts) },
        { ...base, templateButtons: buildTemplateButtons(bts) },
        { ...base, buttons: buildLegacyButtons(bts) }
    ]
    for (const content of attempts) {
        try { return await sock.sendMessage(jid, content, sendOpts) }
        catch (e) { log.dbg(`buttons fallito (${e.message})`) }
    }
    return sock.sendMessage(jid, {
        text: cardsToText({ title: spec.title, text: spec.text, cards: [{ title: '', buttons: bts }] })
    }, sendOpts)
}

async function sendList(sock, jid, spec = {}, o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    const sections = normRows(spec.sections)
    const textFallback = () => {
        const lines = []
        if (spec.text) lines.push({ raw: spec.text })
        for (const s of sections) {
            if (s.title) lines.push({ section: s.title })
            for (const r of s.rows) lines.push(`*${idToCmd(r.id)}*${r.description ? ' — ' + r.description : ''}${r.title && r.title !== r.id ? ` (${r.title})` : ''}`)
        }
        return ui.box(spec.title || CONFIG.botName, lines, { footer: spec.footer })
    }
    if (resolveCardMode(o.sender, o.device, o.mode) === 'universal') {
        try {
            const msg = await buildLegacyList(sock, jid, { ...spec, sections }, o.quoted)
            return await relayInteractive(sock, jid, msg, 'list')
        } catch (e) { log.dbg(`list universal fallita (${e.message})`) }
    }
    const body = [spec.title ? `*${spec.title}*` : '', spec.text || ''].filter(Boolean).join('\n\n')
    const img = toMedia(spec.image)
    const base = img ? { image: img, caption: body } : { text: body || '✦' }
    const attempts = [
        { ...base, footer: spec.footer ?? CONFIG.cardFooter, nativeFlow: [{ text: spec.buttonText || 'Apri menu', sections }] },
        { ...base, footer: spec.footer ?? CONFIG.cardFooter, buttonText: spec.buttonText || 'Apri menu', sections },
        { ...base, templateButtons: sections[0]?.rows?.slice(0, 3).map((r, i) => ({ index: i + 1, quickReplyButton: { displayText: r.title, id: String(r.id) } })) || [] }
    ]
    for (const c of attempts) {
        try { return await sock.sendMessage(jid, c, sendOpts) }
        catch (e) { log.dbg(`list fallito (${e.message})`) }
    }
    let last
    for (const part of splitText(textFallback())) last = await sock.sendMessage(jid, { text: part }, sendOpts)
    return last
}

async function sendTable(sock, jid, title, rows, o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    try {
        return await sock.sendMessage(jid, {
            disclaimerText: CONFIG.botName, headerText: `## ${title}`, contentText: '---',
            title, table: rows, footerText: o.footer || CONFIG.cardFooter
        }, sendOpts)
    } catch (e) {
        log.dbg(`table fallita (${e.message}) → testo`)
        return sock.sendMessage(jid, { text: ui.box(title, [{ raw: ui.table(rows) }]) }, sendOpts)
    }
}
async function sendCode(sock, jid, code, language = 'javascript', o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    try {
        return await sock.sendMessage(jid, {
            disclaimerText: CONFIG.botName, headerText: o.title ? `## ${o.title}` : '', contentText: '---',
            code, language, footerText: o.footer || CONFIG.cardFooter
        }, sendOpts)
    } catch (e) {
        log.dbg(`code fallita (${e.message}) → testo`)
        return sock.sendMessage(jid, { text: '```\n' + code + '\n```' }, sendOpts)
    }
}

async function sendAlbum(sock, jid, mediaList = [], caption = '', o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    let last
    for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i]
        const content = {}
        if (m.video) content.video = toMedia(m.video)
        else if (m.image) content.image = toMedia(m.image)
        else if (m.audio) { content.audio = toMedia(m.audio); content.ptt = !!m.ptt; content.mimetype = m.mimetype || 'audio/ogg; codecs=opus' }
        else if (m.document) { content.document = toMedia(m.document); content.mimetype = m.mimetype; content.fileName = m.fileName || 'file' }
        else continue
        if (i === 0 && caption) content.caption = caption
        if (m.caption && i === 0) content.caption = content.caption || m.caption
        last = await sock.sendMessage(jid, content, sendOpts)
        if (i < mediaList.length - 1) await sleep(300)
    }
    return last
}

async function sendPoll(sock, jid, name, values, opts = {}) {
    const sendOpts = opts.quoted ? { quoted: opts.quoted } : undefined
    const selectableCount = opts.selectableCount ?? opts.multi ?? 1
    const content = { poll: { name, values, selectableCount } }
    if (opts.correctAnswer !== undefined) content.poll.correctAnswer = opts.correctAnswer
    return sock.sendMessage(jid, content, sendOpts)
}

async function sendEvent(sock, jid, ev = {}, o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    const content = {
        event: {
            name: ev.name || 'Evento',
            description: ev.description || '',
            location: ev.location || { name: ev.locationName || '', degreesLatitude: ev.lat, degreesLongitude: ev.lng },
            startTime: ev.startTime || Math.floor(Date.now() / 1000),
            endTime: ev.endTime || Math.floor(Date.now() / 1000) + 3600,
            isCanceled: !!ev.canceled,
            isSchedule: true,
            extraGuestsAllowed: ev.guests !== false
        }
    }
    try { return await sock.sendMessage(jid, content, sendOpts) }
    catch (e) {
        log.dbg(`event fallito: ${e.message} → testo`)
        const when = new Date((ev.startTime || Date.now() / 1000) * 1000).toLocaleString('it-IT')
        return sock.sendMessage(jid, { text: ui.box('📅 EVENTO', [
            `📌 *${ev.name}*`, ev.description || '', `🗓️ ${when}`, ev.locationName ? `📍 ${ev.locationName}` : ''
        ].filter(Boolean)) }, sendOpts)
    }
}

async function sendLocation(sock, jid, lat, lng, o = {}) {
    return sock.sendMessage(jid, {
        location: { degreesLatitude: lat, degreesLongitude: lng, name: o.name, address: o.address }
    }, o.quoted ? { quoted: o.quoted } : undefined)
}

async function sendContact(sock, jid, contacts, o = {}) {
    const list = (Array.isArray(contacts) ? contacts : [contacts]).map(c => ({
        displayName: c.name || c.displayName || 'Contatto',
        vcard: c.vcard || `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name || ''}\nTEL;type=CELL;type=VOICE;waid=${String(c.number).replace(/\D/g, '')}:+${String(c.number).replace(/\D/g, '')}\nEND:VCARD`
    }))
    return sock.sendMessage(jid, { contacts: { displayName: list[0]?.displayName, contacts: list } }, o.quoted ? { quoted: o.quoted } : undefined)
}

async function sendVoice(sock, jid, audio, o = {}) {
    const buf = Buffer.isBuffer(audio) ? audio : toMedia(audio)
    return sock.sendMessage(jid, {
        audio: buf,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        ...(o.quoted ? { quoted: o.quoted } : {})
    })
}

async function sendSticker(sock, jid, sticker, o = {}) {
    const buf = Buffer.isBuffer(sticker) ? sticker : toMedia(sticker)
    return sock.sendMessage(jid, { sticker: buf }, o.quoted ? { quoted: o.quoted } : undefined)
}

async function sendGif(sock, jid, video, o = {}) {
    const buf = Buffer.isBuffer(video) ? video : toMedia(video)
    return sock.sendMessage(jid, {
        video: buf, gifPlayback: true, caption: o.caption || '',
        mimetype: 'video/mp4'
    }, o.quoted ? { quoted: o.quoted } : undefined)
}

async function sendDocument(sock, jid, doc, o = {}) {
    const buf = Buffer.isBuffer(doc) ? doc : toMedia(doc)
    return sock.sendMessage(jid, {
        document: buf,
        mimetype: o.mimetype || 'application/octet-stream',
        fileName: o.fileName || 'file.bin',
        caption: o.caption || ''
    }, o.quoted ? { quoted: o.quoted } : undefined)
}

async function sendProduct(sock, jid, product = {}, o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    try {
        return await sock.sendMessage(jid, {
            text: product.description || '',
            footer: product.footer || CONFIG.cardFooter,
            image: toMedia(product.image),
            nativeFlow: [{
                text: product.buttonText || 'Vedi prodotto',
                product: {
                    title: product.title,
                    price: product.price,
                    currency: product.currency || 'EUR',
                    retailerId: product.retailerId,
                    url: product.url,
                    description: product.description,
                    body: product.body
                }
            }]
        }, sendOpts)
    } catch (e) {
        log.dbg(`product fallito: ${e.message} → testo`)
        return sock.sendMessage(jid, { text: ui.box('🛍️ PRODOTTO', [
            `*${product.title}*`, product.description || '',
            product.price ? `💰 ${product.price} ${product.currency || 'EUR'}` : '',
            product.url || ''
        ].filter(Boolean)) }, sendOpts)
    }
}

const cardsApi = {
    make: makeCard, makeStack: makeStackContent, toText: cardsToText,
    send: sendCards, sendButtons, sendList, sendTable, sendCode,
    sendAlbum, sendPoll, sendEvent, sendLocation, sendContact,
    sendVoice, sendSticker, sendGif, sendDocument, sendProduct,
    universal: { buildInteractive, buildLegacyList, relayInteractive, bizNodes, flowButton },
    resolveMode: resolveCardMode, detectDevice, MODES
}

const CAT_EMOJI = {
    general: '✨', admin: '🛡️', giochi: '🎮', fun: '🎉', sticker: '🖼️', download: '📥',
    musica: '🎵', owner: '👑', tools: '🧰', gruppo: '👥', rpg: '⚔️', sistema: '⚙️', moderazione: '🚨'
}
const catEmoji = (c) => CAT_EMOJI[c] || '📦'
const primaryCmd = (p) => p.commands.find(c => typeof c === 'string') || p.name

const corePlugins = [
    {
        commands: ['menu'], name: 'menu', category: 'sistema', author: 'ZENO',
        description: 'Menu automatico a card con tutte le categorie', usage: '[categoria]',
        async run(sock, m, args, cmd, ctx) {
            const want = (args[0] || '').toLowerCase()
            const visible = (list) => list.filter(p => !p.hidden && isPluginEnabled(p))
            if (want && categoryIndex.has(want)) {
                const list = visible(categoryIndex.get(want))
                const lines = list.map(p => `*${PREFIX}${primaryCmd(p)}*${p.usage ? ' ' + p.usage : ''}${p.description ? ' — ' + p.description : ''}`)
                return ctx.reply(ui.box(`${catEmoji(want)} ${want.toUpperCase()}`, lines.length ? lines : ['Nessun comando']))
            }
            const cards = []
            for (const [cat, list] of categoryIndex) {
                const v = visible(list)
                if (!v.length) continue
                const names = v.slice(0, 6).map(p => PREFIX + primaryCmd(p)).join('  ')
                cards.push({
                    title: `${catEmoji(cat)} ${cat.toUpperCase()}`,
                    body: `${v.length} comandi\n${names}${v.length > 6 ? ' …' : ''}`,
                    buttons: [btn.reply('Apri', `menu ${cat}`)]
                })
            }
            await ctx.sendCards({ text: `✦ *${CONFIG.botName}*\nScegli una categoria`, cards })
        }
    },
    {
        commands: ['help', 'aiuto'], name: 'help', category: 'sistema', author: 'ZENO',
        description: 'Dettagli su un comando', usage: '<comando>', minArgs: 1,
        async run(sock, m, args, cmd, ctx) {
            const p = findPlugin(args[0].replace(/^[^a-z0-9]+/i, ''))
            if (!p) return ctx.err(`Comando *${args[0]}* non trovato.`)
            const flags = ['groupOnly', 'privateOnly', 'ownerOnly', 'adminOnly', 'premiumOnly'].filter(k => p[k])
            await ctx.reply(ui.box(`HELP • ${primaryCmd(p)}`, [
                p.description && `📝 ${p.description}`,
                `📦 Categoria: *${p.category}*`,
                `⌨️ Uso: *${PREFIX}${primaryCmd(p)} ${p.usage || ''}*`.trim(),
                p.aliases.length && `🔁 Alias: ${p.aliases.map(a => PREFIX + a).join(', ')}`,
                p.examples.length && { section: 'Esempi' },
                ...p.examples.map(e => `${PREFIX}${e}`),
                flags.length && `🔒 Richiede: ${flags.join(', ')}`,
                p.cooldown != null && `⏱️ Cooldown: ${p.cooldown / 1000}s`
            ].filter(Boolean)))
        }
    },
    {
        commands: ['ping'], name: 'ping', category: 'sistema', author: 'ZENO',
        description: 'Latenza e uptime del bot',
        async run(sock, m, args, cmd, ctx) {
            const t0 = now()
            const sent = await ctx.reply('🏓 …')
            const ms = now() - t0
            await ctx.edit(sent.key, ui.box('PONG', [`⚡ Latenza: *${ms}ms*`, `⏳ Uptime: *${fmtUptime()}*`]))
        }
    },
    {
        commands: ['status', 'stato', 'info'], name: 'status', category: 'sistema', author: 'ZENO',
        description: 'Stato completo del bot',
        async run(sock, m, args, cmd, ctx) {
            const mem = process.memoryUsage()
            const users = Object.keys(db.users.all()).length
            await ctx.reply(ui.box('STATUS', [
                { section: 'Bot' },
                `${CONFIG.botName} *v${CONFIG.version}*`,
                `⏳ Uptime: *${fmtUptime()}*`,
                `🔌 Plugin: *${plugins.length}* • Comandi: *${cmdIndex.size}*`,
                { section: 'Attività' },
                `📨 Messaggi: *${stats.messagesSeen}*`,
                `✅ Comandi eseguiti: *${stats.commandsRun}*  ❌ falliti: *${stats.commandsFailed}*`,
                `🔁 Riconnessioni: *${stats.reconnects}*  👤 Utenti: *${users}*`,
                { section: 'Sistema' },
                `🧠 RAM: ${ui.bar(mem.rss / os.totalmem() * 100)} (${fmtBytes(mem.rss)})`,
                `🖥️ Node ${process.version} • ${os.platform()} ${os.arch()}`
            ]))
        }
    },
    {
        commands: ['top'], name: 'top', category: 'sistema', author: 'ZENO',
        description: 'Classifica comandi e utenti più attivi',
        async run(sock, m, args, cmd, ctx) {
            const top = (obj, n = 5) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
            await ctx.reply(ui.box('TOP', [
                { section: 'Comandi' },
                ...top(stats.perCommand).map(([k, v], i) => `${medals[i]} ${PREFIX}${k} — *${v}*`),
                { section: 'Utenti' },
                ...top(stats.perUser).map(([k, v], i) => `${medals[i]} @${k} — *${v}*`)
            ]))
        }
    },
    {
        commands: ['cardmode'], name: 'cardmode', category: 'sistema', author: 'ZENO',
        description: 'Scegli come vedere card e menu (auto/universal/carousel/album/stack/buttons/text)',
        usage: '[modalità]',
        async run(sock, m, args, cmd, ctx) {
            const want = MODE_ALIAS[(args[0] || '').toLowerCase()] || (args[0] || '').toLowerCase()
            if (MODES.includes(want) && want !== 'auto') {
                db.users.set(`${ctx.sender}.cardMode`, want)
                return ctx.ok(`Modalità card impostata su *${want}*.\nProva con *${PREFIX}cardtest*`)
            }
            const cur = db.users.get(`${ctx.sender}.cardMode`) || CONFIG.cardMode
            await ctx.sendButtons({
                title: 'CARD MODE',
                text: ui.box('CARD MODE', [
                    `Attuale: *${cur}* → uso *${resolveCardMode(ctx.sender, ctx.device)}*`,
                    `Dispositivo rilevato: *${ctx.device}*`,
                    { section: 'Modalità' },
                    `*auto* — scelta intelligente per dispositivo`,
                    `*universal* — card/bottoni con nodi iOS (Android + iPhone)`,
                    `*carousel* — carosello nativo (Android)`,
                    `*album* — galleria di immagini con bottoni (iPhone)`,
                    `*stack* — una card per messaggio`,
                    `*buttons* — solo bottoni`,
                    `*text* — solo testo`,
                    { raw: `Esempio: *${PREFIX}cardmode stack*` }
                ], { footer: false }),
                buttons: ['auto', 'universal', 'carousel', 'album', 'stack', 'buttons', 'text']
                    .map(x => btn.reply(x, `cardmode ${x}`))
            })
        }
    },
    {
        commands: ['cardtest'], name: 'cardtest', category: 'sistema', author: 'ZENO',
        description: 'Prova le card sul tuo telefono', usage: '[modalità|all|list]',
        async run(sock, m, args, cmd, ctx) {
            const arg0 = (args[0] || '').toLowerCase()
            const demoCards = [
                { title: '🏓 Ping', body: 'Controlla che il bot risponda.', buttons: [btn.reply('Esegui', 'ping')] },
                { title: '📊 Status', body: 'Uptime, RAM e statistiche.', buttons: [btn.reply('Apri', 'status'), btn.copy('Copia versione', CONFIG.version)] }
            ]
            if (arg0 === 'all') {
                await ctx.reply(ui.box('TEST COMPLETO', [`Dispositivo rilevato: *${ctx.device}*`, 'Ti mando 4 versioni numerate.', 'Dimmi quali vedi sul telefono.']))
                for (const [i, md] of ['universal', 'carousel', 'stack', 'text'].entries()) {
                    await ctx.sendCards({ text: `*Test ${i + 1}/4 — ${md}*`, cards: demoCards }, { mode: md })
                    await sleep(1200)
                }
                await ctx.sendList({ title: 'Test 5 — lista', text: 'Lista (versione compatibile iPhone)', buttonText: 'Apri', sections: [{ title: 'Comandi', rows: [{ title: 'Ping', description: 'Test', id: 'ping' }, { title: 'Status', description: 'Stato', id: 'status' }] }] }, { mode: 'universal' })
                return
            }
            if (arg0 === 'list') {
                return ctx.sendList({ title: 'Test lista', text: 'Scegli un comando', buttonText: 'Apri', sections: [{ title: 'Comandi', rows: [{ title: 'Ping', description: 'Test', id: 'ping' }, { title: 'Status', description: 'Stato', id: 'status' }] }] })
            }
            const forced = MODE_ALIAS[arg0] || arg0
            await ctx.sendCards({
                text: `✦ *Test card*\nModalità: *${resolveCardMode(ctx.sender, ctx.device, MODES.includes(forced) ? forced : undefined)}* • dispositivo: *${ctx.device}*`,
                cards: [
                    { title: '🏓 Ping', body: 'Controlla che il bot risponda e quanto è veloce.', buttons: [btn.reply('Esegui', 'ping')] },
                    { title: '📊 Status', body: 'Uptime, RAM, plugin e statistiche.', buttons: [btn.reply('Apri', 'status'), btn.copy('Copia versione', CONFIG.version)] },
                    { title: '🌐 Libreria', body: 'Pagina della libreria usata dal bot.', buttons: [btn.url('Apri sito', 'https://www.npmjs.com/package/@itsliaaa/baileys'), btn.reply('Menu', 'menu')] }
                ]
            }, { mode: MODES.includes(forced) ? forced : undefined })
        }
    },
    {
        commands: ['cardnodes'], name: 'cardnodes', category: 'sistema', author: 'ZENO', ownerOnly: true,
        description: 'Profilo dei nodi iOS per le card (full/biz/off)', usage: '[full|biz|off]',
        async run(sock, m, args, cmd, ctx) {
            const want = (args[0] || '').toLowerCase()
            if (['full', 'biz', 'off'].includes(want)) { CONFIG.nodeProfile = want; saveConfig() }
            await ctx.reply(ui.box('NODI iOS', [
                `Libreria: *${LIB_NAME}*`,
                `Profilo attuale: *${CONFIG.nodeProfile}*`,
                { section: 'Profili' },
                '*full* — biz + bot nelle chat private',
                '*biz* — solo biz',
                '*off* — nessun nodo',
                { raw: `Se su iPhone non vedi le card prova: *${PREFIX}cardnodes biz* poi *${PREFIX}cardtest universal*` }
            ]))
        }
    },
    {
        commands: ['theme', 'tema'], name: 'theme', category: 'sistema', author: 'ZENO', ownerOnly: true,
        description: 'Cambia lo stile dei riquadri', usage: '[zeno|neon|soft|minimal]',
        async run(sock, m, args, cmd, ctx) {
            const want = (args[0] || '').toLowerCase()
            if (THEMES[want]) { CONFIG.theme = want; saveConfig() }
            else if (args[0]) return ctx.err(`Temi disponibili: ${Object.keys(THEMES).join(', ')}`)
            await ctx.reply(ui.box(`TEMA • ${CONFIG.theme}`, [
                `Anteprima del tema *${CONFIG.theme}*`,
                { section: 'Sezione' }, 'riga di esempio', 'un\'altra riga',
                { raw: `Disponibili: ${Object.keys(THEMES).join(', ')}` }
            ]))
        }
    },
    {
        commands: ['plugins', 'plugin'], name: 'plugins', category: 'sistema', author: 'ZENO', ownerOnly: true,
        description: 'Elenco plugin, attiva/disattiva', usage: '[on|off <nome>]',
        async run(sock, m, args, cmd, ctx) {
            const act = (args[0] || '').toLowerCase()
            if ((act === 'on' || act === 'off') && args[1]) {
                const p = plugins.find(x => x.name.toLowerCase() === args[1].toLowerCase())
                if (!p) return ctx.err(`Plugin *${args[1]}* non trovato.`)
                db.plugins.set(p.name, act === 'on')
                return ctx.ok(`Plugin *${p.name}* ${act === 'on' ? 'attivato' : 'disattivato'}.`)
            }
            const lines = plugins.map(p => `${isPluginEnabled(p) ? '🟢' : '🔴'} *${p.name}* — ${p.__usage} usi${p.__errors ? `, ${p.__errors} err` : ''}`)
            await ctx.reply(ui.box(`PLUGIN (${plugins.length})`, [...lines, { raw: `Uso: *${PREFIX}plugins off <nome>*` }]))
        }
    },
    {
        commands: ['reload'], name: 'reload', category: 'sistema', author: 'ZENO', ownerOnly: true,
        description: 'Ricarica tutti i plugin',
        async run(sock, m, args, cmd, ctx) {
            const t0 = now()
            loadPlugins(true)
            await ctx.ok(`Ricaricati *${plugins.length}* plugin in ${now() - t0}ms.`)
        }
    }
]

let plugins = []
const cmdIndex = new Map()
const aliasIndex = new Map()
const regexIndex = []
const categoryIndex = new Map()
const hooksByEvent = new Map()

function normalizePlugin(p, fname) {
    if (!p || typeof p !== 'object') return null
    if (!p.commands || typeof p.run !== 'function') return null
    if (!Array.isArray(p.commands)) p.commands = [p.commands]
    p.commands = p.commands.filter(x => typeof x === 'string' || x instanceof RegExp)
    if (!p.commands.length) return null

    p.__file      = fname
    p.__usage     = 0
    p.__errors    = 0
    p.__loadedAt  = now()
    p.name        = p.name || (typeof p.commands[0] === 'string' ? p.commands[0] : fname.replace(/\.js$/, ''))
    p.description = p.description || ''
    p.usage       = p.usage || ''
    p.examples    = p.examples || []
    p.author      = p.author || 'Sconosciuto'
    p.version     = p.version || '1.0.0'
    p.category    = (p.category || 'general').toLowerCase()
    p.aliases     = Array.isArray(p.aliases) ? p.aliases.filter(a => typeof a === 'string') : []
    p.middleware  = Array.isArray(p.middleware) ? p.middleware : []
    p.tags        = Array.isArray(p.tags) ? p.tags : []
    p.hidden      = !!p.hidden
    return p
}

for (const p of corePlugins) { normalizePlugin(p, '(core)'); p.__core = true }

function loadPlugins(silent = false) {
    if (!fs.existsSync(PLUGINS_DIR)) {
        log.warn(`Cartella plugin non trovata: ${PLUGINS_DIR}`)
        plugins = []; buildIndex(); return plugins
    }
    const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'))
    const loaded = []
    for (const f of files) {
        const full = path.join(PLUGINS_DIR, f)
        try {
            delete require.cache[require.resolve(full)]
            const raw = require(full)
            const p = normalizePlugin(raw, f)
            if (!p) { if (!silent) log.warn(`Plugin ${f} ignorato (mancano commands/run)`); continue }
            loaded.push(p)
        } catch (e) {
            log.err(`Plugin ${f}: ${e.message}`)
            if (DEBUG_LOG) log.raw(e.stack || '')
        }
    }
    plugins = loaded
    stats.pluginsLoaded = plugins.length
    buildIndex()
    return plugins
}

function buildIndex() {
    cmdIndex.clear(); aliasIndex.clear(); categoryIndex.clear()
    regexIndex.length = 0
    hooksByEvent.clear()

    for (const p of [...corePlugins, ...plugins]) {
        for (const c of p.commands) {
            if (typeof c === 'string') cmdIndex.set(c.toLowerCase(), p)
            else if (c instanceof RegExp) regexIndex.push({ re: c, plugin: p })
        }
        for (const a of p.aliases) aliasIndex.set(a.toLowerCase(), p)
        if (!categoryIndex.has(p.category)) categoryIndex.set(p.category, [])
        const catList = categoryIndex.get(p.category)
        const dup = catList.findIndex(x => x.name === p.name && x.__core)
        if (dup >= 0) catList.splice(dup, 1)
        catList.push(p)

        for (const k of ['onMessage', 'onGroupParticipants', 'onGroupsUpdate', 'onCall', 'onPresence', 'onReceipt']) {
            if (typeof p[k] === 'function') {
                if (!hooksByEvent.has(k)) hooksByEvent.set(k, [])
                hooksByEvent.get(k).push(p)
            }
        }
        if (typeof p.hook === 'function') {
            if (!hooksByEvent.has('onMessage')) hooksByEvent.set('onMessage', [])
            hooksByEvent.get('onMessage').push(p)
        }
    }
}

const isPluginEnabled = (p) => db.plugins.get(p.name, true) !== false
const findPlugin = (cmd) => {
    const c = cmd.toLowerCase()
    if (cmdIndex.has(c)) return cmdIndex.get(c)
    if (aliasIndex.has(c)) return aliasIndex.get(c)
    for (const { re, plugin } of regexIndex) {
        re.lastIndex = 0
        if (re.test(cmd)) return plugin
    }
    return null
}

loadPlugins()
log.ok(`Caricati ${C.bold}${plugins.length}${C.reset} plugin ${C.dim}(+${corePlugins.length} core)${C.reset} in ${C.bold}${categoryIndex.size}${C.reset} categorie`)
if (plugins.length) {
    const preview = plugins.map(p => p.name).slice(0, 25).join(', ')
    log.info(`${C.dim}${preview}${plugins.length > 25 ? ' …' : ''}${C.reset}`)
}

if (CONFIG.hotReload) {
    try {
        let _t = null
        fs.watch(PLUGINS_DIR, (ev, f) => {
            if (f && f.endsWith('.js')) {
                clearTimeout(_t)
                _t = setTimeout(() => {
                    log.info(`♻️  ${f} modificato → ricarico plugin…`)
                    loadPlugins(true)
                    bus.emit('plugins:reloaded')
                }, 200)
            }
        })
    } catch (e) { log.warn(`hot-reload non attivo: ${e.message}`) }
}

const cooldowns = new Map()
const checkCooldown = (user, cmd, ms) => {
    if (!ms || ms <= 0) return 0
    const key = `${user}:${cmd}`
    const t = cooldowns.get(key) || 0
    const diff = now() - t
    if (diff < ms) return Math.ceil((ms - diff) / 1000)
    cooldowns.set(key, now())
    return 0
}
scheduler.add('cooldown-cleanup', 5 * 60_000, () => {
    const t = now()
    for (const [k, v] of cooldowns) if (t - v > 10 * 60_000) cooldowns.delete(k)
})

const floodMap = new Map()
function checkFlood(user) {
    const t = now()
    let e = floodMap.get(user)
    if (!e) { e = { count: 0, first: t, mutedUntil: 0 }; floodMap.set(user, e) }
    if (e.mutedUntil > t) return true
    if (t - e.first > CONFIG.floodWindowMs) { e.count = 0; e.first = t; e.mutedUntil = 0 }
    e.count++
    if (e.count > CONFIG.floodMaxMsgs) {
        e.mutedUntil = t + CONFIG.floodMuteMs
        log.warn(`🌊 flood da @${user} → muto per ${CONFIG.floodMuteMs / 1000}s`)
        return true
    }
    return false
}
scheduler.add('flood-cleanup', 60_000, () => {
    const t = now()
    for (const [k, v] of floodMap) if (t - v.first > 5 * 60_000 && v.mutedUntil < t) floodMap.delete(k)
})

const seenMsgs = new NodeCache({ stdTTL: 90, checkperiod: 120 })
const msgStore = new NodeCache({ stdTTL: CONFIG.msgCacheTtlSec, checkperiod: 120, maxKeys: 1000, useClones: false })

const bareJid = (jid = '') => String(jid).split('@')[0].split(':')[0]
const isGroupJid = (jid = '') => jid.endsWith('@g.us')

const safeRequire = (p, fallback = {}) => {
    try { return require(p) } catch (e) { log.dbg(`require ${p}: ${e.message}`); return fallback }
}
const { isOwner: _isOwner } = safeRequire('./lib/owner', { isOwner: () => false })
const { isAdmin: _isAdmin } = safeRequire('./lib/utils', { isAdmin: async () => false })
const isOwner = (n) => { try { return !!_isOwner(n) } catch { return false } }
const isAdmin = async (sock, chat, n) => { try { return !!await _isAdmin(sock, chat, n) } catch { return false } }

const getSenderJid = (m) => m.key.participant || m.key.remoteJid
const getSenderNumber = (m) => bareJid(getSenderJid(m))
const getChatJid = (m) => m.key.remoteJid

function unwrapMessage(msg) {
    let cur = msg
    for (let i = 0; cur && i < 6; i++) {
        const inner = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message || cur.viewOnceMessageV2Extension?.message ||
            cur.documentWithCaptionMessage?.message
        if (!inner) break
        cur = inner
    }
    return cur || {}
}
const tsOf = (m) => {
    const t = m.messageTimestamp
    if (t == null) return 0
    return typeof t === 'object' ? (t.toNumber ? t.toNumber() : Number(t.low)) : Number(t)
}
function extractText(m) {
    const msg = unwrapMessage(m.message)
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId ||
        msg.templateButtonReplyMessage?.selectedId ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.interactiveResponseMessage?.nativeFlowResponseMessage?.buttonReplyValue ||
        ''
    )
}
function getQuoted(m) {
    const msg = unwrapMessage(m.message)
    const ctx = msg.extendedTextMessage?.contextInfo
        || msg.imageMessage?.contextInfo
        || msg.videoMessage?.contextInfo
        || msg.documentMessage?.contextInfo
        || msg.buttonsResponseMessage?.contextInfo
        || msg.interactiveResponseMessage?.contextInfo
    if (!ctx) return null
    return {
        stanzaId: ctx.stanzaId,
        participant: ctx.participant,
        number: bareJid(ctx.participant || ''),
        message: ctx.quotedMessage
    }
}
function getMentions(m) {
    const msg = unwrapMessage(m.message)
    const ctx = msg.extendedTextMessage?.contextInfo
        || msg.imageMessage?.contextInfo
        || msg.videoMessage?.contextInfo
        || msg.documentMessage?.contextInfo
    const list = ctx?.mentionedJid || []
    return list.map(j => ({ jid: j, number: bareJid(j) }))
}
function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 1; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        }
    }
    return dp[a.length][b.length]
}
function suggestCmd(cmd) {
    let best = null, bd = 99
    for (const k of [...cmdIndex.keys(), ...aliasIndex.keys()]) {
        const d = lev(cmd, k)
        if (d < bd) { bd = d; best = k }
    }
    return bd <= Math.max(1, Math.floor(cmd.length / 3)) ? best : null
}
function parseInvocation(raw) {
    let s = String(raw || '').trim()
    const pf = PREFIXES.find(p => s.startsWith(p))
    if (pf) s = s.slice(pf.length).trim()
    const parts = s.split(/\s+/)
    const cmd = (parts[0] || '').toLowerCase()
    return { cmd, args: parts.slice(1).filter(Boolean), argsText: s.slice(parts[0].length).trim() }
}
function extractCommand(msg) {
    let buttonId = ''
    if (msg.buttonsResponseMessage?.selectedButtonId) buttonId = msg.buttonsResponseMessage.selectedButtonId
    else if (msg.templateButtonReplyMessage?.selectedId) buttonId = msg.templateButtonReplyMessage.selectedId
    else if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) buttonId = msg.listResponseMessage.singleSelectReply.selectedRowId
    else if (msg.interactiveResponseMessage?.nativeFlowResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage
        const val = nf.buttonReplyValue || nf.paramsJson || ''
        try { const parsed = JSON.parse(val); buttonId = parsed.id || parsed.rowId || parsed.selectedRowId || val }
        catch { buttonId = val }
    }

    const text = msg.conversation || msg.extendedTextMessage?.text || ''
    if (buttonId) return { ...parseInvocation(buttonId), text, viaButton: true }
    if (PREFIXES.some(p => text.startsWith(p))) return { ...parseInvocation(text), text, viaButton: false }
    return { cmd: '', args: [], argsText: '', text, viaButton: false }
}

async function buildContext(sock, m, args, cmd, plugin, groupName, argsText = '') {
    const chatJid = getChatJid(m)
    const senderJid = getSenderJid(m)
    const sender = getSenderNumber(m)
    const text = extractText(m)
    const isGroup = isGroupJid(chatJid)
    const owner = isOwner(sender)
    const admin = isGroup ? (owner || await isAdmin(sock, chatJid, sender)) : owner
    const device = detectDevice(m.key.id)
    const cardOpts = (o = {}) => ({ quoted: m, sender, device, ...o })

    const ctx = {
        sock, m,
        cmd, args, argsText, text, prefix: PREFIX, plugin, groupName,
        sender, senderJid, chat: chatJid, chatJid, pushName: m.pushName || '',
        isGroup, isPrivate: !isGroup, device,
        isOwner: owner, isAdmin: admin,
        isPremium: !!db.premium.get(sender, false),
        quoted: getQuoted(m),
        mentions: getMentions(m),

        reply: (content, opts) => sock.sendMessage(chatJid, typeof content === 'string' ? { text: content, ...opts } : content, { quoted: m, ...opts }),
        send: (content, opts) => sock.sendMessage(chatJid, content, opts),
        react: (emoji) => sock.sendMessage(chatJid, { react: { text: emoji, key: m.key } }),
        edit: (key, text) => sock.sendMessage(chatJid, { text, edit: key }),
        del: (key = m.key) => sock.sendMessage(chatJid, { delete: key }),
        poll: (name, values, selectableCount = 1) => sock.sendMessage(chatJid, { poll: { name, values, selectableCount } }, { quoted: m }),
        typing: async (ms = 800) => {
            try { await sock.sendPresenceUpdate('composing', chatJid); await sleep(ms); await sock.sendPresenceUpdate('paused', chatJid) } catch {}
        },

        sendCards:   (spec, o) => sendCards(sock, chatJid, spec, cardOpts(o)),
        sendCard:    (card, o) => sendCards(sock, chatJid, { text: card.text, cards: [card] }, cardOpts(o)),
        sendButtons: (spec, o) => sendButtons(sock, chatJid, spec, cardOpts(o)),
        sendList:    (spec, o) => sendList(sock, chatJid, spec, cardOpts(o)),
        sendTable:   (title, rows, o) => sendTable(sock, chatJid, title, rows, cardOpts(o)),
        sendCode:    (code, lang, o) => sendCode(sock, chatJid, code, lang, cardOpts(o)),

        sendAlbum:    (media, cap, o) => sendAlbum(sock, chatJid, media, cap, cardOpts(o)),
        sendPoll:     (name, values, opts) => sendPoll(sock, chatJid, name, values, { quoted: m, ...opts }),
        sendEvent:    (ev, o) => sendEvent(sock, chatJid, ev, cardOpts(o)),
        sendLocation: (lat, lng, o) => sendLocation(sock, chatJid, lat, lng, cardOpts(o)),
        sendContact:  (contacts, o) => sendContact(sock, chatJid, contacts, cardOpts(o)),
        sendVoice:    (audio, o) => sendVoice(sock, chatJid, audio, cardOpts(o)),
        sendSticker:  (sticker, o) => sendSticker(sock, chatJid, sticker, cardOpts(o)),
        sendGif:      (video, o) => sendGif(sock, chatJid, video, cardOpts(o)),
        sendDocument: (doc, o) => sendDocument(sock, chatJid, doc, cardOpts(o)),
        sendProduct:  (prod, o) => sendProduct(sock, chatJid, prod, cardOpts(o)),

        ok:   (msg, title) => sock.sendMessage(chatJid, { text: ui.status('ok', msg, title) }, { quoted: m }),
        err:  (msg, title) => sock.sendMessage(chatJid, { text: ui.status('error', msg, title) }, { quoted: m }),
        warn: (msg, title) => sock.sendMessage(chatJid, { text: ui.status('warn', msg, title) }, { quoted: m }),
        info: (msg, title) => sock.sendMessage(chatJid, { text: ui.status('info', msg, title) }, { quoted: m }),

        ui, btn, cards: cardsApi,
        db,
        bus,
        emit: (name, payload) => bus.emit(name, payload),
        stats, config: CONFIG, log,
        helpers: {
            bareJid, isGroupJid, getQuoted, getMentions, extractText,
            fmtUptime, fmtBytes, getUptime, sleep, chunk
        },
        aborted: false,
        abort: () => { ctx.aborted = true }
    }
    return ctx
}

async function runMiddleware(chain, ctx) {
    let i = 0
    const next = async () => {
        if (ctx.aborted) return
        if (i >= chain.length) return
        const fn = chain[i++]
        try { await fn(ctx, next) } catch (e) { log.err(`middleware: ${e.message}`) }
    }
    await next()
}

async function withTimeout(promise, ms) {
    if (!ms || ms <= 0) return promise
    let timer
    try {
        return await Promise.race([
            promise,
            new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout dopo ${ms / 1000}s`)), ms) })
        ])
    } finally { clearTimeout(timer) }
}

const isNativeStyle = (c) => !!c && typeof c === 'object' && !!(
    c.cards || c.nativeFlow || c.richResponse || c.templateButtons || c.album || c.interactiveAsTemplate ||
    c.disclaimerText || c.poll || c.event || c.product ||
    (Array.isArray(c.buttons) && c.buttons.some(b => b && b.text !== undefined && !b.buttonText))
)

let retryCount = 0
let reconnectTimer = null
const retryCache = new NodeCache()
const logger = pino({ level: 'silent' })
let currentSock = null

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionDir)
    let version
    try {
        version = (await safeRequire('./lib/waversion', { getWaVersion: fetchLatestBaileysVersion }).getWaVersion(fetchLatestBaileysVersion)) || undefined
    } catch (e) { log.dbg(`versione WA: ${e.message}`) }

    const sock = makeWASocket({
        ...(version ? { version } : {}),
        logger,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        markOnlineOnConnect: CONFIG.markOnline,
        syncFullHistory: CONFIG.syncFullHistory,
        msgRetryCounterCache: retryCache,
        getMessage: async (key) => (key?.id ? msgStore.get(key.id) : undefined)
    })
    currentSock = sock

    sock.ev.on('creds.update', saveCreds)

    if (CONFIG.pairing && !state.creds?.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NUMERO)
                log.box('CODICE DI ABBINAMENTO', [`${C.bold}${fg(220)}${code}${C.reset}`, `${C.dim}WhatsApp → Dispositivi collegati → Collega con numero${C.reset}`], 220)
            } catch (e) { log.err(`pairing: ${e.message}`) }
        }, 3000)
    }

    const { fixContent } = safeRequire('./lib/btnfix', { fixContent: (c) => c })
    const _send = sock.sendMessage.bind(sock)
    sock.sendMessage = async (jid, content, opts) => {
        const c = isNativeStyle(content) ? content : fixContent(content)
        let res
        try { res = await _send(jid, c, opts) }
        catch (e) {
            if (!/timed? ?out/i.test(e?.message || '')) throw e
            log.dbg(`sendMessage timeout → riprovo (${jid})`)
            await sleep(1000)
            res = await _send(jid, c, opts)
        }
        try { if (res?.key?.id && res.message) msgStore.set(res.key.id, res.message) } catch {}
        return res
    }

    const _gm = sock.groupMetadata.bind(sock)
    const gmCache = new Map()
    const gmPending = new Map()
    sock.groupMetadata = async (jid) => {
        const c = gmCache.get(jid)
        if (c && now() - c.t < 120000) return c.meta
        if (gmPending.has(jid)) return gmPending.get(jid)
        const p = Promise.race([
            _gm(jid),
            new Promise((_, rej) => setTimeout(() => rej(new Error('groupMetadata timeout')), 8000))
        ]).then(meta => { gmCache.set(jid, { t: now(), meta }); return meta })
          .catch(() => { if (c) return c.meta; throw new Error('groupMetadata fail') })
          .finally(() => gmPending.delete(jid))
        gmPending.set(jid, p)
        return p
    }
    sock.ev.on('group-participants.update', (u) => gmCache.delete(u.id))
    sock.ev.on('groups.update', (list) => { for (const g of list || []) gmCache.delete(g.id) })

    const lidMap = sock.signalRepository?.lidMapping
    if (lidMap) {
        const lidCache = new Map()
        for (const k of ['getLIDForPN', 'getPNForLID']) {
            if (typeof lidMap[k] === 'function') {
                const f = lidMap[k].bind(lidMap)
                lidMap[k] = (...a) => {
                    const key = k + ':' + a[0]
                    const c = lidCache.get(key)
                    if (c && now() - c.t < 600000) return c.p
                    const p = Promise.race([
                        Promise.resolve().then(() => f(...a)).catch(() => null),
                        new Promise(r => setTimeout(() => r(null), 1000))
                    ])
                    const entry = { t: now(), p }
                    lidCache.set(key, entry)
                    p.then(v => { if (!v) entry.t = now() - 540000 })
                    return p
                }
            }
        }
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            log.box('SCANSIONA IL QR', [`${C.dim}WhatsApp → Dispositivi collegati → Collega un dispositivo${C.reset}`], 81)
            require('qrcode-terminal').generate(qr, { small: true })
        }
        if (connection === 'connecting') log.info('Connessione a WhatsApp…')

        if (connection === 'open') {
            retryCount = 0
            log.raw(makeBanner())
            log.box(`${CONFIG.botName} ONLINE`, [
                `${fg(84)}●${C.reset} ${C.bold}v${CONFIG.version}${C.reset}  ${C.dim}uptime ${fmtUptime()}${C.reset}`,
                `Account   ${C.bold}${sock.user?.id ? bareJid(sock.user.id) : '—'}${C.reset}`,
                `Prefisso  ${C.bold}${PREFIXES.join('  ')}${C.reset}   Tema ${C.bold}${CONFIG.theme}${C.reset}   Card ${C.bold}${CONFIG.cardMode}${C.reset}`,
                `Plugin    ${C.bold}${plugins.length}${C.reset} ${C.dim}(+${corePlugins.length} core)${C.reset}   Comandi ${C.bold}${cmdIndex.size}${C.reset}`,
                `${C.dim}Node ${process.version} • ${os.platform()} ${os.arch()} • RAM ${fmtBytes(process.memoryUsage().rss)}${C.reset}`
            ], 213)
            bus.emit('bot:online', { sock })
            if (CONFIG.notifyOwnerOnline) {
                sock.sendMessage(`${NUMERO}@s.whatsapp.net`, {
                    text: ui.box('ONLINE', [`✅ ${CONFIG.botName} v${CONFIG.version}`, `🔌 Plugin: *${plugins.length}*`, `🔁 Avvio n°: *${stats.bootCount}*`])
                }).catch(() => {})
            }
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            log.err(`Connessione chiusa (code=${code})`)
            bus.emit('bot:offline', { code })
            if (code === DisconnectReason.loggedOut) {
                log.warn('Sessione disconnessa. Rimuovi ./session per rifare il login.')
                return
            }
            if (!CONFIG.autoReconnect || reconnectTimer) return
            retryCount++
            stats.reconnects = (stats.reconnects || 0) + 1
            saveStats()
            const base = Math.min(3000 * Math.pow(1.6, retryCount), CONFIG.maxReconnectDelay)
            const jitter = Math.random() * 1500
            const delayMs = Math.floor(base + jitter)
            log.info(`Riconnessione tra ${(delayMs / 1000).toFixed(1)}s (tentativo ${retryCount})…`)
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                start().catch(e => { log.err(`Errore riavvio: ${e.message}`); setTimeout(() => start().catch(() => {}), 5000) })
            }, delayMs)
        }
    })

    const fireHook = async (eventName, payload) => {
        const list = hooksByEvent.get(eventName) || []
        for (const p of list) {
            if (!isPluginEnabled(p)) continue
            const fn = p[eventName] || p.hook
            if (typeof fn !== 'function') continue
            try { await fn(sock, payload) }
            catch (e) { log.dbg(`hook ${eventName} ${p.__file}: ${e.message}`) }
        }
    }
    sock.ev.on('group-participants.update', (u) => fireHook('onGroupParticipants', u))
    sock.ev.on('groups.update',             (l) => fireHook('onGroupsUpdate', l))
    sock.ev.on('call',                      (c) => fireHook('onCall', c))
    sock.ev.on('presence.update',           (p) => { try { bus.emit('presence', p) } catch {} })
    sock.ev.on('messages.update',           (u) => fireHook('onReceipt', u))

    const nameCache = new NodeCache({ stdTTL: 600 })
    const getGroupName = async (jid) => {
        if (!isGroupJid(jid)) return 'Chat Privata'
        if (nameCache.has(jid)) return nameCache.get(jid)
        try {
            const meta = await sock.groupMetadata(jid)
            nameCache.set(jid, meta.subject)
            return meta.subject
        } catch { return 'Gruppo Sconosciuto' }
    }

    const noticeAt = new Map()
    const notice = async (key, chatJid, m, text) => {
        if (!CONFIG.replyDenied) return
        const t = now()
        if (t - (noticeAt.get(key) || 0) < 8000) return
        if (noticeAt.size > 500) noticeAt.clear()
        noticeAt.set(key, t)
        try { await sock.sendMessage(chatJid, { text }, { quoted: m }) } catch {}
    }

    const handleMessage = async (m) => {
        const mid = m.key?.id
        if (mid && seenMsgs.has(mid)) return
        if (mid) seenMsgs.set(mid, true)

        stats.messagesSeen++
        saveStats()

        if (!m.message || m.key.fromMe) return
        if (mid) msgStore.set(mid, m.message)

        const ts = tsOf(m)
        if (CONFIG.ignoreOldMsgSec > 0 && ts && (now() / 1000 - ts) > CONFIG.ignoreOldMsgSec) {
            log.dbg(`messaggio vecchio ignorato (${Math.round(now() / 1000 - ts)}s)`)
            return
        }

        const chatJid = getChatJid(m)
        const sender = getSenderNumber(m)
        const isStatusOrChannel = chatJid === 'status@broadcast' || chatJid.endsWith('@newsletter')

        if (db.bans.get('users', []).includes(sender) && !isOwner(sender)) return
        if (isGroupJid(chatJid) && db.bans.get('groups', []).includes(chatJid)) return
        if (!isOwner(sender) && checkFlood(sender)) { stats.messagesBlocked++; saveStats(); return }

        if (CONFIG.autoRead && !isStatusOrChannel)     try { await sock.readMessages([m.key]) } catch {}
        if (CONFIG.autoPresence && !isStatusOrChannel) try { await sock.sendPresenceUpdate('available', chatJid) } catch {}

        const onMsgHooks = hooksByEvent.get('onMessage') || []
        for (const p of onMsgHooks) {
            if (!isPluginEnabled(p)) continue
            const fn = p.onMessage || p.hook
            if (typeof fn !== 'function') continue
            const t0 = now()
            let timer
            try {
                await Promise.race([
                    fn(sock, m),
                    new Promise(r => { timer = setTimeout(() => { log.dbg(`hook bloccato: ${p.name}`); r() }, 5000) })
                ])
            } catch (e) { log.dbg(`hook ${p.name}: ${e.message}`) }
            clearTimeout(timer)
            if (now() - t0 > 1500) log.dbg(`hook ${p.name} lento: ${now() - t0}ms`)
        }

        if (isStatusOrChannel) return

        const { cmd, args, argsText, viaButton } = extractCommand(unwrapMessage(m.message))
        if (!cmd) return

        const device = detectDevice(m.key.id)
        const prof = db.users.get(sender, {})
        prof.name = m.pushName || prof.name || ''
        prof.device = device
        prof.firstSeen = prof.firstSeen || now()
        prof.lastSeen = now()
        db.users.set(sender, prof)

        const p = findPlugin(cmd)
        if (!p) {
            log.dbg(`❓ comando sconosciuto: ${cmd}`)
            if (CONFIG.suggestCommands && !viaButton && cmd.length >= 3 && /^[a-z0-9]+$/i.test(cmd)) {
                const s = suggestCmd(cmd)
                if (s) await notice(`sug:${sender}`, chatJid, m, ui.status('info', `Comando *${PREFIX}${cmd}* non trovato.\nForse intendevi *${PREFIX}${s}* ?`, 'FORSE INTENDEVI'))
            }
            return
        }
        if (!isPluginEnabled(p)) { log.dbg(`🚫 plugin ${p.name} disabilitato`); return }

        const denied = (why, text) => { log.warn(`.${cmd} ${why}`); return notice(`deny:${sender}:${cmd}`, chatJid, m, ui.status('warn', text, 'NON DISPONIBILE')) }
        if (p.groupOnly   && !isGroupJid(chatJid)) return denied('solo in gruppo',  `*${PREFIX}${cmd}* funziona solo nei gruppi.`)
        if (p.privateOnly &&  isGroupJid(chatJid)) return denied('solo in privato', `*${PREFIX}${cmd}* funziona solo in privato.`)
        if (p.ownerOnly && !isOwner(sender))       return denied('solo owner',      `*${PREFIX}${cmd}* è riservato all'owner.`)
        if (p.premiumOnly && !isOwner(sender) && !db.premium.get(sender, false)) {
            return denied('solo premium', `*${PREFIX}${cmd}* è riservato agli utenti premium.`)
        }
        if (p.adminOnly && isGroupJid(chatJid)) {
            if (!isOwner(sender) && !(await isAdmin(sock, chatJid, sender))) return denied('richiede admin', `*${PREFIX}${cmd}* è riservato agli admin del gruppo.`)
        }

        if (p.minArgs != null && args.length < p.minArgs) {
            await sock.sendMessage(chatJid, { text: ui.status('warn', `Uso: *${PREFIX}${cmd} ${p.usage || ''}*`.trim(), 'ARGOMENTI MANCANTI') }, { quoted: m })
            return
        }
        if (p.maxArgs != null && args.length > p.maxArgs) {
            await sock.sendMessage(chatJid, { text: ui.status('warn', `Troppi argomenti. Uso: *${PREFIX}${cmd} ${p.usage || ''}*`.trim(), 'TROPPI ARGOMENTI') }, { quoted: m })
            return
        }

        if (isGroupJid(chatJid)) {
            try {
                const soloAdminMod = plugins.find(pp => pp.isSoloAdminActive)
                if (soloAdminMod && soloAdminMod.isSoloAdminActive(chatJid)) {
                    const senderOk = isOwner(sender) || await isAdmin(sock, chatJid, sender)
                    const alwaysAllowed = ['soloadmin', 'soloadminon', 'soloadminoff']
                    if (!senderOk && !alwaysAllowed.includes(cmd)) { log.warn(`🔒 SoloAdmin: ignorato .${cmd}`); return }
                }
            } catch (e) { log.dbg(`SoloAdmin: ${e.message}`) }
        }
        try {
            const sa = safeRequire('./lib/soloadmin', { canUse: async () => true })
            if (typeof sa.canUse === 'function' && !(await sa.canUse(sock, m))) {
                log.warn(`SoloAdmin: ignorato .${cmd}`); return
            }
        } catch {}

        const cd = checkCooldown(sender, cmd, p.cooldown ?? CONFIG.cooldownMs)
        if (cd > 0) {
            log.warn(`⏳ @${sender} in cooldown su .${cmd} (${cd}s)`)
            if (CONFIG.replyCooldown) sock.sendMessage(chatJid, { react: { text: '⏳', key: m.key } }).catch(() => {})
            return
        }

        const groupName = await getGroupName(chatJid)
        const ctx = await buildContext(sock, m, args, cmd, p, groupName, argsText)
        const chain = [...(global.ZENO?.middlewares || []), ...p.middleware]

        const t0 = now()
        if (CONFIG.autoTyping) sock.sendPresenceUpdate('composing', chatJid).catch(() => {})
        try {
            await runMiddleware(chain, ctx)
            if (ctx.aborted) return

            await withTimeout(Promise.resolve(p.run(sock, m, args, cmd, ctx)), CONFIG.commandTimeoutMs)
            p.__usage = (p.__usage || 0) + 1
            stats.commandsRun++
            stats.perCommand[cmd] = (stats.perCommand[cmd] || 0) + 1
            stats.perUser[sender] = (stats.perUser[sender] || 0) + 1
            stats.perCategory[p.category] = (stats.perCategory[p.category] || 0) + 1
            saveStats()
            log.cmd(groupName, sender, cmd, true, now() - t0)
            bus.emit('command:success', { cmd, sender, chatJid, plugin: p, ms: now() - t0 })
        } catch (e) {
            p.__errors = (p.__errors || 0) + 1
            stats.commandsFailed++
            saveStats()
            log.cmd(groupName, sender, cmd, false, now() - t0)
            log.err(`   ↳ ${e.message}`)
            if (DEBUG_LOG && e.stack) log.raw(`${C.dim}${e.stack}${C.reset}`)
            bus.emit('command:error', { cmd, sender, chatJid, plugin: p, error: e })
            if (CONFIG.replyErrors) {
                try {
                    await sock.sendMessage(chatJid, {
                        text: ui.status('error', `*${PREFIX}${cmd}* non è andato a buon fine.\n${DEBUG_LOG ? e.message : 'Riprova tra poco.'}`)
                    }, { quoted: m })
                } catch {}
            }
            if (CONFIG.ownerNotifyErrors) {
                try {
                    await sock.sendMessage(`${NUMERO}@s.whatsapp.net`, {
                        text: `⚠️ Errore in .${cmd}\n${e.message}\n\n${e.stack?.slice(0, 600) || ''}`
                    })
                } catch {}
            }
        } finally {
            if (CONFIG.autoTyping) sock.sendPresenceUpdate('paused', chatJid).catch(() => {})
        }
    }

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type && type !== 'notify') return
        for (const m of messages) {
            handleMessage(m).catch(e => log.err(`handler: ${e.message}`))
        }
    })

    return sock
}

scheduler.add('metrics', 60_000, () => {
    const mem = process.memoryUsage()
    const cmdsPerMin = Math.round(stats.commandsRun / Math.max(1, getUptime() / 60000))
    log.dbg(`📈 uptime=${fmtUptime()} rss=${fmtBytes(mem.rss)} heap=${fmtBytes(mem.heapUsed)} cmds/min=${cmdsPerMin}`)
})

scheduler.add('heartbeat', CONFIG.heartbeatIntervalMs, () => {
    const s = currentSock
    if (!s || !CONFIG.markOnline) return
    if (s.ws?.isOpen === false) return
    s.sendPresenceUpdate('available').catch(() => {})
})

scheduler.add('autosave-db', 30_000, () => {
    for (const k of Object.keys(db)) { try { db[k].saveSync() } catch {} }
    saveStats()
})

scheduler.add('autobackup', CONFIG.autoBackupIntervalMs, () => {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const dest = path.join(CONFIG.backupDir, `backup-${stamp}`)
        fs.mkdirSync(dest, { recursive: true })
        const dataDir = path.dirname(path.resolve(CONFIG.statsFile))
        if (fs.existsSync(dataDir)) {
            fs.cpSync(dataDir, path.join(dest, 'data'), { recursive: true })
        }
        log.ok(`💾 Backup creato: ${dest}`)
        const all = fs.readdirSync(CONFIG.backupDir).filter(d => d.startsWith('backup-')).sort()
        for (const old of all.slice(0, Math.max(0, all.length - 10))) {
            try { fs.rmSync(path.join(CONFIG.backupDir, old), { recursive: true, force: true }) } catch {}
        }
    } catch (e) { log.err(`backup: ${e.message}`) }
}, { runNow: false })

process.on('uncaughtException', (e) => {
    log.err(`UncaughtException: ${e.message}`)
    if (DEBUG_LOG) log.raw(e.stack || '')
})
process.on('unhandledRejection', (e) => {
    log.err(`UnhandledRejection: ${e?.message || e}`)
})
const shutdown = (sig) => {
    log.warn(`Ricevuto ${sig}, salvo e chiudo…`)
    try { for (const k of Object.keys(db)) db[k].saveSync() } catch {}
    saveStats()
    scheduler.stopAll()
    setTimeout(() => process.exit(0), 500)
}
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

global.ZENO = {
    CONFIG, C, log,
    db, bus, scheduler,
    ui, btn, cards: cardsApi,

    sendCards:   (jid, spec, o = {}) => sendCards(currentSock, jid, spec, o),
    sendButtons: (jid, spec, o = {}) => sendButtons(currentSock, jid, spec, o),
    sendList:    (jid, spec, o = {}) => sendList(currentSock, jid, spec, o),
    sendTable:   (jid, title, rows, o = {}) => sendTable(currentSock, jid, title, rows, o),
    sendCode:    (jid, code, lang, o = {}) => sendCode(currentSock, jid, code, lang, o),
    sendAlbum:   (jid, media, cap, o = {}) => sendAlbum(currentSock, jid, media, cap, o),
    sendPoll:    (jid, name, values, opts = {}) => sendPoll(currentSock, jid, name, values, opts),
    sendEvent:   (jid, ev, o = {}) => sendEvent(currentSock, jid, ev, o),
    sendProduct: (jid, prod, o = {}) => sendProduct(currentSock, jid, prod, o),
    sendLocation:(jid, lat, lng, o = {}) => sendLocation(currentSock, jid, lat, lng, o),
    sendContact: (jid, c, o = {}) => sendContact(currentSock, jid, c, o),
    sendVoice:   (jid, a, o = {}) => sendVoice(currentSock, jid, a, o),
    sendSticker: (jid, s, o = {}) => sendSticker(currentSock, jid, s, o),
    sendGif:     (jid, v, o = {}) => sendGif(currentSock, jid, v, o),
    sendDocument:(jid, d, o = {}) => sendDocument(currentSock, jid, d, o),

    detectDevice,
    setTheme(name) { if (THEMES[name]) { CONFIG.theme = name; saveConfig(); return true } return false },
    get sock() { return currentSock },
    get stats() { return stats },
    get plugins() { return plugins },
    get commands() {
        const out = {}
        for (const [cat, list] of categoryIndex) {
            out[cat] = list.map(p => ({
                name: p.name, commands: p.commands.filter(c => typeof c === 'string'),
                aliases: p.aliases, description: p.description, usage: p.usage, tags: p.tags,
                enabled: isPluginEnabled(p)
            }))
        }
        return out
    },
    getUptime, fmtUptime, fmtBytes, saveStats,
    findPlugin, isPluginEnabled,
    enablePlugin(name) { db.plugins.set(name, true); bus.emit('plugins:changed') },
    disablePlugin(name) { db.plugins.set(name, false); bus.emit('plugins:changed') },
    reloadPlugins() { return loadPlugins(true) },
    middlewares: [],
    helpers: { bareJid, isGroupJid, extractText, getQuoted, getMentions, safeRequire, sleep, chunk },
    get version() { return CONFIG.version }
}

log.raw(makeBanner())
log.info(`Avvio ${C.bold}${CONFIG.botName}${C.reset} v${CONFIG.version}…`)
log.info(`Libreria WhatsApp: ${C.bold}${LIB_NAME}${C.reset}`)
log.info(`Cartelle: plugins=${CONFIG.pluginsDir} • session=${CONFIG.sessionDir} • db=${CONFIG.dbDir}`)
start().catch(e => {
    log.err(`Errore avvio: ${e.message}`)
    if (DEBUG_LOG) log.raw(e.stack || '')
    setTimeout(() => start().catch(() => {}), 5000)
})
