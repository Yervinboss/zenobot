const { isAdmin } = require('../lib/admin');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

async function isAdminOld(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch (e) {
        console.log('Errore controllo admin tag:', e);
        return false;
    }
}

async function downloadMedia(mediaMessage, type) {
    const stream = await downloadContentFromMessage(mediaMessage, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

module.exports = {
    commands: ['tag'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || m.key.remoteJid;
        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin!' }, { quoted: m });

        const meta = await sock.groupMetadata(jid);
        const allParticipants = meta.participants.map(p => p.id);

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo ||
                    msg.imageMessage?.contextInfo ||
                    msg.videoMessage?.contextInfo ||
                    msg.audioMessage?.contextInfo ||
                    msg.stickerMessage?.contextInfo || {};
        const quoted = ctx.quotedMessage;

        try {
            if (quoted) {
                const actual = quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2?.message || quoted;

                // Testo quotato
                if (actual.conversation || actual.extendedTextMessage) {
                    const quotedText = actual.conversation || actual.extendedTextMessage.text;
                    return await sock.sendMessage(jid, { text: quotedText, mentions: allParticipants });
                }

                // Sticker quotato
                if (actual.stickerMessage) {
                    const buffer = await downloadMedia(actual.stickerMessage, 'sticker');
                    return await sock.sendMessage(jid, {
                        sticker: buffer,
                        contextInfo: { mentionedJid: allParticipants }
                    });
                }

                // Immagine quotata
                if (actual.imageMessage) {
                    const imgMsg = actual.imageMessage;
                    const buffer = await downloadMedia(imgMsg, 'image');
                    return await sock.sendMessage(jid, {
                        image: buffer,
                        caption: imgMsg.caption || '',
                        viewOnce: imgMsg.viewOnce || false,
                        contextInfo: { mentionedJid: allParticipants }
                    });
                }

                // Video quotato
                if (actual.videoMessage) {
                    const vidMsg = actual.videoMessage;
                    const buffer = await downloadMedia(vidMsg, 'video');
                    return await sock.sendMessage(jid, {
                        video: buffer,
                        caption: vidMsg.caption || '',
                        viewOnce: vidMsg.viewOnce || false,
                        contextInfo: { mentionedJid: allParticipants }
                    });
                }

                // Audio quotato
                if (actual.audioMessage) {
                    const audioMsg = actual.audioMessage;
                    const buffer = await downloadMedia(audioMsg, 'audio');
                    return await sock.sendMessage(jid, {
                        audio: buffer,
                        mimetype: audioMsg.mimetype || 'audio/ogg; codecs=opus',
                        ptt: audioMsg.ptt || false,
                        viewOnce: audioMsg.viewOnce || false,
                        contextInfo: { mentionedJid: allParticipants }
                    });
                }

                return await sock.sendMessage(jid, { text: '❌ Tipo di messaggio non supportato per .tag.' }, { quoted: m });
            }

            // Testo passato dopo .tag
            const textArg = args.join(' ').trim();
            if (textArg) {
                return await sock.sendMessage(jid, { text: textArg, mentions: allParticipants });
            }

            return await sock.sendMessage(jid, {
                text: '❌ Scrivi un messaggio dopo `.tag`, oppure rispondi a un messaggio/sticker/foto/video con `.tag`.'
            }, { quoted: m });

        } catch (e) {
            console.error('Errore comando tag:', e);
            return await sock.sendMessage(jid, { text: "❌ Errore durante l'invio del tag." }, { quoted: m });
        }
    }
};
