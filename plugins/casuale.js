// ZENO ULTIMATE — .casuale : manda una canzone a caso dalla tua playlist (.pl)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')
const run = promisify(exec)

const PL = path.join(__dirname, '../playlist_db.json')
const readPl = () => { try { return JSON.parse(fs.readFileSync(PL, 'utf8')) } catch { return {} } }

module.exports = {
    commands: ['casuale', 'random', 'shuffle'],
    name: 'casuale',
    category: 'musica',
    description: 'Una canzone a caso dalla tua playlist (.pl)',
    cooldown: 8000,

    async run(sock, m) {
        const jid = m.key.remoteJid
        const sender = m.key.participant || m.participant || jid
        const tracks = readPl()[sender] || []

        if (!tracks.length) {
            return sock.sendMessage(jid, { text: '🎲 La tua playlist è vuota!\nCerca un brano con *.song <titolo>* e premi "➕ Aggiungi a .PL".' }, { quoted: m })
        }

        const t = tracks[Math.floor(Math.random() * tracks.length)]
        await sock.sendMessage(jid, { react: { text: '🎲', key: m.key } })
        await sock.sendMessage(jid, { text: `🎲 *Canzone casuale*\n\n📌 ${t.title}${t.duration ? `\n⏱ ${t.duration}` : ''}\n\n_Sto preparando l'audio..._` }, { quoted: m })

        const id = Date.now()
        const mp3 = path.join(os.tmpdir(), `zeno_rnd_${id}.mp3`)
        const ogg = path.join(os.tmpdir(), `zeno_rnd_${id}.ogg`)
        try {
            await run(`yt-dlp -x --audio-format mp3 --audio-quality 192k --extractor-args youtube:player-client=android,web -o "${mp3}" "${t.url}"`, { timeout: 120000 })
            await run(`ffmpeg -y -i "${mp3}" -c:a libopus -b:a 128k -ar 48000 -ac 1 -f ogg "${ogg}"`, { timeout: 60000 })
            await sock.sendMessage(jid, { audio: fs.readFileSync(ogg), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m })
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } })
        } catch (e) {
            console.error('[CASUALE]', e.message)
            await sock.sendMessage(jid, { text: '❌ Errore nel scaricare il brano, riprova (*.casuale*).' }, { quoted: m })
        } finally {
            for (const f of [mp3, ogg]) { try { fs.unlinkSync(f) } catch {} }
        }
    }
}
