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
    funzioni:    ['⚙️', 'Sicurezza e funzioni del gruppo'],
    admin:       ['👑', 'Comandi di amministrazione gruppo'],
    gruppo:      ['👥', 'Gestione del gruppo'],
    moderazione: ['🚨', 'Moderazione e sicurezza'],
    giochi:      ['🎮', 'Minigiochi e sfide'],
    rpg:         ['🎰', 'Il mondo RPG'],
    fun:         ['🎉', 'Comandi divertenti'],
    sticker:     ['🖼️', 'Sticker e immagini'],
    musica:      ['🎵', 'Musica e download'],
    download:    ['📥', 'Scarica musica e video'],
    tools:       ['🧰', 'Strumenti utili'],
    sistema:     ['🛠️', 'Stato e info del bot'],
    owner:       ['🔐', 'Comandi riservati owner'],
    assistenza:  ['🆘', 'Supporto e contatti'],
    general:     ['✨', 'Altri comandi']
}
const ORDER = ['staff', 'funzioni', 'admin', 'gruppo', 'moderazione', 'giochi', 'rpg', 'fun', 'sticker', 'musica', 'download', 'tools', 'sistema', 'owner', 'assistenza', 'general']

// Assegnazione automatica (solo per i plugin senza categoria). Correggibile con .setcat
const RULES = [
    ['funzioni', /^(anti[a-z0-9]*|welcome|goodbye|benvenuto|addio|soloadmin\w*|modoadmin|rileva|detect|slowmode|reaction|antispam)$/],
    ['admin',    /^(promote|demote|p|d|kick|k|ban|unban|warn|unwarn|mute|unmute|tag|tagall|hidetag|add|aggiungi|del|delete|admin|admins|link|resetlink|setname|setdesc|grouplink|apri|chiudi|open|close|everyone|rimuovi|svuota|debugadmin|tagadmin)$/],
    ['fun',      /^(abbraccia|bacio|kiss|schiaffo|slap|coccole|carezza|pat|figa|infame|drogato|alcolizzato|ano|culometro|frocio|dox|cazzo|ditalino|letto|tp|ship|coppia|gay|lesbica|bellezza|percentuale|amore|compatibilita|insulta|roast|barzelletta|joke|frase|fact|gaymeter|hot|simp|ritardo|bestemmiometro|top[a-z]+)$/],
    ['rpg',      /^(bal|balance|saldo|daily|giornaliero|work|lavora|rob|ruba|bank|banca|deposit|deposita|withdraw|preleva|slot|casino|roulette|bj|blackjack|divorzio|sposa|matrimonio|shop|negozio|inventario|inv|level|livello|rank|classifica|crimine|mine|mina|pesca|caccia|gift|regala|transfer|paga|pay|xp|portafoglio|wallet)$/],
    ['giochi',   /^(tris|ttt|impiccato|scf|forbici|uno|bomba|indovina|quiz|trivia|labirinto|scramble|basket|mascotte|bandiera|dado|moneta|flip|math|matematica|calcio|gioca|memory|battaglia)$/],
    ['musica',   /^(song|play|spotify|lyrics|testo|ytmp3|ytmp4|youtube|yt|music|musica|video|tiktok|instagram|ig|facebook|fb|download|scarica)$/],
    ['sticker',  /^(s|sticker|stiker|toimg|tovid|attp|ttp|emojimix|take|wm|meme|memegen)$/],
    ['owner',    /^(addowner|delowner|owner|join|leave|esci|restart|riavvia|shutdown|spegni|eval|exec|broadcast|bc|setpp|setprefix|banuser|unbanuser|premium|addprem|delprem|getplugin|update|aggiorna|backup)$/],
    ['sistema',  /^(ping|status|stato|info|help|aiuto|uptime|speed|runtime|botinfo|infobot)$/],
    ['staff',    /^(staff)$/],
    ['assistenza', /^(assistenza|supporto|sito|canale)$/]
]

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
    if (cat !== 'general') return cat
    const ns = names(p)
    for (const [c, re] of RULES) if (ns.some(n => re.test(n))) return c
    return 'general'
}

function visibleCats(ctx) {
    const groups = new Map()
    for (const [cat, list] of allCategories()) {
        for (const p of list) {
            if (p.hidden || !enabled(p)) continue
            const c = effectiveCat(p, cat)
            if (c === 'owner' && !ctx.isOwner) continue
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

        // ── owner: .menucat → quali comandi in quale categoria ──
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

        // ── owner: .setcat bal bj slot rpg ──
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

        // ── menu principale: titolo + (foto con selettore categorie) ──
        const rows = cats.map(({ cat, list }) => {
            const [emo, desc] = info(cat)
            return { title: `${emo} ${cat.toUpperCase()}`, description: `${desc} • ${list.length}`, id: `${P}menu ${cat}` }
        })
        if (!rows.length) return ctx.err('Nessuna categoria disponibile.')

        const name = ctx.pushName ? ` ${ctx.pushName}` : ''
        await ctx.sendCards({
            text: `⚡ *MENU PRINCIPALE DI ${cfg.botName}*`,
            cards: [{
                title: '📚 Menu principale',
                body: `👋 Ciao${name}!\nSeleziona una categoria per aprire il relativo menu.\n\n🚀 ${cfg.botName} • v${cfg.version}`,
                footer: cfg.cardFooter,
                buttons: [ctx.btn.list('Seleziona categoria', [{ title: 'Categorie', rows }])]
            }]
        })
    }
}
