const { pureId, getTarget } = require('../lib/utils');

module.exports = {
    commands: ['id', 'myid'],
    name: 'id',
    category: 'funzioni',
    description: 'Mostra il tuo ID, quello del gruppo e di chi tagghi',
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;
        const t = getTarget(m);
        const righe = [`🆔 *I TUOI DATI*`, `Numero: *${pureId(sender)}*`, `JID: ${sender}`];
        if (jid.endsWith('@g.us')) righe.push(`Gruppo: ${jid}`);
        if (t.source !== 'self') righe.push(`\n🎯 *Utente scelto*\nNumero: *${pureId(t.jid)}*\nJID: ${t.jid}`);
        await sock.sendMessage(jid, { text: righe.join('\n') }, { quoted: m });
    }
};
