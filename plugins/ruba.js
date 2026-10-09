const fs = require('fs');
const path = require('path');
const { pureId, getTarget } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');
const COOLDOWN_MS = 45 * 1000;

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
function getUser(db, id) {
    if (!db[id]) db[id] = { level: 1, xp: 0, money: 1000, lastWork: 0, lastRob: 0 };
    if (db[id].lastRob === undefined) db[id].lastRob = 0;
    return db[id];
}
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');

module.exports = {
    commands: ['ruba', 'steal'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Puoi usare `.ruba` solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);
        const db = getDB();
        const senderUser = getUser(db, senderId);
        const now = Date.now();

        const remaining = COOLDOWN_MS - (now - senderUser.lastRob);
        if (remaining > 0) {
            const secs = Math.ceil(remaining / 1000);
            return await sock.sendMessage(jid, {
                text: `⏳ *Sei ricercato!* Nasconditi ancora *${secs} secondi* prima di un altro furto!`
            }, { quoted: m });
        }

        const { jid: rawTarget, source } = getTarget(m);
        let targetJid;

        if (source === 'self') {
            // Nessun tag → pesca un membro a caso
            try {
                const meta = await sock.groupMetadata(jid);
                const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
                const valid = meta.participants
                    .map(p => p.id)
                    .filter(id => pureId(id) !== senderId && pureId(id) !== botId);
                if (valid.length === 0)
                    return await sock.sendMessage(jid, { text: "❌ Nessun altro membro da derubare!" }, { quoted: m });
                targetJid = valid[Math.floor(Math.random() * valid.length)];
            } catch {
                return await sock.sendMessage(jid, { text: '❌ Errore recupero membri.' }, { quoted: m });
            }
        } else {
            targetJid = rawTarget;
        }

        const targetId = pureId(targetJid);
        if (senderId === targetId)
            return await sock.sendMessage(jid, { text: '❌ Vuoi rubare a te stesso? 🤡' }, { quoted: m });

        const targetUser = getUser(db, targetId);
        if (targetUser.money <= 0)
            return await sock.sendMessage(jid, {
                text: `❌ @${targetId} è al verde, non ha niente da rubare!`,
                mentions: [targetJid]
            }, { quoted: m });

        senderUser.lastRob = now;
        const chance = Math.floor(Math.random() * 100) + 1;

        if (chance > 35) {
            saveDB(db);
            return await sock.sendMessage(jid, {
                text: `👮‍♂️ *Furto fallito!* @${targetId} si è svegliato in tempo. Scappi a mani vuote!`,
                mentions: [targetJid]
            }, { quoted: m });
        }

        let stolen = Math.floor(targetUser.money * 0.30);
        if (stolen <= 0) stolen = 1;

        targetUser.money -= stolen;
        senderUser.money += stolen;
        saveDB(db);

        return await sock.sendMessage(jid, {
            text: `🥷 *Colpo riuscito!*\nHai borseggiato @${targetId}.\n\n💰 Bottino (30%): *+${formatMoney(stolen)}*`,
            mentions: [targetJid]
        }, { quoted: m });
    }
};
