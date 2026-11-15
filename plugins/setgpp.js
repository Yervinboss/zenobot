// ZENO ULTIMATE — .setgpp : cambia la foto profilo del gruppo
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const run = promisify(execFile)

const LIBS = ['@itsliaaa/baileys', '@chatunity/baileys', '@whiskeysockets/baileys', 'baileys']
let dl = null
async function getDownloader() {
    if (dl) return dl
    for (const lib of LIBS) {
        try {
            const mod = await import(lib)
            const fn = mod.downloadContentFromMessage || mod.default?.downloadContentFromMessage
            if (fn) return (dl = fn)
        } catch {}
    }
    throw new Error('downloadContentFromMessage non trovato')
}

const unwrap = (x) =>
    x?.ephemeralMessage?.message ||
    x?.viewOnceMessage?.message ||
    x?.viewOnceMessageV2?.message ||
    x?.documentWithCaptionMessage?.message || x

async function squareJpg(buf) {
    const stamp = Date.now()
    const inp = path.join(__dirname, `gpp_${stamp}.in`)
    const out = path.join(__dirname, `gpp_${stamp}.jpg`)
    try {
        fs.writeFileSync(inp, buf)
        await run('ffmpeg', ['-y', '-i', inp, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=640:640", '-frames:v', '1', '-q:v', '3', out], { timeout: 60000 })
        return fs.readFileSync(out)
    } finally {
        for (const f of [inp, out]) { try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {} }
    }
}

async function setGroupPicture(sock, groupJid, img) {
    await sock.updateProfilePicture(groupJid, img)
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
        const say = (t) => sock.sendMessage(jid, { text: t }, { quoted: m })
        const react = (e) => sock.sendMessage(jid, { react: { text: e, key: m.key } }).catch(() => {})

        const msg = unwrap(unwrap(m.message)) || {}
        const ci = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || {}
        const quoted = unwrap(unwrap(ci.quotedMessage))
        const img = quoted?.imageMessage || msg.imageMessage

        if (!img) {
            return say('📸 *FOTO GRUPPO*\n\nRispondi a una foto con *.setgpp* per usarla come foto del gruppo.')
        }

        await react('⏳')
        try {
            const download = await getDownloader()
            const stream = await download(img, 'image')
            let buffer = Buffer.alloc(0)
            for await (const c of stream) buffer = Buffer.concat([buffer, c])
            if (!buffer.length) throw new Error('download vuoto')

            const photo = await squareJpg(buffer)
            await setGroupPicture(sock, jid, photo)
            await react('✅')
            return say('✅ *Foto del gruppo aggiornata!*')
        } catch (e) {
            console.error('[SETGPP]', e)
            await react('❌')
            return say(`❌ Non sono riuscito a cambiare la foto: ${e.message}\n\nControlla che il bot sia *admin* del gruppo.`)
        }
    }
}
