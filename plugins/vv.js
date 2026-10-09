const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function findViewOnce(obj) {
    if (!obj) return null;
    if (obj.viewOnceMessage?.message) return obj.viewOnceMessage.message;
    if (obj.viewOnceMessageV2?.message) return obj.viewOnceMessageV2.message;
    if (obj.viewOnceMessageV2Extension?.message) return obj.viewOnceMessageV2Extension.message;
    if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
            if ((k.includes('viewOnce') || k.includes('ViewOnce')) && obj[k]?.message) return obj[k].message;
        }
    }
    if (obj.message) {
        const inner = findViewOnce(obj.message);
        if (inner) return inner;
    }
    if (obj.imageMessage || obj.videoMessage || obj.audioMessage) return obj;
    return null;
}

async function downloadMedia(mediaMessage, type) {
    const stream = await downloadContentFromMessage(mediaMessage, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

module.exports = {
    commands: ['vv'],
    run: async (sock, m, args, cmd) => {
        const chatId = m.key.remoteJid;

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo ||
                    msg.imageMessage?.contextInfo ||
                    msg.videoMessage?.contextInfo ||
                    msg.audioMessage?.contextInfo || {};

        let quoted = ctx.quotedMessage;
        let viewOnceMessage = null;

        if (quoted) viewOnceMessage = findViewOnce(quoted);
        if (!viewOnceMessage) viewOnceMessage = findViewOnce(msg);

        if (!viewOnceMessage) {
            return sock.sendMessage(chatId, {
                text: `👁️ *VV - Apri View-Once*\n\n📌 Rispondi a una *visualizzazione singola* con \`.vv\``
            }, { quoted: m });
        }

        let mediaType = null, mediaMessage = null;
        if (viewOnceMessage.imageMessage) { mediaType = 'image'; mediaMessage = viewOnceMessage.imageMessage; }
        else if (viewOnceMessage.videoMessage) { mediaType = 'video'; mediaMessage = viewOnceMessage.videoMessage; }
        else if (viewOnceMessage.audioMessage) { mediaType = 'audio'; mediaMessage = viewOnceMessage.audioMessage; }

        if (!mediaMessage)
            return sock.sendMessage(chatId, { text: '❌ La view-once non contiene foto, video o audio.' }, { quoted: m });

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } }).catch(() => {});

        let buffer = null;
        try {
            buffer = await downloadMedia(mediaMessage, mediaType);
        } catch (e) {
            console.error('[VV]', e.message);
        }

        if (!buffer || buffer.length === 0)
            return sock.sendMessage(chatId, { text: '❌ Errore decrittazione. La view-once potrebbe essere scaduta.' }, { quoted: m });

        try {
            const caption = mediaMessage.caption || '';
            if (mediaType === 'image') {
                await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: m });
            } else if (mediaType === 'video') {
                await sock.sendMessage(chatId, { video: buffer, caption, mimetype: mediaMessage.mimetype || 'video/mp4' }, { quoted: m });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(chatId, { audio: buffer, mimetype: mediaMessage.mimetype || 'audio/mp4', ptt: mediaMessage.ptt || false }, { quoted: m });
            }
            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch (e) {
            console.error('[VV] Errore invio:', e.message);
            return sock.sendMessage(chatId, { text: '❌ Errore durante l\'invio del file convertito.' }, { quoted: m });
        }
    }
};
