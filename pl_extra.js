const MAX_TRACKS = 100;

const toSec = (d) => {
    if (!d || typeof d !== 'string') return 0;
    const p = d.split(':').map(Number);
    if (p.some(isNaN)) return 0;
    return p.reduce((a, b) => a * 60 + b, 0);
};
const fmt = (s) => {
    const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
    return h > 0 ? `${h}h ${String(mi).padStart(2, '0')}m` : `${mi}m ${String(se).padStart(2, '0')}s`;
};
const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const ytId = (url) => (String(url).match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1] || String(url);
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n = 45) => String(s || 'Sconosciuto').substring(0, n);

async function handle(ctx) {
    const { sock, m, jid, sender, sub, rest, readDb, writeDb, playlistDbPath, yts, processQueue } = ctx;
    const say = (text) => sock.sendMessage(jid, { text }, { quoted: m });
    const load = () => { const db = readDb(playlistDbPath); db[sender] = db[sender] || []; return db; };

    // ── .pl more (sottomenu azioni) ──
    if (sub === 'more' || sub === 'azioni') {
        const n = load()[sender].length;
        await sock.sendMessage(jid, {
            text: `⚙️ *ALTRE AZIONI PLAYLIST*\n\n📀 Brani: *${n}*\nScegli cosa fare.\n\n_Per spostare o cercare usa_ \`.pl move 5 2\` _e_ \`.pl search testo\``,
            footer: 'Zeno Ultimate • Playlist',
            title: '⚙️ Altre azioni',
            buttonText: '⚙️ Scegli azione',
            sections: [{ title: 'Azioni', rows: [
                { title: '🔀 Riproduci a caso', rowId: 'pl_allshuffle', description: 'Tutti i brani in ordine casuale' },
                { title: '🔀 Mischia ordine', rowId: 'pl_shuffle', description: 'Riordina i brani salvati a caso' },
                { title: '⏭️ Salta brano', rowId: 'pl_skip', description: 'Salta il prossimo brano in coda' },
                { title: 'ℹ️ Info playlist', rowId: 'pl_info', description: 'Durata totale e statistiche' },
                { title: '♻️ Rimuovi doppioni', rowId: 'pl_dedupe', description: 'Toglie i brani ripetuti' },
                { title: '📋 Esporta lista', rowId: 'pl_export', description: 'Titoli e link in un messaggio' },
                { title: '❓ Tutti i comandi', rowId: 'pl_help', description: 'Guida ai comandi .pl' }
            ] }]
        }, { quoted: m });
        return true;
    }

    // ── .pl help ──
    if (sub === 'help' || sub === 'aiuto') {
        await say(
            `🎵 *COMANDI PLAYLIST*\n\n` +
            `▫️ \`.pl\` → apri la playlist\n` +
            `▫️ \`.pl add [link o nome canzone]\` → aggiungi\n` +
            `▫️ \`.pl all\` → riproduci tutto\n` +
            `▫️ \`.pl all shuffle\` → riproduci tutto a caso\n` +
            `▫️ \`.pl play 3\` → ascolta il brano 3\n` +
            `▫️ \`.pl shuffle\` → mischia l'ordine\n` +
            `▫️ \`.pl move 5 2\` → sposta il brano 5 in posizione 2\n` +
            `▫️ \`.pl top 5\` → porta il brano 5 in cima\n` +
            `▫️ \`.pl search [testo]\` → cerca nella playlist\n` +
            `▫️ \`.pl info\` → statistiche\n` +
            `▫️ \`.pl dedupe\` → togli i doppioni\n` +
            `▫️ \`.pl export\` → lista testuale con link\n` +
            `▫️ \`.pl skip\` → salta il prossimo brano in coda\n` +
            `▫️ \`.pl stop\` · \`.pl del N\` · \`.pl clear\` · \`.pl merge\``
        );
        return true;
    }

    // ── .pl shuffle ──
    if (sub === 'shuffle' || sub === 'mischia') {
        const db = load();
        if (db[sender].length < 2) { await say('❌ Servono almeno 2 brani per mischiare.'); return true; }
        db[sender] = shuffle(db[sender]);
        writeDb(playlistDbPath, db);
        await say(`🔀 Playlist mischiata! *${db[sender].length}* brani in ordine casuale.\nUsa \`.pl\` per vederla.`);
        return true;
    }

    // ── .pl all shuffle ──
    if ((sub === 'all' && /^(shuffle|mischia|random)$/i.test(rest.trim())) || sub === 'allshuffle') {
        const db = load();
        const list = db[sender];
        if (list.length === 0) { await say('❌ La tua playlist è vuota.'); return true; }
        if (global.plQueues[sender]) { await say('⚠️ Coda già attiva! Usa `.pl stop` per fermarla.'); return true; }
        global.plQueues[sender] = { tracks: shuffle(list), currentIndex: 1, total: list.length };
        await say(`🔀 Avvio riproduzione *casuale* di ${list.length} brani!`);
        await processQueue(sock, jid, sender);
        return true;
    }

    // ── .pl move A B  /  .pl top A ──
    if (sub === 'move' || sub === 'sposta' || sub === 'top') {
        const nums = rest.trim().split(/\s+/).filter(Boolean).map((n) => parseInt(n, 10) - 1);
        const from = nums[0];
        const to = sub === 'top' ? 0 : nums[1];
        const db = load();
        const list = db[sender];
        const ok = (i) => Number.isInteger(i) && i >= 0 && i < list.length;
        if (!ok(from) || !ok(to)) {
            await say(sub === 'top'
                ? '❌ Usa: `.pl top 5` (porta il brano 5 in cima).'
                : '❌ Usa: `.pl move 5 2` (sposta il brano 5 in posizione 2).');
            return true;
        }
        const [t] = list.splice(from, 1);
        list.splice(to, 0, t);
        writeDb(playlistDbPath, db);
        await say(`↕️ *${cut(t.title)}*\nora è in posizione *${to + 1}*`);
        return true;
    }

    // ── .pl search testo ──
    if (sub === 'search' || sub === 'cerca') {
        const words = norm(rest).split(' ').filter(Boolean);
        if (words.length === 0) { await say('❌ Usa: `.pl search [testo]`'); return true; }
        const list = load()[sender];
        const hits = [];
        list.forEach((t, i) => {
            const n = norm(t.title);
            if (words.every((w) => n.includes(w))) hits.push(`${i + 1}. ${cut(t.title)}${t.duration ? ` ⏱️ ${t.duration}` : ''}`);
        });
        if (hits.length === 0) { await say(`🔎 Nessun risultato per _${rest.trim()}_ nella tua playlist.`); return true; }
        await say(`🔎 *Trovati ${hits.length}* per _${rest.trim()}_:\n\n${hits.slice(0, 20).join('\n')}\n\n▶️ Ascolta con \`.pl play N\``);
        return true;
    }

    // ── .pl info ──
    if (sub === 'info' || sub === 'stats') {
        const list = load()[sender];
        if (list.length === 0) { await say('❌ La tua playlist è vuota.'); return true; }
        const secs = list.map((t) => toSec(t.duration));
        const known = secs.filter((s) => s > 0);
        const total = known.reduce((a, b) => a + b, 0);
        const ids = list.map((t) => ytId(t.url));
        const dup = ids.length - new Set(ids).size;
        let longest = '';
        if (known.length) {
            const i = secs.indexOf(Math.max(...known));
            longest = `\n🏆 Più lungo: *${cut(list[i].title, 35)}* (${list[i].duration})`;
        }
        const q = global.plQueues[sender];
        await say(
            `📊 *STATISTICHE PLAYLIST*\n\n` +
            `📀 Brani: *${list.length}* / ${MAX_TRACKS}\n` +
            `⏱️ Durata totale: *${known.length ? fmt(total) : 'n/d'}*` +
            (known.length < list.length ? ` _(su ${known.length} brani con durata nota)_` : '') +
            longest +
            `\n♻️ Doppioni: *${dup}*` + (dup ? ' → `.pl dedupe`' : '') +
            `\n▶️ Coda attiva: *${q ? `sì (${q.tracks.length} rimasti)` : 'no'}*`
        );
        return true;
    }

    // ── .pl dedupe ──
    if (sub === 'dedupe' || sub === 'doppioni') {
        const db = load();
        const seen = new Set();
        const clean = db[sender].filter((t) => {
            const id = ytId(t.url);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        const removed = db[sender].length - clean.length;
        if (removed === 0) { await say('✅ Nessun doppione trovato.'); return true; }
        db[sender] = clean;
        writeDb(playlistDbPath, db);
        await say(`♻️ Rimossi *${removed}* doppioni. Ora hai *${clean.length}* brani.`);
        return true;
    }

    // ── .pl export ──
    if (sub === 'export' || sub === 'lista') {
        const list = load()[sender];
        if (list.length === 0) { await say('❌ La tua playlist è vuota.'); return true; }
        const lines = list.map((t, i) => `${i + 1}. ${cut(t.title, 60)}\n${t.url}`);
        let chunk = '📋 *LA TUA PLAYLIST*\n\n';
        for (const line of lines) {
            if ((chunk + line).length > 3500) { await say(chunk); chunk = ''; }
            chunk += line + '\n\n';
        }
        if (chunk.trim()) await say(chunk);
        return true;
    }

    // ── .pl skip (salta il prossimo brano in coda) ──
    if (sub === 'skip' || sub === 'next') {
        const q = global.plQueues[sender];
        if (!q) { await say('⚠️ Nessuna riproduzione in corso.'); return true; }
        if (q.tracks.length === 0) { await say('⚠️ Non ci sono altri brani in coda.'); return true; }
        const t = q.tracks.shift();
        await say(`⏭️ Saltato: *${cut(t.title)}*\n📀 Rimasti in coda: *${q.tracks.length}*\n_Il brano già in invio arriva comunque._`);
        return true;
    }

    // ── .pl add [nome canzone] (senza link) ──
    const KNOWN = new Set(['add', 'all', 'allshuffle', 'stop', 'merge', 'fusion', 'del', 'clear', 'askdel', 'play', 'page',
        'help', 'aiuto', 'shuffle', 'mischia', 'move', 'sposta', 'top', 'search', 'cerca', 'info', 'stats',
        'dedupe', 'doppioni', 'export', 'lista', 'skip', 'next', 'more', 'azioni']);
    // `.pl add nome` oppure direttamente `.pl nome canzone`
    const addText = sub === 'add' ? rest.trim()
        : (sub && !KNOWN.has(sub) && !/^(select|del|page)_\d+$/.test(sub) && !/^\d+$/.test(sub) && !/^https?:/i.test(sub))
            ? (sub + ' ' + rest).trim() : '';
    if (addText && !/^https?:\/\//i.test(rest.trim())) {
        const query = addText.substring(0, 100);
        try {
            const res = await yts(query);
            const v = res && res.videos && res.videos[0];
            if (!v) { await say(`❌ Nessun risultato per _${query}_.`); return true; }
            const db = load();
            if (db[sender].length >= MAX_TRACKS) { await say(`❌ Playlist piena (max ${MAX_TRACKS} brani).`); return true; }
            if (db[sender].some((t) => ytId(t.url) === ytId(v.url))) {
                await say(`⚠️ *${cut(v.title)}* è già nella tua playlist.`);
                return true;
            }
            db[sender].push({ title: v.title, url: v.url, duration: v.timestamp || '--:--' });
            writeDb(playlistDbPath, db);
            await say(`✅ Aggiunto:\n*${cut(v.title, 60)}*\n⏱️ ${v.timestamp || '--:--'}\n📀 Posizione: *${db[sender].length}* (pagina ${Math.ceil(db[sender].length / 4)}: \`.pl page ${Math.ceil(db[sender].length / 4)}\`)`);
        } catch (e) {
            console.error('pl add testo:', e.message);
            await say('❌ Errore durante la ricerca.');
        }
        return true;
    }

    return false;
}

module.exports = { handle, shuffle, toSec, fmt, MAX_TRACKS };
