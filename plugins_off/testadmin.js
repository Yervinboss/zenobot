const { pureId, isAdmin } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

module.exports = {
    commands: ['testadmin'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderPure = pureId(sender);

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const isOwn = isOwner(sender);
        const isAdm = await isAdmin(sock, jid, sender);

        let found = null;
        try {
            const meta = await sock.groupMetadata(jid);
            found = meta.participants.find(p =>
                pureId(p.id) === senderPure ||
                (p.lid && pureId(p.lid) === senderPure)
            );
        } catch {}

        const lines = [
            `🔍 *TEST ADMIN*`,
            ``,
            `📱 sender raw: \`${sender}\``,
            `🔢 sender pure: \`${senderPure}\``,
            `👑 isOwner: ${isOwn ? '✅' : '❌'}`,
            `🛡️ isAdmin: ${isAdm ? '✅' : '❌'}`,
            ``,
            `📋 *Nel groupMetadata:*`,
            found
                ? `id: \`${found.id}\`\nlid: \`${found.lid || '-'}\`\nadmin: \`${found.admin || '-'}\``
                : `❌ Sender NON trovato nei partecipanti`
        ];

        return await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: m });
    }
};
