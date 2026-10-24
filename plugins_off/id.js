const { pureId, getTarget } = require('../lib/utils');
const { isOwner, getOwners } = require('../lib/owner');

module.exports = {
    commands: ['id', 'info', 'myid'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);

        const { jid: targetJid, source } = getTarget(m);
        const targetId = source === 'self' ? senderId : pureId(targetJid);
        const isSelf = targetId === senderId;

        // Info gruppo
        let groupName = 'Chat Privata';
        let groupId = jid.endsWith('@g.us') ? jid : null;
        let isAdminTarget = false;
        if (groupInfo()) {}

        function groupInfo() { return true; }

        if (jid.endsWith('@g.us')) {
            try {
                const meta = await sock.groupMetadata(jid);
                groupName = meta.subject;
                isAdminTarget = !!meta.participants.find(p => pureId(p.id) === targetId && p.admin);
            } catch {}
        }

        const ownerTag = isOwner(targetId) ? ' 👑 *[OWNER]*' : '';
        const adminTag = isAdminTarget ? ' 🛡️ *[ADMIN]*' : '';

        const txt =
`🆔 *ZENO ID CARD* 🆔

👤 *Nome:* ${isSelf ? (m.pushName || 'Tu') : 'Utente'}
📱 *Numero:* \`+${targetId}\`
🔢 *ID puro:* \`${targetId}\`
🏷️ *JID completo:* \`${targetJid}\`
${groupTag()}📊 *Ruolo:* Utente${ownerTag}${adminTag}
💬 *Chat:* ${groupName}

👑 *Owner registrati:* ${getOwners().length}
⚙️ *Bot:* Zeno Ultimate`;

        function groupTag() {
            return groupId ? `👥 *Gruppo ID:* \`${groupId.split('@')[0]}\`\n` : '';
        }

        return await sock.sendMessage(jid, {
            text: txt,
            mentions: [targetJid]
        }, { quoted: m });
    }
};
