const { pureId, getTarget } = require('../lib/utils');

module.exports = {
    commands: ['sex', 'sesso', 'accoppia'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);

        const { jid: targetJid, source } = getTarget(m);
        if (source === 'self')
            return await sock.sendMessage(jid, { text: '❌ Devi taggare o rispondere a un amico!' }, { quoted: m });

        const targetId = pureId(targetJid);
        if (targetId === senderId)
            return await sock.sendMessage(jid, { text: '❌ Devi taggare qualcun altro!' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '👉', key: m.key } });

        const testoMeme = `🛰️ *[ZENO PRANK CORE]* 🛰️\n\n` +
                          `👉 @${senderId} hа puntаtо il cаzzо\n` +
                          `💦 è pаrtitо sul suо аnо e hа sbоrrаtо adоssо a @${targetId}! 🛌💨`;

        return await sock.sendMessage(jid, {
            text: testoMeme,
            mentions: [sender, targetJid]
        }, { quoted: m });
    }
};
