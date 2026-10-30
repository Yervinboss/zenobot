const { pureId, isAdmin } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

// 🛡️ Helper riutilizzabile: ritorna true se l'utente è admin o owner
// Copia questo blocco in qualsiasi comando futuro tu voglia "solo admin"
async function checkAdmin(sock, m) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: '❌ Questo comando funziona solo nei gruppi!' }, { quoted: m });
        return false;
    }

    // Owner del bot → sempre ok
    if (isOwner(sender)) return true;

    // Admin del gruppo → ok
    if (await isAdmin(sock, jid, sender)) return true;

    // Non è admin
    await sock.sendMessage(jid, {
        text: '🔒 *Comando riservato agli amministratori!*'
    }, { quoted: m });
    return false;
}

module.exports = {
    commands: ['admin', 'staff', 'paneladmin'],
    run: async (sock, m, args, cmd) => {
        // 🛡️ Blocca chi non è admin
        if (!(await checkAdmin(sock, m))) return;

        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const senderId = pureId(sender);

        // Da qui in poi SOLO gli admin arrivano
        return await sock.sendMessage(jid, {
            text: `👑 *PANNELLO ADMIN*\n\n` +
                  `Ciao @${senderId}, sei un amministratore! ✅\n\n` +
                  `📋 *Comandi admin disponibili:*\n` +
                  `• \`.warn @tag\` — Richiama utente\n` +
                  `• \`.mute @tag\` — Muta utente\n` +
                  `• \`.tag <testo>\` — Tagga tutti\n` +
                  `• \`.aperto\` / \`.chiuso\` — Gestisci il gruppo\n` +
                  `• \`.p @tag\` / \`.d @tag\` — Promuovi/rimuovi admin\n` +
                  `• \`.link\` / \`.qr\` — Link e QR del gruppo\n` +
                  `• \`.antilink\` — Pannello antilink\n` +
                  `• \`.antispam\` — Pannello antispam\n` +
                  `• \`.antivoip\` — Scansiona stranieri\n` +
                  `• \`.antibot\` — Pannello antibot`,
            mentions: [sender]
        }, { quoted: m });
    }
};
