const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../database/rpg.json');

const getDB = () => {
    if (!fs.existsSync(dbPath)) return {};
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
};
const saveDB = (data) => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

function pureId(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

module.exports = {
    commands: ['divorzio', 'divorzia', /^divorzio_si_/, /^divorzio_no_/],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const userId = pureId(m.key.participant || m.key.remoteJid);
        const db = getDB();

        if (cmd === 'divorzio' || cmd === 'divorzia') {
            if (!db[userId] || !db[userId].spouse)
                return await sock.sendMessage(jid, { text: '❌ Ma se nemmeno sei sposato/a! Vuoi divorziare dal vuoto?' }, { quoted: m });

            const partnerId = db[userId].spouse;

            const buttons = [
                { buttonId: `divorzio_si_${partnerId}_${userId}`, buttonText: { displayText: '💔 Accetta Divorzio' }, type: 1 },
                { buttonId: `divorzio_no_${partnerId}_${userId}`, buttonText: { displayText: '💍 Rifiuta (Restiamo insieme)' }, type: 1 }
            ];

            return await sock.sendMessage(jid, {
                text: `⚖️ *RICHIESTA DI DIVORZIO* 📜\n\n@${userId} ha chiesto il divorzio a @${partnerId}!\nVuole dividere le strade e dividere i beni coniugali. Che decide il partner?`,
                mentions: [`${userId}@s.whatsapp.net`, `${partnerId}@s.whatsapp.net`],
                buttons: buttons,
                headerType: 1
            }, { quoted: m });
        }

        if (cmd.startsWith('divorzio_si_')) {
            const parts = cmd.replace('divorzio_si_', '').split('_');
            const invitedId = parts[0];
            const proposerId = parts[1];

            if (userId !== invitedId && userId !== proposerId)
                return await sock.sendMessage(jid, { text: '❌ Questa pratica di divorzio non è per te!' }, { quoted: m });

            if (!db[proposerId] || !db[invitedId] || db[proposerId].spouse !== invitedId)
                return await sock.sendMessage(jid, { text: '❌ Questa coppia non risulta più valida o registrata.' }, { quoted: m });

            db[proposerId].spouse = null;
            db[invitedId].spouse = null;
            const rimborso = 25000;
            db[proposerId].money = (db[proposerId].money || 0) + rimborso;
            db[invitedId].money = (db[invitedId].money || 0) + rimborso;
            saveDB(db);

            return await sock.sendMessage(jid, {
                text: `💔 *DIVORZIO ACCETTATO E UFFICIALIZZATO!* 👨‍⚖️\n\nLe strade di @${proposerId} e @${invitedId} si dividono ufficialmente. I beni sono stati divisi equamente! Siete di nuovo liberi sul mercato 🏃💨`,
                mentions: [`${proposerId}@s.whatsapp.net`, `${invitedId}@s.whatsapp.net`]
            }, { quoted: m });
        }

        if (cmd.startsWith('divorzio_no_')) {
            const parts = cmd.replace('divorzio_no_', '').split('_');
            const invitedId = parts[0];
            const proposerId = parts[1];

            if (userId !== invitedId && userId !== proposerId)
                return await sock.sendMessage(jid, { text: '❌ Questa pratica di divorzio non è per te!' }, { quoted: m });

            return await sock.sendMessage(jid, {
                text: `💍 *DIVORZIO RESPINTO!* ❤️\n\n@${invitedId} ha rifiutato il divorzio! L'amore (o il portafoglio) trionfa ancora, restate ufficialmente sposati!`,
                mentions: [`${proposerId}@s.whatsapp.net`, `${invitedId}@s.whatsapp.net`]
            }, { quoted: m });
        }
    }
};
