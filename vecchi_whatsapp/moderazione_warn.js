const { isAdmin } = require('../lib/admin');
const fs = require('fs');
const path = require('path');
const { pureId, getTarget } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/warns.json');

function getDB() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

async function isAdminOld(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch { return false; }
}

module.exports = {
    commands: ['warn', 'unwarn', 'richiamo', 'grazia'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || m.key.remoteJid;
        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin possono gestire i richiami.' }, { quoted: m });

        const { jid: targetJid, source } = getTarget(m);
        if (source === 'self' && !args[0])
            return await sock.sendMessage(jid, {
                text: `⚠️ *USO:*\n\`.warn @tag\` o \`.unwarn @tag\`\nOppure rispondi al messaggio con \`.warn\``
            }, { quoted: m });

        const targetId = pureId(targetJid);
        const targetMention = targetJid;

        if (isOwner(targetJid))
            return await sock.sendMessage(jid, { text: '❌ Non puoi sanzionare un owner! 🛡️' }, { quoted: m });

        if (pureId(sender) === targetId)
            return await sock.sendMessage(jid, { text: '❌ Non puoi sanzionare te stesso!' }, { quoted: m });

        const db = getDB();
        if (!db[jid]) db[jid] = {};
        if (!db[jid][targetId]) db[jid][targetId] = 0;

        const isTargetAdmin = await isAdmin(sock, jid, targetJid);
        const adminTag = isTargetAdmin ? ' 👑 *[ADMIN]*' : '';

        if (cmd === 'warn' || cmd === 'richiamo') {
            db[jid][targetId]++;
            const attuali = db[jid][targetId];

            await sock.sendMessage(jid, { react: { text: '⚠️', key: m.key } });

            if (attuali >= 3) {
                db[jid][targetId] = 0;
                saveDB(db);
                await sock.sendMessage(jid, {
                    text: `🚨 *ESPULSIONE!* 🚨\n\n@${targetId}${adminTag} ha accumulato *3/3 richiami*. Ciao! 👋🔨`,
                    mentions: [targetMention]
                }, { quoted: m });
                try {
                    return await sock.groupParticipantsUpdate(jid, [targetMention], 'remove');
                } catch {
                    return await sock.sendMessage(jid, { text: '❌ Non riesco a cacciare (bot admin?).' }, { quoted: m });
                }
            } else {
                saveDB(db);
                return await sock.sendMessage(jid, {
                    text: `⚠️ *RICHIAMO!* ⚠️\n\n👤 @${targetId}${adminTag}\n📊 Richiami: *${attuali}/3*\n👮 Da: @${pureId(sender)}\n\n📌 _Al 3° richiamo vieni espulso._`,
                    mentions: [targetMention, sender]
                }, { quoted: m });
            }
        }

        if (cmd === 'unwarn' || cmd === 'grazia') {
            if (db[jid][targetId] <= 0)
                return await sock.sendMessage(jid, {
                    text: `😇 @${targetId} è già pulito (0 richiami).`,
                    mentions: [targetMention]
                }, { quoted: m });

            db[jid][targetId]--;
            const attuali = db[jid][targetId];
            saveDB(db);

            await sock.sendMessage(jid, { react: { text: '😇', key: m.key } });
            return await sock.sendMessage(jid, {
                text: `😇 *GRAZIA CONCESSA!*\n\n👤 @${targetId}${adminTag}\n📊 Nuovo totale: *${attuali}/3*\n👮 Da: @${pureId(sender)}`,
                mentions: [targetMention, sender]
            }, { quoted: m });
        }
    }
};
