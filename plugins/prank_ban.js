const { pureId, getTarget } = require('../lib/utils');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
    commands: ['ban', 'banna', 'fakeban'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const senderId = pureId(m.key.participant || m.key.remoteJid);

        const { jid: targetJid, source } = getTarget(m);
        const targetId = pureId(targetJid);

        if (source === 'self' || targetId === senderId)
            return await sock.sendMessage(jid, { text: '❌ Devi taggare o rispondere a un amico per simulare il ban!' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '🔨', key: m.key } });

        let msg = await sock.sendMessage(jid, {
            text: `🛡️ [ZENO BAN-ANTIRAID]: Rilevata violazione dei termini da parte di @${targetId}...`,
            mentions: [targetJid]
        }, { quoted: m });
        await delay(1200);

        msg = await sock.sendMessage(jid, {
            text: `⚙️ [SYSTEM]: Generazione pacchetto di esclusione hardware dall'infrastruttura WhatsApp...`
        }, { quoted: msg });
        await delay(1500);

        const verdetto = `💥 *NOTIFICA DI ESPULSIONE RETE COATTIVA* 💥\n\n` +
                         `👤 *Account colpevole:* @${targetId}\n` +
                         `🛡️ *Azione:* BAN PERMANENTE\n` +
                         `⚠️ *Motivo:* Mancato rispetto del Creatore Supremo\n\n` +
                         `🔌 _Il numero è stato inserito nella blacklist globale dei server._\n_Disconnessione forzata in corso... Bye bye! 🤫👋_`;

        return await sock.sendMessage(jid, {
            text: verdetto,
            mentions: [targetJid]
        }, { quoted: msg });
    }
};
