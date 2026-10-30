const { pureId, getTarget, isAdmin } = require('../lib/utils');

module.exports = {
    commands: ['cazzo'],
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

        const cm = Math.floor(Math.random() * (28 - 3 + 1)) + 3;
        let commento = '';
        if (cm < 8) commento = 'Un accendino Clipper fa più figura. 🔎';
        else if (cm < 14) commento = 'Onesto, fa il suo dovere senza pretendere premi. 🪵';
        else if (cm < 20) commento = 'Minchia zio, qua parliamo di un pezzo pesante! 🚀';
        else commento = 'ROBA DA MATTI! Un finale da porno attore, illegale! 👑🍆';

        const adminTag = (await isAdmin(sock, jid, targetJid)) ? ' 👑 *[ADMIN]*' : '';

        await sock.sendMessage(jid, { react: { text: '🍆', key: m.key } });

        return await sock.sendMessage(jid, {
            text: `🍆 *ZENO PISELLOMETRO* 🍆\n\n👤 @${targetId}${adminTag}\n📏 Lunghezza: *${cm} cm*\n\n📝 _${commento}_\n\n👮 @${senderId}`,
            mentions: [targetJid, sender]
        }, { quoted: m });
    }
};
