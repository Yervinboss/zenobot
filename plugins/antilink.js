const fs = require('fs');
const path = require('path');
const { pureId, isImmune, sendButtons } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const dbPath = path.join(__dirname, '../database/antilink.json');

// ═════════ CONFIG ═════════
const DEFAULT_WL = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be'];
const MAX_TEXT = 8000;                    // testo totale oltre cui è "crash"
const MAX_NODES = 2000;                   // nodi max nel messaggio
const MAX_DEPTH = 12;                     // annidamento max
const BURST_MS = 8000;                    // raffica = 1 solo avviso/strike
const STRIKE_TTL = 7 * 24 * 3600 * 1000;  // gli avvisi scadono dopo 7 giorni
const DEFAULT_MAX = 3;                    // avvisi prima del kick (modalità warn)

const SKIP = new Set(['url', 'directPath', 'mediaKey', 'fileSha256', 'fileEncSha256', 'mediaKeyTimestamp',
    'jpegThumbnail', 'thumbnailDirectPath', 'thumbnailSha256', 'thumbnailEncSha256', 'waveform',
    'streamingSidecar', 'scansSidecar', 'scanLengths', 'midQualityFileSha256', 'quotedMessage',
    'fileName', 'mimetype', 'mentionedJid', 'remoteJid', 'participant', 'stanzaId', 'groupJid',
    'newsletterJid', 'messageSecret']);
const JID_RE = /^[\w.:+-]+@(?:s\.whatsapp\.net|g\.us|lid|newsletter|broadcast|c\.us)$/i;

// caratteri invisibili / di controllo (usati per nascondere link e per i crash)
const INVIS = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;
const MARKS = /[\u0300-\u036F]/g;
const CRASH_RUN = /[\u0483-\u0489\u0591-\u06FF\u0700-\u074F\u0900-\u0DFF\u0F00-\u0FFF\u1000-\u109F\u1780-\u17FF\u1800-\u18AF\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFB1D-\uFDFF\uFE70-\uFEFF]{300,}/;

const TLDS = ('com net org info biz edu gov it io me co xyz app dev site online store shop club live link click top vip fun ' +
    'ws tv ai uk de fr es eu br ru cn jp kr pw cc tk ml ga cf gq gg ly im nl pl ch ro ua tr vn ph mx za ng ke eg cx su fm ' +
    'ee lt lv cz sk hu gr pt se fi dk ie bg hr rs lu mt cy xxx porn sex adult cam tube bet casino loan work website tech ' +
    'cloud pro mobi name asia today news blog wiki zone world life icu buzz lol gl gd ink cyou monster digital network ' +
    'agency fyi wtf rip ninja').split(' ');
const BARE_RE = new RegExp('(?<![@\\w.-])((?:[a-z0-9-]+\\.)+(?:' + TLDS.join('|') + '))(?![a-z0-9-])(?::\\d{1,5})?([/?#][^\\s<>"\'`]*)?', 'gi');
const URL_RE = /\b(?:(?:https?|ftp):[\/\\]*[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
const IP_RE = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5}|\/\S*)/g;
const DEEP_RE = /\b(?:tg|intent|ftp):\/\/\S+|\bjavascript:\S+/i;

// ═════════ MODALITÀ STRICT (opzionale, per gruppo) ═════════
const TLDS_STRICT = 'no in to so is at be am la as ma si my id us ar pe ad ag by ac nu'.split(' ');
const BARE_STRICT = new RegExp('(?<![@\\w.-])((?:[a-z0-9-]+\\.)+(?:' + TLDS_STRICT.join('|') + '))(?![a-z0-9-])(?::\\d{1,5})?([/?#][^\\s<>"\'`]*)?', 'gi');
const SPACED_RE = /([a-z0-9-]{2,})\s+\.\s*([a-z]{2,10})\b/gi;                       // "ciao . com" / "ciao .com"
const PUNTO_RE = /([a-z0-9-]{2,})\s+punto\s+(com|net|org|info|xyz|io|it)\b/gi;     // "ciao punto com"

