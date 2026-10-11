'use strict'

module.exports = {
    commands: ['ano', 'culometro'],
    name: 'culometro',
    category: 'fun',
    description: 'Misura il tuo buco',
    usage: '[opzionale: @tag o rispondi a un messaggio]',

    async run(sock, m, args, cmd, ctx) {
        const grandezze = [
            '🟢 Piccolo come una formica 🐜',
            '🔵 Normale, niente di speciale 😌',
            '🟠 Medio, ci passa un dito 🖕',
            '🔴 Enorme! Ci passa una bottiglia 🍾',
            '⚫ Distrutto, sembra un tunnel ferroviario 🚇',
            '💥 Non hai più un buco, è esploso 💣'
        ]
        const grandezza = grandezze[Math.floor(Math.random() * grandezze.length)]

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

        const msg =
`*Analizzando il buco...*

📏 *Risultato:* ${grandezza}

👤 *Target:* ${targetName}`

        await sock.sendMessage(ctx.chatJid, {
            text: msg,
            mentions: targetJid ? [targetJid] : []
        }, { quoted: m })
    }
}
