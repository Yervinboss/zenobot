'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO ULTIMATE — Menu principale con categorie vere
//  Comandi: .menu, .menu <cat>, .menu tutti, .menucat, .setcat, .setmenu
// ═══════════════════════════════════════════════════════════════

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

// ── Utility di base ──
const Z = () => global.ZENO
const primary = (p) => p.commands.find(c => typeof c === 'string') || p.name
const keyOf = (p) => String(p.name).replace(/[.\s]/g, '_')
const names = (p) => [...p.commands.filter(c => typeof c === 'string'), ...(p.aliases || [])].map(x => String(x).toLowerCase())
const store = () => (Z().db && Z().db.settings) || null
const chunkArr = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const enabled = (p) => (typeof Z().isPluginEnabled === 'function' ? Z().isPluginEnabled(p) : true)

// ═══════════════════════════════════════════════════════════════
//  CONFIGURAZIONE CATEGORIE (Senza descrizioni)
// ═══════════════════════════════════════════════════════════════
const CAT_INFO = {
    staff:       ['👥'],
    funzioni:    ['⚙️'],
    admin:       ['👑'],
    gruppo:      ['👥'],
    moderazione: ['🚨'],
    giochi:      ['🎮'],
    rpg:         ['🎰'],
    fun:         ['🎉'],
    media:       ['🖼️'],
    creatore:    ['🛠️']
}

// Assorbe le vecchie categorie in quelle nuove
const CAT_ALIAS = { 
    creator: 'creatore', 
    creatori: 'creatore', 
    tools: 'funzioni', 
    sistema: 'creatore', 
    general: 'moderazione',
    owner: 'creatore',
    sticker: 'media',
    musica: 'media',
    download: 'media'
}

const ORDER = ['staff', 'moderazione', 'funzioni', 'admin', 'gruppo', 'giochi', 'rpg', 'fun', 'media', 'creatore']

const RULES = [
    ['funzioni', /^(anti[a-z0-9]*|welcome|goodbye|benvenuto|addio|soloadmin\w*|modoadmin|rileva|detect|slowmode|reaction|antispam|ping)$/],
    ['admin',    /^(promote|demote|p|d|kick|k|ban|unban|warn|unwarn|mute|unmute|tag|tagall|hidetag|add|aggiungi|del|delete|admin|admins|link|resetlink|setname|setdesc|grouplink|apri|chiudi|open|close|everyone|rimuovi|svuota|debugadmin|tagadmin)$/],
    ['fun',      /^(abbraccia|bacio|kiss|schiaffo|slap|coccole|carezza|pat|figa|infame|drogato|alcolizzato|ano|culometro|frocio|dox|cazzo|ditalino|letto|tp|ship|coppia|gay|lesbica|bellezza|percentuale|amore|compatibilita|insulta|roast|barzelletta|joke|frase|fact|gaymeter|hot|simp|ritardo|bestemmiometro|top[a-z]+|palla|imperatore)$/],
    ['rpg',      /^(bal|balance|saldo|daily|giornaliero|work|lavora|rob|ruba|bank|banca|deposit|deposita|withdraw|preleva|slot|casino|roulette|bj|blackjack|divorzio|sposa|matrimonio|shop|negozio|inventario|inv|level|livello|rank|classifica|crimine|mine|mina|pesca|caccia|gift|regala|transfer|paga|pay|xp|portafoglio|wallet)$/],
    ['giochi',   /^(tris|ttt|impiccato|scf|forbici|uno|bomba|indovina|quiz|trivia|labirinto|scramble|basket|mascotte|bandiera|dado|moneta|flip|math|matematica|calcio|gioca|memory|battaglia)$/],
    ['media',    /^(song|play|spotify|lyrics|testo|ytmp3|ytmp4|youtube|yt|music|musica|video|tiktok|instagram|ig|facebook|fb|download|scarica|s|sticker|stiker|toimg|tovid|attp|ttp|emojimix|take|wm|meme|memegen)$/],
    ['creatore', /^(addowner|delowner|owner|join|leave|esci|restart|riavvia|shutdown|spegni|eval|exec|broadcast|bc|setpp|setprefix|banuser|unbanuser|premium|addprem|delprem|getplugin|update|aggiorna|backup|status|stato|info|help|aiuto|uptime|speed|runtime|botinfo|infobot|stats|clean|pulisci|clearsessions|sessioni|menu|comandi)$/],
    ['staff',    /^(staff)$/]
]

