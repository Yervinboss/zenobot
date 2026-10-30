const { pureId } = require('../lib/utils')
const zx = require('../lib/zx')
const store = require('../lib/store')
const S = store('attivita')
const day = () => new Date().toISOString().slice(0, 10)
const SKIP = /^(protocolMessage|reactionMessage|senderKeyDistributionMessage|messageContextInfo|pollUpdateMessage|keepInChatMessage|editedMessage)$/
const ids = (p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(pureId)

module.exports = {
    commands: ['attivi', 'topattivi', 'fantasmi'],
    name: 'attivita',
    category: 'funzioni',
    groupOnly: true,
    cooldown: 4000,
    description: 'Classifica dei più attivi (oggi/settimana/totale) e lista dei fantasmi',

    // conta i messaggi di ogni membro (solo gruppi)
    onMessage(sock, m) {
        try {
            const jid = m.key.remoteJid
            if (!jid || !jid.endsWith('@g.us') || m.key.fromMe || !m.message) return
            if (!Object.keys(m.message).some(k => !SKIP.test(k))) return
            const id = pureId(m.key.participant); if (!id) return
            const g = S.data[jid] || (S.data[jid] = {})
            const u = g[id] || (g[id] = { n: 0, d: {} })
            u.n++; u.l = Date.now()
            const k = day(); u.d[k] = (u.d[k] || 0) + 1
            const keys = Object.keys(u.d).sort()
            if (keys.length > 8) keys.slice(0, keys.length - 8).forEach(x => delete u.d[x])
            S.save()
        } catch {}
    },

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx), jid = z.jid
        const g = S.data[jid] || {}
        const meta = await sock.groupMetadata(jid)

        if (cmd === 'fantasmi') {
            if (!(ctx && ctx.isAdmin)) return z.err('Solo gli admin possono usare *.fantasmi*.')
            const ghosts = meta.participants.filter(p => !ids(p).some(i => g[i]))
            if (!ghosts.length) return z.ok('Nessun fantasma: tutti hanno scritto almeno una volta!')
            const shown = ghosts.slice(0, 30)
            return z.reply(z.box(`FANTASMI (${ghosts.length})`, [
                { raw: 'Mai visti scrivere da quando tengo il conto:' }, '---',
                ...shown.map(p => ({ raw: '👻 @' + p.id.split('@')[0] })),
                ghosts.length > shown.length ? { raw: `…e altri ${ghosts.length - shown.length}` } : null
            ]), shown.map(p => p.id))
        }

        const mode = (args[0] || '').toLowerCase()
        const period = mode === 'oggi' ? 'oggi' : ['settimana', 'week', '7'].includes(mode) ? 'sett' : 'tot'
        const today = day()
        const score = (u) => period === 'tot' ? u.n : period === 'oggi' ? (u.d[today] || 0) : Object.values(u.d).reduce((a, b) => a + b, 0)
        const rows = meta.participants
            .map(p => ({ p, s: Math.max(0, ...ids(p).map(i => g[i] ? score(g[i]) : 0)) }))
            .filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 10)
        if (!rows.length) return z.info('Ancora nessun dato: conto i messaggi da adesso in poi.\nProva *.attivi oggi* più tardi.')
        const medal = ['🥇', '🥈', '🥉']
        const label = { oggi: 'OGGI', sett: 'SETTIMANA', tot: 'TOTALE' }[period]
        const total = rows.reduce((a, r) => a + r.s, 0)
        return z.reply(z.box(`PIÙ ATTIVI • ${label}`, [
            ...rows.map((r, i) => ({ raw: `${medal[i] || (i + 1) + '.'} @${r.p.id.split('@')[0]} — *${r.s}* msg` })),
            '---', { raw: `Totale top 10: *${total}* messaggi\n_Usa: .attivi oggi • settimana • totale_` }
        ]), rows.map(r => r.p.id))
    }
}
