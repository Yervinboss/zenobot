'use strict'

// ═══════════════════════════════════════════════════════════════
//  ZENO TOOLS — .velocità (Speed Test di Rete e Sistema)
// ═══════════════════════════════════════════════════════════════

const os = require('os')
const { performance } = require('perf_hooks')

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Test di download veloce (scarica 5MB da Cloudflare)
async function testDownload() {
    const start = performance.now()
    try {
        const res = await fetch('https://speed.cloudflare.com/__down?bytes=5000000')
        const buffer = await res.arrayBuffer()
        const end = performance.now()
        
        const durationSec = (end - start) / 1000
        const bitsLoaded = buffer.byteLength * 8
        const speedBps = bitsLoaded / durationSec
        const speedMbps = (speedBps / (1024 * 1024)).toFixed(2)
        
        return speedMbps
    } catch (e) {
        return null
    }
}

module.exports = {
    commands: ['velocita', 'velocità', 'speed', 'speedtest'],
    name: 'velocita',
    category: 'funzioni',
    description: 'Testa la velocità di internet e del telefono',
    usage: '',
    author: 'ZENO',

    async run(sock, m, args, cmd, ctx) {
        const chatId = m.key.remoteJid
        
        // 1. Invia un messaggio di attesa
        const msgWait = await sock.sendMessage(chatId, { text: '⚡ *Avvio Speed Test in corso...*\n_Analisi della rete e del sistema, attendere._' }, { quoted: m })

        // 2. Raccogli dati di sistema (con protezione anticrash)
        const cpus = os.cpus()
        const cpu = (cpus && cpus.length > 0) ? cpus[0] : null
        
        const cpuSpeed = cpu && cpu.speed ? cpu.speed : 'N/D'
        const cpuModel = cpu && cpu.model ? cpu.model.trim() : 'Sconosciuto'
        
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const memPercent = Math.round((usedMem / totalMem) * 100)
        
        const uptime = process.uptime()
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`

        // 3. Esegui il test di rete
        const downloadSpeed = await testDownload()
        
        // 4. Prepara la risposta
        let netStatus = ''
        let netEmoji = '🌐'
        
        if (downloadSpeed === null) {
            netStatus = 'Errore di connessione'
            netEmoji = '❌'
        } else {
            netStatus = `${downloadSpeed} Mbps`
            if (downloadSpeed > 50) netEmoji = '🚀'
            else if (downloadSpeed > 15) netEmoji = '⚡'
            else if (downloadSpeed > 5) netEmoji = '🐢'
            else netEmoji = '🦥'
        }

        // Crea la barra di caricamento per la RAM
        const barLength = 10
        const filled = Math.round((memPercent / 100) * barLength)
        const memBar = '▰'.repeat(filled) + '▱'.repeat(barLength - filled)

        const text = ctx.ui.box('⚡ SPEED TEST', [
            { section: '🌐 Rete Internet' },
            `${netEmoji} Download: *${netStatus}*`,
            `📡 Ping: *Invia .ping per la latenza*`,
            { section: '📱 Sistema (Telefono)' },
            `🧠 CPU: *${cpuModel}*`,
            `⚙️ Velocità CPU: *${cpuSpeed} MHz*`,
            `💾 RAM: ${memBar} *${memPercent}%*`,
            `   └ *${formatBytes(usedMem)}* usati di *${formatBytes(totalMem)}*`,
            `⏱ Uptime Bot: *${uptimeStr}*`,
            { section: 'ℹ️ Info' },
            `Questo test misura la velocità del telefono su cui gira il bot.`
        ], { footer: 'ZENO ULTIMATE' })

        // 5. Modifica il messaggio di attesa con i risultati
        try {
            await sock.sendMessage(chatId, { text: text, edit: msgWait.key })
        } catch (e) {
            await ctx.reply(text)
        }
    }
}
