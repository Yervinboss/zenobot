const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');
const COOLDOWN_MS = 30 * 1000;
const MILESTONE_LEVELS = [5, 15, 25, 35, 45, 55, 65, 75];

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
function getUser(db, id) {
    if (!db[id]) db[id] = { level: 1, xp: 0, money: 0, lastWork: 0 };
    return db[id];
}
const xpToNextLevel = (lvl) => Math.floor(50 * Math.pow(lvl, 1.35));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');

module.exports = {
    commands: ['work'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const userId = pureId(m.key.participant || m.key.remoteJid);

        const db = getDB();
        const user = getUser(db, userId);
        const now = Date.now();

        const remaining = COOLDOWN_MS - (now - user.lastWork);
        if (remaining > 0) {
            const secs = Math.ceil(remaining / 1000);
            return await sock.sendMessage(jid, {
                text: `⏳ Devi aspettare ancora *${secs} secondi* prima di lavorare di nuovo!`
            }, { quoted: m });
        }

        const earnedMoney = randomBetween(500, 2000);
        const earnedXp = randomBetween(30, 70);

        user.money += earnedMoney;
        user.xp += earnedXp;
        user.lastWork = now;

        let txt = `💼 *Hai lavorato!*\n💰 +${formatMoney(earnedMoney)}\n✨ +${earnedXp} XP\n`;

        let leveledUp = false;
        let reachedMilestone = null;
        let needed = xpToNextLevel(user.level);

        while (user.xp >= needed) {
            user.xp -= needed;
            user.level += 1;
            leveledUp = true;
            if (MILESTONE_LEVELS.includes(user.level)) {
                reachedMilestone = user.level;
                const bonus = user.level * 100;
                user.money += bonus;
                txt += `\n🏆 *TRAGUARDO LIVELLO ${user.level}!* Bonus: ${formatMoney(bonus)}\n`;
            }
            needed = xpToNextLevel(user.level);
        }

        if (leveledUp && !reachedMilestone) txt += `\n🎉 *Livello ${user.level}!*\n`;

        txt += `\n📊 Lvl: *${user.level}* | XP: ${user.xp}/${needed} | 💰 ${formatMoney(user.money)}`;

        saveDB(db);

        return await sock.sendMessage(jid, {
            text: txt,
            buttons: [
                { buttonId: 'work', buttonText: { displayText: '🔄 Lavora ancora' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: m });
    }
};
