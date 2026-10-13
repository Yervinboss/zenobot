const fs = require('fs');
const path = require('path');
const { pureId, isImmune, sendButtons } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/antispam.json');
const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 8 * 1000;

if (!global.spamTracker) global.spamTracker = {};

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

async function hook(sock, m) {
    try {
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) return;
        const db = getDB();
        const settings = db[jid];
        if (!settings || !settings.enabled) return;

        const sender = m.key.participant;
        if (!sender) return;

        // 🛡️ IMMUNITÀ
        if (await isImmune(sock, jid, sender)) return;

        const senderPure = pureId(sender);
        const now = Date.now();
        if (!global.spamTracker[jid]) global.spamTracker[jid] = {};
        if (!global.spamTracker[jid][senderPure]) global.spamTracker[jid][senderPure] = [];

        let ts = global.spamTracker[jid][senderPure];
        ts.push(now);
        ts = ts.filter(t => now - t <= SPAM_WINDOW_MS);
        global.spamTracker[jid][senderPure] = ts;

        if (ts.length <= SPAM_LIMIT) return;
        global.spamTracker[jid][senderPure] = [];

        try { await sock.sendMessage(jid, { delete: m.key }); } catch {}

        if (settings.mode === 'kick') {
            try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                await sock.sendMessage(jid, { text: `🚫 @${senderPure} rimosso per spam!`, mentions: [sender] });
            } catch {
                await sock.sendMessage(jid, { text: `⚠️ @${senderPure} fa spam ma non riesco a rimuoverlo.`, mentions: [sender] });
            }
        } else {
            await sock.sendMessage(jid, { text: `⚠️ @${senderPure}, rallenta!`, mentions: [sender] });
        }
    } catch (e) { console.error('antispam hook:', e.message); }
}

module.exports = {
    commands: ['antispam', 'antispamkick', 'antispamwarn', 'antispamoff'],
    hook,
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || m.key.remoteJid;
        if (!isOwner(sender) && !(await isImmune(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin!' }, { quoted: m });

        const db = getDB();
        if (cmd === 'antispamkick') { db[jid] = { enabled: true, mode: 'kick' }; saveDB(db); return sock.sendMessage(jid, { text: '🚫🦵 Antispam *KICK* attivato.' }, { quoted: m }); }
        if (cmd === 'antispamwarn') { db[jid] = { enabled: true, mode: 'warn' }; saveDB(db); return sock.sendMessage(jid, { text: '🚫⚠️ Antispam *WARN* attivato.' }, { quoted: m }); }
        if (cmd === 'antispamoff') { delete db[jid]; saveDB(db); return sock.sendMessage(jid, { text: '🚫❌ Antispam disattivato.' }, { quoted: m }); }

        const current = db[jid];
        const status = current ? `Attivo (${current.mode.toUpperCase()})` : 'Disattivo';
        return await sendButtons(sock, jid,
            `🚫 *GESTIONE ANTISPAM*\n\nStato: *${status}*\nLimite: ${SPAM_LIMIT} msg / ${SPAM_WINDOW_MS / 1000}s\n\nScegli:`,
            'Zeno Bot - Moderazione',
            [
                { text: '🦵 Modalità Kick', id: 'antispamkick' },
                { text: '⚠️ Modalità Warn', id: 'antispamwarn' },
                { text: '❌ Disattiva', id: 'antispamoff' }
            ], m
        );
    }
};
