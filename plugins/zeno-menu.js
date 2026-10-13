'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO ULTIMATE — Menu principale con categorie vere
//  • .menu                 → foto + pulsante "Seleziona categoria"
//  • .menu fun             → comandi della categoria
//  • .menu tutti           → tutti i comandi
//  • .menucat   (owner)    → vedi quali comandi stanno in quale categoria
//  • .setcat <cmd...> <categoria>  (owner) → sposta uno o più comandi
//      es.  .setcat bal bj slot rpg       .setcat figa infame fun
//      per annullare:  .setcat bal reset
//  Le categorie dei plugin con `category` esplicita restano com'è;
//  quelli senza categoria vengono assegnati in automatico dal nome.
// ═══════════════════════════════════════════════════════════════

const Z = () => global.ZENO

// [emoji, descrizione]
const CAT_INFO = {
    staff:       ['👥', 'Chi gestisce il bot'],
    funzioni:    ['⚙️', 'Utilità e strumenti vari'],
    admin:       ['👑', 'Comandi di amministrazione gruppo'],
    gruppo:      ['👥', 'Gestione del gruppo'],
    moderazione: ['🚨', 'Gestione e sicurezza del gruppo'],
    giochi:      ['🎮', 'Minigiochi e sfide'],
    rpg:         ['🎰', 'Il mondo RPG'],
    fun:         ['🎉', 'Comandi divertenti'],
    sticker:     ['🖼️', 'Sticker, audio e media'],
    musica:      ['🎵', 'Musica, playlist e Shazam'],
    download:    ['📥', 'Scarica musica e video'],
    tools:       ['🧰', 'Strumenti utili'],
    sistema:     ['🛠️', 'Stato e info del bot'],
    owner:       ['🔐', 'Comandi riservati owner'],
    assistenza:  ['🆘', 'Supporto e contatti'],
    general:     ['✨', 'Altri comandi']
}
const ORDER = ['staff', 'moderazione', 'funzioni', 'admin', 'gruppo', 'giochi', 'rpg', 'fun', 'sticker', 'musica', 'download', 'tools', 'sistema', 'owner', 'assistenza', 'general']

// Assegnazione automatica (solo per i plugin senza categoria). Correggibile con .setcat
const RULES = [
    ['funzioni', /^(anti[a-z0-9]*|welcome|goodbye|benvenuto|addio|soloadmin\w*|modoadmin|rileva|detect|slowmode|reaction|antispam)$/],
    ['admin',    /^(promote|demote|p|d|kick|k|ban|unban|warn|unwarn|mute|unmute|tag|tagall|hidetag|add|aggiungi|del|delete|admin|admins|link|resetlink|setname|setdesc|grouplink|apri|chiudi|open|close|everyone|rimuovi|svuota|debugadmin|tagadmin)$/],
    ['fun',      /^(abbraccia|bacio|kiss|schiaffo|slap|coccole|carezza|pat|figa|infame|drogato|alcolizzato|ano|culometro|frocio|dox|cazzo|ditalino|letto|tp|ship|coppia|gay|lesbica|bellezza|percentuale|amore|compatibilita|insulta|roast|barzelletta|joke|frase|fact|gaymeter|hot|simp|ritardo|bestemmiometro|top[a-z]+)$/],
    ['rpg',      /^(bal|balance|saldo|daily|giornaliero|work|lavora|rob|ruba|bank|banca|deposit|deposita|withdraw|preleva|slot|casino|roulette|bj|blackjack|divorzio|sposa|matrimonio|shop|negozio|inventario|inv|level|livello|rank|classifica|crimine|mine|mina|pesca|caccia|gift|regala|transfer|paga|pay|xp|portafoglio|wallet)$/],
    ['giochi',   /^(tris|ttt|impiccato|scf|forbici|uno|bomba|indovina|quiz|trivia|labirinto|scramble|basket|mascotte|bandiera|dado|moneta|flip|math|matematica|calcio|gioca|memory|battaglia)$/],
    ['musica',   /^(song|play|spotify|lyrics|testo|ytmp3|ytmp4|youtube|yt|music|musica|video|tiktok|instagram|ig|facebook|fb|download|scarica)$/],
    ['sticker',  /^(s|sticker|stiker|toimg|tovid|attp|ttp|emojimix|take|wm|meme|memegen)$/],
    ['owner',    /^(addowner|delowner|owner|join|leave|esci|restart|riavvia|shutdown|spegni|eval|exec|broadcast|bc|bt|setpp|setprefix|banuser|unbanuser|premium|addprem|delprem|getplugin|update|aggiorna|backup|blacklist|bl|quit)$/],
    ['sistema',  /^(ping|status|stato|info|help|aiuto|uptime|speed|runtime|botinfo|infobot)$/],
    ['staff',    /^(staff)$/],
    ['assistenza', /^(assistenza|supporto|sito|canale)$/]
]

