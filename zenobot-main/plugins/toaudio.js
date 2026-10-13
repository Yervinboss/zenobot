const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const execPromise = util.promisify(exec);

async function downloadMedia(mediaMessage, type) {
    const stream = await downloadContentFromMessage(mediaMessage, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

module.exports = {
    commands: ['toaudio', 'tomp3', 'mp3', 'audio'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo || msg.videoMessage?.contextInfo || {};

        let quoted = ctx.quotedMessage;
        if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
        else if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;
        else if (quoted?.viewOnceMessageV2Extension?.message) quoted = quoted.viewOnceMessageV2Extension.message;

        const videoMessage = quoted?.videoMessage || msg.videoMessage;
        if (!videoMessage) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '🎵 *VIDEO TO AUDIO*\n\n❌ Rispondi a un video con `.toaudio`' }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        const tmpIn = path.join(__dirname, `toaud_in_${Date.now()}.mp4`);
        const tmpOut = path.join(__dirname, `toaud_out_${Date.now()}.m4a`);

        try {
            const buffer = await downloadMedia(videoMessage, 'video');
            if (!buffer) throw new Error('Download fallito');
            fs.writeFileSync(tmpIn, buffer);

            await execPromise(`ffmpeg -y -i "${tmpIn}" -vn -c:a aac -b:a 64k -ar 44100 "${tmpOut}"`);
            if (!fs.existsSync(tmpOut)) throw new Error('Conversione fallita');

            const audioBuffer = fs.readFileSync(tmpOut);
            await sock.sendMessage(jid, { react: { text: '🎵', key: m.key } });

            return await sock.sendMessage(jid, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: m });

        } catch (e) {
            console.error('[TOAUDIO]', e);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Errore estrazione audio.' }, { quoted: m });
        } finally {
            if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
            if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        }
    }
};
