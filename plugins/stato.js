const { downloadContentFromMessage } = require('@itsliaaa/baileys');
const { isImmune } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const MAX_BYTES = 64 * 1024 * 1024;

const unwrap = (msg) => {
    let cur = msg || {};
    for (let i = 0; i < 5; i++) {
        const n = cur.viewOnceMessage?.message || cur.viewOnceMessageV2?.message ||
            cur.viewOnceMessageV2Extension?.message || cur.ephemeralMessage?.message ||
            cur.documentWithCaptionMessage?.message;
        if (!n) break;
        cur = n;
    }
    return cur;
};

async function toBuffer(content, type) {
    const stream = await downloadContentFromMessage(content, type);
    const chunks = []; let size = 0;
    for await (const c of stream) {
        size += c.length;
        if (size > MAX_BYTES) throw new Error('file troppo grande');
        chunks.push(c);
    }
    return Buffer.concat(chunks);
}

module.exports = {
    commands: ['stato', 'status'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });
        if (!jid.endsWith('@g.us')) return reply('❌ Solo nei gruppi!');

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || jid;
        if (!isOwner(sender) && !(await isImmune(sock, jid, sender))) return reply('❌ Solo admin!');

        try {
            const text = (Array.isArray(args) ? args.join(' ') : String(args || '')).trim();
            const own = unwrap(m.message);
            const ctx = (own.extendedTextMessage || own.imageMessage || own.videoMessage)?.contextInfo;
            const quoted = unwrap(ctx?.quotedMessage);
            const src = [own, quoted].find(x => x.imageMessage || x.videoMessage);

            let payload;
            if (src) {
                const kind = src.imageMessage ? 'image' : 'video';
                const content = src.imageMessage || src.videoMessage;
                const buffer = await toBuffer(content, kind);
                payload = { [kind]: buffer, caption: text || (src === quoted ? content.caption || '' : '') };
            } else if (text) {
                if (text.length > 700) return reply('❌ Testo troppo lungo (max 700 caratteri).');
                payload = { text };
            } else {
                return reply('📸 *STATO DEL GRUPPO*\n\nRispondi a una foto o un video con *.stato* (puoi aggiungere una didascalia), oppure scrivi *.stato testo* per uno stato di solo testo.');
            }

            // stato pubblicato direttamente NEL gruppo
            await sock.sendMessage(jid, { ...payload, groupStatus: true });
            await sock.sendMessage(jid, { react: { key: m.key, text: '✅' } }).catch(() => {});
        } catch (e) {
            console.error('stato:', e.message);
            return reply('❌ Non sono riuscito a pubblicare lo stato del gruppo.');
        }
    }
};
