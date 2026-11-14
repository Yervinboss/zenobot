const fs = require('fs');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Uso: node patch_dl.js plugins/pl.js'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file + '.bak7', src);

const a = src.indexOf('async function processQueue');
const b = src.indexOf('async function askDelete');
if (a < 0 || b < 0 || b < a) { console.log('❌ Non trovo processQueue/askDelete'); process.exit(1); }
let mid = src.slice(a, b);
let n1 = 0, n2 = 0;

// 1) se il download col client "android" fallisce, riprova col metodo standard di yt-dlp
mid = mid.replace(/let yt_command = `yt-dlp ([^`]*?) --extractor-args youtube:player-client=android,web ([^`]*)`;/g,
    (_, x, y) => { n1++; return 'let yt_command = `yt-dlp ' + x + ' --extractor-args youtube:player-client=android,web ' + y + ' || yt-dlp ' + x + ' ' + y + '`;'; });

// 2) scrive nel log di Termux il vero motivo dell'errore
mid = mid.split('exec(yt_command, async (error) => {').join(
    "exec(yt_command, async (error, _so, _se) => {\n        if (error) console.error('❌ yt-dlp:', String(_se || error.message).slice(-600));");
n2 = (mid.match(/_se \|\| error\.message/g) || []).length;

src = src.slice(0, a) + mid + src.slice(b);
fs.writeFileSync(file, src);
console.log('✅ Fallback download: ' + n1 + ' | log errori: ' + n2 + ' (devono essere 2 e 2)');
console.log('Fatto! Riavvia il bot. Backup: ' + file + '.bak7');
