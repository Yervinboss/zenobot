const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, '../database/top.json')

let db = {}
try { db = JSON.parse(fs.readFileSync(file, 'utf8')) || {} } catch { db = {} }
let dirty = false

function flush() {
  if (!dirty) return
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(db))
    dirty = false
  } catch {}
}
setInterval(flush, 10000).unref()
process.on('exit', flush)

const IGNORA = ['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'messageContextInfo']

// da chiamare per ogni messaggio ricevuto
function count(m) {
  try {
    const g = m?.key?.remoteJid
    if (!g || !g.endsWith('@g.us') || m.key.fromMe) return
    const who = m.key.participant
    if (!who) return
    if (!Object.keys(m.message || {}).some(k => !IGNORA.includes(k))) return
    db[g] = db[g] || {}
    db[g][who] = (db[g][who] || 0) + 1
    dirty = true
  } catch {}
}

function top(group, n = 5) {
  return Object.entries(db[group] || {}).sort((a, b) => b[1] - a[1]).slice(0, n)
}
function total(group) {
  return Object.values(db[group] || {}).reduce((a, b) => a + b, 0)
}

module.exports = { count, top, total }
