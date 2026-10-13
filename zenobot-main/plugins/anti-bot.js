const fs = require('fs');
const path = require('path');
const { pureId, isImmune } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const antibotDbPath = path.join(__dirname, '../database/antibot.json');

function readDb() {
    if (!fs.existsSync(antibotDbPath)) return {};
    try { return JSON.parse(fs.readFileSync(antibotDbPath, 'utf8')); } catch { return {}; }
}
function writeDb(data) {
    fs.mkdirSync(path.dirname(antibotDbPath), { recursive: true });
    fs.writeFileSync(antibotDbPath, JSON.stringify(data, null, 2), 'utf8');
}

function rilevaDispositivo(msgID = '') {
    if (!msgID) return 'sconosciuto';
    if (/^BAE5[A-F0-9]{12}$/i.test(msgID)) return 'bot';
    if (/^[a-zA-Z]+-[a-fA-F0-9]+$/.test(msgID)) return 'bot';
    if (msgID.startsWith('false_') || msgID.startsWith('true_')) return 'web';
    if (msgID.startsWith('3EB0') && /^[A-Z0-9]+$/.test(msgID)) return 'webbot';
    if (msgID.includes(':')) return 'desktop';
    if (/^[A-F0-9]{32}$/i.test(msgID)) return 'android';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgID)) return 'ios';
    if (/^[A-Z0-9]{20,25}$/i.test(msgID) && !msgID.startsWith('3EB0')) return 'ios';
    if (msgID.startsWith('3EB0')) return 'android_old';
    return 'sconosciuto';
}

async function hook(sock, m) {
    try {
        if (!m.message || m.key.fromMe) return;
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith('@g.us')) return;

        const db = readDb();
        if (!db[chatId]) return;

        const sender = m.key.participant || m.key.remoteJid;
        if (!sender) return;

        // 🛡️ IMMUNITÀ
        if (await isImmune(sock, chatId, sender)) return;

        const sp = pureId(sender);
        const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
        if (sp === botId) return;

        let device = rilevaDispositivo(m.key?.id);

        // Un utente vero non può mandare bottoni/card/liste: se arrivano, è un bot
        const raw = m.message || {};
        const inner = raw.viewOnceMessage?.message || raw.viewOnceMessageV2?.message ||
                      raw.ephemeralMessage?.message || raw.documentWithCaptionMessage?.message || raw;
        const botTypes = ['interactiveMessage', 'buttonsMessage', 'templateMessage', 'listMessage'];
        if (botTypes.some(k => inner[k] || raw[k])) device = 'bot';

        if (['bot', 'webbot'].includes(device)) {
            try {
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                await sock.sendMessage(chatId, {
                    text: `╭─⟪ 🚫 Anti-Bot ⟫─╮\n│ 👤 @${sp}\n│ 🛑 Rimosso\n│ 📱 ${device.toUpperCase()}\n╰─⟪ 𝟑𝟑𝟑 𝐁Ꮻ𝐓 ⟫─╯`,
                    mentions: [sender]
                });
            } catch {}
        }
    } catch {}
}

module.exports = {
    commands: ['antibot'],
    hook,
    run: async (sock, m, args, cmd) => {
        const chatId = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!chatId.endsWith('@g.us'))
            return await sock.sendMessage(chatId, { text: '❌ Solo nei gruppi.' }, { quoted: m });

        if (!isOwner(sender) && !(await isImmune(sock, chatId, sender)))
            return await sock.sendMessage(chatId, { text: '❌ Solo admin.' }, { quoted: m });

        const db = readDb();
        const action = (args[0] || '').toLowerCase();

        if (action === 'on') {
            db[chatId] = true;
            writeDb(db);
            return await sock.sendMessage(chatId, { text: '🛡️ *ANTIBOT ATTIVATO*\n\nButterà fuori Bot e WebBot.' }, { quoted: m });
        }
        if (action === 'off') {
            delete db[chatId];
            writeDb(db);
            return await sock.sendMessage(chatId, { text: '🛡️ *ANTIBOT DISATTIVATO*' }, { quoted: m });
        }

        const status = db[chatId] ? '✅ ATTIVO' : '❌ DISATTIVATO';
        return await sock.sendMessage(chatId, {
            text: `🛡️ *ANTIBOT*\n\nStato: *${status}*\n\n📌 \`.antibot on\` → attiva\n📌 \`.antibot off\` → disattiva`
        }, { quoted: m });
    }
};
