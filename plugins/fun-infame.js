'use strict'

module.exports = {
    commands: ['infame', 'quantosbirro', 'sbirrocheck'],
    name: 'infame',
    category: 'fun',
    description: 'Scopri quanto sei infame',
    usage: '[opzionale: @tag o rispondi a un messaggio]',

    async run(sock, m, args, cmd, ctx) {
        const percent = Math.floor(Math.random() * 101)

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

        const savageReactions = [
            `🧢 *"Nah, sei pulito"* (ma sotto il ${percent}% sei un po' sospetto...)`,
            `👀 *"Fra, ma sei la pecora nera della chat?"*`,
            `💀 *"Sei il motivo per cui le nonne nascondono il portafoglio"*`,
            `🤡 *"Se l'infamia fosse un TikTok, saresti virale"*`,
            `🚓 *"Polizia locale? No, DITTATORIALE con sto livello"*`,
            `🤑 *"Se rubassi come infami, saresti Jeff Bezos"*`,
            `📸 *"Sei lo screenshot che non dovevi fare"*`,
            `🔥 *"Hai più scheletri nell'armadio che followers"*`
        ]
        const randomSavage = savageReactions[Math.floor(Math.random() * savageReactions.length)]

        const emoji = percent > 80 ? '🚨' : percent > 50 ? '😎' : '🧼'
        const verdict = percent > 80
            ? '*SEI L\'ADMIN DEGLI SBIRRI!* 🚨'
            : percent > 50
            ? '*Sei nella zona pericolosa...*'
            : '*Pulito... forse.*'

        const response =
`📊 *TEST INFAME-Z* 📊

👤 *Target:* ${targetName}
👤 *Livello infame:* *${percent}%*
${emoji} ${verdict}

${randomSavage}`

        await sock.sendMessage(ctx.chatJid, {
            text: response,
            mentions: targetJid ? [targetJid] : []
        }, { quoted: m })
    }
}
