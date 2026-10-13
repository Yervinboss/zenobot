const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

module.exports = {
    commands: ['s', 'sticker'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo ||
                    msg.imageMessage?.contextInfo ||
                    msg.videoMessage?.contextInfo ||
                    msg.buttonsResponseMessage?.contextInfo || {};

        // Media diretto o quotato
        let mediaMsg = null;
        let mime = '';

        if (msg.imageMessage) { mediaMsg = msg.imageMessage; mime = mediaMsg.mimetype; }
        else if (msg.videoMessage) { mediaMsg = msg.videoMessage; mime = mediaMsg.mimetype; }
        else if (ctx.quotedMessage) {
            const q = ctx.quotedMessage;
            if (q.imageMessage) { mediaMsg = q.imageMessage; mime = q.imageMessage.mimetype; }
            else if (q.videoMessage) { mediaMsg = q.videoMessage; mime = q.videoMessage.mimetype; }
        }

        if (!mediaMsg || !mime) {
            return await sock.sendMessage(jid, {
                text: '❌ *Istruzioni:* Invia una foto/video con la didascalia `.s` oppure rispondi a un elemento multimediale!'
            }, { quoted: m });
        }

        const isImage = mime.includes('image');
        const isVideo = mime.includes('video') || mime.includes('gif');

        if (!isImage && !isVideo)
            return await sock.sendMessage(jid, { text: '❌ Puoi convertire solo foto, GIF o brevi video!' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        const tmpInput = path.join(__dirname, `tmp_in_${Date.now()}`);
        const tmpOutput = path.join(__dirname, `tmp_out_${Date.now()}.webp`);

        try {
            const stream = await downloadContentFromMessage(mediaMsg, isImage ? 'image' : 'video');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(tmpInput, buffer);

            const ff = ffmpeg(tmpInput);

            if (isImage) {
                ff.outputOptions([
                    '-vf', 'crop=w=min(iw\\,ih):h=min(iw\\,ih),scale=512:512:flags=lanczos',
                    '-vcodec', 'libwebp',
                    '-lossless', '1',
                    '-q:v', '90'
                ]);
            } else {
                ff.outputOptions([
                    '-vf', 'crop=w=min(iw\\,ih):h=min(iw\\,ih),scale=512:512:flags=lanczos,fps=15',
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-s', '512x512'
                ]);
            }

            await new Promise((resolve, reject) => {
                ff.save(tmpOutput).on('end', resolve).on('error', reject);
            });

            const stickerBuffer = fs.readFileSync(tmpOutput);
            await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (e) {
            console.error('[STICKER]', e);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        } finally {
            if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
            if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
        }
    }
};
