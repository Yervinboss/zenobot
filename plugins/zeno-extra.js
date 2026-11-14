'use strict'
// ═══ ZENO EXTRA — solo comandi nuovi: calc, dado, moneta, scegli, 8ball, sondaggio, nota, tagall ═══
const bare = (j = '') => String(j).split('@')[0].split(':')[0]
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const CMDS = {}

CMDS.calc = async (sock, m, args, ctx) => {
    const raw = args.join(' ').replace(/,/g, '.').replace(/\^/g, '**').replace(/x/gi, '*')
    if (!raw || raw.length > 100 || !/^[0-9+\-*/%().\s]+$/.test(raw)) return ctx.err(`Uso: *${ctx.prefix}calc 12*(3+4)/2*\nSolo numeri e + - * / % ^ ( )`)
    try {
        const r = Function(`"use strict"; return (${raw})`)()
        if (!Number.isFinite(r)) throw 0
        ctx.reply(ctx.ui.box('🧮 CALC', [`${args.join(' ')} = *${Math.round(r * 1e8) / 1e8}*`]))
    } catch { ctx.err('Espressione non valida.') }
}
CMDS.dado = async (sock, m, args, ctx) => {
    const n = Math.min(1000, Math.max(2, parseInt(args[0]) || 6))
    ctx.reply(`🎲 d${n}: *${1 + Math.floor(Math.random() * n)}*`)
}
CMDS.moneta = async (sock, m, args, ctx) => ctx.reply(`🪙 *${pick(['Testa', 'Croce'])}*`)
CMDS.scegli = async (sock, m, args, ctx) => {
    const opts = args.join(' ').split(/[|,]/).map(s => s.trim()).filter(Boolean)
    if (opts.length < 2) return ctx.err(`Uso: *${ctx.prefix}scegli pizza | sushi | kebab*`)
    ctx.reply(`🤔 Scelgo: *${pick(opts)}*`)
}
CMDS['8ball'] = async (sock, m, args, ctx) => {
    if (!args.length) return ctx.err(`Fai una domanda.\nUso: *${ctx.prefix}8ball ce la farò?*`)
    ctx.reply(`🎱 ${pick(['Assolutamente sì', 'Molto probabile', 'Sì', 'Forse', 'Non è chiaro, riprova', 'Meglio non dirtelo ora', 'Non ci contare', 'Probabilmente no', 'Assolutamente no'])}`)
}
CMDS.sondaggio = async (sock, m, args, ctx) => {
    const parts = args.join(' ').split('|').map(s => s.trim()).filter(Boolean)
    if (parts.length < 3 || parts.length > 13) return ctx.err(`Uso: *${ctx.prefix}sondaggio Domanda | opzione 1 | opzione 2*\n(da 2 a 12 opzioni)`)
    await ctx.poll(parts[0], parts.slice(1), 1)
}
CMDS.nota = async (sock, m, args, ctx) => {
    const list = ctx.db.notes.get(ctx.sender, [])
    const sub = (args[0] || '').toLowerCase()
    if (sub === 'add' || sub === 'aggiungi') {
        const text = args.slice(1).join(' ').slice(0, 300)
        if (!text) return ctx.err(`Uso: *${ctx.prefix}nota add testo*`)
        if (list.length >= 30) return ctx.err('Hai già 30 note: cancellane qualcuna.')
        list.push({ t: Date.now(), text })
        ctx.db.notes.set(ctx.sender, list)
        return ctx.ok(`Nota *#${list.length}* salvata.`)
    }
    if (sub === 'del' || sub === 'rimuovi') {
        const i = parseInt(args[1]) - 1
        if (!(i >= 0 && i < list.length)) return ctx.err(`Uso: *${ctx.prefix}nota del <numero>*`)
        const [r] = list.splice(i, 1)
        ctx.db.notes.set(ctx.sender, list)
        return ctx.ok(`Nota cancellata:\n${r.text}`)
    }
    if (!list.length) return ctx.info(`Nessuna nota.\nAggiungi: *${ctx.prefix}nota add testo*`)
    ctx.reply(ctx.ui.box('📝 LE TUE NOTE', list.map((n, i) => `*${i + 1}.* ${n.text}`), { footer: `${ctx.prefix}nota add • ${ctx.prefix}nota del <n>` }))
}
CMDS.tagall = async (sock, m, args, ctx) => {
    if (!ctx.isGroup) return ctx.err('Questo comando funziona solo nei gruppi.')
    if (!ctx.isAdmin) return ctx.err('Solo gli admin possono usarlo.')
    const meta = await sock.groupMetadata(ctx.chat)
    const jids = (meta.participants || []).map(p => p.phoneNumber || p.id)
    ctx.send({ text: `📢 *${args.join(' ') || 'Attenzione a tutti!'}*\n\n` + jids.map(j => '• @' + bare(j)).join('\n'), mentions: jids }, { quoted: m })
}
CMDS.extra = async (sock, m, args, ctx) => {
    const p = ctx.prefix
    ctx.reply(ctx.ui.box('✨ ZENO EXTRA', [
        `${p}calc 2*(3+4) • ${p}dado [facce] • ${p}moneta`, `${p}scegli a | b | c • ${p}8ball domanda`,
        `${p}sondaggio Domanda | a | b`, `${p}nota add|del|(vuoto) • ${p}tagall [testo]`
    ]))
}

module.exports = {
    name: 'zeno-extra', category: 'funzioni', author: 'ZENO', version: '2.0.0',
    description: 'Calc, dado, moneta, scegli, 8ball, sondaggio, note personali, tagall',
    usage: '',
    commands: Object.keys(CMDS),
    async run(sock, m, args, cmd, ctx) {
        const fn = CMDS[String(cmd).toLowerCase()]
        if (fn) return fn(sock, m, args, ctx)
    }
}
