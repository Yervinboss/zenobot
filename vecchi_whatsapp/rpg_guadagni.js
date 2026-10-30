'use strict'

const { pureId } = require('../lib/utils')
const R = require('../lib/rpg')
const B = require('../lib/boost')
const zx = require('../lib/zx')

const rnd = B.rnd
const btn = (id, label) => ({ buttonId: id, buttonText: { displayText: label }, type: 1 })
const send = (sock, m, text, buttons) => sock.sendMessage(m.key.remoteJid, {
    text, ...(buttons ? { buttons, headerType: 1 } : {})
}, { quoted: m })

const CATCHES = [
    { name: 'Stivale vecchio', emoji: '👢', min: 10, max: 50, w: 12 },
    { name: 'Sardina', emoji: '🐟', min: 300, max: 700, w: 35 },
    { name: 'Orata', emoji: '🐠', min: 700, max: 1500, w: 28 },
    { name: 'Tonno', emoji: '🐡', min: 1500, max: 3000, w: 15 },
    { name: 'Squalo', emoji: '🦈', min: 4000, max: 7000, w: 7, rare: true },
    { name: 'Tesoro', emoji: '💎', min: 9000, max: 15000, w: 2, rare: true }
]
const PLACES = ['una gioielleria', 'un distributore', 'un furgone portavalori', 'una villa', 'un magazzino']

module.exports = {
    commands: ['pesca', 'crimine'],
    name: 'rpg_guadagni',
    category: 'rpg',
    cooldown: 1500,
    description: 'Due modi per fare soldi: pesca (sicura) e crimine (rischiosa)',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx)
        const id = pureId(m.key.participant || m.key.remoteJid)
        const db = R.read()
        const u = R.user(db, id)
        const now = Date.now()

        // ── pesca ──
        if (cmd === 'pesca') {
            const wait = (u.lastPesca || 0) + 60000 - now
            if (wait > 0) return z.warn(`La lenza è ancora in acqua! Riprova tra *${Math.ceil(wait / 1000)}s*.`)

            const fx = B.start(u, 'pesca')
            const rare = fx.prod('rare')
            const common = fx.prod('common')
            const pool = CATCHES.map(c => ({ c, w: c.w * (c.rare ? rare : 1) }))
            let x = Math.random() * pool.reduce((a, p) => a + p.w, 0)
            let pick = pool[0].c
            for (const p of pool) {
                x -= p.w
                if (x < 0) { pick = p.c; break }
            }
            const base = rnd(pick.min, pick.max)
            const value = pick.rare ? base : Math.round(base * common)
            const e = fx.earn(value, rnd(20, 50))

            u.lastPesca = now
            u.money += e.money
            const up = R.addXp(u, e.xp)
            R.write(db)

            return send(sock, m, z.box('🎣 PESCA', [
                `${pick.emoji} Hai preso: *${pick.name}*${pick.rare ? ' ✨ RARO!' : ''}`,
                { raw: `💰 +${R.eur(e.money)} • ✨ +${e.xp} XP` },
                ...e.notes.map(n => ({ raw: n })),
                up ? `🎉 Sei salito al *livello ${u.level}*!` : null,
                fx.items.length ? { raw: `🧪 Effetti: ${fx.items.map(i => i.emoji).join(' ')}` } : null,
                '---',
                { raw: `Saldo: *${R.eur(u.money)}*` }
            ].filter(Boolean)), [btn('pesca', '🎣 Pesca ancora'), btn('negozio', '🛒 Negozio')])
        }

        // ── crimine ──
        const wait = (u.crimeUntil || 0) - now
        if (wait > 0) return z.warn(`Le guardie ti cercano ancora! Riprova tra *${Math.ceil(wait / 1000)}s*.`)

        const fx = B.start(u, 'crimine')
        const chance = Math.min(0.9, 0.5 + fx.sum('luck'))
        const place = PLACES[rnd(0, PLACES.length - 1)]
        let lines

        if (Math.random() < chance) {
            const loot = Math.round(rnd(2000, 6000) * fx.prod('loot'))
            const e = fx.earn(loot, rnd(40, 80))
            u.money += e.money
            const up = R.addXp(u, e.xp)
            u.crimeUntil = now + 90000
            lines = [
                `🥷 Colpo a *${place}* riuscito!`,
                { raw: `💰 +${R.eur(e.money)} • ✨ +${e.xp} XP` },
                ...e.notes.map(n => ({ raw: n })),
                up ? `🎉 Sei salito al *livello ${u.level}*!` : null
            ]
        } else {
            const fine = Math.round(rnd(800, 2500) * fx.prod('fine'))
            const paid = Math.min(u.money, fine)
            u.money -= paid
            u.crimeUntil = now + 150000
            lines = [
                `🚔 Ti hanno beccato mentre rapinavi *${place}*!`,
                { raw: `💸 Multa: -${R.eur(paid)}\n⏳ Fermo per 2 minuti e mezzo` }
            ]
        }
        R.write(db)

        return send(sock, m, z.box('🥷 CRIMINE', [
            ...lines,
            { raw: `🎲 Probabilità di successo: *${Math.round(chance * 100)}%*` },
            fx.items.length ? { raw: `🧪 Effetti: ${fx.items.map(i => i.emoji).join(' ')}` } : null,
            '---',
            { raw: `Saldo: *${R.eur(u.money)}*` }
        ].filter(Boolean)), [btn('crimine', '🥷 Riprova'), btn('negozio', '🛒 Negozio')])
    }
}
