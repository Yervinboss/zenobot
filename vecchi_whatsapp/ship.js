const crypto = require('crypto')
const { pureId, getCtx } = require('../lib/utils')
const zx = require('../lib/zx')

module.exports = {
    commands: ['ship', 'coppia', 'compatibilita'],
    name: 'ship',
    category: 'fun',
    cooldown: 3000,
    description: 'Compatibilità d\'amore tra due persone (taggane due o una)',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx)
        const me = m.key.participant || m.key.remoteJid
        const c = getCtx(m)
        let a, b
        const men = c.mentionedJid || []
        if (men.length >= 2) [a, b] = men
        else if (men.length === 1) [a, b] = [me, men[0]]
        else if (c.participant) [a, b] = [me, c.participant]
        if (!a || !b) return z.err('Tagga una o due persone: *.ship @a @b*')
        const [x, y] = [pureId(a), pureId(b)].sort()
        const pct = crypto.createHash('md5').update(x + ':' + y + ':' + new Date().toISOString().slice(0, 10)).digest()[0] % 101
        const bar = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10))
        const v = pct >= 90 ? 'Anime gemelle! 💍' : pct >= 70 ? 'Una coppia fantastica 😍' : pct >= 50 ? 'C\'è del potenziale 😏' : pct >= 30 ? 'Meglio amici… forse 😅' : 'Neanche con la colla 💀'
        return z.reply(z.box('💘 SHIP', [
            { raw: `@${pureId(a)} ✖️ @${pureId(b)}` }, `Compatibilità: *${pct}%*`, { raw: bar }, '---', { raw: v + '\n_Il risultato cambia ogni giorno._' }
        ]), [a, b])
    }
}
