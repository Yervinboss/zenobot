const fs = require('fs');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Uso: node patch_pl.js percorso/di/pl.js'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
if (src.includes('pl_extra.js')) { console.log('Già applicata.'); process.exit(0); }
fs.writeFileSync(file + '.bak', src);

const rep = (old, neu, label) => {
    if (!src.includes(old)) { console.log('❌ Punto non trovato: ' + label); process.exit(1); }
    src = src.replace(old, () => neu);
};

rep("'pl_clear', 'pl_askdel'];",
    "'pl_clear', 'pl_askdel', 'pl_shuffle', 'pl_info', 'pl_help', 'pl_skip', 'pl_dedupe'];",
    'comandi');

rep("let track = queueData.tracks.shift();",
    "let track = queueData.tracks.shift();\n" +
    "    try {\n" +
    "        const n = queueData.total - queueData.tracks.length;\n" +
    "        await sock.sendMessage(jid, { text: `▶️ *${n}/${queueData.total}* • _${String(track.title || 'Brano').substring(0, 50)}_` });\n" +
    "    } catch (e) {}",
    'progresso coda');

rep("plDb[sender].push({ title: trackTitle, url: trackUrl });",
    "if (plDb[sender].some(t => t.url === trackUrl) || plDb[sender].length >= 100) continue;\n" +
    "                            plDb[sender].push({ title: trackTitle, url: trackUrl });",
    'doppioni import');

rep("if (sub === 'askdel') {",
    "{\n" +
    "            const extra = require('../pl_extra.js');\n" +
    "            if (await extra.handle({ sock, m, jid, sender, sub, rest, readDb, writeDb, playlistDbPath, yts, processQueue })) return;\n" +
    "        }\n\n" +
    "        if (sub === 'askdel') {",
    'hook');

rep("const PER = 5;",
    "azioni.push(\n" +
    "                { title: '🔀 Mischia playlist', rowId: 'pl_shuffle', description: 'Riordina i brani a caso' },\n" +
    "                { title: 'ℹ️ Info playlist', rowId: 'pl_info', description: 'Durata totale e statistiche' }\n" +
    "            );\n" +
    "            const PER = 5;",
    'menu');

fs.writeFileSync(file, src);
console.log('✅ Patch applicata! Backup: ' + file + '.bak');
