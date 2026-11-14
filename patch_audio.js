const fs = require('fs');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Uso: node patch_audio.js plugins/pl.js'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file + '.bak4', src);

const swap = (old, neu, label) => {
    const n = src.split(old).length - 1;
    if (n === 0) { console.log('⚠️ Non trovato (già modificato?): ' + label); return; }
    src = src.split(old).join(neu);
    console.log('✅ ' + label + ' → ' + n + ' punti');
};

swap('--audio-quality 128k', '--audio-quality 0', 'download alla qualità massima');
swap('-c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1',
     '-c:a libopus -b:a 128k -vbr on -compression_level 10 -application audio -ar 48000 -ac 2',
     'opus 128k stereo');
swap('-c:a aac -b:a 96k -ar 44100 -ac 2', '-c:a aac -b:a 128k -ar 44100 -ac 2', 'fondi playlist 128k');

fs.writeFileSync(file, src);
console.log('Fatto! Riavvia il bot. Backup: ' + file + '.bak4');
