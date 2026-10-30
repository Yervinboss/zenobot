const zx = require('../lib/zx')
const store = require('../lib/store')
const S = store('promemoria', { list: [] })
const UNIT = { s: 1e3, sec: 1e3, m: 6e4, min: 6e4, h: 36e5, ore: 36e5, ora: 36e5, g: 864e5, d: 864e5, giorni: 864e5 }
const MAX = 7 * 864e5
let started = false

function parse(t) {
    const x = /^(\d+)\s*(s|sec|m|min|h|ore|ora|g|d|giorni)$/i.exec(String(t || ''))
    return x ? Number(x[1]) * UNIT[x[2].toLowerCase()] : 0
}
const fmt = (ms) => { if (ms < 6e4) return `${Math.max(1, Math.round(ms / 1e3))} sec`; const m = Math.round(ms / 6e4); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 144) / 10} g` }

function arm(sock, r) {
    const wait = Math.max(0, r.at - Date.now())
    setTimeout(async () => {
        const i = S.data.list.findIndex(x => x.id === r.id)
        if (i === -1) return
        S.data.list.splice(i, 1); S.save()
        try { await sock.sendMessage(r.chat, { text: `⏰ *PROMEMORIA*\n@${r.user.split('@')[0]} ${r.text}`, mentions: [r.user] }) } catch {}
    }, Math.min(wait, 2147000000))
}
const start = (sock) => { if (started) return; started = true; S.data.list.forEach(r => arm(sock, r)) }

module.exports = {
    commands: ['promemoria', 'ricordami', 'remind'],
    name: 'promemoria',
    category: 'funzioni',
    cooldown: 2000,
    description: 'Ti ricorda qualcosa dopo un po\' (es. .promemoria 30m uscire il cane)',

    // riarma i promemoria salvati dopo un riavvio (al primo messaggio ricevuto)
    onMessage(sock) { start(sock) },

    async run(sock, m, args, cmd, ctx) {
        start(sock)
        const z = zx(sock, m, ctx)
        const user = m.key.participant || m.key.remoteJid
        const mine = S.data.list.filter(r => r.user === user)

        if (/^(lista|list)$/i.test(args[0] || '')) {
            if (!mine.length) return z.info('Non hai promemoria attivi.')
            return z.reply(z.box('I TUOI PROMEMORIA', mine.map((r, i) => ({ raw: `${i + 1}. tra *${fmt(r.at - Date.now())}* — ${r.text}` })).concat('---', { raw: '_Annulla con .promemoria annulla <n>_' })))
        }
        if (/^(annulla|cancella)$/i.test(args[0] || '')) {
            const r = mine[(parseInt(args[1]) || 0) - 1]
            if (!r) return z.err('Numero non valido. Guarda *.promemoria lista*')
            S.data.list = S.data.list.filter(x => x.id !== r.id); S.save()
            return z.ok('Promemoria annullato.')
        }
        const ms = parse(args[0]), text = args.slice(1).join(' ').trim()
        if (!ms || !text) return z.err('Uso: *.promemoria 30m <cosa>*\nUnità: s, m, h, g  (max 7 giorni)\nAltro: *.promemoria lista* • *annulla <n>*')
        if (ms > MAX) return z.err('Massimo 7 giorni.')
        if (mine.length >= 10) return z.err('Hai già 10 promemoria attivi.')
        const r = { id: Date.now() + Math.random().toString(36).slice(2, 6), chat: z.jid, user, at: Date.now() + ms, text: text.slice(0, 300) }
        S.data.list.push(r); S.save(); arm(sock, r)
        return z.ok(`Ok! Tra *${fmt(ms)}* ti ricordo: _${r.text}_`)
    }
}
