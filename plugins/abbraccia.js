const fs = require('fs')

module.exports = {
  commands: ['abbraccia', 'abbraccio'],
  run: async (sock, m) => {
    const jid = m.key.remoteJid
    const sender = m.key.participant || jid
    const ctx = m.message.extendedTextMessage?.contextInfo
    const target = ctx?.mentionedJid?.[0] || ctx?.participant
    if (!target) return sock.sendMessage(jid, { text: 'Tagga qualcuno o rispondi a un suo messaggio 🫂' }, { quoted: m })

    const loc = { name: 'ABBRACCIO' }
    if (fs.existsSync('./media/abbraccio.jpg')) loc.jpegThumbnail = fs.readFileSync('./media/abbraccio.jpg')

    const card = {
      key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'Halo' },
      message: { locationMessage: loc },
      participant: '0@s.whatsapp.net'
    }

    const line = '══════•⊰✰⊱•══════'
    const text = `${line}\n@${target.split('@')[0]} sei stato/a abbracciato/a da @${sender.split('@')[0]}\n${line}`
    await sock.sendMessage(jid, { text, mentions: [target, sender] }, { quoted: card })
  }
}
