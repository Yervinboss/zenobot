const { pureId, getTarget, isAdmin } = require('../lib/utils');

module.exports = {
    commands: ['dox', 'doxxing'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);
        const { jid: targetJid, source } = getTarget(m);
        const targetId = pureId(targetJid);

        if (senderId === targetId && source !== 'self')
            return await sock.sendMessage(jid, { text: '❌ Non puoi doxxare te stesso! 😂' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '📡', key: m.key } });

        const fintoIP = '192.168.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255);
        const macAddress = '00:1A:2B:3C:' + Math.floor(Math.random() * 90 + 10) + ':' + Math.floor(Math.random() * 90 + 10);
        const adminTag = (await isAdmin(sock, jid, targetJid)) ? ' 👑 *[ADMIN]*' : '';

        return await sock.sendMessage(jid, {
            text: `🛰️ *ZENO RADAR SECURITY ENGINE* 🛰️\n\n` +
                  `👤 *Bersaglio:* @${targetId}${adminTag}\n` +
                  `🌐 *IP:* \`${fintoIP}\`\n` +
                  `🔒 *MAC:* \`${macAddress}\`\n` +
                  `📍 *Loc:* Milano (San Siro)\n` +
                  `📡 *Provider:* Fastweb Backbone\n\n` +
                  `👮 *Richiesto da:* @${senderId}`,
            mentions: [targetJid, sender]
        }, { quoted: m });
    }
};
