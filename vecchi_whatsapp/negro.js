const { pureId, getTarget, isAdmin } = require('../lib/utils');

module.exports = {
    commands: ['negro'],
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
        if (percentuale < 20) commento = 'Bianco latte, sbiadito. 🥚';
        else if (percentuale < 50) commento = "Un po' di abbronzatura da spiaggia c'è. ☀️";
        else if (percentuale < 80) commento = 'Stile Maranza di San Siro attivo. 🎭';
        else commento = 'AFRICA SANGUE PURO! Livello Baby Gang sbloccato! 🏿👑';

        const adminTag = (await isAdmin(sock, jid, targetJid)) ? ' 👑 *[ADMIN]*' : '';

        await sock.sendMessage(jid, { react: { text: '🏿', key: m.key } });

        return await sock.sendMessage(jid, {
            text: `🏿 *ZENO NEGROMETRO* 🏿\n\n👤 @${targetId}${adminTag}\n📊 Tasso: *${percentuale}%*\n\n📝 _${commento}_\n\n👮 @${senderId}`,
            mentions: [targetJid, sender]
        }, { quoted: m });
    }
};
