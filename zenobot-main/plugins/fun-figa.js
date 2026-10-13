'use strict'

module.exports = {
    commands: ['figa'],
    name: 'figa',
    category: 'fun',
    description: 'Calcola l\'apertura stimata',
    usage: '[opzionale: @tag o rispondi a un messaggio]',

    async run(sock, m, args, cmd, ctx) {
        const width = Math.floor(Math.random() * 31)

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

        const finalPhrase = width >= 8
            ? '🔥 Complimenti, siamo su livelli impressionanti!'
            : '😅 Un risultato discreto, c\'è sempre margine di miglioramento!'

        const message =
`━━━━━━━━━━━━━━━━
📏 CALCOLATORE DI APERTURA 📏
━━━━━━━━━━━━━━━━
🔍 ${targetName} ha un'apertura stimata di:  
👉 ${width} cm!  
━━━━━━━━━━━━━━━━
${finalPhrase}`

        await sock.sendMessage(ctx.chatJid, {
            text: message,
            mentions: targetJid ? [targetJid] : []
        }, { quoted: m })
    }
}
