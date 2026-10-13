// plugins/ioslab.js — laboratorio varianti per iPhone
// Uso: .ioslab  → manda 6 messaggi numerati. Dimmi quali numeri vedi sull'iPhone.
// Usa solo ctx.universal già presente nel tuo index.js (nessuna dipendenza nuova).

const biz = (withBot, isGroup) => {
    const nodes = [{
        tag: 'biz', attrs: {},
        content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
    }]
    if (withBot && !isGroup) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
    return nodes
}

module.exports = {
    commands: ['ioslab'],
    name: 'ioslab',
    category: 'sistema',
    author: 'ZENO',
    ownerOnly: true,
    description: 'Prova 6 varianti di invio per capire cosa vede l\'iPhone',
    async run(sock, m, args, cmd, ctx) {
        const U = ctx.universal
        const jid = ctx.chat
        const isGroup = jid.endsWith('@g.us')
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))

        const variants = [
            { n: 1, label: 'attuale (senza wrapper, biz+bot)', wrap: null, nodes: biz(true, isGroup) },
            { n: 2, label: 'viewOnce + biz+bot', wrap: 'viewOnceMessage', nodes: biz(true, isGroup) },
            { n: 3, label: 'viewOnce + solo biz', wrap: 'viewOnceMessage', nodes: biz(false, isGroup) },
            { n: 4, label: 'senza wrapper, solo biz', wrap: null, nodes: biz(false, isGroup) },
            { n: 5, label: 'senza wrapper, senza nodi (controllo)', wrap: null, nodes: [] },
            { n: 6, label: 'viewOnceV2 + biz+bot', wrap: 'viewOnceMessageV2', nodes: biz(true, isGroup) }
        ]

        await ctx.reply(`*IOS LAB*\nTi mando ${variants.length} messaggi con bottoni, numerati.\nDimmi quali numeri vedi con i bottoni sull'iPhone e quali sull'Android.`)

        for (const v of variants) {
            try {
                const msg = await U.buildInteractive(sock, jid, {
                    body: `*Variante ${v.n}/${variants.length}*\n${v.label}`,
                    footer: 'ioslab',
                    image: null,
                    buttons: [
                        { text: 'Ping', id: 'ping' },
                        { text: 'Copia', copy: 'ZENO' }
                    ]
                }, m)
                const content = v.wrap ? { [v.wrap]: { message: msg.message } } : msg.message
                await sock.relayMessage(jid, content, { messageId: msg.key.id, additionalNodes: v.nodes })
            } catch (e) {
                await ctx.reply(`Variante ${v.n} non inviabile: ${e.message}`)
            }
            await sleep(1500)
        }

        // 7: carosello con wrapper + biz+bot
        try {
            const msg = await U.buildInteractive(sock, jid, {
                body: '*Variante 7* — carosello viewOnce + biz+bot',
                footer: 'ioslab',
                cards: [
                    { title: 'Ping', body: 'Card 1', buttons: [{ text: 'Esegui', id: 'ping' }] },
                    { title: 'Status', body: 'Card 2', buttons: [{ text: 'Apri', id: 'status' }] }
                ]
            }, m)
            await sock.relayMessage(jid, { viewOnceMessage: { message: msg.message } }, { messageId: msg.key.id, additionalNodes: biz(true, isGroup) })
        } catch (e) {
            await ctx.reply(`Variante 7 non inviabile: ${e.message}`)
        }
    }
}
