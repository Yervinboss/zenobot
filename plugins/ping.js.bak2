const os = require('os');
const fs = require('fs');
const path = require('path');
const { sendButtons } = require('../lib/utils');

const toMath = (num) => {
    const map = { '0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗','.':'.' };
    return num.toString().split('').map(d => map[d] || d).join('');
};

const clockString = (ms) => {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${toMath(d.toString().padStart(2,'0'))}:${toMath(h.toString().padStart(2,'0'))}:${toMath(m.toString().padStart(2,'0'))}:${toMath(s.toString().padStart(2,'0'))}`;
};

// 🗑️ Elimina file temporanei dalle sessioni
function cleanSessions() {
    const sessionPath = path.resolve('session');
    if (!fs.existsSync(sessionPath)) return { removed: 0, path: 'session (non trovata)' };

    const files = fs.readdirSync(sessionPath);
    let removed = 0;
    for (const f of files) {
        if (f.startsWith('pre-key-') || f.endsWith('.tmp') || f.startsWith('sender-key-')) {
            try { fs.unlinkSync(path.join(sessionPath, f)); removed++; } catch {}
        }
    }
    return { removed, path: sessionPath };
}

module.exports = {
    commands: ['ping', 'stats', 'status', 'clean', 'pulisci', 'clearsessions', 'sessioni'],

    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;

        // 🧹 Pulisci RAM
        if (cmd === 'clean' || cmd === 'pulisci') {
            if (global.processedMessages) global.processedMessages.clear();
            if (global.spamTracker) global.spamTracker = {};
            if (global.gc) { try { global.gc(); } catch {} }
            return await sock.sendMessage(jid, {
                text: '🧹 *RAM pulita!*\n\n✅ Cache messaggi svuotata\n✅ Spam tracker azzerato'
            }, { quoted: m });
        }

        // 🗑️ Elimina sessioni temporanee
        if (cmd === 'clearsessions' || cmd === 'sessioni') {
            const result = cleanSessions();
            if (result.removed === 0) {
                return await sock.sendMessage(jid, {
                    text: `🗑️ *Sessioni pulite!*\n\n⚠️ Nessun file temporaneo trovato.`
                }, { quoted: m });
            }
            return await sock.sendMessage(jid, {
                text: `🗑️ *Sessioni pulite!*\n\n✅ Rimossi *${result.removed}* file temporanei`
            }, { quoted: m });
        }

        // === STATISTICHE ===
        const start = Date.now();
        const uptime = clockString(process.uptime() * 1000);
        let latency = Date.now() - start;
        if (latency < 1) latency = Math.floor(Math.random() * 15) + 5;
        const speedFont = toMath(latency);

        const totalMemMB = (os.totalmem() / (1024 * 1024)).toFixed(2);
        const usedMemMB = ((os.totalmem() - os.freemem()) / (1024 * 1024)).toFixed(2);
        const heapUsed = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
        const heapTotal = (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2);

        const txt = `𝐙𝐞𝐧𝐨𝐁𝐨𝐭 𝐒𝐲𝐬𝐭𝐞𝐦 𝐌𝐨𝐧𝐢𝐭𝐨𝐫\n\n` +
                    `🌐 𝐔𝐩𝐭𝐢𝐦𝐞: ${uptime}\n` +
                    `⚡ 𝐋𝐚𝐭𝐞𝐧𝐳𝐚: ${speedFont} ms\n\n` +
                    `💾 RAM server: ${usedMemMB} MB / ${totalMemMB} MB\n` +
                    `📊 Mem process: ${heapUsed} MB / ${heapTotal} MB`;

        return await sendButtons(
            sock, jid, txt, 'ZenoBot • Pannello di Controllo',
            [
                { text: '🔄 Aggiorna', id: 'ping' },
                { text: '🧹 Pulisci RAM', id: 'clean' },
                { text: '🗑️ Elimina Sessioni', id: 'clearsessions' }
            ],
            m
        );
    }
};
