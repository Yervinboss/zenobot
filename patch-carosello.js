const fs = require('fs'), cp = require('child_process')
const file = process.argv[2] || 'index.js'
let src = fs.readFileSync(file, 'utf8')
const orig = src
let bad = 0
if (src.includes('CAROUSEL_STYLES')) { console.log('Patch carosello già applicata.'); process.exit(0) }
function rep(nome, da, a) {
    const n = src.split(da).length - 1
    if (n !== 1) { console.log(`✖ ${nome}: trovato ${n} volte (serve 1)`); bad++; return }
    src = src.replace(da, () => a)
    console.log(`✔ ${nome}`)
}

rep('config', `    cardImage: 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg',\n`,
`    carouselStyle: 'native',      // come costruire il carosello: native | flat | biz | bare | wrap (prova con .carotest)
    cardImage: 'https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg',\n`)

rep('versione', `    version: '4.5.0'\n}`, `    version: '4.6.0'\n}`)

rep('bizNodes', `function bizNodes(kind, jid) {\n    const prof = CONFIG.nodeProfile || 'full'`,
`function bizNodes(kind, jid, profOverride) {\n    const prof = profOverride || CONFIG.nodeProfile || 'full'`)

rep('relay + carosello', `async function relayInteractive(sock, jid, msg, kind) {\n    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: bizNodes(kind, jid) })`,
`// ── CAROSELLO: più "stili" di costruzione, da provare con .carotest ─────────
const CAROUSEL_STYLES = {
    native: 'carosello della libreria (quello che va su Android)',
    flat:   'costruito a mano + nodi biz e bot',
    biz:    'costruito a mano + solo nodo biz',
    bare:   'costruito a mano, nessun nodo extra',
    wrap:   'costruito a mano dentro viewOnce + nodo biz'
}
const CAROUSEL_NODES = { flat: 'full', biz: 'biz', bare: 'off', wrap: 'biz' }

async function buildCarouselContent(sock, spec = {}) {
    const IM = baileys.proto.Message.InteractiveMessage
    const cards = []
    for (const c of spec.cards) {
        cards.push(IM.fromObject({
            header: await flowHeader(sock, c),
            body: IM.Body.fromObject({ text: cardCaption(c) || ' ' }),
            footer: IM.Footer.fromObject({ text: c.footer ?? CONFIG.cardFooter ?? '' }),
            nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons: (c.buttons || []).slice(0, 3).map(flowButton) })
        }))
    }
    return IM.fromObject({
        body: IM.Body.fromObject({ text: spec.text || ' ' }),
        footer: IM.Footer.fromObject({ text: spec.footer ?? CONFIG.cardFooter ?? '' }),
        header: IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false }),
        carouselMessage: IM.CarouselMessage.fromObject({ cards, messageVersion: 1 })
    })
}

// spec: { text, footer, cards:[{title, body, image, buttons}] }  (max ~10 card per pagina)
async function sendCarouselPage(sock, jid, spec = {}, style = 'native', o = {}) {
    const sendOpts = o.quoted ? { quoted: o.quoted } : undefined
    const cards = (spec.cards || []).filter(Boolean)
    if (!cards.length) return sock.sendMessage(jid, { text: spec.text || '' }, sendOpts)
    if (style === 'native' || !CAROUSEL_STYLES[style]) {
        return sock.sendMessage(jid, {
            text: spec.text || '✦', footer: spec.footer ?? CONFIG.cardFooter, cards: cards.map(makeCard)
        }, sendOpts)
    }
    let msg
    if (cards.length === 1) {
        const c = cards[0]
        msg = await buildInteractive(sock, jid, {
            body: cardCaption(c), footer: c.footer,
            image: c.image === undefined ? CONFIG.cardImage : c.image, video: c.video,
            buttons: (c.buttons || []).slice(0, 3)
        }, o.quoted)
    } else {
        const interactiveMessage = await buildCarouselContent(sock, { ...spec, cards })
        const ctxInfo = { deviceListMetadata: {}, deviceListMetadataVersion: 2 }
        const content = style === 'wrap'
            ? { viewOnceMessage: { message: { messageContextInfo: ctxInfo, interactiveMessage } } }
            : { messageContextInfo: ctxInfo, interactiveMessage }
        msg = await baileys.generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: o.quoted })
    }
    return relayInteractive(sock, jid, msg, 'interactive', CAROUSEL_NODES[style])
}

async function relayInteractive(sock, jid, msg, kind, prof) {
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: bizNodes(kind, jid, prof) })`)

