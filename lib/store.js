const fs = require('fs'), path = require('path')
const DIR = path.join(__dirname, '../database')
const cache = {}

// Piccolo archivio JSON con salvataggio ritardato (non scrive a ogni messaggio)
module.exports = function store(name, def = {}) {
    if (!cache[name]) {
        const file = path.join(DIR, name + '.json')
        let data = { ...def }
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) data = { ...def, ...raw }
        } catch {}
        cache[name] = { file, data, t: null }
    }
    const s = cache[name]
    return {
        data: s.data,
        save() {
            if (s.t) return
            s.t = setTimeout(() => {
                s.t = null
                try {
                    fs.mkdirSync(DIR, { recursive: true })
                    fs.writeFileSync(s.file + '.tmp', JSON.stringify(s.data))
                    fs.renameSync(s.file + '.tmp', s.file)
                } catch (e) { console.error('[store]', e.message) }
            }, 2000)
        }
    }
}
