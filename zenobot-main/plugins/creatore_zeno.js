const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/antinuke.json');

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify([]));
    }
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        return Array.isArray(data) ? data : [];
    } catch { return []; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

async function isAdmin(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch { return false; }
}

async function sendZenoPanel(sock, jid, m, isOn) {
    const status = isOn ? 'ONLINE 🛡️ (Chat Protetta)' : 'DISATTIVATO 🔓 (Nessuno Scudo)';
    const bodyText = `『 👑 *Z E N O   S U P R E M E* 👑 』\n\n` +
                     `🛡️ *Sistema Anti-Nuke & Raid Core*\n` +
                     `📊 *Stato:* *${status}*\n\n` +
                     `_Usa i pulsanti per accendere/spegnere lo scudo:_`;
    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🛡️ Attiva Scudo', id: 'zenon' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔓 Disattiva', id: 'zenooff' }) }
    ];
    const msg = { viewOnceMessage: { message: { interactiveMessage: { body: { text: bodyText }, footer: { text: 'Zeno Guard ⚙️' }, nativeFlowMessage: { buttons } } } } };
    return await sock.relayMessage(jid, msg, { quoted: m });
}

module.exports = {
    commands: ['zeno', '0', 'zenon', 'zenooff'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;

        // ✅ Ora usa la lista owner centralizzata
        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Azione negata! Solo owner o admin.' }, { quoted: m });

        let list = getDB();

        if (cmd === 'zenon') {
            if (!list.includes(jid)) { list.push(jid); saveDB(list); }
            await sock.sendMessage(jid, { react: { text: '🛡️', key: m.key } });
            return await sock.sendMessage(jid, { text: '🛡️ *ANTI-NUKE ATTIVATO!*' }, { quoted: m });
        }
        if (cmd === 'zenooff') {
            list = list.filter(g => g !== jid); saveDB(list);
            await sock.sendMessage(jid, { react: { text: '🔓', key: m.key } });
            return await sock.sendMessage(jid, { text: '🔓 *ANTI-NUKE DISATTIVATO.*' }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '👑', key: m.key } });
        return await sendZenoPanel(sock, jid, m, list.includes(jid));
    },

    hook: async (sock, m) => {
        if (!m.messageStubType) return;
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) return;

        const list = getDB();
        if (!list.includes(jid)) return;

        const attore = m.participant || m.key.participant;
        const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
        if (isOwner(attore) || pureId(attore) === botId) return;

        if (m.messageStubType === 28 || m.messageStubType === 32 || m.messageStubType === 30) {
            const attoreJid = pureId(attore) + '@s.whatsapp.net';
            try {
                await sock.groupParticipantsUpdate(jid, [attoreJid], 'remove');
                await sock.sendMessage(jid, {
                    text: `🚨 *CONTROFFENSIVA ANTI-NUKE!* 🚨\n\n⚠️ Attacco da @${pureId(attore)}\n🛡️ Rimozione immediata! 🔨💨`,
                    mentions: [attoreJid]
                });
            } catch (e) { console.error('AntiNuke:', e.message); }
        }
    }
};
