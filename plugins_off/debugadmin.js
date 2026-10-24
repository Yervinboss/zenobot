const { pureId, isAdmin } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

module.exports = {
    commands: ['debugadmin'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!jid.endsWith('@g.us')) {
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });
        }

        const meta = await sock.groupMetadata(jid);
        const senderPure = pureId(sender);
        const senderRaw = String(sender);

        // Lista primi 5 partecipanti con id, lid, admin
        const lines = [];
        lines.push(`📋 *DEBUG ADMIN*`);
        lines.push(``);
        lines.push(`👤 *TU*`);
        lines.push(`raw: ${senderRaw}`);
        lines.push(`pure: ${senderPure}`);
        lines.push(`owner: ${isOwner(sender)}`);
        lines.push(`admin: ${await isAdmin(sock, jid, sender)}`);
        lines.push(``);
        lines.push(`👥 *PRIMI 5 PARTECIPANTI*`);
        for (const p of meta.participants.slice(0, 5)) {
            lines.push(`• id: ${p.id}`);
            lines.push(`  lid: ${p.lid || '-'}`);
            lines.push(`  admin: ${p.admin || '-'}`);
            lines.push(`  pureId(id): ${pureId(p.id)}`);
            if (p.lid) lines.push(`  pureId(lid): ${pureId(p.lid)}`);
            lines.push(``);
        }

        return await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: m });
    }
};
