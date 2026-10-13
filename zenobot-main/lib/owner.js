const fs = require('fs');
const path = require('path');

const ownersPath = path.join(__dirname, '../database/owners.json');

// 👇 Imposta qui l'owner principale (una volta sola!)
const DEFAULT_OWNER = '573215721964';

function getOwners() {
    try {
        if (!fs.existsSync(ownersPath)) {
            fs.mkdirSync(path.dirname(ownersPath), { recursive: true });
            fs.writeFileSync(ownersPath, JSON.stringify([DEFAULT_OWNER], null, 2));
            return [DEFAULT_OWNER];
        }
        const data = JSON.parse(fs.readFileSync(ownersPath, 'utf-8'));
        return Array.isArray(data) ? data : [DEFAULT_OWNER];
    } catch { return [DEFAULT_OWNER]; }
}

function saveOwners(list) {
    fs.writeFileSync(ownersPath, JSON.stringify(list, null, 2));
}

function pureId(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function isOwner(jid) {
    const id = pureId(jid);
    return getOwners().includes(id);
}

function addOwner(jid) {
    const id = pureId(jid);
    const list = getOwners();
    if (!list.includes(id)) { list.push(id); saveOwners(list); return true; }
    return false;
}

function removeOwner(jid) {
    const id = pureId(jid);
    const list = getOwners().filter(o => o !== id);
    saveOwners(list);
    return true;
}

module.exports = { getOwners, saveOwners, isOwner, addOwner, removeOwner, pureId, DEFAULT_OWNER };
