'use strict'

// ═══════════════════════════════════════════════════════════════════════════
//  🔥  FUN PACK 2 — ditalino & sega
//  • .ditalino @user   → sequenza animata + punteggio + scenetta
//  • .sega @user       → sequenza animata + punteggio + scenetta
//  Sempre nei gruppi, con cooldown, tutto ironico e metaforico.
// ═══════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ─── Target: reply o menzione ───────────────────────────────────────────────
const resolveTarget = (m) => {
    if (m.quoted?.sender) return m.quoted.sender
    const ctx = m.message?.extendedTextMessage?.contextInfo
    if (ctx?.participant) return ctx.participant
    const mentions = ctx?.mentionedJid || m.message?.mentionedJid || []
    if (mentions.length) return mentions[0]
    return null
}

const tag = (jid) => `@${String(jid).split('@')[0]}`

// ─── Barra animata ──────────────────────────────────────────────────────────
const bar = (pct, size = 12) => {
    const filled = Math.round((pct / 100) * size)
    return '█'.repeat(filled) + '░'.repeat(size - filled)
}

// ─── Velocità in base al tempo di reazione ──────────────────────────────────
const speedLabel = (ms) => {
    if (ms < 300)  return '⚡ *Fulmineo* — non c\'è stato il tempo di dire "aspetta"'
    if (ms < 700)  return '🏎️ *Veloce* — ritmo da professionista'
    if (ms < 1200) return '🚶 *Tranquillo* — con calma ma con stile'
    if (ms < 2000) return '🐢 *Lento e costante* — la pazienza è una virtù'
    return              '😴 *Quasi addormentato* — serve un caffè'
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENETTE
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_DITALINO = [
    { min: 0,  max: 20,  emoji: '😐', title: 'Reazione tiepida',      desc: 'Boh, forse non era il momento giusto.' },
    { min: 21, max: 40,  emoji: '😬', title: 'Così così',             desc: 'C\'è stato un tentativo, ma manca la tecnica.' },
    { min: 41, max: 60,  emoji: '😏', title: 'Promettente',           desc: 'Con un po\' di pratica si arriva lontano.' },
    { min: 61, max: 80,  emoji: '🔥', title: 'Serata scoppiettante',  desc: 'I vicini hanno sentito qualcosa.' },
    { min: 81, max: 100, emoji: '🌊', title: 'Cascata inarrestabile', desc: 'Allagato il piano di sotto. Chiamare i vigili.' }
]

const SCENE_SEGA = [
    { min: 0,  max: 20,  emoji: '🧊', title: 'Motore spento',         desc: 'Non si è nemmeno acceso. Ritenta.' },
    { min: 21, max: 40,  emoji: '🔧', title: 'Riscaldamento lento',   desc: 'Serve qualche giro in più di rodaggio.' },
    { min: 41, max: 60,  emoji: '⚙️', title: 'Ingranaggi in moto',    desc: 'La macchina gira, ma non a pieno regime.' },
    { min: 61, max: 80,  emoji: '💨', title: 'Turbo attivato',        desc: 'Frizione, cambio, gas a fondo: si vola.' },
    { min: 81, max: 100, emoji: '🚀', title: 'Lancio spaziale',       desc: 'Houston, abbiamo un decollo. Tutto liscio.' }
]

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
    commands: ['ditalino', 'sega'],
    aliases: ['dita', 'handjob'],
    cooldown: 4000,
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
                text: '🤨 Con te stesso? Direi di no, dai.'
            }, { quoted: m })
        }

        const me = tag(m.key.participant)
        const tu = tag(target)

        // ─── DITALINO ──────────────────────────────────────────────────────
        if (cmd === 'ditalino') {
            const steps = [
                `🖐️ ${me} inizia a scaldare ${tu}...`,
                `👆 Un dito...`,
                `✌️ Due dita...`,
                `🤟 Tre dita... e ritmo serrato!`,
                `💦 *Situazione critica!*`,
                `🌊 *CASCATA IN ARRIVO!*`
            ]

            for (const s of steps) {
                await sock.sendMessage(chatId, {
                    text: s,
                    mentions: [m.key.participant, target]
                }, { quoted: m })
                await sleep(650)
            }

            const t0 = Date.now()
            await sleep(rand(300, 1800))
            const elapsed = Date.now() - t0

            const pct = rand(1, 100)
            const p = pick(SCENE_DITALINO.filter(s => pct >= s.min && pct <= s.max))

            return sock.sendMessage(chatId, {
                text:
                    `${p.emoji} *${p.title.toUpperCase()}* ${p.emoji}\n\n` +
                    `📊 Intensità: *${pct}%*\n` +
                    `${bar(pct)}\n\n` +
                    `⏱️ Reazione: *${elapsed}ms* — ${speedLabel(elapsed)}\n` +
                    `💬 ${p.desc}\n\n` +
                    `👉 ${me} × ${tu}`,
                mentions: [m.key.participant, target]
            }, { quoted: m })
        }

        // ─── SEGA ──────────────────────────────────────────────────────────
        if (cmd === 'sega') {
            const steps = [
                `✊ ${me} impugna la situazione con ${tu}...`,
                `🔄 Su e giù...`,
                `🔄 Su e giù... più veloce...`,
                `💨 *Ritmo da Formula 1!*`,
                `🌋 *Pressione alle stelle!*`,
                `🚀 *DECOLLO IMMINENTE!*`
            ]

            for (const s of steps) {
                await sock.sendMessage(chatId, {
                    text: s,
                    mentions: [m.key.participant, target]
                }, { quoted: m })
                await sleep(650)
            }

            const t0 = Date.now()
            await sleep(rand(300, 1800))
            const elapsed = Date.now() - t0

            const pct = rand(1, 100)
            const p = pick(SCENE_SEGA.filter(s => pct >= s.min && pct <= s.max))

            return sock.sendMessage(chatId, {
                text:
                    `${p.emoji} *${p.title.toUpperCase()}* ${p.emoji}\n\n` +
                    `📊 Potenza: *${pct}%*\n` +
                    `${bar(pct)}\n\n` +
                    `⏱️ Tempo: *${elapsed}ms* — ${speedLabel(elapsed)}\n` +
                    `💬 ${p.desc}\n\n` +
                    `👉 ${me} × ${tu}`,
                mentions: [m.key.participant, target]
            }, { quoted: m })
        }
    }
}
