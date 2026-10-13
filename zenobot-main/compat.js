const fs = require('fs')

module.exports = (sock) => (m, body, command, text) => {
  m.chat = m.key.remoteJid
  m.sender = m.key.participant || m.key.remoteJid
  const ctx = m.message?.extendedTextMessage?.contextInfo
  m.mentionedJid = ctx?.mentionedJid || []
  if (ctx?.participant) m.quoted = { sender: ctx.participant }
  const conn = {
    sendMessage: (jid, content, opt) => sock.sendMessage(jid, content, opt),
    groupMetadata: (jid) => sock.groupMetadata(jid),
    groupParticipantsUpdate: (jid, ids, action) => sock.groupParticipantsUpdate(jid, ids, action)
  }
  return { conn, text, command }
}
