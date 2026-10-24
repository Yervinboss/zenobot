const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');
const SYMBOLS = '🍒,🍋,🍊,🍇,⭐,💎,7️⃣'.split(',');
const BET_AMOUNTS = [100, 1000, 10000];

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
function getUser(db, id) {
    if (!db[id]) db[id] = { level: 1, xp: 0, money: 5000, lastWork: 0 };
    return db[id];
}
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');
const spin = () => [0,0,0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);

async function playSlot(sock, jid, m, userId, betAmount) {
    const db = getDB();
    const user = getUser(db, userId);

    if (user.money < betAmount)
        return sock.sendMessage(jid, { text: `❌ Non hai abbastanza soldi! Hai ${formatMoney(user.money)}.` }, { quoted: m });

    const result = spin();
    const display = result.join(' | ');
    let winnings = 0;

    if (result[0] === result[1] && result[1] === result[2]) {
        winnings = result[0] === '7️⃣' ? betAmount * 10 : betAmount * 5;
    } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        winnings = Math.floor(betAmount * 1.5);
    }

    let txt = `🎰 [ ${display} ]\n\n`;
    if (winnings > 0) {
        user.money += (winnings - betAmount);
        txt += `🎉 *HAI VINTO ${formatMoney(winnings)}!*\n`;
    } else {
        user.money -= betAmount;
        txt += `💔 Hai perso ${formatMoney(betAmount)}.\n`;
    }
    txt += `\n💰 Saldo: ${formatMoney(user.money)}`;
    saveDB(db);
    return sock.sendMessage(jid, { text: txt }, { quoted: m });
}

module.exports = {
    commands: ['slot', /^slotbet_\d+$/],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const userId = pureId(m.key.participant || m.key.remoteJid);

        if (cmd.startsWith('slotbet_')) {
            const betAmount = parseInt(cmd.replace('slotbet_', ''), 10);
            return await playSlot(sock, jid, m, userId, betAmount);
        }

        if (cmd === 'slot') {
            const buttons = BET_AMOUNTS.map(amount => ({
                buttonId: `slotbet_${amount}`,
                buttonText: { displayText: formatMoney(amount) },
                type: 1
            }));
            return await sock.sendMessage(jid, {
                text: '🎰 Scegli quanto vuoi puntare:',
                footer: 'Zeno Bot - Slot Machine',
                buttons, headerType: 1
            }, { quoted: m });
        }
    }
};
