const fs = require('fs'), path = require('path')
const file = path.join(__dirname, '../database/rpg.json')
const START = 1000

const read = () => {
    try {
        const d = JSON.parse(fs.readFileSync(file, 'utf8'))
        return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
    } catch { return {} }
}
const write = (d) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(d, null, 2)) }
const user = (db, id) => db[id] || (db[id] = { level: 1, xp: 0, money: START, lastWork: 0 })
const eur = (n) => '€' + Number(n || 0).toLocaleString('it-IT')
const need = (lvl) => Math.floor(50 * Math.pow(lvl, 1.35))
const addXp = (u, xp) => { u.xp += xp; let up = 0; while (u.xp >= need(u.level)) { u.xp -= need(u.level); u.level++; up++ } return up }

module.exports = { read, write, user, eur, need, addXp, START }
