const fs = require('fs');
const path = require('path');
const yts = require('yt-search');

const dbPath = path.join(__dirname, '../zenomusic_db.json');

const readDb = (p = dbPath) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
};
const writeDb = (data, p = dbPath) => {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
};

// Cerca la canzone dal pezzo di testo usando Genius
async function findOnGenius(q) {
    try {
        let res = await fetch('https://genius.com/api/search/song?per_page=5&q=' + encodeURIComponent(q), {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) return null;
        let json = await res.json();
        let hit = json?.response?.sections?.[0]?.hits?.[0]?.result;
        if (!hit) return null;
        return { title: hit.title, artist: hit.artist_names || hit.primary_artist?.name || '' };
    } catch (e) {
        return null;
    }
}

module.exports = {
    commands: ['frase', 'indovina'],
    run: async (sock, m) => {
        let chatId = m.key.remoteJid;
        let sender = m.key.participant || m.participant || chatId;
        let text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';

        let parts = text.slice(1).trim().split(/ +/);
        let query = parts.slice(1).join(' ').trim();

        if (!query) {
            return sock.sendMessage(chatId, { text: '❌ Scrivi un pezzo della canzone!\nEsempio: `.frase ho visto un re` ' }, { quoted: m });
        }

        await sock.sendMessage(chatId, { react: { text: '🔎', key: m.key } });

        try {
            let found = await findOnGenius(query);
            let searchTerm = found ? `${found.artist} ${found.title}` : `${query} testo lyrics`;

            let search = await yts(searchTerm);
            if (!search || !search.videos || search.videos.length === 0) {
                return sock.sendMessage(chatId, { text: `❌ Non ho trovato nessuna canzone per: "${query}"` }, { quoted: m });
            }

            let vid = search.videos[0];

            let db = readDb(dbPath);
            db[sender] = { url: vid.url, title: vid.title, duration: vid.timestamp };
            writeDb(db, dbPath);

            let txt = `🎶 *ZEUS MUSIC* 🎶\n\n` +
                      `🔎 *Cercavi:* "${query}"\n` +
                      `📌 *Titolo:* ${vid.title}\n` +
                      `⏱ *Durata:* ${vid.timestamp}\n` +
                      `👁️ *Visualizzazioni:* ${vid.views}\n`;

            let response = await fetch(vid.thumbnail);
            let buffer = Buffer.from(await response.arrayBuffer());

            let buttons = [
                { buttonId: 'sendnormal', buttonText: { displayText: '🎵 Audio Normale' }, type: 1 },
                { buttonId: 'sendvideo', buttonText: { displayText: '🎬 Video MP4' }, type: 1 },
                { buttonId: 'addplaylist', buttonText: { displayText: '➕ Aggiungi a .PL' }, type: 1 }
            ];

            return await sock.sendMessage(chatId, {
                image: buffer,
                caption: txt,
                footer: '⚡ Zeus Bot - Music Player',
                buttons: buttons,
                headerType: 4
            }, { quoted: m });

        } catch (e) {
            console.error('[TESTO] Errore:', e);
            return sock.sendMessage(chatId, { text: '❌ Errore durante la ricerca della canzone.' }, { quoted: m });
        }
    }
};
