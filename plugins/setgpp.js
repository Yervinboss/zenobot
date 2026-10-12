// ZENO ULTIMATE — .setgpp : cambia la foto profilo del gruppo
// Uso: rispondi a una foto con .setgpp  (oppure manda la foto con .setgpp in didascalia)
const { downloadContentFromMessage } = require('@whiskeysockets/baileys')

async function download(imageMessage) {
    const stream = await downloadContentFromMessage(imageMessage, 'image')
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}

module.exports = {
    commands: ['setgpp', 'gpp', 'fotogruppo'],
    name: 'setgpp',
    category: 'moderazione',
    description: 'Cambia la foto del gruppo (rispondi a una foto)',
    usage: '(rispondi a una foto)',
    groupOnly: true,
    adminOnly: true,
    cooldown: 5000,

    async run(sock, m) {
        const jid = m.key.remoteJid
        const msg = m.message || {}
        const ci = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || {}

        let quoted = ci.quotedMessage
        quoted = quoted?.viewOnceMessage?.message || quoted?.viewOnceMessageV2?.message || quoted
        const img = quoted?.imageMessage || msg.imageMessage

        if (!img) {
            return sock.sendMessage(jid, { text: '📸 *FOTO GRUPPO*\n\nRispondi a una foto con *.setgpp* per usarla come foto del gruppo.' }, { quoted: m })
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } })
        try {
            const buffer = await download(img)
            if (!buffer?.length) throw new Error('download vuoto')
            await sock.updateProfilePicture(jid, buffer)
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } })
            return sock.sendMessage(jid, { text: '✅ *Foto del gruppo aggiornata!*' }, { quoted: m })
        } catch (e) {
            console.error('[SETGPP]', e.message)
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } })
            return sock.sendMessage(jid, { text: '❌ Non sono riuscito a cambiare la foto.\nControlla che il bot sia *admin* del gruppo e riprova con un\'altra immagine.' }, { quoted: m })
        }
    }
}
