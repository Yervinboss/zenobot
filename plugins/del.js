const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    commands: ['del', 'delete'],
    run: async (sock, m, args, cmd) => {
        const chatId = m.key.remoteJid;
        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo ||
                    msg.imageMessage?.contextInfo ||
                    msg.videoMessage?.contextInfo ||
                    msg.buttonsResponseMessage?.contextInfo ||
                    msg.templateButtonReplyMessage?.contextInfo ||
                    msg.listResponseMessage?.contextInfo ||
                    msg.interactiveResponseMessage?.contextInfo || {};

        const quotedMsg = ctx.quotedMessage;
        const stanzaId = ctx.stanzaId;

        if (!quotedMsg && !stanzaId) {
            return sock.sendMessage(chatId, {
                text: `🗑️ *Elimina Messaggio*\n\n📌 *Come si usa:*\nRispondi a un messaggio qualsiasi con \`.del\` per eliminarlo all'istante insieme al tuo comando.`
            }, { quoted: m });
        }

        const botId = sock.user?.id || '';
        const botPure = botId.split(':')[0].split('@')[0];

        const targetKey = {
            remoteJid: chatId,
            fromMe: ctx.participant && ctx.participant.split('@')[0] === botPure,
            id: stanzaId,
            participant: ctx.participant
        };

        try {
            await sock.sendMessage(chatId, { delete: targetKey });
            await delay(150);
            await sock.sendMessage(chatId, { delete: m.key });
        } catch (e) {
            console.error('[DEL] Errore:', e.message);
        }
    }
};
