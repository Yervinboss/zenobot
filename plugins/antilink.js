const fs = require('fs');
const path = require('path');
const { pureId, isImmune, sendButtons } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/antilink.json');
const WHITELIST_DOMAINS = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be'];
const LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+\.[a-z]{2,})/gi;
const RAW_LINK = /(https?:\/\/[^\s"\\]+)|(www\.[^\s"\\]+\.[a-z]{2,})/gi;
const CRASH = /[\u0600-\u06FF\u0900-\u0DFF\u200B-\u200F]{300,}/;
const MAX_RAW = 8000;
const SKIP = new Set(['url', 'directPath', 'mediaKey', 'fileSha256', 'fileEncSha256', 'mediaKeyTimestamp',
    'jpegThumbnail', 'thumbnailDirectPath', 'thumbnailSha256', 'thumbnailEncSha256', 'waveform',
    'streamingSidecar', 'scansSidecar', 'scanLengths', 'midQualityFileSha256', 'quotedMessage']);
const strip = (k, v) => (SKIP.has(k) || v?.type === 'Buffer' || v instanceof Uint8Array) ? undefined : v;
const MEDIA = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'ptvMessage', 'lottieStickerMessage'];

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

const isWhitelisted = (l) => WHITELIST_DOMAINS.some(d => l.toLowerCase().includes(d));
const containsForbidden = (t) => {
    if (!t) return false;
    const m = t.match(LINK_REGEX);
    if (!m) return false;
    return m.some(l => !isWhitelisted(l));
};

async function hook(sock, m) {
    try {
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) return;

        const db = getDB();
        const settings = db[jid];
        if (!settings || !settings.enabled) return;

        const sender = m.key.participant;
        if (!sender) return;

        // 🛡️ IMMUNITÀ: owner + admin saltano TUTTO
        if (await isImmune(sock, jid, sender)) return;

        const msg = m.message || {};
        const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message ||
                      msg.viewOnceMessageV2Extension?.message || msg.ephemeralMessage?.message ||
                      msg.documentWithCaptionMessage?.message || msg;
        const mediaKey = MEDIA.find(k => inner[k]);
        let raw = '';
        if (mediaKey) {
            raw = inner[mediaKey].caption || '';
        } else {
            try { raw = JSON.stringify(inner, strip); } catch {}
        }
        const crash = CRASH.test(raw) || (!mediaKey && raw.length > MAX_RAW);
        const hasLink = (raw.match(RAW_LINK) || []).some(l => !isWhitelisted(l));
        if (!crash && !hasLink) return;

        try { await sock.sendMessage(jid, { delete: m.key }); } catch {}

        if (crash || settings.mode === 'kick') {
            try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                await sock.sendMessage(jid, { text: `🚫 @${pureId(sender)} rimosso per link.`, mentions: [sender] });
            } catch {
                await sock.sendMessage(jid, { text: `⚠️ @${pureId(sender)} ha mandato un link ma non riesco a rimuoverlo.`, mentions: [sender] });
            }
        } else {
            await sock.sendMessage(jid, { text: `⚠️ @${pureId(sender)}, link non consentiti!`, mentions: [sender] });
        }
    } catch (e) { console.error('antilink hook:', e.message); }
}

module.exports = {
    commands: ['antilink', 'antilinkkick', 'antilinkwarn', 'antilinkoff'],
    hook,
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || m.key.remoteJid;
        if (!isOwner(sender) && !(await isImmune(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin!' }, { quoted: m });

        const db = getDB();
        if (cmd === 'antilinkkick') { db[jid] = { enabled: true, mode: 'kick' }; saveDB(db); return sock.sendMessage(jid, { text: '🔗🦵 Antilink *KICK* attivato.' }, { quoted: m }); }
        if (cmd === 'antilinkwarn') { db[jid] = { enabled: true, mode: 'warn' }; saveDB(db); return sock.sendMessage(jid, { text: '🔗⚠️ Antilink *WARN* attivato.' }, { quoted: m }); }
        if (cmd === 'antilinkoff') { delete db[jid]; saveDB(db); return sock.sendMessage(jid, { text: '🔗❌ Antilink disattivato.' }, { quoted: m }); }

        const current = db[jid];
        const status = current ? `Attivo (${current.mode.toUpperCase()})` : 'Disattivo';
        return await sendButtons(sock, jid,
            `🔗 *GESTIONE ANTILINK*\n\nStato: *${status}*\nWhitelist: TikTok, Instagram, YouTube\n\nScegli:`,
            'Zeno Bot - Moderazione',
            [
                { text: '🦵 Modalità Kick', id: 'antilinkkick' },
                { text: '⚠️ Modalità Warn', id: 'antilinkwarn' },
                { text: '❌ Disattiva', id: 'antilinkoff' }
            ], m
        );
    }
};
