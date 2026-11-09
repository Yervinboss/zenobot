'use strict'
// ═══ ZENO EXTRA — afk, antilink, welcome, warn, xp/rank, daily, remind, calc, tagall, dado, scegli ═══
const Z = () => global.ZENO
const S = () => Z().db.settings
const bare = (j = '') => String(j).split('@')[0].split(':')[0]
const PFX = () => Z().CONFIG.prefix || '.'
const gid = (jid) => bare(jid).replace(/[^a-z0-9-]/gi, '_')
const uniq = (a) => [...new Set(a.filter(Boolean))]
const toJid = (n) => bare(n) + '@s.whatsapp.net'
const dur = (ms) => {
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60)
    return [d && d + 'g', h && h + 'h', m && m + 'm', !d && !h && !m && s + 's'].filter(Boolean).join(' ')
}
const lvlOf = (xp) => Math.floor(Math.sqrt(xp / 40))
const needFor = (l) => l * l * 40

async function groupAdmins(sock, jid) {
    const out = new Set()
    try {
        const meta = await sock.groupMetadata(jid)
        for (const p of meta.participants || []) if (p.admin) [p.id, p.phoneNumber, p.lid].forEach(x => x && out.add(bare(x)))
        return { meta, admins: out }
    } catch { return { meta: null, admins: out } }
}

// ── Promemoria: controllo ogni 15s (parte da solo al primo uso) ──
function ensureTick() {
    try {
        const sch = Z().scheduler
        if (sch.tasks.has('zeno-extra-remind')) return
        sch.add('zeno-extra-remind', 15000, () => {
            const sock = Z().sock
            const list = S().get('extra.rem', [])
            const t = Date.now()
            const due = list.filter(r => r.at <= t)
            if (!due.length || !sock) return
            S().set('extra.rem', list.filter(r => r.at > t))
            for (const r of due) sock.sendMessage(r.jid, { text: `⏰ @${r.num} promemoria:\n*${r.text}*`, mentions: [toJid(r.num)] }).catch(() => {})
        })
    } catch {}
}
setTimeout(ensureTick, 5000)

// ── Hook: antilink, AFK, XP ──
const xpCd = new Map()
async function onMessage(sock, m) {
    ensureTick()
    if (!m.message || m.key.fromMe) return
    const jid = m.key.remoteJid || ''
    if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return
    const H = Z().helpers
    const text = H.extractText(m) || ''
    const isGroup = jid.endsWith('@g.us')
    const sender = bare(m.key.participant || jid)
    const isCmd = text.startsWith(PFX())

    // antilink
    if (isGroup && /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i.test(text) && S().get(`extra.antilink.${gid(jid)}`, false)) {
        const { admins } = await groupAdmins(sock, jid)
        if (!admins.has(sender)) {
            try {
                await sock.sendMessage(jid, { delete: m.key })
                await sock.sendMessage(jid, { text: `🚫 @${sender} i link di altri gruppi non sono ammessi.`, mentions: [toJid(sender)] })
            } catch {}
            m.__blocked = true
            return
        }
    }

    // AFK: ritorno
    const isAfkCmd = isCmd && text.slice(PFX().length).trim().toLowerCase().startsWith('afk')
    const mine = S().get(`extra.afk.${sender}`)
    if (mine && !isAfkCmd) {
        S().del(`extra.afk.${sender}`)
        sock.sendMessage(jid, { text: `👋 Bentornato @${sender}! Eri AFK da *${dur(Date.now() - mine.t)}*.`, mentions: [toJid(sender)] }, { quoted: m }).catch(() => {})
    }
    // AFK: avviso se tagghi/rispondi a un AFK
    const targets = uniq([...H.getMentions(m).map(x => x.number), H.getQuoted(m)?.number]).filter(n => n !== sender)
    for (const n of targets) {
        const a = S().get(`extra.afk.${n}`)
        if (a) sock.sendMessage(jid, { text: `💤 @${n} è AFK da *${dur(Date.now() - a.t)}*\n📝 ${a.reason}`, mentions: [toJid(n)] }, { quoted: m }).catch(() => {})
    }

    // XP (solo messaggi normali, 1 ogni 30s per utente)
    if (!isCmd && text && Date.now() - (xpCd.get(sender) || 0) > 30000) {
        xpCd.set(sender, Date.now())
        const before = S().get(`extra.xp.${sender}`, 0)
        const after = before + 5 + Math.floor(Math.random() * 8)
        S().set(`extra.xp.${sender}`, after)
        if (isGroup && lvlOf(after) > lvlOf(before)) {
            sock.sendMessage(jid, { text: `🎉 @${sender} è salito al *livello ${lvlOf(after)}*!`, mentions: [toJid(sender)] }).catch(() => {})
        }
    }
}

