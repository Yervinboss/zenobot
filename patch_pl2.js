const fs = require('fs');
const plFile = process.argv[2];
const exFile = process.argv[3];
if (!plFile || !exFile || !fs.existsSync(plFile) || !fs.existsSync(exFile)) {
    console.log('Uso: node patch_pl2.js plugins/pl.js pl_extra.js'); process.exit(1);
}
let pl = fs.readFileSync(plFile, 'utf8');
let ex = fs.readFileSync(exFile, 'utf8');
if (pl.includes("'pl_more'")) { console.log('Già applicata.'); process.exit(0); }
fs.writeFileSync(plFile + '.bak2', pl);
fs.writeFileSync(exFile + '.bak2', ex);

const rep = (src, old, neu, label) => {
    if (!src.includes(old)) { console.log('❌ Punto non trovato: ' + label); process.exit(1); }
    return src.replace(old, () => neu);
};

// pl.js: nel menu principale resta solo un bottone "Altre azioni"
pl = rep(pl,
"azioni.push(\n" +
"                { title: '🔀 Mischia playlist', rowId: 'pl_shuffle', description: 'Riordina i brani a caso' },\n" +
"                { title: 'ℹ️ Info playlist', rowId: 'pl_info', description: 'Durata totale e statistiche' }\n" +
"            );\n" +
"            const PER = 5;",
"azioni.push({ title: '⚙️ Altre azioni', rowId: 'pl_more', description: 'Mischia, info, doppioni, esporta...' });\n" +
"            const PER = 4; // WhatsApp: max 10 righe per lista (4 azioni + 4 brani + 2 pagina)",
'menu');

pl = rep(pl,
"'pl_skip', 'pl_dedupe'];",
"'pl_skip', 'pl_dedupe', 'pl_more', 'pl_export', 'pl_allshuffle'];",
'comandi');

// pl_extra.js: sottomenu + riproduzione casuale da bottone
ex = rep(ex,
"if (sub === 'all' && /^(shuffle|mischia|random)$/i.test(rest.trim())) {",
"if ((sub === 'all' && /^(shuffle|mischia|random)$/i.test(rest.trim())) || sub === 'allshuffle') {",
'allshuffle');

ex = rep(ex,
"    // ── .pl help ──",
"    // ── .pl more (sottomenu azioni) ──\n" +
"    if (sub === 'more' || sub === 'azioni') {\n" +
"        const n = load()[sender].length;\n" +
"        await sock.sendMessage(jid, {\n" +
"            text: `⚙️ *ALTRE AZIONI PLAYLIST*\\n\\n📀 Brani: *${n}*\\nScegli cosa fare.\\n\\n_Per spostare o cercare usa_ \\`.pl move 5 2\\` _e_ \\`.pl search testo\\``,\n" +
"            footer: 'Zeno Ultimate • Playlist',\n" +
"            title: '⚙️ Altre azioni',\n" +
"            buttonText: '⚙️ Scegli azione',\n" +
"            sections: [{ title: 'Azioni', rows: [\n" +
"                { title: '🔀 Riproduci a caso', rowId: 'pl_allshuffle', description: 'Tutti i brani in ordine casuale' },\n" +
"                { title: '🔀 Mischia ordine', rowId: 'pl_shuffle', description: 'Riordina i brani salvati a caso' },\n" +
"                { title: '⏭️ Salta brano', rowId: 'pl_skip', description: 'Salta il prossimo brano in coda' },\n" +
"                { title: 'ℹ️ Info playlist', rowId: 'pl_info', description: 'Durata totale e statistiche' },\n" +
"                { title: '♻️ Rimuovi doppioni', rowId: 'pl_dedupe', description: 'Toglie i brani ripetuti' },\n" +
"                { title: '📋 Esporta lista', rowId: 'pl_export', description: 'Titoli e link in un messaggio' },\n" +
"                { title: '❓ Tutti i comandi', rowId: 'pl_help', description: 'Guida ai comandi .pl' }\n" +
"            ] }]\n" +
"        }, { quoted: m });\n" +
"        return true;\n" +
"    }\n\n" +
"    // ── .pl help ──",
'more');

fs.writeFileSync(plFile, pl);
fs.writeFileSync(exFile, ex);
console.log('✅ Fatto! Riavvia il bot. Backup: .bak2');
