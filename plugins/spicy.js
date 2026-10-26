'use strict'

// ═══════════════════════════════════════════════════════════════════════════
//  🔥  FUN SPICY PACK
//  Comandi:
//   • .letto @user     → compatibilità a letto con scenetta random
//   • .bacio @user     → bacio con sequenza animata + punteggio
//   • .corna @user     → "livello di corna" (scherzo)
//   • .pompino @user   → mini scenetta (opzionale, attivabile da config)
//  Regole: mai chiari espliciti, tutto metaforico e ironico 😏
// ═══════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ─── Target picker: menzione o reply ────────────────────────────────────────
const resolveTarget = (m) => {
    if (m.quoted?.sender) return m.quoted.sender
    if (m.message?.extendedTextMessage?.contextInfo?.participant) {
        return m.message.extendedTextMessage.contextInfo.participant
    }
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
        || m.message?.mentionedJid
        || []
    if (mentions.length) return mentions[0]
    return null
}

const tag = (jid) => `@${String(jid).split('@')[0]}`

// ─── Barra "caricamento" ────────────────────────────────────────────────────
const bar = (pct) => {
    const filled = Math.round(pct / 10)
    return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// ═══════════════════════════════════════════════════════════════════════════
//  📊  DATABASE SCENETTE (tutte metaforiche)
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_LETTO = [
    { min: 0,  max: 20,  emoji: '🧊',  title: 'Frigidità glaciale',     desc: 'Direi che stasera si dorme ognuno dal proprio lato del letto.' },
    { min: 21, max: 40,  emoji: '😴',  title: 'Pigiamino e Netflix',    desc: 'Forse è meglio un film, un tè caldo e tanti cuscini.' },
    { min: 41, max: 60,  emoji: '😏',  title: 'Serata promettente',     desc: 'C\'è del potenziale, ma bisogna scaldare i motori con calma.' },
    { min: 61, max: 80,  emoji: '🔥',  title: 'Fuoco sotto le lenzuola', desc: 'Le coperte voleranno via in meno di 30 secondi.' },
    { min: 81, max: 100, emoji: '🌋',  title: 'Eruzione garantita',     desc: 'Consiglio di avvisare i vicini prima di iniziare.' }
]

const SCENE_BACIO = [
    { min: 0,  max: 25,  emoji: '🫣',  title: 'Bacio sfuggito',    desc: 'È stato più un "ciao" goffo che un bacio vero.' },
    { min: 26, max: 50,  emoji: '😗',  title: 'Bacio timido',       desc: 'Carino, ma la prossima volta osa un po\' di più.' },
    { min: 51, max: 75,  emoji: '💋',  title: 'Bacio sentito',      desc: 'C\'è stata passione, si sente nell\'aria.' },
    { min: 76, max: 100, emoji: '💞',  title: 'Bacio da film',      desc: 'Scene da cinema, applausi dalla platea.' }
]

const SCENE_CORNA = [
    '🍀 Sei salvo per ora... ma tieni il telefono sott\'occhio.',
    '🚨 Leggero odore di tradimento nell\'aria.',
    '👀 Un "amico" un po\' troppo presente negli ultimi giorni.',
    '🚩 Le bandierine rosse sono tantissime.',
    '🐂 Direi che è ora di comprare un paio di scarpe nuove.'
]

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
    commands: ['letto', 'bacio', 'corna'],
    aliases: ['bed', 'kiss', 'becco'],
    cooldown: 3000,
    groupOnly: true,

    async run(sock, m, args, cmd) {
        const chatId = m.key.remoteJid
        const target = resolveTarget(m)

        if (!target) {
            return sock.sendMessage(chatId, {
                text: `🚨 Devi taggare qualcuno o rispondere a un suo messaggio.\n\n_Es:_ *.${cmd} @utente*`
            }, { quoted: m })
        }
        if (target === m.key.participant) {
            return sock.sendMessage(chatId, {
                text: '🤨 Non puoi farlo con te stesso... o forse sì? Meglio di no.'
            }, { quoted: m })
        }

        const me = tag(m.key.participant)
        const tu = tag(target)

        // ─── LETTO ─────────────────────────────────────────────────────────
        if (cmd === 'letto') {
            const pct = rand(1, 100)
            const p = pick(SCENE_LETTO.filter(s => pct >= s.min && pct <= s.max))

            await sock.sendMessage(chatId, {
                text: `🛏️ *ANALISI LETTO*\n\n${me} ❤️ ${tu}\n\n_Sensori in azione..._\n${bar(0)} 0%`,
                mentions: [m.key.participant, target]
            }, { quoted: m })

            for (const step of [25, 50, 75, 100]) {
                await sleep(450)
                const v = Math.round(pct * step / 100)
                await sock.sendMessage(chatId, {
                    text: `${bar(step)} ${v}%`,
                    edit: undefined
                }).catch(() => {})
            }

            await sleep(400)
            return sock.sendMessage(chatId, {
                text: `${p.emoji} *${p.title.toUpperCase()}* ${p.emoji}\n\n📊 Compatibilità: *${pct}%*\n💬 ${p.desc}\n\n👉 ${me} × ${tu}`,
                mentions: [m.key.participant, target]
            }, { quoted: m })
        }

        // ─── BACIO ─────────────────────────────────────────────────────────
        if (cmd === 'bacio') {
            const sequenza = [
                `💋 ${me} si avvicina lentamente a ${tu}...`,
                `😳 ...occhi chiusi...`,
                `😘 ...labbra a 3cm...`,
                `💥 *SBACIUCCHIAMENTO!*`,
                `✨ Momento magico registrato.`
            ]
            for (const s of sequenza) {
                await sock.sendMessage(chatId, {
                    text: s,
                    mentions: [m.key.participant, target]
                }, { quoted: m })
                await sleep(700)
            }

            const pct = rand(1, 100)
            const p = pick(SCENE_BACIO.filter(s => pct >= s.min && pct <= s.max))

            return sock.sendMessage(chatId, {
                text: `${p.emoji} *${p.title.toUpperCase()}* ${p.emoji}\n\n📊 Intensità: *${pct}%*\n💬 ${p.desc}\n\n💌 ${me} → ${tu}`,
                mentions: [m.key.participant, target]
            }, { quoted: m })
        }

        // ─── CORNA ─────────────────────────────────────────────────────────
        if (cmd === 'corna') {
            const pct = rand(1, 100)
            const msg = pct < 25 ? SCENE_CORNA[0]
                      : pct < 50 ? SCENE_CORNA[1]
                      : pct < 70 ? SCENE_CORNA[2]
                      : pct < 90 ? SCENE_CORNA[3]
                      :             SCENE_CORNA[4]

            return sock.sendMessage(chatId, {
                text: `🐂 *TEST DELLE CORNA*\n\n👤 Soggetto: ${tu}\n📊 Livello: *${pct}%*\n${bar(pct)}\n\n💬 ${msg}\n\n_Scherzo, ovviamente 😂_`,
                mentions: [target]
            }, { quoted: m })
        }
    }
}
