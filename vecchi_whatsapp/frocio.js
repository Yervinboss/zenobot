const { pureId, getTarget, isAdmin } = require('../lib/utils');

module.exports = {
    commands: ['frocio'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);
        const { jid: targetJid, source } = getTarget(m);
        const targetId = pureId(targetJid);

        if (senderId === targetId && source !== 'self')
            return await sock.sendMessage(jid, { text: '❌ Non puoi usarlo su te stesso! 😂' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        const percentuale = Math.floor(Math.random() * 101);
        let commento = '';
        if (percentuale < 20) commento = 'Un etero dritto come un fuso. 🛡️';
        else if (percentuale < 50) commento = "Qualche dubbio ce l'ha, ma si trattiene. 👀";
        else if (percentuale < 80) commento = 'La situazione si fa sospetta stasera... 🏳️‍🌈';
        else commento = 'IL RE DELLA REGINA! Livello massimo superato! 👑🌈';

        const adminTag = (await isAdmin(sock, jid, targetJid)) ? ' 👑 *[ADMIN]*' : '';

        await sock.sendMessage(jid, { react: { text: '🏳️‍🌈', key: m.key } });

        return await sock.sendMessage(jid, {
            text: `🏳️‍🌈 *ZENO FROCIMETRO* 🏳️‍🌈\n\n👤 @${targetId}${adminTag}\n📊 Livello: *${percentuale}%*\n\n📝 _${commento}_\n\n👮 @${senderId}`,
            mentions: [targetJid, sender]
        }, { quoted: m });
    }
};