// ═════════ NORMALIZZAZIONE (anti-offuscamento) ═════════
function norm(s) {
    return s.normalize('NFKC')                                   // ｅｖｉｌ．ｃｏｍ -> evil.com
        .replace(INVIS, '')                                      // zero-width & co
        .replace(/[\u3002\uFF0E\uFF61\u2024\u2E2E]/g, '.')       // punti "strani"
        .replace(/\bhxxp(s?)/gi, 'http$1')                       // hxxps://
        .replace(/\s*[\[\(\{<]\s*(?:\.|dot|punto)\s*[\]\)\}>]\s*/gi, '.')  // evil[.]com (dot)
        .replace(/\s+dot\s+/gi, '.')                             // evil dot com
        .replace(/[\[\(\{]\s*:\s*[\]\)\}]/g, ':');               // http[:]//
}

function parseUrl(raw) {
    let s = raw.replace(/[)\].,;:!?]+$/, '');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://' + s;
    try { return new URL(s); } catch { return null; }
}

const inWl = (host, wl) => wl.some(d => host === d || host.endsWith('.' + d));

// URL ammesso solo se: http(s), niente user@, host ESATTO in whitelist (o suo sottodominio),
// e nessun redirect nascosto verso altri siti
function allowed(u, wl) {
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!inWl(host, wl)) return false;
    if (/^\/redirect(\/|$)/i.test(u.pathname)) return false;
    let tail = u.search + u.hash;
    if (/%3a%2f%2f/i.test(tail)) return false;
    for (let i = 0; i < 2; i++) { try { tail = decodeURIComponent(tail); } catch { break; } }
    return !/:\/\//.test(tail);
}

function findLink(text, wl, strict) {
    let s = norm(text);
    if (strict) s = s.replace(SPACED_RE, '$1.$2').replace(PUNTO_RE, '$1.$2');
    for (const mt of s.matchAll(URL_RE)) {
        const u = parseUrl(mt[0]);
        if (!u || !allowed(u, wl)) return mt[0].slice(0, 60);
    }
    const rest = s.replace(URL_RE, ' ');
    for (const mt of rest.matchAll(BARE_RE)) {
        const host = mt[1].toLowerCase();
        if (inWl(host, wl)) {
            const u = parseUrl(host + (mt[2] || ''));
            if (u && allowed(u, wl)) continue;
        }
        return mt[0].slice(0, 60);
    }
    if (strict) for (const mt of rest.matchAll(BARE_STRICT)) {
        const host = mt[1].toLowerCase();
        if (inWl(host, wl)) { const u = parseUrl(host + (mt[2] || '')); if (u && allowed(u, wl)) continue; }
        return mt[0].slice(0, 60);
    }
    for (const mt of rest.matchAll(IP_RE)) {
        if (mt[0].split(/[:\/]/)[0].split('.').every(o => +o <= 255)) return mt[0].slice(0, 60);
    }
    const d = s.match(DEEP_RE);
    return d ? d[0].slice(0, 60) : null;
}

// ═════════ ANALISI MESSAGGIO ═════════
// toglie viewOnce / effimeri / modifiche e ricorda la chiave del messaggio ORIGINALE (per le modifiche)
function unwrap(msg, jid, sender) {
    let cur = msg || {}, delKey = null;
    for (let i = 0; i < 8; i++) {
        const pm = cur.protocolMessage;
        if (pm?.editedMessage && pm.key) delKey = { ...pm.key, remoteJid: jid, participant: pm.key.participant || sender };
        const nxt = cur.viewOnceMessage?.message || cur.viewOnceMessageV2?.message ||
            cur.viewOnceMessageV2Extension?.message || cur.ephemeralMessage?.message ||
            cur.documentWithCaptionMessage?.message || cur.editedMessage?.message || pm?.editedMessage;
        if (!nxt) break;
        cur = nxt;
    }
    return { inner: cur, delKey };
}

