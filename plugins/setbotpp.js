const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

// Numero owner (solo cifre, con prefisso, senza +)
const OWNERS = ['39XXXXXXXXXX'];

const LIBS = ['@itsliaaa/baileys', '@realvare/baileys', '@chatunity/baileys', '@whiskeysockets/baileys', 'baileys'];
let dl = null;
async function getDownloader() {
    if (dl) return dl;
    for (const lib of LIBS) {
        try {
            const mod = await import(lib);
            const fn = mod.downloadContentFromMessage || mod.default?.downloadContentFromMessage;
            if (fn) return (dl = fn);
        } catch {}
    }
    throw new Error('downloadContentFromMessage non trovato');
}

const digits = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

async function isOwnerJid(sock, jid) {
    if (OWNERS.includes(digits(jid))) return true;
    if (String(jid).endsWith('@lid')) {
        try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
            if (pn && OWNERS.includes(digits(pn))) return true;
        } catch {}
    }
    return false;
}

const unwrap = (x) =>
    x?.ephemeralMessage?.message ||
    x?.viewOnceMessage?.message ||
    x?.viewOnceMessageV2?.message ||
    x?.documentWithCaptionMessage?.message || x;

async function squareJpg(buf) {
    const inp = path.join(__dirname, `bpp_${Date.now()}.in`);
    const out = path.join(__dirname, `bpp_${Date.now()}.jpg`);
    try {
        fs.writeFileSync(inp, buf);
        await run('ffmpeg', ['-y', '-i', inp, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=640:640", '-frames:v', '1', out], { timeout: 60000 });
        return fs.readFileSync(out);
    } catch (e) {
        console.error('[SETBOTPP] ffmpeg:', e.message);
        return buf;
    } finally {
        for (const f of [inp, out]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
    }
}

module.exports = {
    commands: ['setbotpp', 'botpp', 'cambiafotobot'],
    run: async (sock, m) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.participant || jid;
        const say = (t) => sock.sendMessage(jid, { text: t }, { quoted: m });
        const react = (e) => sock.sendMessage(jid, { react: { text: e, key: m.key } }).catch(() => {});

        if (!(m.key.fromMe || await isOwnerJid(sock, sender))) {
            return say('❌ Solo il Creatore del bot!');
        }

        const msg = unwrap(unwrap(m.message)) || {};
        const ctx = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || {};
        const quoted = unwrap(unwrap(ctx.quotedMessage));
        const imageMessage = quoted?.imageMessage || msg.imageMessage;

        if (!imageMessage) {
            return say('📸 *ZENO AVATAR*\n\n❌ Rispondi a un\'immagine con `.setbotpp`');
        }

        await react('⏳');
        try {
            const download = await getDownloader();
            const stream = await download(imageMessage, 'image');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            if (!buffer.length) throw new Error('Download fallito');

            const img = await squareJpg(buffer);
            const me = digits(sock.user.id) + '@s.whatsapp.net';
            await sock.updateProfilePicture(me, img);

            await react('🤖');
            return say('🤖 *FOTO PROFILO AGGIORNATA!*');
        } catch (e) {
            console.error('[SETBOTPP]', e);
            await react('❌');
            return say(`❌ Errore aggiornamento foto profilo: ${e.message}`);
        }
    }
};