// ── Hook: benvenuto / addio ──
async function onGroupParticipants(sock, u) {
    try {
        if (!u?.id || !S().get(`extra.welcome.${gid(u.id)}`, false)) return
        if (u.action !== 'add' && u.action !== 'remove') return
        const meta = await sock.groupMetadata(u.id).catch(() => null)
        const name = meta?.subject || 'il gruppo'
        for (const p of u.participants || []) {
            const jid = typeof p === 'string' ? p : (p.phoneNumber || p.id)
            const tag = '@' + bare(jid)
            const text = u.action === 'add'
                ? `👋 Benvenuto ${tag} in *${name}*!\nLeggi la descrizione e rispetta le regole 💜`
                : `👋 ${tag} ha lasciato *${name}*. Ciao ciao!`
            await sock.sendMessage(u.id, { text, mentions: [jid] })
        }
    } catch {}
}

// ═══ COMANDI ═══
const CMDS = {}
const need = (ctx, { group = false, admin = false } = {}) => {
    if (group && !ctx.isGroup) { ctx.err('Questo comando funziona solo nei gruppi.'); return false }
    if (admin && !ctx.isAdmin) { ctx.err('Solo gli admin possono usarlo.'); return false }
    return true
}
const targetOf = (ctx) => {
    const t = ctx.mentions[0]?.jid || ctx.quoted?.participant
    return t ? { jid: t, num: bare(t) } : null
}
const toggle = (key, label, extra = '') => async (sock, m, args, ctx) => {
    if (!need(ctx, { group: true, admin: true })) return
    const k = `extra.${key}.${gid(ctx.chat)}`
    const a = (args[0] || '').toLowerCase()
    if (a !== 'on' && a !== 'off') return ctx.info(`${label}: *${S().get(k, false) ? 'ON' : 'OFF'}*\nUso: *${ctx.prefix}${ctx.cmd} on|off*${extra}`)
    S().set(k, a === 'on')
    ctx.ok(`${label} ${a === 'on' ? 'attivato' : 'disattivato'}.${a === 'on' ? extra : ''}`)
}

CMDS.afk = async (sock, m, args, ctx) => {
    const reason = args.join(' ').slice(0, 100) || 'nessun motivo'
    S().set(`extra.afk.${ctx.sender}`, { t: Date.now(), reason })
    ctx.ok(`Ora sei AFK.\n📝 ${reason}`)
}
CMDS.antilink = toggle('antilink', '🔗 Antilink', '\n⚠️ Il bot deve essere admin per cancellare i messaggi.')
CMDS.welcome = toggle('welcome', '👋 Benvenuto/addio')

