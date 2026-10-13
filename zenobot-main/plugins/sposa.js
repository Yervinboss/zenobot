const fs = require('fs');
const path = require('path');
const { pureId, getTarget } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/rpg.json');

const RINGS = {
    bronzo:   { name: '💍 Anello di Bronzo',   price: 5000 },
    argento:  { name: "💍 Anello d'Argento",  price: 20000 },
    oro:      { name: "💍 Anello d'Oro",      price: 50000 },
    diamante: { name: '💎 Anello di Diamante', price: 150000 }
};

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}
function getUser(db, userId) {
    if (!db[userId]) db[userId] = { level: 1, xp: 0, money: 0, spouse: null };
    return db[userId];
}
const formatMoney = (n) => '€' + n.toLocaleString('it-IT');

module.exports = {
    commands: ['sposa', /^proposta_si_/, /^proposta_no_/, /^compraanello_/],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const userId = pureId(m.key.participant || m.key.remoteJid);
        const db = getDB();
        const user = getUser(db, userId);

        // === 1) Richiesta iniziale ===
        if (cmd === 'sposa') {
            const { jid: targetJid, source } = getTarget(m);
            if (source === 'self')
                return await sock.sendMessage(jid, {
                    text: '❌ Devi menzionare la persona che vuoi sposare oppure rispondere a un suo messaggio! Esempio: `.sposa @utente`'
                }, { quoted: m });

            const targetId = pureId(targetJid);
            if (targetId === userId)
                return await sock.sendMessage(jid, { text: '❌ Non puoi sposarti da solo/a!' }, { quoted: m });

            const targetData = getUser(db, targetId);

            if (user.spouse || targetData.spouse)
                return await sock.sendMessage(jid, { text: '❌ Uno di voi due è già impegnato o sposato!' }, { quoted: m });

            const buttons = [
                { buttonId: `proposta_si_${targetId}_${userId}`, buttonText: { displayText: '❤️ Sposati' }, type: 1 },
                { buttonId: `proposta_no_${targetId}_${userId}`, buttonText: { displayText: '💔 Rifiuta' }, type: 1 }
            ];

            return await sock.sendMessage(jid, {
                text: `💒 @${targetId}, hai ricevuto una proposta di matrimonio da @${userId}!\n\nAccetti di convolare a nozze?`,
                mentions: [targetJid, `${userId}@s.whatsapp.net`],
                buttons: buttons,
                headerType: 1
            }, { quoted: m });
        }

        // === 2) Sì ===
        if (cmd.startsWith('proposta_si_')) {
            const parts = cmd.replace('proposta_si_', '').split('_');
            const invitedId = parts[0];
            const proposerId = parts[1];

            if (userId !== invitedId)
                return await sock.sendMessage(jid, { text: '❌ Questa proposta non è per te!' }, { quoted: m });

            const ringButtons = Object.keys(RINGS).map(key => ({
                buttonId: `compraanello_${key}_${proposerId}_${invitedId}`,
                buttonText: { displayText: `${RINGS[key].name} (${formatMoney(RINGS[key].price)})` },
                type: 1
            }));

            return await sock.sendMessage(jid, {
                text: `💖 *Proposta accettata!* Ora @${invitedId} e @${proposerId} devono scegliere l'anello di nozze.\n\nScegliete l'anello da acquistare:`,
                mentions: [`${proposerId}@s.whatsapp.net`, `${invitedId}@s.whatsapp.net`],
                buttons: ringButtons,
                headerType: 1
            }, { quoted: m });
        }

        // === 3) No ===
        if (cmd.startsWith('proposta_no_')) {
            const parts = cmd.replace('proposta_no_', '').split('_');
            const invitedId = parts[0];
            const proposerId = parts[1];

            if (userId !== invitedId)
                return await sock.sendMessage(jid, { text: '❌ Questa proposta non è per te!' }, { quoted: m });

            return await sock.sendMessage(jid, {
                text: `💔 @${invitedId} ha rifiutato la proposta di matrimonio di @${proposerId}. Che troia...`,
                mentions: [`${proposerId}@s.whatsapp.net`, `${invitedId}@s.whatsapp.net`]
            }, { quoted: m });
        }

        // === 4) Acquisto anello ===
        if (cmd.startsWith('compraanello_')) {
            const parts = cmd.replace('compraanello_', '').split('_');
            const ringKey = parts[0];
            const proposerId = parts[1];
            const invitedId = parts[2];

            if (userId !== proposerId && userId !== invitedId)
                return await sock.sendMessage(jid, { text: "❌ Non puoi comprare l'anello per loro!" }, { quoted: m });

            const ring = RINGS[ringKey];
            if (!ring) return;

            const proposerData = getUser(db, proposerId);
            const invitedData = getUser(db, invitedId);
            const totalMoney = proposerData.money + invitedData.money;

            if (totalMoney < ring.price) {
                return await sock.sendMessage(jid, {
                    text: `❌ *Matrimonio annullato per fondi insufficienti!* 💸\n\nNessuno di voi ha abbastanza soldi per comprare il ${ring.name} (${formatMoney(ring.price)}).`
                }, { quoted: m });
            }

            if (proposerData.money >= ring.price) {
                proposerData.money -= ring.price;
            } else {
                const diff = ring.price - proposerData.money;
                proposerData.money = 0;
                invitedData.money -= diff;
            }

            proposerData.spouse = invitedId;
            invitedData.spouse = proposerId;
            saveDB(db);

            return await sock.sendMessage(jid, {
                text: `🎉💍 *EVVIVA GLI SPOSI!* 🥂❤️\n\n@${proposerId} e @${invitedId} si sono ufficialmente sposati acquistando il magnifico *${ring.name}*!\nTanti auguri alla nuova coppia! 🎊`,
                mentions: [`${proposerId}@s.whatsapp.net`, `${invitedId}@s.whatsapp.net`]
            }, { quoted: m });
        }
    }
};