const MAP = {}
const put = (cat, list) => list.split(/\s+/).filter(Boolean).forEach(c => { MAP[c] = cat })
put('moderazione', 'kick warn unwarn richiamo grazia mute unmute aperto chiuso apri chiudi p promote d demote del delete tag link invito qr qrlink admin staff paneladmin antilink antispam antivoip antibot req richieste richiesta welcome setwelcome setbenvenuto testwelcome soloadmin solo setgpp gpp fotogruppo top zeno')
put('funzioni',    'afk afk_group afk_all afklist id myid pp tpnumero ping')
put('fun',         'abbraccia abbraccio bacio kiss bacia corna letto sega ditalino cazzo frocio negro dox doxxing figa ano culometro drogato alcolizzato alcol infame quantosbirro sbirrocheck palla imperatore doss ddos dossattacco sex sesso accoppia ban banna fakeban')
put('rpg',         'bal balance soldi portafoglio work bj blackjack slot ruba steal sposa divorzio divorzia')
put('media',       'song play shazam pl tp playlist addplaylist casuale random shuffle suggerisci simili consiglia s sticker toaudio tomp3 mp3 audio vv tx')
put('creatore',    'stats status clean pulisci clearsessions sessioni menu comandi owner setowner addowner delowner shutdown spegni stopbot blackout setbotpp botpp zenon zenooff nuke nukeall purge testadmin debugadmin testios ioslab setcat menucat setmenu')

// ═══════════════════════════════════════════════════════════════
//  GESTIONE MEDIA (Foto/Video del Menu)
// ═══════════════════════════════════════════════════════════════
const MEDIA_DIR = () => path.join(process.cwd(), 'media')
const F_VIDEO = () => path.join(MEDIA_DIR(), 'menu.mp4')
const F_IMAGE = () => path.join(MEDIA_DIR(), 'menu.jpg')
const MAX_BYTES = 16 * 1024 * 1024

function getBaileys() {
    for (const n of ['@whiskeysockets/baileys', 'baileys', '@adiwajshing/baileys', '@itsukichan/baileys']) {
        try { return require(n) } catch {}
    }
    return null
}

function loadMenuMedia() {
    try {
        if (fs.existsSync(F_VIDEO())) return { video: fs.readFileSync(F_VIDEO()), gifPlayback: true, mimetype: 'video/mp4' }
        if (fs.existsSync(F_IMAGE())) return { image: fs.readFileSync(F_IMAGE()) }
    } catch {}
    return null
}

async function sendCard(ctx, caption) {
    const custom = loadMenuMedia()
    if (custom) {
        try { await ctx.reply({ ...custom, caption }); return true } catch {}
    }
    try {
        if (ctx.config.cardImage) { await ctx.reply({ image: { url: ctx.config.cardImage }, caption }); return true }
    } catch {}
    return false
}

const unwrap = (msg) => {
    let x = msg
    for (let i = 0; i < 6 && x; i++) {
        const n = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message ||
            x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message
        if (!n) break
        x = n
    }
    return x
}

