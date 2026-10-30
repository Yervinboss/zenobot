const { pureId, getTarget } = require('../lib/utils')
const R = require('../lib/rpg')
const zx = require('../lib/zx')
const DAY = 864e5

module.exports = {
    commands: ['daily', 'giornaliero', 'bonus', 'paga', 'dai', 'classifica', 'top10', 'profilo', 'me'],
    name: 'rpg_extra',
    category: 'rpg',
    cooldown: 2500,
    description: 'Bonus giornaliero con serie, paga un amico, classifica e profilo RPG',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx), jid = z.jid
        const sender = m.key.participant || m.key.remoteJid
        const id = pureId(sender)
        const db = R.read(), u = R.user(db, id), now = Date.now()

        if (['daily', 'giornaliero', 'bonus'].includes(cmd)) {
            const left = (u.lastDaily || 0) + DAY - now
            if (left > 0) return z.warn(`Hai già ritirato il bonus di oggi.\nRiprova tra *${Math.floor(Math.ceil(left / 6e4) / 60)}h ${Math.ceil(left / 6e4) % 60}m*.`)
            u.streak = (now - (u.lastDaily || 0) < 2 * DAY) ? (u.streak || 0) + 1 : 1
            const k = Math.min(u.streak, 7)
            const money = 1000 + k * 250, xp = 40 + k * 10
            u.money += money; u.lastDaily = now
            const up = R.addXp(u, xp)
            R.write(db)
            return z.reply(z.box('🎁 BONUS GIORNALIERO', [
                `Soldi: *+${R.eur(money)}*  •  XP: *+${xp}*`,
                `Serie: *${u.streak}* giorni ${'🔥'.repeat(k)}`,
                up ? `🎉 Sei salito al *livello ${u.level}*!` : null,
                '---', { raw: `Saldo: *${R.eur(u.money)}*\n_Torna domani: più giorni di fila = bonus più alto (fino a 7)._` }
            ]))
        }

        if (cmd === 'paga' || cmd === 'dai') {
            const t = getTarget(m)
            const amount = parseInt(args.find(a => /^\d+$/.test(a)))
            if (t.source === 'self' || !amount) return z.err('Uso: *.paga @utente <importo>*\noppure rispondi a un suo messaggio con *.paga 500*')
            const tid = pureId(t.jid)
            if (tid === id) return z.err('Non puoi pagare te stesso.')
            if (amount < 1) return z.err('Importo non valido.')
            if (u.money < amount) return z.err(`Non hai abbastanza soldi. Saldo: *${R.eur(u.money)}*`)
            const tu = R.user(db, tid)
            u.money -= amount; tu.money += amount
            R.write(db)
            return z.reply(z.box('💸 PAGAMENTO', [{ raw: `@${id} → @${tid}\nImporto: *${R.eur(amount)}*\nIl tuo saldo: *${R.eur(u.money)}*` }]), [sender, t.jid])
        }

        if (cmd === 'classifica' || cmd === 'top10') {
            const byLvl = /liv|lvl|xp/i.test(args[0] || '')
            const rows = Object.entries(db)
                .map(([i, x]) => ({ i, v: byLvl ? (x.level || 1) * 100000 + (x.xp || 0) : (x.money || 0), x }))
                .sort((a, b) => b.v - a.v).slice(0, 10)
            const medal = ['🥇', '🥈', '🥉']
            return z.reply(z.box(byLvl ? '🏆 CLASSIFICA LIVELLI' : '💰 CLASSIFICA RICCHI', [
                ...rows.map((r, n) => ({ raw: `${medal[n] || (n + 1) + '.'} @${r.i} — ${byLvl ? `Lv *${r.x.level || 1}*` : `*${R.eur(r.x.money)}*`}` })),
                '---', { raw: '_Cambia: .classifica soldi • .classifica livello_' }
            ]), rows.map(r => r.i + '@s.whatsapp.net'))
        }

        // profilo
        const t = getTarget(m)
        const tid = t.source === 'self' ? id : pureId(t.jid)
        const tj = t.source === 'self' ? sender : t.jid
        const p = R.user(db, tid)
        const pct = Math.round(p.xp / R.need(p.level) * 100)
        const bar = '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10))
        const rank = Object.values(db).filter(x => (x.money || 0) > (p.money || 0)).length + 1
        const wife = p.spouse ? `💍 Sposato/a con @${p.spouse}` : null
        const caption = z.box('👤 PROFILO', [
            { raw: `@${tid}` },
            `Livello: *${p.level}*  ${bar} ${pct}%`,
            `Soldi: *${R.eur(p.money)}* (n° ${rank} tra i ricchi)`,
            p.streak ? `Serie daily: *${p.streak}* 🔥` : null, wife
        ])
        let pic; try { pic = await sock.profilePictureUrl(tj, 'image') } catch {}
        const mentions = [tj].concat(p.spouse ? [p.spouse + '@s.whatsapp.net'] : [])
        if (pic) { try { return await sock.sendMessage(jid, { image: { url: pic }, caption, mentions }, { quoted: m }) } catch {} }
        return z.reply(caption, mentions)
    }
}
