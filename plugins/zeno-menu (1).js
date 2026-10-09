'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO ULTIMATE — Menu principale a card con selettore categorie
//  Android  → card con immagine + pulsante "Seleziona categoria"
//  iPhone   → anteprima card + lista con pulsante "Seleziona categoria"
//  Le categorie si creano da sole dai tuoi plugin (campo `category`).
//  Mettilo in ./plugins/ — ha priorità sul menu di serie e sui vecchi menu.
// ═══════════════════════════════════════════════════════════════

const Z = () => global.ZENO

// [emoji, descrizione] — categorie non elencate usano 📦
const CAT_INFO = {
    general:     ['✨', 'Comandi generali'],
    sistema:     ['⚙️', 'Stato e info del bot'],
    admin:       ['👑', 'Amministrazione del gruppo'],
    gruppo:      ['👥', 'Gestione del gruppo'],
    moderazione: ['🚨', 'Moderazione e sicurezza'],
    giochi:      ['🎮', 'Minigiochi e sfide'],
    fun:         ['🎉', 'Comandi divertenti'],
    rpg:         ['🎰', 'Il mondo RPG'],
    sticker:     ['🖼️', 'Sticker e immagini'],
    download:    ['📥', 'Scarica musica e video'],
    musica:      ['🎵', 'Musica e canzoni'],
    tools:       ['🧰', 'Strumenti utili'],
    owner:       ['🔐', 'Riservati all\'owner']
}
const ORDER = Object.keys(CAT_INFO)

const primary = (p) => p.commands.find(c => typeof c === 'string') || p.name

function visibleCats(ctx) {
    const out = []
    for (const [cat, list] of Z().categories) {
        if (cat === 'owner' && !ctx.isOwner) continue
        const v = list.filter(p => !p.hidden && Z().isPluginEnabled(p))
        if (v.length) out.push({ cat, list: v })
    }
    const rank = (c) => { const i = ORDER.indexOf(c); return i === -1 ? 999 : i }
    return out.sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat))
}

async function sendSub(ctx, { cat, list }) {
    const [emo, desc] = CAT_INFO[cat] || ['📦', 'Comandi']
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
    // immagine + testo se sta in una didascalia, altrimenti solo testo
    if (box.length <= 1000) {
        try { return await ctx.reply({ image: { url: ctx.config.cardImage }, caption: box }) } catch {}
    }
    for (const part of ctx.helpers.chunk(box.split('\n'), 60).map(x => x.join('\n'))) await ctx.reply(part)
}

module.exports = {
    commands: ['menu', 'comandi'],
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
        const want = (args[0] || '').toLowerCase()

        // ── sottomenu: .menu giochi ──
        if (want && want !== 'tutti') {
            const found = cats.find(c => c.cat === want)
            if (!found) return ctx.err(`Categoria *${want}* non trovata.\nScrivi *${P}menu* per vederle tutte.`)
            return sendSub(ctx, found)
        }

        // ── elenco completo: .menu tutti ──
        if (want === 'tutti') {
            const lines = []
            for (const { cat, list } of cats) {
                lines.push({ section: `${(CAT_INFO[cat] || ['📦'])[0]} ${cat.toUpperCase()}` })
                lines.push({ raw: list.map(p => P + primary(p)).join('  ') })
            }
            return ctx.reply(ctx.ui.box('TUTTI I COMANDI', lines))
        }

        // ── menu principale: card + selettore categorie ──
        const rows = cats.map(({ cat, list }) => {
            const [emo, desc] = CAT_INFO[cat] || ['📦', 'Comandi']
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
