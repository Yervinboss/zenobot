'use strict'
// Potenziamenti del negozio RPG (oggetti con vantaggi e svantaggi)
// Gli effetti attivi stanno in user.fx dentro database/rpg.json

const R = require('./rpg')
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a

const ITEMS = {
    caffe: {
        id: 'caffe', name: 'Caffè Doppio', emoji: '☕', price: 2000, uses: 5, kinds: ['work'],
        pro: '+60% soldi al work', con: 'XP -50%',
        mods: { money: 1.6, xp: 0.5 }
    },
    energy: {
        id: 'energy', name: 'Energy Drink', emoji: '⚡', price: 2500, uses: 3, kinds: ['work', 'pesca', 'crimine'],
        pro: 'guadagni x2', con: '25% di crollo (-500/1.500)',
        mods: { money: 2, crashChance: 0.25, crashLoss: [500, 1500] }
    },
    blindato: {
        id: 'blindato', name: 'Blindato', emoji: '🛡️', price: 3000, minutes: 60, kinds: ['work', 'pesca', 'crimine'],
        pro: 'nessuno può derubarti', con: 'tassa del 15% sui guadagni',
        mods: { money: 0.85, shield: true }
    },
    guanti: {
        id: 'guanti', name: 'Guanti da Scasso', emoji: '🧤', price: 2500, uses: 3, kinds: ['crimine'],
        pro: '+20% successo, bottino x1,5', con: 'multa x2 se fallisci',
        mods: { luck: 0.2, loot: 1.5, fine: 2 }
    },
    esca: {
        id: 'esca', name: 'Esca Dorata', emoji: '🎣', price: 1500, uses: 4, kinds: ['pesca'],
        pro: 'pesci rari x3', con: 'pesci comuni valgono la metà',
        mods: { rare: 3, common: 0.5 }
    }
}

const ensure = (u) => {
    if (!u.fx || typeof u.fx !== 'object') u.fx = {}
    return u.fx
}

function isActive(u, it) {
    const e = ensure(u)[it.id]
    if (!e) return false
    return it.minutes ? e.until > Date.now() : e.uses > 0
}

const active = (u) => Object.values(ITEMS).filter(it => isActive(u, it))
const shielded = (u) => active(u).some(it => it.mods.shield)

function buy(u, id) {
    const it = ITEMS[id]
    ensure(u)[id] = it.minutes ? { until: Date.now() + it.minutes * 60000 } : { uses: it.uses }
    return it
}

function left(u, it) {
    const e = ensure(u)[it.id]
    if (it.minutes) return Math.ceil((e.until - Date.now()) / 60000) + ' min'
    return e.uses + (e.uses === 1 ? ' uso' : ' usi')
}

const duration = (it) => (it.minutes ? it.minutes + ' min' : it.uses + ' usi')

// Inizia un'azione (work, pesca, crimine): consuma una carica degli oggetti attivi
// e restituisce gli effetti da applicare.
function start(u, kind) {
    ensure(u)
    const items = active(u).filter(it => it.kinds.includes(kind))
    for (const it of items) {
        if (it.uses) {
            const e = u.fx[it.id]
            e.uses -= 1
            if (e.uses <= 0) delete u.fx[it.id]
        }
    }
    const prod = (k) => items.reduce((a, it) => a * (it.mods[k] === undefined ? 1 : it.mods[k]), 1)
    const sum = (k) => items.reduce((a, it) => a + (it.mods[k] || 0), 0)
    const earn = (money, xp) => {
        let m = money * prod('money')
        const x = xp * prod('xp')
        const notes = []
        for (const it of items) {
            if (it.mods.crashChance && Math.random() < it.mods.crashChance) {
                const loss = rnd(it.mods.crashLoss[0], it.mods.crashLoss[1])
                m -= loss
                notes.push(it.emoji + ' *Crollo!* ' + it.name + ' ti costa ' + R.eur(loss))
            }
        }
        return { money: Math.max(0, Math.round(m)), xp: Math.max(0, Math.round(x)), notes }
    }
    return { items, prod, sum, earn }
}

module.exports = { ITEMS, rnd, isActive, active, shielded, buy, left, duration, start }
