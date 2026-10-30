'use strict'

const delay = (ms) => new Promise(r => setTimeout(r, ms))

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━'
const TITLE = `☢️  *Z E N O   N U K E*  ☢️\n${DIV}`
const line = (t) => `${TITLE}\n\n${t}\n\n${DIV}`

const bareJid = (jid = '') => String(jid).split('@')[0].split(':')[0]
const phoneOf = (jid = '') => bareJid(jid).replace(/\D/g, '')

module.exports = {
    commands: ['nuke', 'nukeall', 'purge'],
    name: 'nuke',
    category: 'owner',
    description: 'Scherzo: simula la nuke del gruppo (solo owner)',
    hidden: true,        // non appare nel menu
    ownerOnly: true,     // 🔒 solo owner/creator
    groupOnly: true,     // solo nei gruppi

    async run(sock, m, args, cmd, ctx) {
        try {
            const chatId = ctx.chatJid
            const sender = ctx.sender
            const senderJid = ctx.senderJid

            console.log('[NUKE] chat:', chatId, '| sender:', sender, '| senderJid:', senderJid)

            let metadata
            try {
                metadata = await sock.groupMetadata(chatId)
            } catch (e) {
                console.error('[NUKE] groupMetadata error:', e)
                return ctx.err('Impossibile leggere i dati del gruppo.')
            }

            if (!metadata || !metadata.participants) {
                return ctx.err('Dati gruppo non validi.')
            }

            const botBare = bareJid(sock.user?.id || '')
            const isBotAdmin = metadata.participants.some(
                p => bareJid(p.id) === botBare && (p.admin === 'admin' || p.admin === 'superadmin')
            )

            const participants = metadata.participants.filter(p => bareJid(p.id) !== botBare)
            const total = participants.length

            console.log('[NUKE] totale:', total, '| bot admin:', isBotAdmin)

            // ═══ FASE 1 — Briefing ═══
            await ctx.react('☢️')
            await ctx.reply(line(
                `☢️  *INIZIALIZZAZIONE PROTOCOLLO NUKE*\n\n` +
                `📡  Target: *${metadata.subject || 'N/D'}*\n` +
                `👥  Bersagli: *${total}*\n` +
                `🔐  Permessi bot: ${isBotAdmin ? '✅ Admin' : '⚠️ Non admin'}\n` +
                `⚡  Modalità: *DISTRUZIONE TOTALE*\n\n` +
                `_Avvio in corso..._`
            ))
            await delay(1800)

            // ═══ FASE 2 — Scansione ═══
            const phases = [
                '🔍  Scansione membri attivi...',
                '🔍  Analisi permessi utente...',
                '🔍  Verifica connessione al server...',
                '🔍  Bypass crittografia end-to-end...',
                '🔍  Iniezione payload nei nodi...'
            ]
            let scan = `${TITLE}\n\n*📡 SCANSIONE IN CORSO*\n\n`
            for (const ph of phases) {
                scan += `${ph}\n`
                await ctx.reply(scan + `\n${DIV}`)
                await delay(700)
            }
            await delay(800)

            // ═══ FASE 3 — Rimozione finta ═══
            const shuffled = [...participants].sort(() => Math.random() - 0.5)
            const chunkSize = Math.max(1, Math.ceil(shuffled.length / 6))

            await ctx.reply(line('🚨  *PROTOCOLLO NUKE AVVIATO*  🚨\n\n⚡  Espulsione in corso...'))
            await delay(1200)

            for (let i = 0; i < shuffled.length; i += chunkSize) {
                const chunk = shuffled.slice(i, i + chunkSize)
                const list = chunk.map(p => `  💀  +${phoneOf(p.id) || '???'}`).join('\n')
                const progress = Math.min(100, Math.round(((i + chunk.length) / shuffled.length) * 100))
                const filled = Math.floor(progress / 10)
                const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)

                await ctx.reply(
                    `${TITLE}\n\n*⚡ RIMOZIONE IN CORSO*\n\n${list}\n\n\`[${bar}] ${progress}%\`\n\n${DIV}`
                )
                await delay(900)
            }
            await delay(1000)

            // ═══ FASE 4 — Completato ═══
            await ctx.reply(line(
                `✅  *NUKE COMPLETATA*\n\n` +
                `💀  Rimossi: *${total}* membri\n` +
                `📊  Stato gruppo: *VUOTO*\n` +
                `⚡  Tempo impiegato: *${(total * 0.9).toFixed(1)}s*\n\n` +
                `_Il gruppo verrà chiuso a breve..._`
            ))
            await delay(2200)

            await ctx.reply(`${TITLE}\n\n🔒  *Chiusura gruppo in corso...*\n\n\`[██████████] 100%\`\n\n${DIV}`)
            await delay(2500)

            // ═══ FASE 5 — REVEAL ═══
            await ctx.react('🤣')
            await ctx.reply(
                `${DIV}\n` +
                `🤣  *SORPRESA!*  ✌️\n` +
                `${DIV}\n\n` +
                `_Nessuno è stato rimosso_\n` +
                `_Era tutto uno scherzo_\n\n` +
                `> 🎭 *SONO UN LARPER* 🤣✌️\n\n` +
                `${DIV}\n` +
                `💀 *Zeno Nuke* — 100% fake, 200% memes`
            )

        } catch (err) {
            console.error('[NUKE] ERRORE:', err)
            try {
                await sock.sendMessage(m.key.remoteJid, {
                    text: `❌ Errore interno: \`${err.message}\``
                }, { quoted: m })
            } catch {}
        }
    }
}
