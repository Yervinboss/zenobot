'use strict'

module.exports = {
    name: 'fakepay',
    commands: ['fakepay', 'fintopagamento'],
    category: 'tools',
    author: 'ZENO',
    description: 'Crea una finta richiesta di pagamento (trucco valuta XXX)',
    usage: '<importo> <testo nota>',
    minArgs: 2,

    async run(sock, m, args, cmd, ctx) {
        // Prende il numero (es. 1, 10, 50)
        const rawAmount = String(args[0] || '').replace(',', '.')
        const amount = parseFloat(rawAmount)
        
        if (!isFinite(amount) || amount <= 0) {
            return ctx.err(`Importo non valido. Uso: *${ctx.prefix}${cmd} 1 Testo del messaggio*`)
        }

        // Il resto degli argomenti diventa il testo del messaggio
        const noteText = args.slice(1).join(' ')
        
        // Chi apparirà come "Richiedente" (di default il numero dell'owner)
        const ownerJid = `${ctx.config?.numero || ctx.sender}@s.whatsapp.net`

        try {
            // Costruiamo il payload nativo esatto per la finta richiesta
            const paymentContent = {
                requestPaymentMessage: {
                    currencyCodeIso4217: 'XXX', // Valuta finta per bypassare i controlli
                    amount1000: Math.floor(amount * 1000), // WhatsApp usa i millesimi
                    requestFrom: ownerJid,
                    expiryTimestamp: 0,
                    amount: {
                        value: Math.floor(amount * 1000),
                        offset: 1000,
                        currencyCode: 'XXX'
                    },
                    noteMessage: {
                        extendedTextMessage: {
                            text: noteText
                        }
                    }
                }
            }

            // Generiamo e inviamo il messaggio
            const msg = await require('@itsliaaa/baileys').generateWAMessageFromContent(
                ctx.chat, 
                paymentContent, 
                { userJid: sock.user.id, quoted: m }
            )
            
            await sock.relayMessage(ctx.chat, msg.message, { messageId: msg.key.id })
            
        } catch (e) {
            ctx.log?.err(`Errore fakepay: ${e.message}`)
            ctx.err(`Impossibile inviare la finta richiesta.`)
        }
    }
}
