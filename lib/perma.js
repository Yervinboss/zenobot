const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, '../database/perma.json')

const pure = (j) => j ? String(j).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : ''

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'))
    return d && !Array.isArray(d) ? d : {}
  } catch { return {} }
}
function save(d) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(d, null, 2))
}

// restituisce tutte le versioni dell'id (numero e LID) per non farsi fregare
async function variants(sock, id) {
  const set = new Set()
  const p = pure(id)
  if (p) set.add(p)
  const lm = sock?.signalRepository?.lidMapping
  if (lm && id) {
    try {
      const full = String(id).includes('@') ? id : `${p}@s.whatsapp.net`
      const x = full.endsWith('@lid') ? await lm.getPNForLID(full) : await lm.getLIDForPN(full)
      if (x) set.add(pure(x))
    } catch {}
  }
  return [...set]
}

async function add(sock, group, id) {
  const db = load()
  db[group] = db[group] || []
  for (const v of await variants(sock, id)) if (!db[group].includes(v)) db[group].push(v)
  save(db)
}

async function remove(sock, group, id) {
  const db = load()
  const vs = await variants(sock, id)
  const before = (db[group] || []).length
  db[group] = (db[group] || []).filter(x => !vs.includes(x))
  save(db)
  return before - db[group].length
}

function list(group) { return load()[group] || [] }

// da chiamare quando qualcuno entra nel gruppo
async function onJoin(sock, update) {
  if (!update || update.action !== 'add') return
  const banned = list(update.id)
  if (!banned.length) return
  for (const p of update.participants || []) {
    const id = typeof p === 'string' ? p : p.id
    const vs = await variants(sock, id)
    if (vs.some(v => banned.includes(v))) {
      try {
        await sock.groupParticipantsUpdate(update.id, [id], 'remove')
        await sock.sendMessage(update.id, {
          text: `🚫 @${pure(id)} è bannato permanentemente (perma) ed è stato rimosso di nuovo.`,
          mentions: [id]
        })
      } catch {}
    }
  }
}

module.exports = { add, remove, list, onJoin, pure }
