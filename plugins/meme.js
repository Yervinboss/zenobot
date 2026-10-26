'use strict'

const Jimp = require('jimp')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SIZES = [128, 64, 32, 16]
const fontCache = {}

async function getFont(size, color) {
    const key = `${size}_${color}`
    if (!fontCache[key]) fontCache[key] = await Jimp.loadFont(Jimp[`FONT_SANS_${size}_${color}`])
    return fontCache[key]
}

function ffmpegRun(args) {
    return new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args])
        let err = ''
        p.stderr.on('data', d => { err += d })
        p.on('error', reject)
        p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`)))
    })
}

async function convert(buffer, inExt, outExt, vf) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const inp = path.join(os.tmpdir(), `meme_${id}.${inExt}`)
    const out = path.join(os.tmpdir(), `meme_${id}.${outExt}`)
    fs.writeFileSync(inp, buffer)
    try {
        const args = ['-i', inp, '-frames:v', '1']
        if (vf) args.push('-vf', vf)
        args.push(out)
        await ffmpegRun(args)
        return fs.readFileSync(out)
    } finally {
        for (const f of [inp, out]) { try { fs.unlinkSync(f) } catch {} }
    }
}

async function pickSize(text, maxW, maxH, startSize) {
    const words = text.split(/\s+/).filter(Boolean)
    for (const size of SIZES) {
        if (size > startSize) continue
        const f = await getFont(size, 'WHITE')
        const longest = Math.max(...words.map(w => Jimp.measureText(f, w)))
        if (longest <= maxW && Jimp.measureTextHeight(f, text, maxW) <= maxH) return size
    }
    return 16
}

async function drawBlock(image, text, where) {
    if (!text) return
    const W = image.bitmap.width
    const H = image.bitmap.height
    const pad = Math.max(8, Math.round(W * 0.02))
    const maxW = W - pad * 2
    const maxH = Math.round(H * 0.4)
    const start = W >= 900 ? 128 : W >= 400 ? 64 : 32

    const size = await pickSize(text, maxW, maxH, start)
    const white = await getFont(size, 'WHITE')
    const black = await getFont(size, 'BLACK')
    const textH = Jimp.measureTextHeight(white, text, maxW)
    const y = where === 'top' ? pad : H - pad - textH
    const o = size >= 128 ? 4 : size >= 64 ? 3 : 2

    const put = (font, dx, dy) => image.print(
        font, pad + dx, y + dy,
        { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_TOP },
        maxW, textH + 20
    )

    const dirs = [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]
    for (const [dx, dy] of dirs) put(black, dx, dy)
    put(white, 0, 0)
}

module.exports = {
    commands: ['meme'],
    category: 'fun',
    description: 'Scrive un testo sopra una foto o uno sticker',
    usage: '<testo sopra> | <testo sotto> (rispondendo a una foto/sticker)',
    async run(sock, m, args, cmd, ctx) {
        const raw = args.join(' ').trim()
        if (!raw) return ctx.err('Scrivi il testo del meme!\nEsempio: rispondi a una foto/sticker con *.meme Quando accendo il PC | e non parte*')

        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const isSticker = !!(quoted && quoted.stickerMessage)
        const isImage = !!(quoted && quoted.imageMessage)

        if (!isSticker && !isImage) {
            return ctx.err('Devi rispondere a una FOTO o a uno STICKER con il comando .meme e il testo!')
        }
        if (isSticker && quoted.stickerMessage.isAnimated) {
            return ctx.err('Gli sticker animati non sono supportati, usa uno sticker statico o una foto.')
        }

        await ctx.react('🖼️')

        try {
            const node = isSticker ? quoted.stickerMessage : quoted.imageMessage
            const type = isSticker ? 'sticker' : 'image'

            let B = null
            try { B = require('@itsliaaa/baileys') } catch { B = require('@whiskeysockets/baileys') }

            const stream = await B.downloadContentFromMessage(node, type)
            let buffer = Buffer.alloc(0)
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])

            // Sticker WebP -> PNG per Jimp
            if (isSticker) buffer = await convert(buffer, 'webp', 'png')

            const image = await Jimp.read(buffer)

            const parts = raw.split('|').map(s => s.trim().toUpperCase())
            const top = parts[0]
            const bottom = parts[1]

            await drawBlock(image, top, 'top')
            await drawBlock(image, bottom, 'bottom')

            if (isSticker) {
                const png = await image.getBufferAsync(Jimp.MIME_PNG)
                const vf = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba'
                const webp = await convert(png, 'png', 'webp', vf)
                await sock.sendMessage(ctx.chat, { sticker: webp }, { quoted: m })
            } else {
                const jpg = await image.quality(90).getBufferAsync(Jimp.MIME_JPEG)
                await sock.sendMessage(ctx.chat, { image: jpg, caption: '😂 *Ecco il tuo meme!*' }, { quoted: m })
            }

            await ctx.react('✅')
        } catch (e) {
            console.error('Errore creazione meme:', e)
            await ctx.react('❌')
            return ctx.err('Errore durante la creazione del meme.')
        }
    }
}