// raccoglie TUTTE le stringhe del messaggio (non il JSON grezzo)
function collect(node, out, st, depth) {
    if (node == null || st.over) return;
    if (depth > MAX_DEPTH || ++st.n > MAX_NODES) { st.over = true; return; }
    if (typeof node === 'string') { st.len += node.length; if (st.len <= 200000) out.push(node); return; }
    if (typeof node !== 'object' || ArrayBuffer.isView(node)) return;
    if (Array.isArray(node)) { for (const x of node) collect(x, out, st, depth + 1); return; }
    for (const k of Object.keys(node)) { if (!SKIP.has(k)) collect(node[k], out, st, depth + 1); }
}

function crashReason(texts, st) {
    if (st.over) return 'struttura anomala';
    if (st.len > MAX_TEXT) return 'testo enorme';
    for (const t of texts) {
        if (CRASH_RUN.test(t)) return 'caratteri crash';
        if ((t.match(MARKS) || []).length > 150) return 'zalgo';
        if ((t.match(INVIS) || []).length > 200) return 'caratteri invisibili';
    }
    return null;
}

function analyze(m, jid, sender, wl, strict) {
    const { inner, delKey } = unwrap(m.message, jid, sender);
    const texts = [], st = { n: 0, len: 0, over: false };
    collect(inner, texts, st, 0);
    if (inner.locationMessage?.url) texts.push(String(inner.locationMessage.url));
    const crash = crashReason(texts, st);
    if (crash) return { reason: 'crash', detail: crash, delKey };
    if (inner.groupInviteMessage) return { reason: 'link', detail: 'invito gruppo', delKey };
    for (const t of texts) {
        if (t.length < 4 || JID_RE.test(t)) continue;
        const hit = findLink(t, wl, strict);
        if (hit) return { reason: 'link', detail: hit, delKey };
    }
    return null;
}

// ═════════ DATABASE (in memoria + scrittura atomica) ═════════
let DB = null;
function load() {
    if (DB) return DB;
    try { DB = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { DB = {}; }
    if (!DB || typeof DB !== 'object' || Array.isArray(DB)) DB = {};
    return DB;
}
function save() {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const tmp = dbPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(DB, null, 2));
        fs.renameSync(tmp, dbPath);
    } catch (e) { console.error('antilink save:', e.message); }
}
function getCfg(jid) {
    const c = load()[jid];
    if (!c) return null;
    if (c.mode !== 'warn') c.mode = 'kick';
    if (!Array.isArray(c.wl)) c.wl = [];
    if (!Number.isInteger(c.max)) c.max = DEFAULT_MAX;
    if (!c.strikes || typeof c.strikes !== 'object') c.strikes = {};
    if (!Array.isArray(c.log)) c.log = [];
    return c;
}

// ═════════ UTILITÀ GRUPPO ═════════
const num = (j) => String(j || '').split('@')[0].split(':')[0];
const META = new Map(), RECENT = new Map(), NOADM = new Map();

async function botIsAdmin(sock, jid) {
    try {
        let c = META.get(jid);
        if (!c || Date.now() - c.t > 60000) { c = { t: Date.now(), m: await sock.groupMetadata(jid) }; META.set(jid, c); }
        const ids = new Set([sock.user?.id, sock.user?.lid, sock.user?.jid].filter(Boolean).map(num));
        const me = c.m.participants.find(p => [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean).some(x => ids.has(num(x))));
        if (!me) return null;
        return me.admin === 'admin' || me.admin === 'superadmin';
    } catch { return null; }
}

function addStrike(cfg, sender) {
    const key = 'u' + num(sender), now = Date.now(), e = cfg.strikes[key];
    const n = (e && now - e.ts < STRIKE_TTL ? e.n : 0) + 1;
    cfg.strikes[key] = { n, ts: now };
    for (const k of Object.keys(cfg.strikes)) if (now - cfg.strikes[k].ts > STRIKE_TTL) delete cfg.strikes[k];
    return n;
}
function pushLog(cfg, sender, v, action) {
    cfg.log.push({ t: Date.now(), u: num(sender), r: v.reason, d: v.reason === 'crash' ? v.detail : '', a: action });
    if (cfg.log.length > 20) cfg.log.splice(0, cfg.log.length - 20);
}

