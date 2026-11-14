const fs = require('fs');
const exFile = process.argv[2];
if (!exFile || !fs.existsSync(exFile)) { console.log('Uso: node patch_pl3.js pl_extra.js'); process.exit(1); }
let ex = fs.readFileSync(exFile, 'utf8');
if (ex.includes('const addText')) { console.log('Già applicata.'); process.exit(0); }
fs.writeFileSync(exFile + '.bak3', ex);

const rep = (old, neu, label) => {
    if (!ex.includes(old)) { console.log('❌ Punto non trovato: ' + label); process.exit(1); }
    ex = ex.replace(old, () => neu);
};

rep("if (sub === 'add' && rest.trim() &&",
"const KNOWN = new Set(['add', 'all', 'allshuffle', 'stop', 'merge', 'fusion', 'del', 'clear', 'askdel', 'play', 'page',\n" +
"        'help', 'aiuto', 'shuffle', 'mischia', 'move', 'sposta', 'top', 'search', 'cerca', 'info', 'stats',\n" +
"        'dedupe', 'doppioni', 'export', 'lista', 'skip', 'next', 'more', 'azioni']);\n" +
"    // `.pl add nome` oppure direttamente `.pl nome canzone`\n" +
"    const addText = sub === 'add' ? rest.trim()\n" +
"        : (sub && !KNOWN.has(sub) && !/^(select|del|page)_\\d+$/.test(sub) && !/^\\d+$/.test(sub) && !/^https?:/i.test(sub))\n" +
"            ? (sub + ' ' + rest).trim() : '';\n" +
"    if (addText &&",
'condizione add');

rep("const query = rest.trim().substring(0, 100);",
    "const query = addText.substring(0, 100);",
    'query');

rep("📀 Posizione: *${db[sender].length}*",
    "📀 Posizione: *${db[sender].length}* (pagina ${Math.ceil(db[sender].length / 4)}: \\`.pl page ${Math.ceil(db[sender].length / 4)}\\`)",
    'pagina');

fs.writeFileSync(exFile, ex);
console.log('✅ Fatto! Riavvia il bot. Backup: ' + exFile + '.bak3');