// ── Assegnazione esplicita: comando → categoria (ha la precedenza sulle regole automatiche) ──
const MAP = {}
const put = (cat, list) => list.split(/\s+/).filter(Boolean).forEach(c => { MAP[c] = cat })
put('moderazione', 'kick warn unwarn richiamo grazia mute unmute aperto chiuso apri chiudi p promote d demote del delete tag link invito qr qrlink admin staff paneladmin antilink antispam antivoip antibot req richieste richiesta welcome setwelcome setbenvenuto testwelcome soloadmin solo setgpp gpp fotogruppo')
put('funzioni',    'afk afk_group afk_all afklist id myid pp tpnumero')
put('fun',         'abbraccia abbraccio bacio kiss bacia corna letto sega ditalino cazzo frocio negro dox doxxing figa ano culometro drogato alcolizzato alcol infame quantosbirro sbirrocheck palla imperatore doss ddos dossattacco sex sesso accoppia ban banna fakeban')
put('rpg',         'bal balance soldi portafoglio work bj blackjack slot ruba steal sposa divorzio divorzia')
put('musica',      'song play shazam pl tp playlist addplaylist casuale random shuffle suggerisci simili consiglia')
put('sticker',     's sticker toaudio tomp3 mp3 audio vv tx')
put('sistema',     'ping stats status clean pulisci clearsessions sessioni menu comandi setcat menucat')
put('owner',       'owner setowner addowner delowner shutdown spegni stopbot blackout setbotpp botpp cambiafotobot zeno zenon zenooff nuke nukeall purge testadmin debugadmin testios ioslab quit esci leave blacklist bl bt')

const primary = (p) => p.commands.find(c => typeof c === 'string') || p.name
const keyOf = (p) => String(p.name).replace(/[.\s]/g, '_')
const names = (p) => [...p.commands.filter(c => typeof c === 'string'), ...(p.aliases || [])].map(x => String(x).toLowerCase())
const store = () => (Z().db && Z().db.settings) || null
const chunkArr = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const enabled = (p) => (typeof Z().isPluginEnabled === 'function' ? Z().isPluginEnabled(p) : true)

// Funziona sia con il nuovo index.js (ZENO.categories) sia con quello vecchio (ZENO.plugins)
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
    if (cat !== 'general') return cat
    for (const [c, re] of RULES) if (ns.some(n => re.test(n))) return c
    return 'general'
}

// ⚠️ ORA la categoria "owner" è visibile a TUTTI (il blocco avviene al click)
function visibleCats(ctx) {
    const groups = new Map()
    for (const [cat, list] of allCategories()) {
        for (const p of list) {
            if (p.hidden || !enabled(p)) continue
            const c = effectiveCat(p, cat)
            if (!groups.has(c)) groups.set(c, [])
            groups.get(c).push(p)
        }
    }
    const rank = (c) => { const i = ORDER.indexOf(c); return i === -1 ? 998 : i }
    return [...groups.entries()]
        .map(([cat, list]) => ({ cat, list }))
        .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat))
}

const info = (cat) => CAT_INFO[cat] || ['📦', 'Comandi']

// 🎭 Frasi simpatiche quando un non-owner prova ad aprire la categoria OWNER
const FRASI_VIETATE = [
    '🚫 *ACCESSO NEGATO*\n\n_Lurido!_ Come osi entrare qui dentro senza il consenso? 🤬\n\n👑 Questa zona è solo per il *CREATORE*\n👉 Torna da dove sei venuto',
    '🛑 *ALT LÀ!*\n\nMa guarda un po\' chi si vede... un *lurido* curioso 😏\n\n👑 Questa sezione è sacra. Solo il *CREATORE* può metterci piede\n\n_Torna a giocare con i comandi normali_ 🚪',
    '⛔ *ZONA VIETATA*\n\n_Lurido!_ Ti sei perso o cosa? 🗿\n\n👑 Qui comanda solo il *CREATORE*, tu levati dalle palle\n\n_Osare tanto non ti conviene_ 😈',
    '🔒 *SBARRATO!*\n\nEhi *lurido*, chi ti ha dato il permesso? 🤨\n\n👑 La sezione owner è off-limits per te\n\n_Fatti gli affari tuoi_ 👉🚪',
    '😤 *MA GUARDA TE!*\n\nUn *lurido* che prova ad aprire la sezione del *CREATORE*...\n\n👑 Non sei nessuno qui dentro, sparisci 🚪\n\n_Torna quando sarai degno_ ✌️'
]