// ═════════ HOOK (ogni messaggio di gruppo) ═════════
async function hook(sock, m) {
    try {
        const jid = m.key?.remoteJid;
        if (!jid || !jid.endsWith('@g.us') || m.key.fromMe || !m.message) return;
        const cfg = getCfg(jid);
        if (!cfg || !cfg.enabled) return;
        const sender = m.key.participant;
        if (!sender) return;

        // prima l'analisi (solo CPU), poi l'immunità: niente chiamate inutili a ogni messaggio
        const v = analyze(m, jid, sender, [...DEFAULT_WL, ...cfg.wl], cfg.strict);
        if (!v) return;
        if (await isImmune(sock, jid, sender)) return;   // owner + admin

        // anti-raffica: da qui niente await finché non marco il mittente
        const k = jid + '|' + num(sender), now = Date.now();
        const first = now - (RECENT.get(k) || 0) > BURST_MS;
        if (first) {
            RECENT.set(k, now);
            if (RECENT.size > 500) for (const [x, t] of RECENT) if (now - t > BURST_MS) RECENT.delete(x);
        }

        if ((await botIsAdmin(sock, jid)) === false) {
            if (now - (NOADM.get(jid) || 0) > 600000) {
                NOADM.set(jid, now);
                await sock.sendMessage(jid, { text: '⚠️ Antilink attivo ma *non sono admin*: non posso eliminare né rimuovere. Rendimi admin!' });
            }
            return;
        }

        try { await sock.sendMessage(jid, { delete: v.delKey || m.key }); } catch {}
        if (!first) return;

        const tag = '@' + pureId(sender);
        const motivo = v.reason === 'crash' ? `messaggio crash (${v.detail})` : 'link non consentito';
        let n = 0, kick = v.reason === 'crash' || cfg.mode === 'kick';
        if (!kick) { n = addStrike(cfg, sender); kick = cfg.max > 0 && n >= cfg.max; }
        pushLog(cfg, sender, v, kick ? 'kick' : 'warn');
        if (kick) delete cfg.strikes['u' + num(sender)];
        save();

        if (kick) {
            try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                await sock.sendMessage(jid, { text: `🚫 ${tag} rimosso: ${motivo}.`, mentions: [sender] });
            } catch {
                await sock.sendMessage(jid, { text: `⚠️ ${tag}: ${motivo}, ma non riesco a rimuoverlo.`, mentions: [sender] });
            }
        } else {
            await sock.sendMessage(jid, { text: `⚠️ ${tag}, link non consentiti! Avviso ${n}${cfg.max ? '/' + cfg.max : ''}`, mentions: [sender] });
        }
    } catch (e) { console.error('antilink hook:', e.message); }
}

// ═════════ COMANDI ═════════
function normDomain(x) {
    if (!x) return null;
    const d = String(x).toLowerCase().trim().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
    return /^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(d) ? d : null;
}

