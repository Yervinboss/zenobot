const { isAdmin } = require('../lib/admin')
const { isOwner } = require('../owner')
const perma = require('../lib/perma')

module.exports = {
  commands: ['perma'],
  run: async (sock, m) => {
    const jid = m.key.remoteJid
    if (!jid.endsWith('@g.us')) return sock.sendMessage(jid, { text: '❌ Questo comando può essere usato solo nei gruppi!' }, { quoted: m })

    const sender = m.key.participant || jid
    if (!isOwner(sender) && !(await isAdmin(sock, jid, sender))) {
      return sock.sendMessage(jid, { text: '❌ Solo gli amministratori possono usare .perma.' }, { quoted: m })
    }

    const ctx = m.message.extendedTextMessage?.contextInfo
    const target = ctx?.participant || ctx?.mentionedJid?.[0]
    if (!target) return sock.sendMessage(jid, { text: "❌ Rispondi a un messaggio dell'utente o taggalo!" }, { quoted: m })
    if (isOwner(target)) return sock.sendMessage(jid, { text: '🧠 Non puoi bannare il creatore del bot!' }, { quoted: m })

    try {
      await perma.add(sock, jid, target)
      await sock.groupParticipantsUpdate(jid, [target], 'remove')
      await sock.sendMessage(jid, {
        text: `⛔ @${perma.pure(target)} è stato bannato permanentemente.\nSe rientra, lo rimuovo subito. Per sbannarlo: .sban`,
        mentions: [target]
      }, { quoted: m })
    } catch {
      await sock.sendMessage(jid, { text: '❌ Non sono riuscito a rimuoverlo. Controlla che io sia amministratore.' }, { quoted: m })
    }
  }
}
