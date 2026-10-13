const { isAdmin } = require('../lib/admin');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

async function isAdminOld(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch { return false; }
}

module.exports = {
    commands: ['aperto', 'chiuso', 'apri', 'chiudi'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: "❌ Solo nei gruppi!" }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;
        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin del gruppo o owner.' }, { quoted: m });

        try {
            if (cmd === 'chiuso' || cmd === 'chiudi') {
                await sock.groupSettingUpdate(jid, 'announcement');
                await sock.sendMessage(jid, { react: { text: '🔒', key: m.key } });
                return await sock.sendMessage(jid, {
                    text: '🔒 *CHAT BLOCCATA!*\n\nDa ora *SOLO GLI ADMIN* possono scrivere. 🤫'
                });
            }

            if (cmd === 'aperto' || cmd === 'apri') {
                await sock.groupSettingUpdate(jid, 'not_announcement');
                await sock.sendMessage(jid, { react: { text: '🔓', key: m.key } });
                return await sock.sendMessage(jid, {
                    text: '🔓 *CHAT RIAPERTA!*\n\n*TUTTI* possono scrivere di nuovo. 🎉'
                });
            }
        } catch (e) {
            console.error('moderazione_gruppo:', e.message);
            return await sock.sendMessage(jid, {
                text: '❌ Errore! Assicurati che il bot sia *Amministratore* del gruppo.'
            }, { quoted: m });
        }
    }
};
