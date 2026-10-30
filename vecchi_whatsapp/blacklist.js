const fs = require('fs');
const path = require('path');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '..', 'data', 'db', 'blacklist.json');

function loadDB() {
    try {
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            fs.writeFileSync(dbPath, JSON.stringify({ groups: [] }, null, 2));
        }
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!Array.isArray(data.groups)) data.groups = [];
        return data;
    } catch { return { groups: [] }; }
}
function saveDB(data) {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('blacklist saveDB:', e.message); }
}

async function hook(sock, m) {
    try {
        const jid = m.key?.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) return;
        const db = loadDB();
        if (!db.groups.includes(jid)) return;
        const sender = m.key.participant || (m.key.fromMe && sock.user?.id) || m.key.remoteJid;
        if (isOwner(sender)) return;
        m.__blocked = true;
    } catch (e) { console.error('blacklist hook:', e.message); }
}

async function getAllGroups(sock) {
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({ id: g.id, name: g.subject || '(senza nome)' }));
    } catch (e) { console.error('getAllGroups:', e.message); return []; }
}

module.exports = {
    commands: ['blacklist', 'bl'],
    name: 'blacklist',
    category: 'creatore',
    author: 'ZENO',
    description: 'Gestisci la blacklist dei gruppi (solo owner)',
    usage: '[list|add <id>|remove <id>]',
    hook,

    async run(sock, m, args, cmd, ctx) {
        const jid = ctx?.chatJid || m.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const sender = m.key.participant || (m.key.fromMe && sock.user?.id) || m.key.remoteJid;

        if (!isOwner(sender)) {
            return sock.sendMessage(jid, { text: '❌ Solo il creatore può usare questo comando.' }, { quoted: m });
        }

        const db = loadDB();
        const sub = (args[0] || '').toLowerCase();
        const target = args[1] || (isGroup ? jid : null);

        if (sub === 'add' || cmd === 'bl') {
            if (!target) return sock.sendMessage(jid, { text: '❌ Specifica l\'ID del gruppo.\nEs: blacklist add 12036...@g.us\n\nUsa blacklist list per vedere gli ID.' }, { quoted: m });
            if (!target.endsWith('@g.us')) return sock.sendMessage(jid, { text: '❌ ID non valido (deve finire con @g.us).' }, { quoted: m });
            if (db.groups.includes(target)) return sock.sendMessage(jid, { text: '⚠️ Già in blacklist:\n' + target }, { quoted: m });
            db.groups.push(target);
            saveDB(db);
            return sock.sendMessage(jid, { text: '🚫 Aggiunto in blacklist:\n' + target }, { quoted: m });
        }

        if (sub === 'remove' || sub === 'rm' || sub === 'del') {
            if (!target) return sock.sendMessage(jid, { text: '❌ Specifica l\'ID del gruppo.' }, { quoted: m });
            if (!db.groups.includes(target)) return sock.sendMessage(jid, { text: '⚠️ Non è in blacklist:\n' + target }, { quoted: m });
            db.groups = db.groups.filter(id => id !== target);
            saveDB(db);
            return sock.sendMessage(jid, { text: '✅ Rimosso dalla blacklist:\n' + target }, { quoted: m });
        }

        if (sub === 'list' || sub === 'ls' || sub === 'gruppi') {
            await sock.sendMessage(jid, { text: '⏳ Recupero la lista dei gruppi...' }, { quoted: m });
            const all = await getAllGroups(sock);
            if (!all.length) return sock.sendMessage(jid, { text: '📋 Il bot non è in nessun gruppo.' }, { quoted: m });

            const righe = all.map((g, i) => {
                const bloccato = db.groups.includes(g.id) ? '🚫' : '✅';
                return bloccato + ' *' + (i + 1) + '. ' + g.name + '*\n   `' + g.id + '`';
            });

            const testo = '📋 *GRUPPI DEL BOT (' + all.length + ')*\n\n✅ attivi | 🚫 bloccati\n\n' +
                righe.join('\n\n') +
                '\n\n💡 Copia l\'ID e usa:\n• blacklist add <id>\n• blacklist remove <id>';

            if (testo.length > 4000) {
                const parti = [];
                for (let i = 0; i < testo.length; i += 3500) parti.push(testo.slice(i, i + 3500));
                for (const p of parti) await sock.sendMessage(jid, { text: p });
            } else {
                await sock.sendMessage(jid, { text: testo });
            }
            return;
        }

        return sock.sendMessage(jid, {
            text: '🚫 *GESTIONE BLACKLIST*\n\nGruppi bloccati: *' + db.groups.length + '*\n\n' +
                '📌 *Comandi (funzionano anche in privato):*\n' +
                '• blacklist list → lista tutti i gruppi del bot con ID\n' +
                '• blacklist add <id> → blocca un gruppo\n' +
                '• blacklist remove <id> → sblocca un gruppo\n' +
                '• blacklist add (dentro il gruppo) → blocca il gruppo corrente\n' +
                '• blacklist remove (dentro il gruppo) → sblocca il gruppo corrente'
        }, { quoted: m });
    }
};
