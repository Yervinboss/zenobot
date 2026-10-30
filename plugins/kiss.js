const fs = require('fs')

const frasi = [
  'sei stato/a baciato/a con passione',
  'sei stato/a baciato/a dolcemente',
  'sei stato/a baciato/a a sorpresa',
  'sei stato/a baciato/a a stampo',
  'sei stato/a baciato/a in modo schifato'
]

module.exports = {
  commands: ['kiss', 'bacio', 'bacia'],
  run: async (sock, m) => {
    const jid = m.key.remoteJid
    const sender = m.key.participant || jid
    const ctx = m.message.extendedTextMessage?.contextInfo
    const target = ctx?.mentionedJid?.[0] || ctx?.participant
    if (!target) return sock.sendMessage(jid, { text: 'Tagga qualcuno o rispondi a un suo messaggio 💋' }, { quoted: m })

    const loc = { name: 'BACIO' }
    if (fs.existsSync('./media/bacio.jpg')) loc.jpegThumbnail = fs.readFileSync('./media/bacio.jpg')

    const card = {
      key: { participants: '0@s.whatsapp.net', fromMe: false, id: 'Halo' },
      message: { locationMessage: loc },
      participant: '0@s.whatsapp.net'
    }

    const frase = frasi[Math.floor(Math.random() * frasi.length)]
    const line = '══════•⊰✰⊱•══════'
    const text = `${line}\n@${target.split('@')[0]} ${frase} da @${sender.split('@')[0]}\n${line}`
    await sock.sendMessage(jid, { text, mentions: [target, sender] }, { quoted: card })
  }
}
