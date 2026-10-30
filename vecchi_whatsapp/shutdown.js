const { isOwner } = require('../lib/owner');

module.exports = {
    commands: ['shutdown', 'spegni', 'stopbot', 'blackout'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!isOwner(sender))
            return await sock.sendMessage(jid, { text: '❌ Azione riservata al Creatore.' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '💤', key: m.key } });
        await sock.sendMessage(jid, { text: '💤 Spegnimento in corso...' }, { quoted: m });

        setTimeout(() => process.exit(0), 1500);
    }
};
