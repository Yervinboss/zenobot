'use strict'

const { pureId } = require('../lib/utils')
const R = require('../lib/rpg')
const B = require('../lib/boost')
const zx = require('../lib/zx')

const btn = (id, label) => ({ buttonId: id, buttonText: { displayText: label }, type: 1 })
const send = (sock, m, text, buttons) => sock.sendMessage(m.key.remoteJid, {
    text, ...(buttons ? { buttons, headerType: 1 } : {})
}, { quoted: m })

module.exports = {
    commands: ['negozio', 'shop', 'compra', 'effetti', 'zaino'],
    name: 'rpg_shop',
    category: 'rpg',
    cooldown: 1500,
    description: 'Negozio di potenziamenti RPG (ogni oggetto ha un lato negativo)',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx)
        const P = (ctx && ctx.prefix) || '.'
        const id = pureId(m.key.participant || m.key.remoteJid)
        const db = R.read()
        const u = R.user(db, id)

        // ── negozio con tendina ──
        if (cmd === 'negozio' || cmd === 'shop') {
            const items = Object.values(B.ITEMS)
            const lines = items.map(it =>
                `${it.emoji} *${it.name}* — ${R.eur(it.price)} (${B.duration(it)})\n✅ ${it.pro}\n⚠️ ${it.con}`
            ).join('\n\n')
            const text = `💰 Saldo: *${R.eur(u.money)}*\n\n${lines}\n\n_Ogni potenziamento ha un lato negativo: valuta se ti conviene!_`
            const rows = items.map(it => ({
                title: `${it.emoji} ${it.name}`,
                description: `${R.eur(it.price)} • ${B.duration(it)} • ⚠️ ${it.con}`.slice(0, 72),
                id: `compra ${it.id}`
            }))
            if (ctx && typeof ctx.sendList === 'function') {
                return ctx.sendList({
                    title: '🛒 NEGOZIO',
                    text,
                    buttonText: 'Scegli oggetto',
                    sections: [{ title: 'Potenziamenti', rows }]
                })
            }
            return z.reply(text + `\n\nCompra con *${P}compra <nome>*`)
        }

        // ── acquisto ──
        if (cmd === 'compra') {
            const key = (args[0] || '').toLowerCase()
            const it = B.ITEMS[key] || (key ? Object.values(B.ITEMS).find(i => i.name.toLowerCase().startsWith(key)) : null)
            if (!it) return z.err(`Oggetto non trovato. Scrivi *${P}negozio* e scegli dalla tendina.`)
            if (B.isActive(u, it)) return z.warn(`${it.emoji} *${it.name}* è già attivo (${B.left(u, it)}).`)
            if (u.money < it.price) return z.err(`Ti servono *${R.eur(it.price)}*, hai *${R.eur(u.money)}*.`)
            u.money -= it.price
            B.buy(u, it.id)
            R.write(db)
            return send(sock, m, z.box(`${it.emoji} ${it.name.toUpperCase()} ATTIVO`, [
                { raw: `✅ ${it.pro}\n⚠️ ${it.con}\n⏱ Durata: *${B.duration(it)}*` },
                '---',
                { raw: `Saldo: *${R.eur(u.money)}*` }
            ]), [btn('work', '💼 Lavora'), btn('effetti', '📦 Effetti')])
        }

        // ── effetti attivi ──
        const act = B.active(u)
        const lines = act.length
            ? act.map(it => ({ raw: `${it.emoji} *${it.name}* — ${B.left(u, it)}\n✅ ${it.pro}\n⚠️ ${it.con}` }))
            : [{ raw: 'Nessun potenziamento attivo.' }]
        return send(sock, m, z.box('📦 I TUOI EFFETTI', [
            ...lines,
            '---',
            { raw: `Saldo: *${R.eur(u.money)}* • Livello *${u.level}*` }
        ]), [btn('negozio', '🛒 Negozio')])
    }
}