function findMediaNode(m) {
    const root = unwrap(m.message || m.msg || {})
    const ctxInfo = root?.extendedTextMessage?.contextInfo || root?.imageMessage?.contextInfo ||
        root?.videoMessage?.contextInfo || root?.documentMessage?.contextInfo
    const quoted = unwrap(ctxInfo?.quotedMessage)
    for (const c of [root, quoted]) {
        if (!c) continue
        if (c.imageMessage) return { type: 'image', node: c.imageMessage }
        if (c.videoMessage) return { type: 'video', node: c.videoMessage }
        if (c.documentMessage && /^(image|video)\//.test(c.documentMessage.mimetype || '')) return { type: 'document', node: c.documentMessage }
    }
    return null
}

async function downloadNode(node, type) {
    const B = getBaileys()
    if (!B || typeof B.downloadContentFromMessage !== 'function') throw new Error('Baileys non trovato')
    const stream = await B.downloadContentFromMessage(node, type)
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}

function gifToMp4(buf) {
    return new Promise((resolve, reject) => {
        const id = Date.now() + '_' + Math.floor(Math.random() * 1e5)
        const tin = path.join(os.tmpdir(), `zm_${id}.gif`)
        const tout = path.join(os.tmpdir(), `zm_${id}.mp4`)
        fs.writeFileSync(tin, buf)
        execFile('ffmpeg', ['-y', '-i', tin, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', tout], (err) => {
            try {
                if (err || !fs.existsSync(tout)) return reject(new Error('ffmpeg non disponibile o conversione fallita'))
                resolve(fs.readFileSync(tout))
            } finally {
                try { fs.unlinkSync(tin) } catch {}
                try { fs.unlinkSync(tout) } catch {}
            }
        })
    })
}

function saveMenuMedia(kind, buf) {
    fs.mkdirSync(MEDIA_DIR(), { recursive: true })
    if (kind === 'video') {
        fs.writeFileSync(F_VIDEO(), buf)
        try { fs.unlinkSync(F_IMAGE()) } catch {}
    } else {
        fs.writeFileSync(F_IMAGE(), buf)
        try { fs.unlinkSync(F_VIDEO()) } catch {}
    }
}

// ═══════════════════════════════════════════════════════════════
//  FUNZIONI DI SUPPORTO E GRAFICA
// ═══════════════════════════════════════════════════════════════
const TOP = '╭━━━━━━━━━━━━━━━╮'
const BOT = '╰━━━━━━━━━━━━━━━╯'
const SEP = '┣━━━━━━━━━━━━━━━'

const info = (cat) => CAT_INFO[cat] || ['📦']

function allCategories() {
    const z = Z()
    if (z.categories && typeof z.categories[Symbol.iterator] === 'function') return z.categories
    const map = new Map()
    for (const p of z.plugins || []) {
        const c = String(p.category || 'general').toLowerCase()
        if (!map.has(c)) map.set(c, [])
        map.get(c).push(p)
    }
    return map
}

function effectiveCat(p, cat) {
    const ov = store()?.get(`menuCat.${keyOf(p)}`)
    if (ov) return ov
    const ns = names(p)
    for (const n of ns) if (MAP[n]) return MAP[n]
    if (cat !== 'general') return CAT_ALIAS[String(cat).toLowerCase()] || cat
    for (const [c, re] of RULES) if (ns.some(n => re.test(n))) return c
    return 'moderazione' // Default
}

function visibleCats(ctx) {
    const groups = new Map()
    for (const [cat, list] of allCategories()) {
        for (const p of list) {
            if (p.hidden || !enabled(p)) continue
            const c = effectiveCat(p, cat)
            if (c === 'owner' && !ctx.isOwner) continue // Gestito da CAT_ALIAS ormai
            if (!groups.has(c)) groups.set(c, [])
            groups.get(c).push(p)
        }
    }
    const rank = (c) => { const i = ORDER.indexOf(c); return i === -1 ? 998 : i }
    return [...groups.entries()]
        .map(([cat, list]) => ({ cat, list }))
        .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat))
}

async function sendSub(ctx, { cat, list }) {
    const [emo] = info(cat)
    const P = ctx.prefix
    const lines = list.map(p => `┃ ▸ *${P}${primary(p)}*`)
    const box = [
        TOP,
        `┃ ${emo}  *${cat.toUpperCase()}*`,
        `┃ 📦 ${list.length} comandi`,
        SEP,
        ...lines,
        SEP,
        `┃ ↩ Torna al menu: *${P}menu*`,
        BOT
    ].join('\n')
    if (box.length <= 1000) {
        if (await sendCard(ctx, box)) return
    }
    for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
}

// ═══════════════════════════════════════════════════════════════
//  HANDLERS DEI COMANDI
// ═══════════════════════════════════════════════════════════════

