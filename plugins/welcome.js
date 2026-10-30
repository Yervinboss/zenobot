const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pureId } = require('../lib/utils');

const dbPath = path.join(__dirname, '../database/welcome.json');
const FALLBACK_PIC = 'https://telegra.ph/file/8ca14ef9fa43e99d1d196.jpg';
const BATCH_DELAY = 3000;
const SEND_GAP = 1200;

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
function isEnabled(db, jid) {
    const v = db[jid];
    if (typeof v === 'string') return true;
    return v?.enabled !== false;
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// stessa tecnica di .pl: scarica la foto grande e la ridimensiona con ffmpeg
async function getSmallThumb(sock, user) {
    let urlGrande;
    try { urlGrande = await sock.profilePictureUrl(user, 'image'); }
    catch {
        try { urlGrande = await sock.profilePictureUrl(user, 'preview'); }
        catch { urlGrande = FALLBACK_PIC; }
    }
    try {
        const r = await fetch(urlGrande);
        const grande = Buffer.from(await r.arrayBuffer());
        const piccola = await new Promise((resolve) => {
            try {
                const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=300:-1', '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', 'pipe:1']);
                const out = [];
                ff.stdout.on('data', d => out.push(d));
                ff.on('close', () => resolve(Buffer.concat(out)));
                ff.on('error', () => resolve(null));
                ff.stdin.on('error', () => {});
                ff.stdin.end(grande);
            } catch { resolve(null); }
        });
        if (piccola && piccola.length > 500) return piccola;
    } catch {}
    try {
        const urlPreview = await sock.profilePictureUrl(user, 'preview');
        return Buffer.from(await (await fetch(urlPreview)).arrayBuffer());
    } catch { return null; }
}

async function sendWelcomeCard(sock, jid, user) {
    const meta = await sock.groupMetadata(jid);
    const count = meta.participants.length;
    const groupName = meta.subject || 'questo gruppo';

    const thumb = await getSmallThumb(sock, user);

    const loc = { name: '𝐁𝐞𝐧𝐯𝐞𝐧𝐮𝐭𝐨 👋' };
    if (thumb) loc.jpegThumbnail = thumb;

    const card = {
        key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'ZenoWelcome' },
        message: { locationMessage: loc },
        participant: '0@s.whatsapp.net'
    };

    const caption =
        `╭──── 👋 ────╮\n` +
        `   𝐁𝐄𝐍𝐕𝐄𝐍𝐔𝐓𝐎\n` +
        `╰──── 🎉 ────╯\n\n` +
        `@${pureId(user)} è appena entrato/a in\n` +
        `『 ${groupName} 』\n\n` +
        `👥 Ora siete in *${count}*`;

    await sock.sendMessage(jid, { text: caption, mentions: [user] }, { quoted: card });
}

async function sendWelcomeBatch(sock, jid, users, force = false) {
    const db = getDB();
    if (!force && !isEnabled(db, jid)) return;

    for (const user of users) {
        try { await sendWelcomeCard(sock, jid, user); }
        catch (e) { console.error('[WELCOME] errore card:', e.message); }
        if (users.length > 1) await delay(SEND_GAP);
    }
}

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
    commands: ['welcome', 'testwelcome'],

    hook: async (sock) => { registerJoinListener(sock); },

    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const { isOwner } = require('../lib/owner');
        const { isAdmin } = require('../lib/admin');
        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        const db = getDB();

        if (cmd === 'welcome') {
            const action = (args[0] || '').toLowerCase();
            if (action === 'on' || action === 'off') {
                db[jid] = { enabled: action === 'on' };
                saveDB(db);
                await sock.sendMessage(jid, { react: { text: action === 'on' ? '✅' : '🔕', key: m.key } });
                return await sock.sendMessage(jid, {
                    text: action === 'on' ? '✅ Benvenuto *attivato*.' : '🔕 Benvenuto *disattivato*.'
                }, { quoted: m });
            }
            return await sock.sendMessage(jid, {
                text: `👋 *WELCOME*\n\nStato: ${isEnabled(db, jid) ? 'ATTIVO ✅' : 'Disattivato 🔕'}\n\n` +
                      `\`.welcome on\` / \`.welcome off\`\n\`.testwelcome\``
            }, { quoted: m });
        }

        if (cmd === 'testwelcome') {
            return await sendWelcomeBatch(sock, jid, [sender], true);
        }
    }
};