module.exports = {
    commands: ['antilink', 'antilinkkick', 'antilinkwarn', 'antilinkoff'],
    hook,
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });
        if (!jid.endsWith('@g.us')) return reply('❌ Solo nei gruppi!');

        const sender = m.key.participant || (m.key.fromMe && sock.user.id) || m.key.remoteJid;
        if (!isOwner(sender) && !(await isImmune(sock, jid, sender))) return reply('❌ Solo admin!');

        const db = load();
        const ensure = () => { if (!db[jid]) db[jid] = { enabled: false, mode: 'kick' }; return getCfg(jid); };

        if (cmd === 'antilinkkick' || cmd === 'antilinkwarn') {
            const c = ensure();
            c.enabled = true; c.mode = cmd === 'antilinkkick' ? 'kick' : 'warn'; save();
            return reply(c.mode === 'kick'
                ? '🔗🦵 Antilink *KICK* attivato: link = rimozione immediata.'
                : `🔗⚠️ Antilink *WARN* attivato: kick dopo ${c.max || '∞'} avvisi.`);
        }
        if (cmd === 'antilinkoff') {
            const c = getCfg(jid);
            if (c) { c.enabled = false; save(); }
            return reply('🔗❌ Antilink disattivato (impostazioni conservate).');
        }

        const a = Array.isArray(args) ? args : String(args || '').trim().split(/\s+/).filter(Boolean);
        const sub = (a[0] || '').toLowerCase();

        if (sub === 'wl' || sub === 'whitelist') {
            const c = ensure(), act = (a[1] || '').toLowerCase();
            if (act === 'add' || act === 'del') {
                const d = normDomain(a[2]);
                if (!d) return reply('❌ Dominio non valido. Es: .antilink wl add spotify.com');
                if (act === 'add') {
                    if (DEFAULT_WL.includes(d) || c.wl.includes(d)) return reply('ℹ️ Già in whitelist.');
                    if (c.wl.length >= 30) return reply('❌ Whitelist piena (max 30).');
                    c.wl.push(d);
                } else {
                    if (!c.wl.includes(d)) return reply('ℹ️ Non è nella whitelist del gruppo (quelli base non si tolgono).');
                    c.wl = c.wl.filter(x => x !== d);
                }
                save();
                return reply(act === 'add' ? `✅ *${d}* aggiunto alla whitelist.` : `🗑️ *${d}* tolto dalla whitelist.`);
            }
            return reply('📋 *Whitelist*\n' + [...DEFAULT_WL, ...c.wl].map(d => '• ' + d).join('\n'));
        }

        if (sub === 'strict') {
            const c = ensure(), v = (a[1] || '').toLowerCase();
            if (v !== 'on' && v !== 'off') return reply(`🔒 Modalità *strict*: ${c.strict ? 'ATTIVA' : 'disattiva'}\nUsa: .antilink strict on/off`);
            c.strict = v === 'on'; save();
            return reply(c.strict
                ? '🔒 *Strict* attivo: bloccati anche "sito . com", "sito punto com" e domini tipo .no/.in/.to.'
                : '🔓 Strict disattivato.');
        }
        if (sub === 'max') {
            const c = ensure(), n = parseInt(a[1], 10);
            if (!(n >= 0 && n <= 10)) return reply('❌ Usa: .antilink max <0-10>\n(0 = in modalità warn non kicka mai)');
            c.max = n; save();
            return reply(n ? `✅ Kick dopo *${n}* avvisi (modalità warn).` : '✅ Modalità warn senza kick automatico.');
        }

        if (sub === 'log') {
            const c = getCfg(jid);
            if (!c || !c.log.length) return reply('📭 Nessun evento registrato.');
            const rows = c.log.slice(-10).reverse().map(e =>
                `• ${new Date(e.t).toLocaleString('it-IT')} — +${e.u} — ${e.r === 'crash' ? 'crash ' + e.d : 'link'} → ${e.a}`);
            return reply('📜 *Ultimi eventi*\n' + rows.join('\n'));
        }

        const c = getCfg(jid);
        const status = c && c.enabled ? `Attivo (${c.mode.toUpperCase()}${c.mode === 'warn' ? ', soglia ' + (c.max || '∞') : ''})` : 'Disattivo';
        const extra = c ? c.wl.length : 0;
        return await sendButtons(sock, jid,
            `🔗 *GESTIONE ANTILINK*\n\nStato: *${status}*\nWhitelist: TikTok, Instagram, YouTube${extra ? ` (+${extra})` : ''}\n` +
            `Protegge da: link anche offuscati, inviti, redirect, modifiche e messaggi crash\n\n` +
            `_.antilink wl add/del <dominio> · .antilink max <n> · .antilink log · .antilink strict on/off_\n\nScegli:`,
            'Zeus Bot - Moderazione',
            [
                { text: '🦵 Modalità Kick', id: 'antilinkkick' },
                { text: '⚠️ Modalità Warn', id: 'antilinkwarn' },
                { text: '❌ Disattiva', id: 'antilinkoff' }
            ], m
        );
    }
};
