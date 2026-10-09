const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execAsync = promisify(exec);
const FONT_PATH = '/system/fonts/Roboto-Regular.ttf';

function wrapText(text, maxCharsPerLine = 16) {
    let words = text.split(/\s+/).filter(Boolean);
    let lines = [], current = '';
    for (let word of words) {
        let test = current ? current + ' ' + word : word;
        if (test.length > maxCharsPerLine && current) { lines.push(current); current = word; }
        else current = test;
    }
    if (current) lines.push(current);
    return lines;
}

function escapeForDrawtext(text) {
    return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%');
}

module.exports = {
    commands: ['tx'],
    run: async (sock, m, args, cmd) => {
        const chat = m.key.remoteJid;
        const text = args.join(' ').trim();

        if (!text) return sock.sendMessage(chat, { text: '✍️ Scrivi il testo dopo il comando, es: *.tx Ciao a tutti*' }, { quoted: m });
        if (!fs.existsSync(FONT_PATH)) return sock.sendMessage(chat, { text: `❌ Font non trovato in ${FONT_PATH}.` }, { quoted: m });

        let righe = wrapText(text.toUpperCase(), 16).slice(0, 6);
        let fontSize = righe.length <= 2 ? 70 : righe.length <= 4 ? 55 : 42;
        let lineHeight = fontSize + 14;
        let startY = 256 - (righe.length * lineHeight) / 2;

        let filters = righe.map((r, i) => {
            let y = Math.round(startY + i * lineHeight);
            return `drawtext=fontfile=${FONT_PATH}:text='${escapeForDrawtext(r)}':fontcolor=white:fontsize=${fontSize}:borderw=6:bordercolor=black:x=(w-text_w)/2:y=${y}`;
        }).join(',');

        let outPath = path.join(os.tmpdir(), `tx_${Date.now()}.webp`);
        let cmdStr = `ffmpeg -y -f lavfi -i "color=c=black@0.0:s=512x512" -vf "format=rgba,${filters}" -vframes 1 -c:v libwebp -lossless 1 -pix_fmt yuva420p "${outPath}"`;

        try {
            await execAsync(cmdStr);
            const buffer = fs.readFileSync(outPath);
            await sock.sendMessage(chat, { sticker: buffer }, { quoted: m });
        } catch (e) {
            console.error('[TX]', e.message);
            await sock.sendMessage(chat, { text: '❌ Errore creazione sticker (ffmpeg manca libwebp/drawtext?).' }, { quoted: m });
        } finally {
            fs.unlink(outPath, () => {});
        }
    }
};
