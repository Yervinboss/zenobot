const { pureId, getTarget } = require('../lib/utils');
const { isAdmin } = require('../lib/admin');
const { getOwners, addOwner, removeOwner, DEFAULT_OWNER } = require('../lib/owner');

const idsOf = (p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(pureId);

module.exports = {
    commands: ['owner', 'setowner', 'addowner', 'delowner', 'testadmin', 'debugadmin'],
    name: 'owner',
    category: 'owner',
    ownerOnly: true,
    description: 'Gestione owner del bot e test controllo admin',
    usage: '[@utente | numero]',
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;
        const say = (text, mentions) => sock.sendMessage(jid, { text, ...(mentions ? { mentions } : {}) }, { quoted: m });
        const getParts = async () => {
            if (!jid.endsWith('@g.us')) return [];
            try { return (await sock.groupMetadata(jid)).participants; } catch { return []; }
        };

        if (cmd === 'owner') {
            const parts = await getParts();
            const mentions = [];
            const list = getOwners().map((o, i) => {
                const p = parts.find(x => idsOf(x).includes(o));
                mentions.push(p ? p.id : o + '@s.whatsapp.net');
                return `${i + 1}. @${pureId(p ? p.id : o)}${o === DEFAULT_OWNER ? ' 👑' : ''}`;
            });
            return say(`👑 *OWNER DEL BOT*\n\n${list.join('\n')}\n\n_Per toglierne uno: .delowner <n°> oppure tagga l'utente_`, mentions);
        }

        if (cmd === 'delowner') {
            const owners = getOwners();
            const t = getTarget(m);
            let ids = [];
            if (t.source !== 'self') {
                ids = [pureId(t.jid)];
                const p = (await getParts()).find(x => idsOf(x).includes(pureId(t.jid)));
                if (p) ids = idsOf(p);
            } else if (/^\d{1,3}$/.test(args[0] || '')) {
                const o = owners[parseInt(args[0]) - 1];
                if (o) ids = [o];
            } else if (args[0]) {
                ids = [pureId(args[0])];
            }
            ids = ids.filter(Boolean);
            if (!ids.length) return say('❌ Usa *.delowner <n°>* (il numero nella lista di *.owner*) oppure tagga l\'utente.');
            if (ids.includes(DEFAULT_OWNER)) return say('❌ Non puoi rimuovere l\'owner principale.');
            const rimossi = owners.filter(o => ids.includes(o));
            if (!rimossi.length) return say('ℹ️ Nessun owner corrisponde. Guarda la lista con *.owner*.');
            rimossi.forEach(o => removeOwner(o));
            return say(`🗑️ Rimossi ${rimossi.length} owner:\n${rimossi.join('\n')}`);
        }

        if (cmd === 'addowner' || cmd === 'setowner') {
            const t = getTarget(m);
            const num = t.source !== 'self' ? pureId(t.jid) : pureId(args[0] || '');
            if (!num || num.length < 7) return say('❌ Tagga un utente, rispondi a un suo messaggio o scrivi il numero.');
            return say(addOwner(num) ? `✅ ${num} ora è owner.` : `ℹ️ ${num} era già owner.`);
        }

        if (cmd === 'testadmin') {
            if (!jid.endsWith('@g.us')) return say('❌ Usalo in un gruppo.');
            const target = getTarget(m).jid;
            const adm = await isAdmin(sock, jid, target);
            return say(`🛡️ @${pureId(target)} è admin del gruppo: *${adm ? 'SÌ ✅' : 'NO ❌'}*`, [target]);
        }

        if (cmd === 'debugadmin') {
            if (!jid.endsWith('@g.us')) return say('❌ Usalo in un gruppo.');
            const admins = (await getParts()).filter(p => p.admin)
                .map(p => `• id: ${pureId(p.id)} | lid: ${pureId(p.lid) || '-'} | num: ${pureId(p.phoneNumber) || '-'}`);
            return say(`🔎 *DEBUG ADMIN*\nTu: ${pureId(sender)}\nBot: ${pureId(sock.user?.id)}\n\nAdmin (${admins.length}):\n${admins.join('\n') || '-'}`);
        }
    }
};