async function handleSetMenu(m, args, ctx) {
    const P = ctx.prefix
    const arg = (args[0] || '').trim()

    if (/^(reset|default|rimuovi|off)$/i.test(arg)) {
        try { fs.unlinkSync(F_VIDEO()) } catch {}
        try { fs.unlinkSync(F_IMAGE()) } catch {}
        return ctx.reply('✅ Media del menu ripristinata a quella di default.')
    }

    let kind, buf

    if (/^https?:\/\//i.test(arg)) {
        if (typeof fetch !== 'function') return ctx.err('Il tuo Node è troppo vecchio per scaricare dai link (serve Node 18+).')
        const res = await fetch(arg)
        if (!res.ok) return ctx.err(`Impossibile scaricare il link (HTTP ${res.status}).`)
        const mime = (res.headers.get('content-type') || '').toLowerCase()
        buf = Buffer.from(await res.arrayBuffer())
        if (mime.includes('gif')) { buf = await gifToMp4(buf); kind = 'video' }
        else if (mime.startsWith('video/')) kind = 'video'
        else if (mime.startsWith('image/')) kind = 'image'
        else return ctx.err('Il link non è un\'immagine, un video o una gif.')
    } else {
        const found = findMediaNode(m)
        if (!found) {
            return ctx.err(
                `Invia una *foto, video o gif* con didascalia *${P}setmenu*,\n` +
                `oppure rispondi a una media con *${P}setmenu*.\n` +
                `Puoi anche usare un link: *${P}setmenu https://...*\n` +
                `Per tornare al default: *${P}setmenu reset*`
            )
        }
        const mime = (found.node.mimetype || '').toLowerCase()
        const dlType = found.type === 'document' ? 'document' : found.type
        buf = await downloadNode(found.node, dlType)
        if (found.type === 'image' || (found.type === 'document' && mime.startsWith('image/') && !mime.includes('gif'))) kind = 'image'
        else if (mime.includes('gif')) { buf = await gifToMp4(buf); kind = 'video' }
        else kind = 'video'
    }

    if (!buf || !buf.length) return ctx.err('File vuoto o non scaricato.')
    if (buf.length > MAX_BYTES) return ctx.err('File troppo pesante (max 16 MB). Usa un video più corto.')

    saveMenuMedia(kind, buf)
    await ctx.reply(`✅ Media del menu aggiornata (${kind === 'video' ? 'video/GIF animata' : 'foto'}).\nProvala con *${P}menu*`)
}

async function handleMenuCat(ctx, cats) {
    if (!ctx.isOwner) return ctx.err('Comando riservato all\'owner.')
    const P = ctx.prefix
    const lines = []
    for (const { cat, list } of cats) {
        lines.push({ section: `${info(cat)[0]} ${cat.toUpperCase()} (${list.length})` })
        lines.push({ raw: list.map(primary).join(' ') })
    }
    lines.push({ raw: `Sposta con: *${P}setcat <comando...> <categoria>*` })
    const box = ctx.ui.box('CATEGORIE MENU', lines)
    for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
}

async function handleSetCat(ctx, args) {
    if (!ctx.isOwner) return ctx.err('Comando riservato all\'owner.')
    const P = ctx.prefix
    if (args.length < 2) return ctx.err(`Uso: *${P}setcat <comando...> <categoria>*\nEsempio: *${P}setcat bal bj slot rpg*\nPer annullare: *${P}setcat bal reset*`)
    
    const cat = args[args.length - 1].toLowerCase()
    const done = [], missing = []
    const st = store()
    
    if (!st) return ctx.err('Database non disponibile.')
    
    for (const n of args.slice(0, -1)) {
        const p = Z().findPlugin(n.replace(/^[^a-z0-9]+/i, ''))
        if (!p) { missing.push(n); continue }
        if (cat === 'reset') st.del(`menuCat.${keyOf(p)}`)
        else st.set(`menuCat.${keyOf(p)}`, cat)
        done.push(primary(p))
    }
    
    const out = []
    if (done.length) out.push(cat === 'reset' ? `Ripristinati: ${done.join(', ')}` : `Spostati in *${cat.toUpperCase()}*: ${done.join(', ')}`)
    if (missing.length) out.push(`Non trovati: ${missing.join(', ')}`)
    return ctx.reply(ctx.ui.box('SETCAT', out))
}

