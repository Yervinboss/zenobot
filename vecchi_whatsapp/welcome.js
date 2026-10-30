const fs = require('fs');
const path = require('path');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');
const { isAdmin } = require('../lib/admin');

const dbPath = path.join(__dirname, '../database/welcome.json');
const FALLBACK_PIC = 'https://telegra.ph/file/8ca14ef9fa43e99d1d196.jpg';
const DEFAULT_TEXT = '@user 𝐛𝐞𝐧𝐯𝐞𝐧𝐮𝐭𝐨/𝐚 𝐧𝐞𝐥 𝐠𝐫𝐮𝐩𝐩𝐨 @group';
const BATCH_DELAY = 3000;

function getDB() {
    try {
        const d = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    } catch { return {}; }
}
function saveDB(db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
// compatibile col vecchio formato (solo stringa)
function getCfg(db, jid) {
    const v = db[jid];
    if (typeof v === 'string') return { text: v, enabled: true };
    return { text: v?.text || null, enabled: v?.enabled !== false };
}

async function fetchBuffer(url) {
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
}

async function sendWelcomeBatch(sock, jid, users, force = false) {
    const cfg = getCfg(getDB(), jid);
    if ((!cfg.enabled && !force) || !users.length) return;

    const meta = await sock.groupMetadata(jid);
    const count = meta.participants.length;

    let pic;
    try { pic = await sock.profilePictureUrl(users[0], 'image'); }
    catch { pic = FALLBACK_PIC; }

    let ppBuffer = null;
    try { ppBuffer = await fetchBuffer(pic); }
    catch { try { ppBuffer = await fetchBuffer(FALLBACK_PIC); } catch {} }

    const welcomeText = users.map(user =>
        (cfg.text || DEFAULT_TEXT)
            .replace(/@user/g, () => '@' + pureId(user))
            .replace(/@group/g, () => meta.subject || '')
            .replace(/@count/g, () => String(count))
            .replace(/@desc/g, () => meta.desc?.toString() || 'Nessuna descrizione')
    ).join('\n');

    const location = {
        name: '𝐁𝐞𝐧𝐯𝐞𝐧𝐮𝐭𝐨 👋',
        vcard: 'BEGIN:VCARD\nVERSION:3.0\nN:;Welcome;;;\nFN:Welcome\nEND:VCARD'
    };
    if (ppBuffer) location.jpegThumbnail = ppBuffer.toString('base64');

    const fakeWelcome = {
        key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'ZenoWelcome' },
        message: { locationMessage: location },
        participant: '0@s.whatsapp.net'
    };

    await sock.sendMessage(jid, {
        text: `${welcomeText}\n\n👥 𝐌𝐞𝐦𝐛𝐫𝐢 𝐚𝐭𝐭𝐮𝐚𝐥𝐢: ${count}`,
        mentions: users
    }, { quoted: fakeWelcome });
}

// --- Ingressi: raggruppa chi entra insieme in un solo messaggio ---
const pending = new Map();

function queueWelcome(sock, jid, users) {
    const batch = pending.get(jid) || { users: new Set(), timer: null };
    for (const u of users) batch.users.add(u);
    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(async () => {
        pending.delete(jid);
        try { await sendWelcomeBatch(sock, jid, [...batch.users]); }
        catch (e) { console.error('[WELCOME] errore invio:', e.message); }
    }, BATCH_DELAY);
    pending.set(jid, batch);
}

function registerJoinListener(sock) {
    if (sock.__welcomeListener) return;
    sock.__welcomeListener = true;
    sock.ev.on('group-participants.update', async (ev) => {
        try {
            if (ev.action !== 'add') return;
            const botPure = pureId(sock.user?.id || '');
            const users = [];
            for (const p of ev.participants) {
                const userJid = typeof p === 'string' ? p : (p.id || p.phoneNumber);
                if (!userJid || pureId(userJid) === botPure) continue;
                users.push(userJid);
            }
            if (users.length) {
                console.log('[WELCOME] ingresso via evento:', users.join(', '));
                queueWelcome(sock, ev.id, users);
            }
        } catch (e) {
            console.error('[WELCOME] listener errore:', e.message);
        }
    });
}