async function sendSub(ctx, { cat, list }) {
    const [emo, desc] = info(cat)
    const P = ctx.prefix
    const lines = list.map(p => {
        const name = `*${P}${primary(p)}*${p.usage ? ' ' + p.usage : ''}`
        return p.description ? `${name}\n   ${p.description}` : name
    })
    const box = ctx.ui.box(`${emo} ${cat.toUpperCase()}`, [
        { raw: `_${desc}_ • ${list.length} comandi` },
        '---',
        ...lines,
        '---',
        { raw: `↩ Torna al menu: *${P}menu*` }
    ])
    if (box.length <= 1000) {
        try { return await ctx.reply({ image: { url: ctx.config.cardImage }, caption: box }) } catch {}
    }
    for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
}

module.exports = {
    commands: ['menu', 'comandi', 'setcat', 'menucat'],
    name: 'menu',
    category: 'sistema',
    description: 'Menu principale con le categorie',
    usage: '[categoria]',
    author: 'ZENO',
    priority: 100,
    cooldown: 1500,

    async run(sock, m, args, cmd, ctx) {
        const P = ctx.prefix
        const cfg = ctx.config
        const cats = visibleCats(ctx)

        // ── owner: .menucat ──
        if (cmd === 'menucat') {
            if (!ctx.isOwner) return ctx.err('Comando riservato all\'owner.')
            const lines = []
            for (const { cat, list } of cats) {
                lines.push({ section: `${info(cat)[0]} ${cat.toUpperCase()} (${list.length})` })
                lines.push({ raw: list.map(primary).join(' ') })
            }
            lines.push({ raw: `Sposta con: *${P}setcat <comando...> <categoria>*` })
            const box = ctx.ui.box('CATEGORIE MENU', lines)
            for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
            return
        }

        // ── owner: .setcat ──
        if (cmd === 'setcat') {
            if (!ctx.isOwner) return ctx.err('Comando riservato all\'owner.')
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

        const want = (args[0] || '').toLowerCase()

        // ── 🚨 BLOCCO OWNER: se non sei owner e provi ad aprire la categoria owner ──
        if (want === 'owner' && !ctx.isOwner) {
            const frase = FRASI_VIETATE[Math.floor(Math.random() * FRASI_VIETATE.length)]
            return ctx.reply(frase)
        }

        // ── sottomenu: .menu fun ──
        if (want && want !== 'tutti') {
            const found = cats.find(c => c.cat === want)
            if (!found) return ctx.err(`Categoria *${want}* non trovata.\nScrivi *${P}menu* per vederle tutte.`)
            return sendSub(ctx, found)
        }

        // ── elenco completo: .menu tutti ──
        if (want === 'tutti') {
            const lines = []
            for (const { cat, list } of cats) {
                lines.push({ section: `${info(cat)[0]} ${cat.toUpperCase()}` })
                lines.push({ raw: list.map(p => P + primary(p)).join('  ') })
            }
            const box = ctx.ui.box('TUTTI I COMANDI', lines)
            for (const part of chunkArr(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
            return
        }

        // ── menu principale ──
        const rows = cats.map(({ cat, list }) => {
            const [emo, desc] = info(cat)
            return { title: `${emo} ${cat.toUpperCase()}`, description: `${desc} • ${list.length}`, id: `${P}menu ${cat}` }
        })
        if (!rows.length) return ctx.err('Nessuna categoria disponibile.')

        const totCmd = cats.reduce((n, c) => n + c.list.length, 0)
        const name = ctx.pushName ? ` ${ctx.pushName}` : ''
        const caption =
            `⚡ *MENU PRINCIPALE DI ${cfg.botName}*\n` +
            `👋 Ciao${name}!\n` +
            `📦 ${cats.length} categorie • ${totCmd} comandi\n\n` +
            `🚀 ${cfg.botName} • v${cfg.version}`

        // 1) foto + testo
        let sent = false
        try {
            await ctx.reply({ image: { url: cfg.cardImage }, caption })
            sent = true
        } catch {}
        if (!sent) {
            try {
                const fs = require('fs'), path = require('path')
                const local = path.join(process.cwd(), 'media', 'menu.jpg')
                if (fs.existsSync(local)) { await ctx.reply({ image: fs.readFileSync(local), caption }); sent = true }
            } catch {}
        }
        if (!sent) await ctx.reply(caption)

        // 2) lista con pulsante
        await ctx.sendList({
            text: 'Seleziona una categoria',
            footer: cfg.cardFooter,
            buttonText: 'Seleziona categoria',
            sections: [{ title: 'Categorie', rows }]
        }, { mode: 'universal' })
    }
    }
