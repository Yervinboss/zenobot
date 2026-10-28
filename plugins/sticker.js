const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

let Webp = null;
try { Webp = require('node-webpmux'); } catch {}

const PACK = 'ZENO ULTIMATE';
const AUTHOR = 'Zeno Bot';
const MAX_STATIC = 95 * 1024;
const MAX_ANIM = 480 * 1024;

async function addExif(buf) {
    if (!Webp) return buf;
    try {
        const img = new Webp.Image();
        await img.load(buf);
        const json = {
            'sticker-pack-id': 'zeno-' + Date.now(),
            'sticker-pack-name': PACK,
            'sticker-pack-publisher': AUTHOR,
            emojis: ['😀']
        };
        const head = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
        const jb = Buffer.from(JSON.stringify(json), 'utf-8');
        const exif = Buffer.concat([head, jb]);
        exif.writeUIntLE(jb.length, 14, 4);
        img.exif = exif;
        return await img.save(null);
    } catch (e) {
        console.error('[STICKER] exif', e.message);
        return buf;
    }
}

function convert(input, output, animated, o) {
    return new Promise((resolve, reject) => {
        let vf = 'crop=w=min(iw\\,ih):h=min(iw\\,ih),scale=512:512:flags=lanczos';
        if (animated) vf += `,fps=${o.fps}`;

        const opts = ['-vf', vf, '-vcodec', 'libwebp', '-lossless', '0', '-q:v', String(o.q), '-compression_level', '6', '-an'];
        if (animated) opts.push('-loop', '0', '-preset', 'default', '-t', String(o.dur));
        else opts.push('-frames:v', '1');

        ffmpeg(input)
            .outputOptions(opts)
            .format('webp')
            .on('end', resolve)
            .on('error', reject)
            .save(output);
    });
}

module.exports = {
    commands: ['s', 'sticker'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo ||
                    msg.imageMessage?.contextInfo ||
                    msg.videoMessage?.contextInfo ||
                    msg.buttonsResponseMessage?.contextInfo || {};

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

        const id = `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
        const tmpInput = path.join(__dirname, `tmp_in_${id}`);
        const tmpOutput = path.join(__dirname, `tmp_out_${id}.webp`);

        try {
            const stream = await downloadContentFromMessage(mediaMsg, isImage ? 'image' : 'video');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            fs.writeFileSync(tmpInput, Buffer.concat(chunks));

            const attempts = isImage
                ? [{ q: 80 }, { q: 60 }, { q: 40 }, { q: 25 }, { q: 12 }]
                : [
                    { q: 50, fps: 15, dur: 8 },
                    { q: 38, fps: 12, dur: 7 },
                    { q: 28, fps: 10, dur: 6 },
                    { q: 18, fps: 8, dur: 5 },
                    { q: 10, fps: 8, dur: 4 }
                ];
            const limit = isImage ? MAX_STATIC : MAX_ANIM;

            let result = null;
            for (const o of attempts) {
                if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
                await convert(tmpInput, tmpOutput, !isImage, o);
                const buf = fs.readFileSync(tmpOutput);
                if (buf.length <= limit) { result = buf; break; }
            }

            if (!result) throw new Error('File troppo pesante anche dopo la compressione, prova un video più corto');

            result = await addExif(result);

            await sock.sendMessage(jid, { sticker: result }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (e) {
            console.error('[STICKER]', e);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: '❌ Errore sticker: ' + String(e.message || e).split('\n')[0].slice(0, 200)
            }, { quoted: m });
        } finally {
            if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
            if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
        }
    }
};
