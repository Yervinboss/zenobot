const QRCode = require('qrcode');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

async function isAdmin(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch { return false; }
}

module.exports = {
    commands: ['link', 'invito', 'qr', 'qrlink'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const code = await sock.groupInviteCode(jid);
            if (!code) throw new Error('Codice vuoto');

            const cleanCode = String(code).replace(/[^a-zA-Z0-9]/g, '').trim();
            const groupLink = `https://chat.whatsapp.com/${cleanCode}`;

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

            if (cmd === 'link' || cmd === 'invito') {
                return await sock.sendMessage(jid, {
                    text: `🔗 *LINK DI INVITO*\n\n${groupLink}`
                }, { quoted: m });
            }

            if (cmd === 'qr' || cmd === 'qrlink') {
                const qrBuffer = await QRCode.toBuffer(groupLink, {
                    type: 'png', margin: 4, scale: 10,
                    errorCorrectionLevel: 'H',
                    color: { dark: '#000000', light: '#ffffff' }
                });

                return await sock.sendMessage(jid, {
                    image: qrBuffer,
                    caption: `📸 *QR CODE GRUPPO*\n\nScansiona con la fotocamera!\n\n🔗 ${groupLink}`
                }, { quoted: m });
            }

        } catch (e) {
            console.error('link_gruppo:', e.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Errore. Assicurati che il bot sia *Amministratore*!' }, { quoted: m });
        }
    }
};
