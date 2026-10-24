'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO — .cambiafoto  (cambia la foto del gruppo)
//  • invia una foto con didascalia  .cambiafoto
//  • oppure rispondi a una foto con  .cambiafoto
//  • .cambiafoto rimuovi  → toglie la foto del gruppo
//  Solo admin del gruppo e owner. Il bot deve essere admin
//  (a meno che il gruppo lasci modificare le info a tutti).
//  La foto viene ritagliata quadrata in automatico (serve ffmpeg).
// ═══════════════════════════════════════════════════════════════

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const TMP = path.join(os.tmpdir(), 'zeno-gpic')
try { fs.mkdirSync(TMP, { recursive: true }) } catch {}

function getBaileys() {
    for (const n of ['@whiskeysockets/baileys', 'baileys', '@adiwajshing/baileys', '@itsukichan/baileys', '@itsliaaa/baileys']) {
        try { return require(n) } catch {}
    }
    return null
}

const unwrap = (msg) => {
    let x = msg
    for (let i = 0; i < 6 && x; i++) {
        const n = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message ||
            x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message
        if (!n) break
        x = n
    }
    return x
}

// cerca una foto nel messaggio stesso o in quello a cui si risponde
function findImageNode(m) {
    const root = unwrap(m.message || m.msg || {})
    const ci = root?.extendedTextMessage?.contextInfo || root?.imageMessage?.contextInfo ||
        root?.videoMessage?.contextInfo || root?.documentMessage?.contextInfo
    const quoted = unwrap(ci?.quotedMessage)
    for (const c of [root, quoted]) {
        if (!c) continue
        if (c.imageMessage) return { type: 'image', node: c.imageMessage }
        if (c.documentMessage && /^image\//.test(c.documentMessage.mimetype || '')) return { type: 'document', node: c.documentMessage }
    }
    return null
}

// c'è un video/gif invece di una foto?
function hasVideo(m) {
    const root = unwrap(m.message || m.msg || {})
    const ci = root?.extendedTextMessage?.contextInfo || root?.videoMessage?.contextInfo
    const quoted = unwrap(ci?.quotedMessage)
    return !!(root?.videoMessage || quoted?.videoMessage)
}

async function downloadNode(node, type) {
    const B = getBaileys()
    if (!B || typeof B.downloadContentFromMessage !== 'function') throw new Error('Baileys non trovato')
    const stream = await B.downloadContentFromMessage(node, type)
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}

// ritaglio quadrato 640x640 (se ffmpeg non c'è uso la foto com'è)
function squareJpeg(buf) {
    return new Promise((resolve) => {
        const id = Date.now() + '_' + Math.floor(Math.random() * 1e5)
        const tin = path.join(TMP, `in_${id}`)
        const tout = path.join(TMP, `out_${id}.jpg`)
        const done = (b) => {
            try { fs.unlinkSync(tin) } catch {}
            try { fs.unlinkSync(tout) } catch {}
            resolve(b)
        }
        try { fs.writeFileSync(tin, buf) } catch { return resolve(buf) }
        execFile('ffmpeg', ['-y', '-i', tin, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=640:640",
            '-frames:v', '1', '-q:v', '3', tout], { timeout: 60000 }, (err) => {
            if (err || !fs.existsSync(tout)) return done(buf)
            try { done(fs.readFileSync(tout)) } catch { done(buf) }
        })
    })
}

const num = (j) => String(j || '').split('@')[0].split(':')[0]
const isIn = (p, jid) => {
    const n = num(jid)
    return n && [p.id, p.lid, p.phoneNumber, p.jid].some(x => x && num(x) === n)
}

module.exports = {
    name: 'cambiafoto',
    commands: ['cambiafoto', 'setfotogruppo'],
    category: 'moderazione',
    description: 'Cambia la foto del gruppo (foto o risposta a una foto)',
    usage: '[rimuovi]',
    author: 'ZENO',

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        const sender = m.key.participant || m.participant || chatId
        const P = (ctx && ctx.prefix) || '.'

        const reply = (c) => (ctx && typeof ctx.reply === 'function')
            ? ctx.reply(c)
            : sock.sendMessage(chatId, typeof c === 'string' ? { text: c } : c, { quoted: m })
        const err = (t) => (ctx && typeof ctx.err === 'function') ? ctx.err(t) : reply(t)
        const react = (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: m.key } }).catch(() => {})

        if (!chatId.endsWith('@g.us')) return err('Questo comando funziona solo nei gruppi.')

        // ── permessi: admin o owner ──
        let senderAdmin = ctx && typeof ctx.isAdmin === 'boolean' ? ctx.isAdmin : null
        const isOwner = !!(ctx && ctx.isOwner)
        if (senderAdmin === null && !isOwner) {
            try {
                const meta = await sock.groupMetadata(chatId)
                const me = (meta.participants || []).find(p => isIn(p, sender))
                senderAdmin = !!(me && (me.admin === 'admin' || me.admin === 'superadmin'))
            } catch { senderAdmin = false }
        }
        if (!isOwner && !senderAdmin) return err('Solo gli *admin* del gruppo possono cambiare la foto.')

        const arg = (Array.isArray(args) ? args[0] : '') || ''

        // ── rimuovi la foto ──
        if (/^(rimuovi|togli|elimina|reset|remove)$/i.test(arg)) {
            try {
                await sock.removeProfilePicture(chatId)
            } catch (e) {
                console.error('[cambiafoto] rimozione:', e && e.message)
                return err(/not-authorized|forbidden|403/i.test(String(e && e.message))
                    ? 'Il bot deve essere *admin* del gruppo per farlo.'
                    : 'Non sono riuscito a rimuovere la foto.')
            }
            await react('✅')
            return reply('🗑️ Foto del gruppo rimossa.')
        }

        // ── trovo la foto ──
        const found = findImageNode(m)
        if (!found) {
            if (hasVideo(m)) return err('Serve una *foto*, non un video. Manda un\'immagine.')
            return err(`Invia una *foto* con didascalia *${P}cambiafoto*,\noppure rispondi a una foto con *${P}cambiafoto*.\nPer toglierla: *${P}cambiafoto rimuovi*`)
        }

        await react('⏳')
        let buf
        try {
            buf = await downloadNode(found.node, found.type === 'document' ? 'document' : 'image')
        } catch (e) {
            console.error('[cambiafoto] download:', e && e.message)
            return err('Non sono riuscito a scaricare la foto, riprova.')
        }
        if (!buf || !buf.length) return err('La foto è vuota, riprova.')

        const img = await squareJpeg(buf)

        // ── imposto la foto: prima il metodo normale, poi quello diretto ──
        try {
            await sock.updateProfilePicture(chatId, img)
        } catch (e1) {
            console.error('[cambiafoto] updateProfilePicture:', e1 && e1.message)
            try {
                await sock.query({
                    tag: 'iq',
                    attrs: { target: chatId, to: '@s.whatsapp.net', type: 'set', xmlns: 'w:profile:picture' },
                    content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }]
                })
            } catch (e2) {
                console.error('[cambiafoto] query:', e2 && e2.message)
                const msg = String((e2 && e2.message) || (e1 && e1.message) || '')
                return err(/not-authorized|forbidden|403/i.test(msg)
                    ? 'Il bot deve essere *admin* del gruppo per cambiare la foto.'
                    : 'Non sono riuscito a cambiare la foto, riprova con un\'altra immagine.')
            }
        }

        await react('✅')
        return reply('✅ Foto del gruppo aggiornata!')
    }
}
