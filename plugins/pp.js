const { pureId, getTarget } = require('../lib/utils');

function getNumber(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0];
}

module.exports = {
    commands: ['pp'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const { jid: targetJid } = getTarget(m);
        const targetId = pureId(targetJid);

        if (!targetJid || !targetId)
            return await sock.sendMessage(jid, { text: '❌ Utente non valido.' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '📸', key: m.key } });

        let ppUrl = null;
        try { ppUrl = await sock.profilePictureUrl(targetJid, 'image'); }
        catch (e1) {
            try { ppUrl = await sock.profilePictureUrl(targetJid, 'preview'); }
            catch (e2) { ppUrl = null; }
        }

        if (!ppUrl) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Foto profilo non disponibile (potrebbe essere nascosta).' }, { quoted: m });
        }

        try {
            await sock.sendMessage(jid, {
                image: { url: ppUrl },
                caption: `🖼️ *Foto profilo di @${targetId}*`,
                mentions: [targetJid]
            }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        } catch (e) {
            console.error('[PP]', e);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Errore invio foto.' }, { quoted: m });
        }
    }
};
