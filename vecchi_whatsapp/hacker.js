'use strict'
module.exports = {
    commands: ['hacker', 'hackera'],
    category: 'fun',
    description: 'Simula un attacco hacker contro un utente',
    usage: '<@utente>',
    async run(sock, m, args, cmd, ctx) {
        const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                       m.message.extendedTextMessage?.contextInfo?.participant
        
        if (!target) return ctx.err('Tagga qualcuno o rispondi a un suo messaggio per hackerarlo!')
        
        const victim = target.split('@')[0]
        await ctx.reply(`⚠️ *AVVIO PROTOCOLLO DI ATTACCO...*\nTarget: @${victim}`)
        await ctx.react('💻')
        
        const steps = [
            `[▓▓░░░░░░░░] 20% - Connessione al server...`,
            `[▓▓▓▓░░░░░░] 40% - Bypass del firewall...`,
            `[▓▓▓▓▓▓░░░░] 60% - Iniezione SQL in corso...`,
            `[▓▓▓▓▓▓▓▓░░] 80% - Download dati personali...`,
            `[▓▓▓▓▓▓▓▓▓▓] 100% - ACCESSO EFFETTUATO! 🔓`
        ]
        
        const msgWait = await sock.sendMessage(ctx.chat, { text: steps[0] })
        
        for (let i = 1; i < steps.length; i++) {
            await new Promise(r => setTimeout(r, 1200)) // Aspetta 1.2 secondi
            try {
                await sock.sendMessage(ctx.chat, { text: steps[i], edit: msgWait.key })
            } catch {}
        }
        
        await new Promise(r => setTimeout(r, 1000))
        
        const result = ctx.ui.box('💻 HACK COMPLETATO', [
            `👤 Target: *@${victim}*`,
            `🌐 IP: *192.168.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}*`,
            `📱 Dispositivo: *Android 14*`,
            `🔋 Batteria: *${Math.floor(Math.random()*100)}%*`,
            `📸 Foto trovate: *${Math.floor(Math.random()*500)}*`,
            `🔐 Password: *Crackata*`,
            { section: '📂 File scaricati' },
            `- WhatsApp Backup`,
            `- Galleria (32 GB)`,
            `- Cronologia Chrome`,
            { raw: '_Scherzo! Nessun dato è stato rubato. 😂_' }
        ], { footer: 'ZENO HACKER' })
        
        await sock.sendMessage(ctx.chat, { text: result, mentions: [target] }, { edit: msgWait.key })
        await ctx.react('😈')
    }
}
