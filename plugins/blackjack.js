const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');
global.blackjack = global.blackjack || {};

const SYMBOLS = '2,3,4,5,6,7,8,9,10,J,Q,K,A'.split(',');
const CARD_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');

function calc(hand) {
    let s = 0, a = 0;
    for (const c of hand) { s += CARD_VALUES[c]; if (c === 'A') a++; }
    while (s > 21 && a > 0) { s -= 10; a--; }
    return s;
}
const draw = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

async function sendBjMessage(sock, jid, m, bodyText, senderJid) {
    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🃏 Carta (Hit)', id: 'carta' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🛑 Stai (Stand)', id: 'stai' }) }
    ];
    const msg = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text: bodyText },
                    footer: { text: 'Zeno Casino ⚙️' },
                    nativeFlowMessage: { buttons },
                    contextInfo: { mentionedJid: [senderJid] }
                }
            }
        }
    };
    return await sock.relayMessage(jid, msg, { quoted: m });
}

module.exports = {
    commands: ['bj', 'blackjack', 'carta', 'stai', 'hit', 'stand'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const senderJid = m.key.participant || m.key.remoteJid;
        const userId = pureId(senderJid);

        if (cmd === 'carta' || cmd === 'hit') {
            if (!global.blackjack[userId]) return;
            const game = global.blackjack[userId];
            game.playerHand.push(draw());
            const ps = calc(game.playerHand);

            if (ps > 21) {
                const db = getDB();
                if (!db[userId]) db[userId] = { level: 1, xp: 0, money: 2000, lastWork: 0 };
                db[userId].money -= game.bet;
                saveDB(db);
                delete global.blackjack[userId];
                await sock.sendMessage(jid, { react: { text: '💥', key: m.key } });
                return await sock.sendMessage(jid, { text: `💥 *SBALLATO!* [ ${game.playerHand.join(' | ')} ] — Perdi ${formatMoney(game.bet)}.` }, { quoted: m });
            }

            const body = `🃏 *BLACKJACK ZENO* 🃏\n\n🫵 *Tu:* [ ${game.playerHand.join(' | ')} ] (*${ps}*)\n🏦 *Banco:* [ ${game.dealerHand} | ❓ ]\n\n💰 Puntata: ${formatMoney(game.bet)}`;
            return await sendBjMessage(sock, jid, m, body, senderJid);
        }

        if (cmd === 'stai' || cmd === 'stand') {
            if (!global.blackjack[userId]) return;
            const game = global.blackjack[userId];
            const ps = calc(game.playerHand);
            let ds = calc(game.dealerHand);
            while (ds < 17) { game.dealerHand.push(draw()); ds = calc(game.dealerHand); }

            const db = getDB();
            if (!db[userId]) db[userId] = { level: 1, xp: 0, money: 2000, lastWork: 0 };

            let outcome;
            if (ds > 21 || ps > ds) { db[userId].money += game.bet; outcome = `🎉 *HAI VINTO ${formatMoney(game.bet * 2)}!*`; }
            else if (ps < ds) { db[userId].money -= game.bet; outcome = `💔 *VINCE IL BANCO!* Perdi ${formatMoney(game.bet)}.`; }
            else outcome = `🤝 *PAREGGIO!*`;

            saveDB(db);
            delete global.blackjack[userId];
            return await sock.sendMessage(jid, {
                text: `🃏 *VERDETTO* 🃏\n\n🫵 [ ${game.playerHand.join(' | ')} ] (*${ps}*)\n🏦 [ ${game.dealerHand.join(' | ')} ] (*${ds}*)\n\n${outcome}\n💰 Saldo: ${formatMoney(db[userId].money)}`
            }, { quoted: m });
        }

        // === Nuova partita ===
        const db = getDB();
        if (!db[userId]) db[userId] = { level: 1, xp: 0, money: 2000, lastWork: 0 };

        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return sock.sendMessage(jid, { text: '❌ Cifra non valida! Esempio: `.bj 100`' }, { quoted: m });
        if (db[userId].money < bet) return sock.sendMessage(jid, { text: `❌ Soldi insufficienti! Hai ${formatMoney(db[userId].money)}.` }, { quoted: m });
        if (global.blackjack[userId]) return sock.sendMessage(jid, { text: '⚠️ Hai già una mano aperta!' }, { quoted: m });

        const d1 = draw();
        global.blackjack[userId] = { bet, playerHand: [draw(), draw()], dealerHand: [d1] };
        const ps = calc(global.blackjack[userId].playerHand);

        if (ps === 21) {
            db[userId].money += bet * 2; saveDB(db); delete global.blackjack[userId];
            return await sock.sendMessage(jid, { text: `👑 *BLACKJACK NATURALE!* Vinci ${formatMoney(bet * 3)}!` }, { quoted: m });
        }

        const body = `🃏 *CASINÒ BLACKJACK ZENO* 🃏\n\n🫵 [ ${global.blackjack[userId].playerHand.join(' | ')} ] (*${ps}*)\n🏦 [ ${d1} | ❓ ]\n\n💰 Puntata: ${formatMoney(bet)}`;
        return await sendBjMessage(sock, jid, m, body, senderJid);
    }
};