async function sendMainMenu(ctx, cats) {
    const P = ctx.prefix
    const cfg = ctx.config
    
    const rows = cats.map(({ cat, list }) => {
        const [emo] = info(cat)
        return { title: `${emo} ${cat.toUpperCase()}`, description: `${list.length} comandi`, id: `${P}menu ${cat}` }
    })
    
    if (!rows.length) return ctx.err('Nessuna categoria disponibile.')

    const totCmd = cats.reduce((n, c) => n + c.list.length, 0)
    const name = ctx.pushName ? ` *${ctx.pushName}*` : ''

    let caption = [
        TOP,
        `┃ ⚡ *${cfg.botName}*`,
        `┃ 👋 Ciao${name}!`,
        `┃ 📂 ${cats.length} categorie`,
        `┃ ⚡ ${totCmd} comandi`,
        SEP,
        `┃ 👇 Usa il pulsante sotto`,
        `┃ 📜 *${P}menu tutti*`,
        BOT,
        `🚀 _${cfg.botName} • v${cfg.version}_`
    ].join('\n')
    
    if (caption.length > 1000) {
        caption = [
            TOP,
            `┃ ⚡ *${cfg.botName}*`,
            `┃ 👋 Ciao${name}!`,
            `┃ 📂 ${cats.length} categorie`,
            `┃ ⚡ ${totCmd} comandi`,
            SEP,
            `┃ 👇 Usa il pulsante sotto`,
            `┃ 📜 *${P}menu tutti*`,
            BOT,
            `🚀 _${cfg.botName} • v${cfg.version}_`
        ].join('\n')
    }

    let sent = await sendCard(ctx, caption)
    if (!sent) {
        try {
            const local = path.join(process.cwd(), 'media', 'menu.jpg')
            if (fs.existsSync(local)) { await ctx.reply({ image: fs.readFileSync(local), caption }); sent = true }
        } catch {}
    }
    if (!sent) await ctx.reply(caption)

    await ctx.sendList({
        text: 'Seleziona una categoria',
        footer: cfg.cardFooter,
        buttonText: 'Seleziona categoria',
        sections: [{ title: 'Categorie', rows }]
    }, { mode: 'universal' })
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT PLUGIN
// ═══════════════════════════════════════════════════════════════
module.exports = {
    commands: ['menu', 'comandi', 'setcat', 'menucat', 'setmenu'],
    name: 'menu',
    category: 'sistema',
    description: 'Menu principale con le categorie',
    usage: '[categoria]',
    author: 'ZENO',
    priority: 100,
    cooldown: 1500,

    async run(sock, m, args, cmd, ctx) {
        const cats = visibleCats(ctx)
        const want = (args[0] || '').toLowerCase()

        // 1. Comandi Owner
        if (cmd === 'setmenu') {
            try { return await handleSetMenu(m, args, ctx) } 
            catch (e) { return ctx.err('Errore: ' + (e && e.message ? e.message : e)) }
        }
        if (cmd === 'menucat') return handleMenuCat(ctx, cats)
        if (cmd === 'setcat') return handleSetCat(ctx, args)

        // 2. Sottomenu categoria specifica
        if (want && want !== 'tutti') {
            const found = cats.find(c => c.cat === want)
            if (!found) return ctx.err(`Categoria *${want}* non trovata.\nScrivi *${ctx.prefix}menu* per vederle tutte.`)
            return sendSub(ctx, found)
        }

        // 3. Elenco completo "tutti"
        if (want === 'tutti') {
            const lines = []
            for (const { cat, list } of cats) {
                lines.push({ section: `${info(cat)[0]} ${cat.toUpperCase()}` })
                lines.push({ raw: list.map(p => ctx.prefix + primary(p)).join('  ') })
            }
            const box = ctx.ui.box('TUTTI I COMANDI', lines)
            for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
            return
        }

        // 4. Menu principale (default)
        return sendMainMenu(ctx, cats)
    }
}
