// ╔════════════════════════════════════════╗
// ║   📸  ZEUS BOT  •  PLUGIN INSTAGRAM    ║
// ╚════════════════════════════════════════╝

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const APP_ID = '936619743392459';
const RISERVATI = ['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts'];

const panel = (titolo, righe = []) =>
    `╭━━━『 ${titolo} 』━━━╮\n${righe.map((r) => `┃ ${r}`).join('\n')}\n╰━━━━━━━━━━━━━━━━━━━╯`;
const num = (n) => Number(n || 0).toLocaleString('it-IT');

// estrae lo username da link, @nome o nome semplice
function estraiUsername(input) {
    const t = String(input || '').trim();
    const link = t.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
    let u = link ? link[1] : t.replace(/^@/, '');
    u = u.replace(/\/+$/, '');
    if (RISERVATI.includes(u.toLowerCase())) return null;
    return /^[a-zA-Z0-9._]{1,30}$/.test(u) ? u.toLowerCase() : null;
}

async function leggiProfiloApi(username) {
    const res = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: { 'User-Agent': UA, 'x-ig-app-id': APP_ID, 'Accept': 'application/json' }
    });
    if (res.status === 404) return { nonTrovato: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { user: json?.data?.user || null };
}

module.exports = {
    commands: ['ig', 'instagram'],
    run: async (sock, m, args) => {
        const jid = m.key.remoteJid;
        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });
        const react = (text) => sock.sendMessage(jid, { react: { text, key: m.key } }).catch(() => {});

        const username = estraiUsername(args.join(' '));
        if (!username)
            return reply('❌ Scrivi un nome o un link valido.\nEsempio: `.ig cristiano` oppure `.ig https://instagram.com/cristiano`');

        await react('🔎');
        let dati;
        try { dati = await leggiProfilo(username); }
        catch (e) {
            console.error('Errore IG:', e.message);
            await react('❌');
            return reply('⚠️ Instagram ha bloccato la richiesta. Riprova tra qualche minuto.');
        }
        if (dati.nonTrovato || !dati.user) {
            await react('❌');
            return reply(`❌ Profilo *@${username}* non trovato.`);
        }

        const u = dati.user;
        const righe = [
            `👤 *${u.full_name || u.username}* ${u.is_verified ? '✅' : ''}`,
            `🔗 @${u.username}`,
            u.is_private === undefined ? '🔎 Dati dalla pagina pubblica' : u.is_private ? '🔒 Account *privato*' : '🌍 Account *pubblico*',
            '',
            `👥 Follower: *${num(u.edge_followed_by?.count)}*`,
            `➕ Seguiti: *${num(u.edge_follow?.count)}*`,
            `🖼️ Post: *${num(u.edge_owner_to_timeline_media?.count)}*`
        ];
        if (u.category_name) righe.push(`🏷️ Categoria: ${u.category_name}`);
        if (u.biography) righe.push('', `📝 ${u.biography}`);
        if (u.external_url) righe.push(`🌐 ${u.external_url}`);
        righe.push('', `📎 instagram.com/${u.username}`);
        const caption = panel('📸 INSTAGRAM', righe);

        try {
            const foto = u.profile_pic_url_hd || u.profile_pic_url;
            const buf = Buffer.from(await (await fetch(foto)).arrayBuffer());
            await sock.sendMessage(jid, { image: buf, caption }, { quoted: m });
        } catch (e) {
            console.error('Errore foto IG:', e.message);
            await reply(caption);
        }
        await react('✅');
    }
};

// ━━━ metodo 2: meta tag della pagina pubblica ━━━
const abbrevia = (s) => {
    const t = String(s).replace(/,/g, '').trim();
    const n = parseFloat(t);
    if (/k$/i.test(t)) return Math.round(n * 1e3);
    if (/m$/i.test(t)) return Math.round(n * 1e6);
    return Math.round(n) || 0;
};

async function leggiProfiloHtml(username) {
    const res = await fetch(`https://www.instagram.com/${username}/`, {
        headers: {
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });
    if (res.status === 404) return { nonTrovato: true };
    if (!res.ok) throw new Error(`HTML ${res.status}`);
    const html = await res.text();
    const meta = (p) => {
        const r = html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`, 'i'));
        return r ? r[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&') : null;
    };
    const desc = meta('og:description') || '';
    const stat = desc.match(/([\d.,]+[KMkm]?)\s+Followers?,\s*([\d.,]+[KMkm]?)\s+Following,\s*([\d.,]+[KMkm]?)\s+Posts?/i);
    if (!stat) throw new Error('HTML senza dati');
    const nome = ((meta('og:title') || '').match(/^(.*?)\s*\(@/) || [])[1] || username;
    const bio = (desc.match(/on Instagram:\s*"(.*)"\s*$/s) || [])[1] || '';
    return { user: {
        username, full_name: nome, biography: bio, is_verified: false,
        profile_pic_url_hd: meta('og:image'),
        edge_followed_by: { count: abbrevia(stat[1]) },
        edge_follow: { count: abbrevia(stat[2]) },
        edge_owner_to_timeline_media: { count: abbrevia(stat[3]) }
    } };
}

async function leggiProfilo(username) {
    const errori = [];
    for (const metodo of [leggiProfiloApi, leggiProfiloHtml]) {
        try {
            const r = await metodo(username);
            if (r.nonTrovato || r.user) return r;
        } catch (e) { errori.push(e.message); }
    }
    throw new Error(errori.join(' | '));
}
