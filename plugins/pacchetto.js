const { createCanvas, loadImage } = require('@napi-rs/canvas');

const API = 'https://api.sticker.ly/v4/stickerPack/smartSearch';
const HEADERS = {
    'user-agent': 'androidapp.stickerly/3.17.0 (Redmi Note 4; U; Android 29; in-ID; id;)',
    'content-type': 'application/json'
};
const MAX_PACK = 20;
const MAX_SINGLE = 12;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function searchPack(kw) {
    let res = await fetch(API, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
            keyword: kw,
            enabledKeywordSearch: true,
            filter: {
                extendSearchResult: false, onlyAnimated: false, onlyStatic: false,
                stickerType: 'ALL', searchBy: 'ALL', languages: ['en'],
                sortBy: 'RECOMMENDED', minStickerCount: 1
            }
        }),
        signal: AbortSignal.timeout(10000)
    });
    let j = await res.json();
    let packs = j?.result?.stickerPacks || [];
    const q = kw.toLowerCase();
    const ok = packs.filter(p => !p.animated && (p.name || '').toLowerCase().includes(q));
    ok.sort((a, b) => (b.exportCount || 0) - (a.exportCount || 0));
    return ok[0] || null;
}

async function download(url) {
    try {
        let r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        return Buffer.from(await r.arrayBuffer());
    } catch (e) {
        return null;
    }
}

async function toWebp(buf) {
    let img = await loadImage(buf);
    let size = 512;
    let canvas = createCanvas(size, size);
    let ctx = canvas.getContext('2d');
    let scale = Math.min(size / img.width, size / img.height);
    let w = img.width * scale;
    let h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return await canvas.encode('webp', 90);
}

module.exports = {
    commands: ['pacchetto', 'spack'],
    run: async (sock, m) => {
        let chatId = m.key.remoteJid;
        let text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        let parts = text.slice(1).trim().split(/ +/);
        let query = parts.slice(1).join(' ').trim();

        if (!query) {
            return sock.sendMessage(chatId, { text: '❌ Scrivi un personaggio o un anime!\nEsempio: `.pacchetto naruto`' }, { quoted: m });
        }

        await sock.sendMessage(chatId, { react: { text: '🔎', key: m.key } });

        try {
            let t0 = Date.now();
            let key = query.toLowerCase();
            let hit = cache.get(key);
            let pack, bufs, all;
            let tSearch = 0, tDown = 0;

            if (hit && Date.now() - hit.ts < CACHE_MS) {
                ({ pack, bufs, all } = hit);
            } else {
                pack = await searchPack(query);
                tSearch = Date.now() - t0;
                if (!pack) {
                    return sock.sendMessage(chatId, { text: `❌ Nessun pacchetto trovato per: "${query}"` }, { quoted: m });
                }
                all = pack.resourceFiles || [];
                let t1 = Date.now();
                let files = all.slice(0, MAX_PACK);
                let results = await Promise.all(files.map(f => download(pack.resourceUrlPrefix + f)));
                bufs = results.filter(Boolean);
                tDown = Date.now() - t1;
                if (bufs.length === 0) {
                    return sock.sendMessage(chatId, { text: '❌ Non sono riuscito a scaricare gli sticker.' }, { quoted: m });
                }
                cache.set(key, { pack, bufs, all, ts: Date.now() });
            }

            let t2 = Date.now();

            // Tentativo 1: pacchetto unico con bottone "Aggiungi"
            try {
                await sock.sendMessage(chatId, {
                    cover: bufs[0],
                    stickers: bufs.map(b => ({ data: b, emojis: ['✨'] })),
                    name: 'ZENO ULTIMATE',
                    publisher: 'Zeno Bot',
                    description: (pack.name || query).slice(0, 80)
                }, { quoted: m });

                console.log(`[PACCHETTO] "${query}" -> ricerca ${tSearch}ms | download ${tDown}ms | invio ${Date.now() - t2}ms | cache ${tSearch === 0}`);
                await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
                return;
            } catch (e) {
                console.error('[PACCHETTO] Errore pacchetto, passo agli sticker singoli:', e);
            }

            // Tentativo 2: scheda + sticker singoli
            await sock.sendMessage(chatId, {
                text: `🎴 *${pack.name}*\n👤 ${pack.authorName}\n🧩 ${all.length} sticker (te ne mando ${Math.min(bufs.length, MAX_SINGLE)})\n🔗 ${pack.shareUrl}`
            }, { quoted: m });

            for (let b of bufs.slice(0, MAX_SINGLE)) {
                try {
                    await sock.sendMessage(chatId, { sticker: await toWebp(b) });
                    await sleep(700);
                } catch (e) {
                    console.error('[PACCHETTO] sticker saltato:', e.message);
                }
            }
            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
        } catch (e) {
            console.error('[PACCHETTO] Errore:', e);
            return sock.sendMessage(chatId, { text: '❌ Errore durante la ricerca del pacchetto.' }, { quoted: m });
        }
    }
};