rep('sendCards usa lo stile', `            last = await sock.sendMessage(jid, {
                text: i === 0 ? (spec.text || '✦') : \`✦ \${i + 1}/\${pages.length}\`,
                footer: spec.footer ?? CONFIG.cardFooter,
                cards: pages[i].map(makeCard)
            }, sendOpts)`,
`            last = await sendCarouselPage(sock, jid, {
                text: i === 0 ? (spec.text || '✦') : \`✦ \${i + 1}/\${pages.length}\`,
                footer: spec.footer ?? CONFIG.cardFooter,
                cards: pages[i]
            }, o.style || CONFIG.carouselStyle || 'native', o)`)

rep('cardsApi', `    universal: { sendAdCard, sendLegacyButtons,`, `    carouselStyles: CAROUSEL_STYLES,\n    universal: { sendCarouselPage, sendAdCard, sendLegacyButtons,`)

rep('comandi', `    {\n        commands: ['cardnodes'], name: 'cardnodes',`,
`    {
        commands: ['carotest'], name: 'carotest', category: 'sistema', author: 'ZENO',
        description: 'Prova gli stili di carosello sul tuo telefono', usage: '[stile|all]',
        async run(sock, m, args, cmd, ctx) {
            const want = (args[0] || 'all').toLowerCase()
            const names = want === 'all' ? Object.keys(CAROUSEL_STYLES) : [want]
            if (names.some(n => !CAROUSEL_STYLES[n])) return ctx.err(\`Stili: \${Object.keys(CAROUSEL_STYLES).join(', ')}\`)
            const demo = [1, 2, 3].map(n => ({ title: \`🎵 Canzone \${n}\`, body: 'Artista • 3:21', buttons: [btn.reply('▶ Riproduci', 'ping')] }))
            await ctx.reply(ui.box('TEST CAROSELLO', [
                \`Dispositivo rilevato: *\${ctx.device}*\`,
                \`Ti mando \${names.length} varianti numerate.\`,
                'Dimmi quali scorrono di lato sul tuo telefono.'
            ]))
            for (let i = 0; i < names.length; i++) {
                try {
                    await sendCarouselPage(sock, ctx.chat, {
                        text: \`*Variante \${i + 1}/\${names.length} — \${names[i]}*\\n_\${CAROUSEL_STYLES[names[i]]}_\`, cards: demo
                    }, names[i], { quoted: m })
                } catch (e) { await ctx.reply(\`Variante *\${names[i]}* non inviabile: \${e.message}\`) }
                await sleep(1500)
            }
            await ctx.reply(\`Trovata quella giusta? Usa *\${PREFIX}carostyle <nome>*\`)
        }
    },
    {
        commands: ['carostyle'], name: 'carostyle', category: 'sistema', author: 'ZENO', ownerOnly: true,
        description: 'Scegli lo stile del carosello e attivalo su iPhone', usage: '[stile|ios on|ios off]',
        async run(sock, m, args, cmd, ctx) {
            const a0 = (args[0] || '').toLowerCase()
            if (a0 === 'ios') {
                CONFIG.iosMode = (args[1] || '').toLowerCase() === 'on' ? 'carousel' : 'compat'; saveConfig()
                return ctx.ok(\`Su iPhone/Web/Desktop ora uso: *\${CONFIG.iosMode}*\`)
            }
            if (CAROUSEL_STYLES[a0]) { CONFIG.carouselStyle = a0; saveConfig(); return ctx.ok(\`Stile carosello: *\${a0}*\`) }
            await ctx.reply(ui.box('STILE CAROSELLO', [
                \`Attuale: *\${CONFIG.carouselStyle}*\`, \`iPhone usa: *\${CONFIG.iosMode}*\`,
                { section: 'Stili' },
                ...Object.entries(CAROUSEL_STYLES).map(([k, v]) => \`*\${k}* — \${v}\`),
                { raw: \`Esempio: *\${PREFIX}carostyle flat*\\nPoi: *\${PREFIX}carostyle ios on*\` }
            ]))
        }
    },
    {\n        commands: ['cardnodes'], name: 'cardnodes',`)

if (bad) { console.log(`\nNessuna modifica salvata (${bad} errori).`); process.exit(1) }
const bak = `${file}.bak-${Date.now()}`
fs.writeFileSync(bak, orig); fs.writeFileSync(file, src)
try {
    cp.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    console.log(`\n✔ Fatto. Backup: ${bak}`)
} catch (e) {
    fs.writeFileSync(file, orig)
    console.log('✖ Errore di sintassi, ripristinato l\'originale.\n' + String(e.stderr || e.message).slice(0, 400))
    process.exit(1)
}
