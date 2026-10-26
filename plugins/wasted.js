'use strict'
module.exports = {
    commands: ['wasted'],
    category: 'fun',
    description: 'Applica l\'effetto WASTED di GTA a un utente',
    usage: '<@utente>',
    async run(sock, m, args, cmd, ctx) {
        const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                       m.message.extendedTextMessage?.contextInfo?.participant
        
        if (!target) return ctx.err('Tagga qualcuno o rispondi a un suo messaggio!')
        
        await ctx.react('💀')
        try {
            let ppUrl
            try {
                ppUrl = await sock.profilePictureUrl(target, 'image')
            } catch {
                ppUrl = 'https://i.ibb.co/6P5Yt4b/default-avatar.png' // Avatar di default se non ha la foto
            }
            
            const apiUrl = `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(ppUrl)}`
            const res = await fetch(apiUrl)
            if (!res.ok) throw new Error('API error')
            const buffer = Buffer.from(await res.arrayBuffer())
            
            await sock.sendMessage(ctx.chat, { 
                image: buffer, 
                caption: `💀 *@${target.split('@')[0]} è stato eliminato.*`,
                mentions: [target]
            }, { quoted: m })
            await ctx.react('✅')
        } catch (e) {
            ctx.err('Errore durante la creazione dell\'immagine.')
        }
    }
}
