const fs = require('fs');
const path = require('path');
const { pureId, getTarget } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function getUser(db, userId) {
    if (!db[userId]) db[userId] = { level: 1, xp: 0, money: 1000, lastWork: 0 };
    return db[userId];
}
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');

module.exports = {
    commands: ['bal', 'balance', 'portafoglio', 'soldi'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);

        const { jid: targetJid, source } = getTarget(m);
        const targetId = source === 'self' ? senderId : pureId(targetJid);

        const db = getDB();
        const user = getUser(db, targetId);

        const top = Object.entries(db)
            .map(([id, u]) => ({ id, money: u.money || 0 }))
            .sort((a, b) => b.money - a.money)
            .slice(0, 3)
            .map((t, i) => `${['🥇','🥈','🥉'][i]} @${t.id} — ${formatMoney(t.money)}`)
            .join('\n');

        const bodyText =
            `👤 *Utente:* @${targetId}\n` +
            `💰 *Contanti:* ${formatMoney(user.money)}\n` +
            `📊 *Livello:* ${user.level} _(XP: ${user.xp})_`;

        const footerText = `⚡ Zeno Bot RPG • Top ricchi:\n${top || '_Nessuno ancora_'}`;

        let pfp;
        try { pfp = await sock.profilePictureUrl(source === 'self' ? sender : targetJid, 'image'); }
        catch { pfp = 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg'; }

        let textMessage = `💳 *PORTAFOGLIO ZENO RPG*\n\n${bodyText}\n\n${footerText}\n\n🎰 _Usa .slot, .ruba o .daily_`;

        try {
            return await sock.sendMessage(jid, {
                image: { url: pfp },
                caption: textMessage,
                mentions: [targetId + '@s.whatsapp.net']
            }, { quoted: m });
        } catch (e) {
            return await sock.sendMessage(jid, {
                text: textMessage,
                mentions: [targetId + '@s.whatsapp.net']
            }, { quoted: m });
        }
    }
};