CMDS.warn = async (sock, m, args, ctx) => {
    if (!need(ctx, { group: true, admin: true })) return
    const t = targetOf(ctx)
    if (!t) return ctx.err(`Tagga o rispondi a qualcuno.\nUso: *${ctx.prefix}warn @utente [motivo]*`)
    const reason = args.filter(a => !a.startsWith('@')).join(' ') || 'nessun motivo'
    const k = `extra.warns.${gid(ctx.chat)}.${t.num}`
    const n = S().inc(k, 1)
    if (n < 3) return ctx.send({ text: `⚠️ @${t.num} warn *${n}/3*\n📝 ${reason}`, mentions: [t.jid] }, { quoted: m })
    S().set(k, 0)
    try {
        await sock.groupParticipantsUpdate(ctx.chat, [t.jid], 'remove')
        ctx.send({ text: `🚫 @${t.num} ha raggiunto *3/3* warn ed è stato rimosso.`, mentions: [t.jid] })
    } catch {
        ctx.send({ text: `🚫 @${t.num} ha raggiunto *3/3* warn, ma non riesco a rimuoverlo (il bot deve essere admin).`, mentions: [t.jid] })
    }
}
CMDS.warns = async (sock, m, args, ctx) => {
    if (!need(ctx, { group: true })) return
    const t = targetOf(ctx) || { jid: ctx.senderJid, num: ctx.sender }
    const n = S().get(`extra.warns.${gid(ctx.chat)}.${t.num}`, 0)
    ctx.send({ text: `⚠️ @${t.num} ha *${n}/3* warn.`, mentions: [t.jid] }, { quoted: m })
}
CMDS.resetwarn = async (sock, m, args, ctx) => {
    if (!need(ctx, { group: true, admin: true })) return
    const t = targetOf(ctx)
    if (!t) return ctx.err('Tagga o rispondi a qualcuno.')
    S().set(`extra.warns.${gid(ctx.chat)}.${t.num}`, 0)
    ctx.ok(`Warn di @${t.num} azzerati.`)
}

CMDS.rank = async (sock, m, args, ctx) => {
    const xp = S().get(`extra.xp.${ctx.sender}`, 0)
    const l = lvlOf(xp), lo = needFor(l), hi = needFor(l + 1)
    const coins = S().get(`extra.coin.${ctx.sender}`, 0)
    const all = Object.entries(S().get('extra.xp', {})).sort((a, b) => b[1] - a[1])
    const pos = all.findIndex(([n]) => n === ctx.sender) + 1
    ctx.reply(ctx.ui.box('📈 RANK', [
        `👤 @${ctx.sender}`, `⭐ Livello: *${l}*`, `✨ XP: *${xp}* (prossimo: ${hi})`,
        ctx.ui.bar((xp - lo) / (hi - lo) * 100), `🏆 Posizione: *${pos || '-'}°*`, `🪙 Monete: *${coins}*`
    ]), { mentions: [ctx.senderJid] })
}
CMDS.lb = async (sock, m, args, ctx) => {
    const top = Object.entries(S().get('extra.xp', {})).sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (!top.length) return ctx.info('Ancora nessun dato. Scrivete un po\' in chat!')
    const medals = ['🥇', '🥈', '🥉']
    ctx.send({
        text: ctx.ui.box('🏆 CLASSIFICA XP', top.map(([n, xp], i) => `${medals[i] || (i + 1) + '.'} @${n} — Lv *${lvlOf(xp)}* (${xp} xp)`)),
        mentions: top.map(([n]) => toJid(n))
    }, { quoted: m })
}
CMDS.classifica = CMDS.lb

CMDS.daily = async (sock, m, args, ctx) => {
    const k = `extra.daily.${ctx.sender}`
    const d = S().get(k, { last: 0, streak: 0 })
    const el = Date.now() - d.last
    if (el < 20 * 3600e3) return ctx.warn(`Hai già ritirato il bonus. Torna tra *${dur(20 * 3600e3 - el)}*.`)
    const streak = el < 48 * 3600e3 ? d.streak + 1 : 1
    const coins = 100 + Math.min(streak, 7) * 25
    S().set(k, { last: Date.now(), streak })
    S().inc(`extra.coin.${ctx.sender}`, coins)
    S().inc(`extra.xp.${ctx.sender}`, 50)
    ctx.ok(`🪙 +*${coins}* monete e ✨ +*50* xp\n🔥 Serie: *${streak}* giorni`, 'BONUS GIORNALIERO')
}

