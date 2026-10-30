const { isAdmin } = require('../lib/admin');
const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/mutati.json');

function getMuted() {
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveMuted(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

function fullJid(jid) {
    if (!jid) return '';
    const str = typeof jid === 'object' ? (jid.id || String(jid)) : String(jid);
    return str.split(':')[0];
}

async function isAdminOld(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => pureId(p.id) === sp && p.admin);
    } catch { return false; }
}

async function hook(sock, m) {
    try {
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) return;
        const sender = m.key.participant;
        if (!sender) return;
        if (isOwner(sender)) return;

        const db = getMuted();
        const mutedList = db[jid] || [];
        if (mutedList.length === 0) return; // nessuno mutato in questo gruppo

        const senderPure = pureId(sender);
        const isMuted = mutedList.some(id => pureId(id) === senderPure);

        if (isMuted) {
            console.log(`[MUTE] Rilevato utente mutato: ${senderPure} sta scrivendo`);
            try {
                await sock.sendMessage(jid, { delete: m.key });
                console.log(`[MUTE] ✅ Messaggio eliminato`);
            } catch (e) {
                console.log(`[MUTE] ❌ Errore eliminazione: ${e.message}`);
                console.log(`[MUTE] Suggerimento: il bot è admin del gruppo?`);
            }
        }
    } catch (e) {
        console.error('[MUTE] Hook error:', e.message);
    }
}

module.exports = {
    commands: ['mute', 'unmute'],
    hook,
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || m.key.remoteJid;

        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo admin!' }, { quoted: m });

        const msg = m.message || {};
        const ctx = msg.extendedTextMessage?.contextInfo || {};
        let target = ctx.participant;
        if (!target && ctx.mentionedJid?.length > 0) target = ctx.mentionedJid[0];

        if (!target)
            return await sock.sendMessage(jid, {
                text: `❌ Rispondi a un messaggio o tagga un utente!`
            }, { quoted: m });

        if (cmd === 'unmute') {
            const db = getMuted();
            if (!db[jid]) db[jid] = [];
            db[jid] = db[jid].filter(id => pureId(id) !== pureId(target));
            saveMuted(db);
            return await sock.sendMessage(jid, {
                text: `🔊 @${pureId(target)} è stato *smutato*.`,
                mentions: [fullJid(target)]
            }, { quoted: m });
        }

        if (cmd === 'mute') {
            if (isOwner(target))
                return await sock.sendMessage(jid, { text: '🧠 Non puoi mutare un owner!' }, { quoted: m });

            const db = getMuted();
            if (!db[jid]) db[jid] = [];
            if (!db[jid].some(id => pureId(id) === pureId(target))) {
                db[jid].push(fullJid(target));
                saveMuted(db);
            }
            console.log(`[MUTE] Aggiunto ${pureId(target)} alla lista mutati di ${jid}`);
            return await sock.sendMessage(jid, {
                text: `🔇 *MUTATO:* @${pureId(target)}`,
                mentions: [fullJid(target)]
            }, { quoted: m });
        }
    }
};
