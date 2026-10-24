const zx = require('../lib/zx')
const QR = (() => { try { return require('qrcode') } catch { return null } })()

const WX = { 0: ['☀️', 'Sereno'], 1: ['🌤️', 'Quasi sereno'], 2: ['⛅', 'Poco nuvoloso'], 3: ['☁️', 'Coperto'], 45: ['🌫️', 'Nebbia'], 48: ['🌫️', 'Nebbia gelata'],
    51: ['🌦️', 'Pioggerella'], 53: ['🌦️', 'Pioggerella'], 55: ['🌧️', 'Pioggerella fitta'], 61: ['🌧️', 'Pioggia debole'], 63: ['🌧️', 'Pioggia'], 65: ['🌧️', 'Pioggia forte'],
    71: ['🌨️', 'Neve debole'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve forte'], 80: ['🌦️', 'Rovesci'], 81: ['🌧️', 'Rovesci'], 82: ['⛈️', 'Rovesci violenti'],
    95: ['⛈️', 'Temporale'], 96: ['⛈️', 'Temporale con grandine'], 99: ['⛈️', 'Temporale con grandine'] }
const wx = (c) => WX[c] || ['🌡️', 'Variabile']

const getJson = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.json()
}

function calc(expr) {
    let e = String(expr).toLowerCase().replace(/,/g, '.').replace(/\^/g, '**').replace(/×|x(?=\s*\d)/g, '*').replace(/÷/g, '/')
    e = e.replace(/\b(sqrt|sin|cos|tan|log|abs|round|floor|ceil)\b/g, 'Math.$1').replace(/\bpi\b/g, 'Math.PI')
    const rest = e.replace(/Math\.(sqrt|sin|cos|tan|log|abs|round|floor|ceil|PI)/g, '')
    if (!rest.trim() || !/^[0-9+\-*/().%\s]+$/.test(rest) || e.length > 120) throw new Error('bad')
    const v = Function('"use strict";return (' + e + ')')()
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad')
    return Math.round(v * 1e10) / 1e10
}

