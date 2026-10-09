const { isOwner } = require('../lib/owner');
const { isAdmin } = require('../lib/admin');
const { isOn, setOn } = require('../lib/soloadmin');

module.exports = {
    commands: ['soloadmin', 'solo'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        // supporta sia ".soloadmin on" che ".solo admin on"
        const a = [...args];
        if (cmd === 'solo' && (a[0] || '').toLowerCase() === 'admin') a.shift();
        const action = (a[0] || '').toLowerCase();

        if (action === 'on') {
            setOn(jid, true);
            await sock.sendMessage(jid, { react: { text: '🔒', key: m.key } });
            return await sock.sendMessage(jid, { text: '🔒 *Solo admin ATTIVO*\nIl bot ora risponde solo agli admin.' }, { quoted: m });
        }
        if (action === 'off') {
            setOn(jid, false);
            await sock.sendMessage(jid, { react: { text: '🔓', key: m.key } });
            return await sock.sendMessage(jid, { text: '🔓 *Solo admin DISATTIVATO*\nIl bot risponde a tutti.' }, { quoted: m });
        }

        return await sock.sendMessage(jid, {
            text: `🔒 *SOLO ADMIN*\n\nStato: ${isOn(jid) ? 'ATTIVO' : 'Disattivato'}\n\n\`.soloadmin on\`\n\`.soloadmin off\``
        }, { quoted: m });
    }
};
