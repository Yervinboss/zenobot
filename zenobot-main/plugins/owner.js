const { pureId, getTarget } = require('../lib/utils');
const { isOwner, getOwners, addOwner, removeOwner } = require('../lib/owner');

module.exports = {
    commands: ['owner', 'setowner', 'addowner', 'delowner'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);

        // Solo owner attuali possono gestire la lista
        if (!isOwner(senderId))
            return await sock.sendMessage(jid, { text: '❌ Solo gli owner possono usare questo comando!' }, { quoted: m });

        // .owner → mostra lista
        if (cmd === 'owner' && args.length === 0) {
            const list = getOwners().map((id, i) => `${i + 1}. @${id}`).join('\n');
            return await sock.sendMessage(jid, {
                text: `👑 *OWNER DI ZENO BOT* 👑\n\n${list}\n\n📌 _Usa \`.owner add @utente\` o \`.owner del @utente\`_`,
                mentions: getOwners().map(id => id + '@s.whatsapp.net')
            }, { quoted: m });
        }

        // .owner add @utente
        if (cmd === 'owner' && args[0] === 'add') {
            const { jid: targetJid, source } = getTarget(m);
            if (source === 'self')
                return await sock.sendMessage(jid, { text: '❌ Tagga o rispondi a chi vuoi aggiungere!' }, { quoted: m });

            const added = addOwner(targetJid);
            return await sock.sendMessage(jid, {
                text: added
                    ? `✅ @${pureId(targetJid)} è ora un *OWNER* di Zeno Bot!`
                    : `⚠️ @${pureId(targetJid)} è già un owner.`,
                mentions: [targetJid]
            }, { quoted: m });
        }

        // .owner del @utente
        if (cmd === 'owner' && args[0] === 'del') {
            const { jid: targetJid, source } = getTarget(m);
            if (source === 'self')
                return await sock.sendMessage(jid, { text: '❌ Tagga o rispondi a chi vuoi rimuovere!' }, { quoted: m });

            const tid = pureId(targetJid);
            if (tid === senderId)
                return await sock.sendMessage(jid, { text: '❌ Non puoi rimuovere te stesso!' }, { quoted: m });

            removeOwner(targetJid);
            return await sock.sendMessage(jid, {
                text: `🗑️ @${tid} non è più un owner.`,
                mentions: [targetJid]
            }, { quoted: m });
        }

        // Alias .addowner / .delowner
        if (cmd === 'addowner') { args = ['add']; return module.exports.run(sock, m, args, 'owner'); }
        if (cmd === 'delowner') { args = ['del']; return module.exports.run(sock, m, args, 'owner'); }
    }
};
