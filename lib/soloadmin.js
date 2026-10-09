const fs = require('fs');
const path = require('path');
const { isOwner } = require('./owner');
const { isAdmin } = require('./admin');

const dbPath = path.join(__dirname, '../database/soloadmin.json');

function getDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { return {}; }
}
function saveDB(data) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}
function isOn(jid) { return !!getDB()[jid]; }
function setOn(jid, on) {
    const db = getDB();
    if (on) db[jid] = true; else delete db[jid];
    saveDB(db);
}

// true = può usare il bot, false = va ignorato
async function canUse(sock, m) {
    const jid = m.key.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) return true;
    const on = isOn(jid);
    if (!on) return true;
    const sender = m.key.participant || jid;
    const fromMe = !!m.key.fromMe;
    const owner = isOwner(sender);
    let admin = null;
    let result = true;
    if (!fromMe && !owner) {
        admin = await isAdmin(sock, jid, sender);
        result = admin;
    }
    return result;
}

module.exports = { isOn, setOn, canUse };