module.exports = {
    commands: ['meteo', 'wiki', 'traduci', 'calc', 'calcola', 'qrcode', 'creaqr', 'password', 'pass', 'scegli', 'dado', 'moneta'],
    name: 'utility',
    category: 'funzioni',
    cooldown: 3000,
    description: 'Meteo, Wikipedia, traduttore, calcolatrice, QR, password, scegli, dado, moneta',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx), jid = z.jid
        const text = (ctx && ctx.argsText != null ? ctx.argsText : args.join(' ')).trim()
        const quotedText = () => {
            const q = ctx && ctx.quoted
            const msg = q && (q.message || q.msg || q)
            return msg && (msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '') || ''
        }
        try {
            if (cmd === 'meteo') {
                if (!text) return z.err('Uso: *.meteo <città>*  es. *.meteo Milano*')
                const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=1&language=it`)
                const c = geo.results && geo.results[0]
                if (!c) return z.err(`Non trovo la città *${text}*.`)
                const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=3`)
                const n = f.current, [ic, desc] = wx(n.weather_code)
                const days = ['Oggi', 'Domani', 'Dopodomani']
                const next = f.daily.time.map((_, i) => {
                    const [e] = wx(f.daily.weather_code[i])
                    return { raw: `${e} *${days[i]}*: ${Math.round(f.daily.temperature_2m_min[i])}°/${Math.round(f.daily.temperature_2m_max[i])}° • ☔ ${f.daily.precipitation_probability_max[i] ?? 0}%` }
                })
                return z.reply(z.box(`METEO • ${c.name}${c.country ? ', ' + c.country : ''}`, [
                    { raw: `${ic} *${desc}*  ${Math.round(n.temperature_2m)}°C (percepiti ${Math.round(n.apparent_temperature)}°)` },
                    `Umidità: *${n.relative_humidity_2m}%* • Vento: *${Math.round(n.wind_speed_10m)} km/h*`, '---', ...next
                ]))
            }

            if (cmd === 'wiki') {
                if (!text) return z.err('Uso: *.wiki <argomento>*')
                const os = await getJson(`https://it.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(text)}&limit=1&format=json`)
                const title = os[1] && os[1][0]
                if (!title) return z.err(`Nessun risultato per *${text}*.`)
                const s = await getJson(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
                const caption = z.box(`📚 ${s.title}`, [{ raw: String(s.extract || 'Nessun riassunto disponibile.').slice(0, 900) }, '---', { raw: (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || '' }])
                if (s.thumbnail && s.thumbnail.source) { try { return await sock.sendMessage(jid, { image: { url: s.thumbnail.source }, caption }, { quoted: m }) } catch {} }
                return z.reply(caption)
            }

            if (cmd === 'traduci') {
                let lang = (args[0] || '').toLowerCase(), body = args.slice(1).join(' ')
                if (!/^[a-z]{2}$/.test(lang)) { body = text; lang = 'en' }
                if (!body) body = quotedText()
                if (!body) return z.err('Uso: *.traduci <lingua> <testo>*  es. *.traduci en ciao come stai*\nOppure rispondi a un messaggio con *.traduci en*')
                const from = lang === 'it' ? 'en' : 'it'
                const r = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(body.slice(0, 450))}&langpair=${from}|${lang}`)
                const out = r.responseData && r.responseData.translatedText
                if (!out) return z.err('Traduzione non disponibile.')
                return z.reply(z.box(`TRADUZIONE ${from.toUpperCase()} → ${lang.toUpperCase()}`, [{ raw: out }]))
            }

            if (cmd === 'calc' || cmd === 'calcola') {
                if (!text) return z.err('Uso: *.calc 12*(3+4)*  (anche sqrt, pi, ^, %)')
                let v; try { v = calc(text) } catch { return z.err('Espressione non valida.') }
                return z.reply(z.box('CALCOLATRICE', [{ raw: `${text}\n= *${v}*` }]))
            }

            if (cmd === 'qrcode' || cmd === 'creaqr') {
                if (!QR) return z.err('Manca il modulo *qrcode* (npm i qrcode).')
                if (!text) return z.err('Uso: *.qrcode <testo o link>*')
                const buf = await QR.toBuffer(text.slice(0, 500), { width: 512, margin: 2 })
                return sock.sendMessage(jid, { image: buf, caption: '🔳 Ecco il tuo QR code' }, { quoted: m })
            }

            if (cmd === 'password' || cmd === 'pass') {
                const len = Math.min(40, Math.max(8, parseInt(args[0]) || 16))
                const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'
                const pw = Array.from(require('crypto').randomBytes(len), b => set[b % set.length]).join('')
                // la password va in privato, non nel gruppo
                const priv = (m.key.participant || m.key.remoteJid)
                await sock.sendMessage(priv, { text: z.box('PASSWORD SICURA', [{ raw: '```' + pw + '```\nLunghezza: ' + len }]) })
                if (jid.endsWith('@g.us')) return z.ok('Te l\'ho mandata in privato 🔐')
                return
            }

            if (cmd === 'scegli') {
                const opts = text.split(/\s*[|,]\s*|\s+o\s+/i).map(s => s.trim()).filter(Boolean)
                if (opts.length < 2) return z.err('Uso: *.scegli pizza | sushi | kebab*')
                return z.reply(z.box('🎯 HO SCELTO', [{ raw: `*${opts[Math.floor(Math.random() * opts.length)]}*` }]))
            }
            if (cmd === 'dado') {
                const f = Math.min(1000, Math.max(2, parseInt(args[0]) || 6))
                return z.reply(z.box('🎲 DADO', [{ raw: `d${f} → *${1 + Math.floor(Math.random() * f)}*` }]))
            }
            if (cmd === 'moneta') return z.reply(z.box('🪙 MONETA', [{ raw: `*${Math.random() < 0.5 ? 'TESTA' : 'CROCE'}*` }]))
        } catch (e) {
            return z.err('Servizio non raggiungibile in questo momento, riprova tra poco.')
        }
    }
}