CMDS.remind = async (sock, m, args, ctx) => {
    const mt = /^(\d+)(s|m|h|g|d)$/i.exec(args[0] || '')
    const text = args.slice(1).join(' ').slice(0, 200)
    if (!mt || !text) return ctx.err(`Uso: *${ctx.prefix}remind 10m comprare il pane*\n(s = secondi, m = minuti, h = ore, g = giorni)`)
    const ms = Number(mt[1]) * { s: 1e3, m: 6e4, h: 36e5, g: 864e5, d: 864e5 }[mt[2].toLowerCase()]
    if (ms < 5000 || ms > 30 * 864e5) return ctx.err('Durata ammessa: da 5 secondi a 30 giorni.')
    const list = S().get('extra.rem', [])
    if (list.filter(r => r.num === ctx.sender).length >= 10) return ctx.err('Hai già 10 promemoria attivi.')
    list.push({ at: Date.now() + ms, jid: ctx.chat, num: ctx.sender, text })
    S().set('extra.rem', list)
    ensureTick()
    ctx.ok(`Ti avviso tra *${dur(ms)}*:\n${text}`)
}
CMDS.promemoria = CMDS.remind

CMDS.calc = async (sock, m, args, ctx) => {
    const raw = args.join(' ').replace(/,/g, '.').replace(/\^/g, '**').replace(/x/gi, '*')
    if (!raw || raw.length > 100 || !/^[0-9+\-*/%().\s]+$/.test(raw)) return ctx.err(`Uso: *${ctx.prefix}calc 12*(3+4)/2*\nSolo numeri e + - * / % ^ ( )`)
    try {
        const r = Function(`"use strict"; return (${raw})`)()
        if (!Number.isFinite(r)) throw 0
        ctx.reply(ctx.ui.box('🧮 CALC', [`${args.join(' ')} = *${Math.round(r * 1e8) / 1e8}*`]))
    } catch { ctx.err('Espressione non valida.') }
}

CMDS.tagall = async (sock, m, args, ctx) => {
    if (!need(ctx, { group: true, admin: true })) return
    const meta = await sock.groupMetadata(ctx.chat)
    const jids = (meta.participants || []).map(p => p.phoneNumber || p.id)
    ctx.send({ text: `📢 *${args.join(' ') || 'Attenzione a tutti!'}*\n\n` + jids.map(j => '• @' + bare(j)).join('\n'), mentions: jids }, { quoted: m })
}

CMDS.dado = async (sock, m, args, ctx) => {
    const n = Math.min(1000, Math.max(2, parseInt(args[0]) || 6))
    ctx.reply(`🎲 d${n}: *${1 + Math.floor(Math.random() * n)}*`)
}
CMDS.scegli = async (sock, m, args, ctx) => {
    const opts = args.join(' ').split(/[|,]/).map(s => s.trim()).filter(Boolean)
    if (opts.length < 2) return ctx.err(`Uso: *${ctx.prefix}scegli pizza | sushi | kebab*`)
    ctx.reply(`🤔 Scelgo: *${opts[Math.floor(Math.random() * opts.length)]}*`)
}

CMDS.extra = async (sock, m, args, ctx) => {
    const p = ctx.prefix
    ctx.reply(ctx.ui.box('✨ ZENO EXTRA', [
        { section: 'Gruppo (admin)' },
        `${p}antilink on|off • ${p}welcome on|off`, `${p}warn @u [motivo] • ${p}warns • ${p}resetwarn @u`, `${p}tagall [testo]`,
        { section: 'Livelli e monete' },
        `${p}rank • ${p}lb • ${p}daily`,
        { section: 'Utilità' },
        `${p}afk [motivo] • ${p}remind 10m testo`, `${p}calc 2*(3+4) • ${p}dado [facce] • ${p}scegli a | b | c`
    ]))
}

module.exports = {
    name: 'zeno-extra', category: 'tools', author: 'ZENO', version: '1.0.0',
    description: 'AFK, antilink, benvenuto, warn, XP/rank, bonus daily, promemoria, calc, tagall, dado, scegli',
    usage: '',
    commands: Object.keys(CMDS),
    onMessage, onGroupParticipants,
    async run(sock, m, args, cmd, ctx) {
        ensureTick()
        const fn = CMDS[String(cmd).toLowerCase()]
        if (fn) return fn(sock, m, args, ctx)
    }
}
