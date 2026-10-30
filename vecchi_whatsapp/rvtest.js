'use strict'

// Prova del carosello nel formato di varebot (@realvare/baileys)
module.exports = {
    name: 'rvtest',
    commands: ['rvtest'],
    category: 'sistema',
    ownerOnly: true,
    author: 'ZENO',
    description: 'Prova il carosello nel formato di varebot',

    async run(sock, m, args, cmd, ctx) {
        const cards = [1, 2, 3].map(i => ({
            image: { url: ctx.config.cardImage },
            title: `${i}. Card di prova`,
            body: `Card numero ${i}\nScorri di lato`,
            footer: 'ZENOBOT',
            buttons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: `Seleziona ${i}`, id: '.ping' }) },
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Apri sito', url: 'https://example.com' }) }
            ]
        }))
        try {
            await sock.sendMessage(ctx.chat, { text: 'Test carosello (formato varebot)', footer: 'ZENOBOT', cards }, { quoted: m })
            await ctx.reply('✅ Inviato. Lo vedi? Scorre di lato?')
        } catch (e) {
            await ctx.reply('❌ Errore: ' + (e && e.message))
        }
    }
}
