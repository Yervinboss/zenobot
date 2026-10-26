'use strict'

module.exports = {
    commands: ['alcolizzato', 'alcol'],
    name: 'alcolizzato',
    category: 'fun',
    description: 'Misura il tuo tasso alcolemico',
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
            ? '🍾 Amico se hai bisogno di parlare io ci sono..'
            : width >= 30
            ? '🥂 Beve in modo responsabile, o quasi...'
            : '🚰 Totalmente sobrio, niente sbronze per oggi!'

        const message =
`『💬』 ══ •⊰✰⊱• ══ 『💬』

MOMENTO DEL TEST DELL'ALCOL! 🍷 
━━━━━━━━━━━━━━
 ${targetName} ha un tasso alcolemico del ${width}%! 🍷
『💬』 ══ •⊰✰⊱• ══ 『💬』

${finalPhrase}`

        await sock.sendMessage(ctx.chatJid, {
            text: message,
            mentions: targetJid ? [targetJid] : []
        }, { quoted: m })
    }
}
