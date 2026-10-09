const { isAdmin } = require('../lib/admin');
const { isOwner } = require('../owner')
const compat = require('../compat')

function pureId(jid) { return jid ? jid.replace(/[^0-9]/g, '') : '' }

async function isAdminOld(sock, jid, sender) {
  try {
    const meta = await sock.groupMetadata(jid)
    const senderPure = pureId(sender)
    return !!meta.participants.find(p => pureId(p.id) === senderPure && p.admin)
  } catch { return false }
}

module.exports = {
  commands: ['kick'],
  run: async (sock, m) => {
    const jid = m.key.remoteJid
    if (!jid.endsWith('@g.us')) return sock.sendMessage(jid, { text: '❌ Questo comando può essere usato solo nei gruppi!' }, { quoted: m })

    const sender = m.key.participant || jid
    if (!isOwner(sender) && !(await isAdmin(sock, jid, sender))) {
      return sock.sendMessage(jid, { text: '❌ Solo gli amministratori possono usare .kick.' }, { quoted: m })
    }

    const ctx = m.message.extendedTextMessage?.contextInfo
    const target = ctx?.participant || ctx?.mentionedJid?.[0]
    if (!target) return sock.sendMessage(jid, { text: "❌ Rispondi a un messaggio dell'utente o taggalo!" }, { quoted: m })
    if (isOwner(target)) return sock.sendMessage(jid, { text: '🧠 Non puoi rimuovere il creatore del bot!' }, { quoted: m })

    try {
      await sock.groupParticipantsUpdate(jid, [target], 'remove')
      await sock.sendMessage(jid, { text: `🚫 @${pureId(target)} è stato rimosso dal gruppo.`, mentions: [target] }, { quoted: m })
    } catch {
      await sock.sendMessage(jid, { text: '❌ Non sono riuscito a rimuoverlo. Controlla che io sia amministratore.' }, { quoted: m })
    }
  }
}
