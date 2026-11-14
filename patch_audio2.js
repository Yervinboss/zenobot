const fs = require('fs');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Uso: node patch_audio2.js plugins/pl.js'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file + '.bak5', src);

const a = src.indexOf('async function processQueue');
const b = src.indexOf('async function askDelete');
if (a < 0 || b < 0 || b < a) { console.log('❌ Non trovo processQueue/askDelete'); process.exit(1); }
let mid = src.slice(a, b);
let n = 0;

// 1) conversione: AAC 160k stereo in .m4a (come fa già "fondi playlist")
mid = mid.replace(/-c:a libopus -b:a \d+k -vbr on -compression_level 10(?: -application audio)? -ar 48000 -ac [12] -threads 0 -f ogg/g,
    () => { n++; return '-c:a aac -b:a 160k -ar 44100 -ac 2 -movflags +faststart -f ipod'; });
// 2) estensione del file temporaneo
mid = mid.split('vocale_pl_${timestamp}.ogg').join('vocale_pl_${timestamp}.m4a');
// 3) invio come file audio normale (non messaggio vocale)
mid = mid.split("mimetype: 'audio/ogg; codecs=opus', ptt: true")
    .join("mimetype: 'audio/mp4', ptt: false, fileName: `${String(track.title || 'Zeno').replace(/[^\\w\\s.-]/g, '').trim().substring(0, 60) || 'Zeno'}.m4a`");
// 4) download alla qualità massima
mid = mid.split('--audio-quality 128k').join('--audio-quality 0');

src = src.slice(0, a) + mid + src.slice(b);
fs.writeFileSync(file, src);
console.log('✅ Comandi ffmpeg aggiornati: ' + n + ' (devono essere 2)');
console.log('Fatto! Riavvia il bot. Backup: ' + file + '.bak5');
