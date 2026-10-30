const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../lib/owner');

async function downloadMedia(mediaMessage, type) {
    const stream = await downloadContentFromMessage(mediaMessage, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

module.exports = {
    commands: ['setbotpp', 'botpp', 'cambiafotobot'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!isOwner(sender))
            return await sock.sendMessage(jid, { text: '❌ Solo il Creatore del bot!' }, { quoted: m });

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || {};

        let quoted = ctx.quotedMessage;
        if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
        else if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;

        const imageMessage = quoted?.imageMessage || msg.imageMessage;

        if (!imageMessage)
            return await sock.sendMessage(jid, { text: '📸 *ZENO AVATAR*\n\n❌ Rispondi a un\'immagine con `.setbotpp`' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const buffer = await downloadMedia(imageMessage, 'image');
            if (!buffer) throw new Error('Download fallito');

            await sock.updateProfilePicture(sock.user.id, buffer);

            await sock.sendMessage(jid, { react: { text: '🤖', key: m.key } });
            return await sock.sendMessage(jid, { text: '🤖 *FOTO PROFILO AGGIORNATA!*' }, { quoted: m });

        } catch (e) {
            console.error('[SETBOTPP]', e.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Errore aggiornamento foto profilo.' }, { quoted: m });
        }
    }
};
