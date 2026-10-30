const { isAdmin } = require('../lib/admin')
const { isOwner } = require('../lib/owner')
const perma = require('../lib/perma')

module.exports = {
  commands: ['sban'],
  run: async (sock, m, args) => {
    const jid = m.key.remoteJid
    if (!jid.endsWith('@g.us')) return sock.sendMessage(jid, { text: '❌ Questo comando può essere usato solo nei gruppi!' }, { quoted: m })

    const sender = m.key.participant || jid
    if (!isOwner(sender) && !(await isAdmin(sock, jid, sender))) {
      return sock.sendMessage(jid, { text: '❌ Solo gli amministratori possono usare .sban.' }, { quoted: m })
    }

    const ctx = m.message.extendedTextMessage?.contextInfo
    let target = ctx?.participant || ctx?.mentionedJid?.[0]
    const num = (args || []).join('').replace(/[^0-9]/g, '')
    if (!target && num) target = `${num}@s.whatsapp.net`

    if (!target) {
      const l = perma.list(jid)
      if (!l.length) return sock.sendMessage(jid, { text: '✅ Nessun utente bannato in questo gruppo.' }, { quoted: m })
      return sock.sendMessage(jid, { text: `⛔ *Bannati (perma):*\n\n${l.map(x => '• ' + x).join('\n')}\n\nPer sbannare: .sban numero` }, { quoted: m })
    }

    const n = await perma.remove(sock, jid, target)
    if (!n) return sock.sendMessage(jid, { text: '⚠️ Questo utente non risulta bannato.' }, { quoted: m })
    await sock.sendMessage(jid, { text: `✅ @${perma.pure(target)} è stato sbannato, può rientrare.`, mentions: [target] }, { quoted: m })
  }
}
