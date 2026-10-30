'use strict';

module.exports = {
    commands: ['antiprivato', 'antipv'],
    name: 'antiprivato',
    category: 'sistema',
    author: 'ZENO',
    description: 'Blocca l\'uso dei comandi nelle chat private',
    usage: '[on|off]',
    ownerOnly: true,

    // Questo hook intercetta OGNI messaggio prima che venga processato
    async onMessage(sock, m) {
        const db = global.ZENO?.db;
        if (!db) return;

        const antiPrivato = db.settings.get('antiprivato', false);
        if (!antiPrivato) return;

        const chatJid = m.key.remoteJid;
        // Se è un gruppo, non ci interessa
        if (chatJid.endsWith('@g.us')) return;

        // Controlla se è un comando (inizia con un prefisso)
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const prefix = global.ZENO?.CONFIG?.prefix || '.';
        if (!text.startsWith(prefix)) return;

        // Controlla se è l'owner
        const sender = m.key.participant || m.key.remoteJid;
        const cleanSender = String(sender).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const ownerNumber = global.ZENO?.CONFIG?.numero || '';
        
        if (cleanSender === ownerNumber) return;

        // Manda il messaggio e blocca l'esecuzione del comando
        await sock.sendMessage(chatJid, { 
            text: 'no negro non sei un onnipotente come il mio re Zeno' 
        }, { quoted: m });

        // Questo dice al bot di fermarsi e non eseguire il comando
        m.__blocked = true;
    },

    async run(sock, m, args, cmd, ctx) {
        const azione = (args[0] || '').toLowerCase();
        const statoAttuale = ctx.db.settings.get('antiprivato', false);

        if (azione === 'on') {
            ctx.db.settings.set('antiprivato', true);
            return ctx.ok('🛡️ *Antiprivato ATTIVATO!*\nIl bot ignorerà tutti i comandi inviati in privato.');
        } 
        
        if (azione === 'off') {
            ctx.db.settings.set('antiprivato', false);
            return ctx.ok('🔓 *Antiprivato DISATTIVATO!*\nIl bot risponderà di nuovo in privato.');
        }

        return ctx.reply(ctx.ui.box('🛡️ ANTIPRIVATO', [
            `Stato attuale: *${statoAttuale ? 'ATTIVO 🟢' : 'DISATTIVATO 🔴'}*`,
            `Per cambiare usa: *${ctx.prefix}antiprivato on* oppure *${ctx.prefix}antiprivato off*`
        ]));
    }
};
