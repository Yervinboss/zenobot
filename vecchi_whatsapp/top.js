const topdb = require('../lib/top')

const pure = (j) => j ? String(j).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : ''

module.exports = {
  commands: ['top'],
  run: async (sock, m) => {
    const jid = m.key.remoteJid
    if (!jid.endsWith('@g.us')) return sock.sendMessage(jid, { text: '❌ Questo comando può essere usato solo nei gruppi!' }, { quoted: m })

    const lista = topdb.top(jid, 5)
    if (!lista.length) {
      return sock.sendMessage(jid, { text: '📊 Non ho ancora contato nessun messaggio in questo gruppo. Scrivete un po\' e riprova!' }, { quoted: m })
    }

    const medaglie = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
    const righe = lista.map(([who, n], i) => `${medaglie[i]} @${pure(who)} — *${n}* messaggi`)

    await sock.sendMessage(jid, {
      text: `🏆 *TOP 5 CHI SCRIVE DI PIÙ*\n\n${righe.join('\n')}\n\n📊 Messaggi totali contati: *${topdb.total(jid)}*`,
      mentions: lista.map(([who]) => who)
    }, { quoted: m })
  }
}
