const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../database/rpg.json');

function read() {
    try {
        const d = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    } catch { return {}; }
}

function write(db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function user(db, id) {
    if (!db[id] || typeof db[id] !== 'object') db[id] = {};
    const u = db[id];
    if (typeof u.level !== 'number' || u.level < 1) u.level = 1;
    if (typeof u.xp !== 'number') u.xp = 0;
    if (typeof u.money !== 'number') u.money = 1000;
    if (typeof u.lastWork !== 'number') u.lastWork = 0;
    return u;
}

const need = (lvl) => Math.floor(50 * Math.pow(lvl, 1.35));

function addXp(u, amount) {
    u.xp = (u.xp || 0) + amount;
    let up = false;
    while (u.xp >= need(u.level)) {
        u.xp -= need(u.level);
        u.level += 1;
        up = true;
    }
    return up;
}

const eur = (n) => '€' + Number(n || 0).toLocaleString('it-IT');

module.exports = { read, write, user, need, addXp, eur };
