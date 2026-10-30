const zx = require('../lib/zx')
const store = require('../lib/store')
const REG = store('regole')
const when = (s) => s ? new Date(s * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/D'

module.exports = {
    commands: ['gruppo', 'infogruppo', 'admins', 'listadmin', 'setnome', 'setdesc', 'resetlink', 'add', 'aggiungi', 'regole', 'setregole'],
    name: 'gruppo_tools',
    category: 'moderazione',
    groupOnly: true,
    cooldown: 2500,
    description: 'Info gruppo, chiama gli admin, regole, nome, descrizione, reset link, aggiungi',

    async run(sock, m, args, cmd, ctx) {
        const z = zx(sock, m, ctx), jid = z.jid
        const isAdm = !!(ctx && ctx.isAdmin)
        const text = (ctx && ctx.argsText != null ? ctx.argsText : args.join(' ')).trim()
        const onlyAdmin = () => z.err(`Solo gli admin possono usare *.${cmd}*.`)

        try {
            // ─── INFO GRUPPO ───
            if (cmd === 'gruppo' || cmd === 'infogruppo') {
                const meta = await sock.groupMetadata(jid)
                const adm = meta.participants.filter(p => p.admin)
                const lines = [
                    `Nome: *${meta.subject}*`,
                    `Membri: *${meta.participants.length}* • Admin: *${adm.length}*`,
                    `Creato il: *${when(meta.creation)}*`,
                    `Chi scrive: *${meta.announce ? 'solo admin' : 'tutti'}*`,
                    `Chi modifica info: *${meta.restrict ? 'solo admin' : 'tutti'}*`
                ]
                if (meta.desc) lines.push('---', { raw: '📝 ' + String(meta.desc).slice(0, 300) })
                const caption = z.box('INFO GRUPPO', lines)
                let pic; try { pic = await sock.profilePictureUrl(jid, 'image') } catch {}
                if (pic) { try { return await sock.sendMessage(jid, { image: { url: pic }, caption }, { quoted: m }) } catch {} }
                return z.reply(caption)
            }

            // ─── CHIAMA GLI ADMIN ───
            if (cmd === 'admins' || cmd === 'listadmin') {
                const meta = await sock.groupMetadata(jid)
                const adm = meta.participants.filter(p => p.admin)
                const lines = [...(text ? [{ raw: '📢 ' + text }, '---'] : []),
                    ...adm.map(p => ({ raw: `${p.admin === 'superadmin' ? '👑' : '🛡️'} @${p.id.split('@')[0]}` }))]
                return z.reply(z.box('ADMIN DEL GRUPPO', lines), adm.map(p => p.id))
            }

            // ─── REGOLE ───
            if (cmd === 'regole') {
                const r = REG.data[jid]
                if (!r) return z.info('Nessuna regola impostata.\nGli admin possono usare *.setregole <testo>*')
                return z.reply(z.box('REGOLE DEL GRUPPO', [{ raw: r }]))
            }
            if (cmd === 'setregole') {
                if (!isAdm) return onlyAdmin()
                if (!text) return z.err('Uso: *.setregole <testo>*\nPer cancellarle: *.setregole reset*')
                if (text.toLowerCase() === 'reset') { delete REG.data[jid]; REG.save(); return z.ok('Regole cancellate.') }
                REG.data[jid] = text.slice(0, 1500); REG.save()
                return z.ok('Regole salvate! Chiunque può leggerle con *.regole*')
            }

            // ─── DA QUI SOLO ADMIN ───
            if (!isAdm) return onlyAdmin()

            if (cmd === 'setnome') {
                if (!text) return z.err('Uso: *.setnome <nuovo nome>*')
                await sock.groupUpdateSubject(jid, text.slice(0, 100))
                return z.ok(`Nome cambiato in *${text.slice(0, 100)}*`)
            }
            if (cmd === 'setdesc') {
                if (!text) return z.err('Uso: *.setdesc <descrizione>*  (o *reset* per toglierla)')
                await sock.groupUpdateDescription(jid, text.toLowerCase() === 'reset' ? undefined : text.slice(0, 2000))
                return z.ok('Descrizione aggiornata.')
            }
            if (cmd === 'resetlink') {
                const code = await sock.groupRevokeInvite(jid)
                return z.reply(z.box('LINK RESETTATO', [{ raw: 'Il vecchio link non funziona più.\nhttps://chat.whatsapp.com/' + code }]))
            }
            if (cmd === 'add' || cmd === 'aggiungi') {
                const num = (args[0] || '').replace(/\D/g, '')
                if (num.length < 8) return z.err('Uso: *.add 39333xxxxxxx*  (numero con prefisso)')
                const target = num + '@s.whatsapp.net'
                const res = await sock.groupParticipantsUpdate(jid, [target], 'add')
                const st = String(res && res[0] && res[0].status || '')
                if (st === '200') return z.ok(`@${num} aggiunto al gruppo!`, [target])
                if (st === '409') return z.warn('È già nel gruppo.')
                if (st === '408') return z.warn('Ha lasciato da poco il gruppo: riprova più tardi.')
                if (st === '403') {
                    try {
                        const code = await sock.groupInviteCode(jid)
                        const meta = await sock.groupMetadata(jid)
                        await sock.sendMessage(target, { text: `Ciao! Sei stato invitato nel gruppo *${meta.subject}*:\nhttps://chat.whatsapp.com/${code}` })
                        return z.info('Per la sua privacy non posso aggiungerlo: gli ho mandato il link d\'invito in privato.')
                    } catch { return z.err('Privacy attiva e non riesco a mandargli l\'invito.') }
                }
                return z.err('Non sono riuscito ad aggiungerlo (numero non valido?).')
            }
        } catch (e) {
            return z.err('Operazione non riuscita. Controlla che il bot sia *admin* del gruppo.')
        }
    }
}
