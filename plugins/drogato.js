'use strict'

module.exports = {
    commands: ['drogato'],
    name: 'drogato',
    category: 'fun',
    description: 'Misura il tuo livello di droga',
    usage: '[opzionale: @tag o rispondi a un messaggio]',

    async run(sock, m, args, cmd, ctx) {
        const width = Math.floor(Math.random() * 101)

        // Priorità: @tag > reply > autore
        let targetJid = null
        let targetName = null
        if (ctx.mentions.length) {
            targetJid = ctx.mentions[0].jid
            targetName = '@' + ctx.mentions[0].number
        } else if (ctx.quoted && ctx.quoted.participant) {
            targetJid = ctx.quoted.participant
            targetName = '@' + ctx.quoted.number
        } else {
            targetJid = ctx.senderJid
            targetName = ctx.pushName || 'Tu'
        }

        const finalPhrase = width >= 70
            ? '🌿 Attenti che si pippa pure la farina'
            : width >= 30
            ? '🌿 Non sa pippare, aumenta le dosi!!'
            : '🌿 Un\'esempio da seguire, complimenti.'

        const message =
`『💬』 ══ •⊰✰⊱• ══ 『💬』

MOMENTO DEL DRUG TEST! 🌿 
━━━━━━━━━━━━━━
 ${targetName} ha un tasso di droga del ${width}%! 🌿
『💬』 ══ •⊰✰⊱• ══ 『💬』

${finalPhrase}`

        await sock.sendMessage(ctx.chatJid, {
            text: message,
            mentions: targetJid ? [targetJid] : []
        }, { quoted: m })
    }
}
