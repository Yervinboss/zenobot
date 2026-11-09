const { isOn, setOn } = require('../lib/soloadmin');

module.exports = {
    commands: ['soloadmin', 'solo'],
    name: 'soloadmin',
    category: 'moderazione',
    groupOnly: true,
    adminOnly: true,
    description: 'Il bot risponde solo agli admin del gruppo',
    usage: 'on/off',
    run: async (sock, m, args) => {
        const jid = m.key.remoteJid;
        const a = (args[0] || '').toLowerCase();
        if (['on', 'attiva', '1'].includes(a)) setOn(jid, true);
        else if (['off', 'disattiva', '0'].includes(a)) setOn(jid, false);
        else {
            return sock.sendMessage(jid, {
                text: `🔒 Solo admin: *${isOn(jid) ? 'ATTIVO' : 'DISATTIVO'}*\nUsa *.soloadmin on* oppure *.soloadmin off*`
            }, { quoted: m });
        }
        await sock.sendMessage(jid, {
            text: isOn(jid)
                ? '🔒 Solo admin *attivato*: il bot risponde solo agli admin.'
                : '🔓 Solo admin *disattivato*: il bot risponde a tutti.'
        }, { quoted: m });
    }
};