module.exports = {
    commands: ['setwelcome', 'setbenvenuto', 'welcome', 'testwelcome'],

    hook: async (sock) => { registerJoinListener(sock); },

    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        const db = getDB();
        const cfg = getCfg(db, jid);

        // testo grezzo (mantiene gli a capo)
        const raw = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const text = (raw.replace(/^\S+\s*/, '') || args.join(' ')).trim();

        if (cmd === 'setwelcome' || cmd === 'setbenvenuto') {
            if (!text) {
                return await sock.sendMessage(jid, {
                    text: `ⓘ 𝐔𝐬𝐨 𝐝𝐞𝐥 𝐜𝐨𝐦𝐚𝐧𝐝𝐨:\n\n` +
                          `*𝐕𝐚𝐫𝐢𝐚𝐛𝐢𝐥𝐢 𝐝𝐢𝐬𝐩𝐨𝐧𝐢𝐛𝐢𝐥𝐢:*\n` +
                          `• @user - Menziona l'utente\n` +
                          `• @group - Nome del gruppo\n` +
                          `• @count - Numero membri\n` +
                          `• @desc - Descrizione gruppo\n\n` +
                          `*𝐄𝐬𝐞𝐦𝐩𝐢:*\n.setwelcome Benvenuto @user nel gruppo @group!\n\n` +
                          `*𝐑𝐞𝐬𝐞𝐭:*\n.setwelcome reset\n\n` +
                          `*𝐌𝐞𝐬𝐬𝐚𝐠𝐠𝐢𝐨 𝐚𝐭𝐭𝐮𝐚𝐥𝐞:*\n${cfg.text || DEFAULT_TEXT + ' (predefinito)'}`
                }, { quoted: m });
            }

            if (text.toLowerCase() === 'reset') {
                db[jid] = { text: null, enabled: cfg.enabled };
                saveDB(db);
                return await sock.sendMessage(jid, {
                    text: `✅ 𝐌𝐞𝐬𝐬𝐚𝐠𝐠𝐢𝐨 𝐫𝐢𝐩𝐫𝐢𝐬𝐭𝐢𝐧𝐚𝐭𝐨!\n\n*𝐌𝐞𝐬𝐬𝐚𝐠𝐠𝐢𝐨 𝐩𝐫𝐞𝐝𝐞𝐟𝐢𝐧𝐢𝐭𝐨:*\n${DEFAULT_TEXT}\n\nⓘ Usa .testwelcome per testarlo`
                }, { quoted: m });
            }

            db[jid] = { text, enabled: cfg.enabled };
            saveDB(db);
            return await sock.sendMessage(jid, {
                text: `✅ 𝐌𝐞𝐬𝐬𝐚𝐠𝐠𝐢𝐨 𝐝𝐢 𝐛𝐞𝐧𝐯𝐞𝐧𝐮𝐭𝐨 𝐚𝐠𝐠𝐢𝐨𝐫𝐧𝐚𝐭𝐨!\n\n*𝐍𝐮𝐨𝐯𝐨 𝐦𝐞𝐬𝐬𝐚𝐠𝐠𝐢𝐨:*\n${text}\n\nⓘ Usa .testwelcome per testarlo\nⓘ Usa .setwelcome reset per ripristinare`
            }, { quoted: m });
        }

        if (cmd === 'welcome') {
            const action = (args[0] || '').toLowerCase();
            if (action === 'on' || action === 'off') {
                db[jid] = { text: cfg.text, enabled: action === 'on' };
                saveDB(db);
                await sock.sendMessage(jid, { react: { text: action === 'on' ? '✅' : '🔕', key: m.key } });
                return await sock.sendMessage(jid, {
                    text: action === 'on' ? '✅ Benvenuto *attivato*.' : '🔕 Benvenuto *disattivato*.'
                }, { quoted: m });
            }
            return await sock.sendMessage(jid, {
                text: `👋 *WELCOME*\n\nStato: ${cfg.enabled ? 'ATTIVO ✅' : 'Disattivato 🔕'}\n\n` +
                      `*Messaggio:*\n${cfg.text || DEFAULT_TEXT + ' (predefinito)'}\n\n` +
                      `\`.welcome on\` / \`.welcome off\`\n\`.setwelcome <frase>\`\n\`.testwelcome\``
            }, { quoted: m });
        }

        if (cmd === 'testwelcome') {
            return await sendWelcomeBatch(sock, jid, [sender], true);
        }
    }
};
