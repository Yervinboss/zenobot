const fs = require('fs');
const path = require('path');
const { isOwner } = require('../lib/owner');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pending = new Map(); // sender -> { targets: [jid], label }

async function getAllGroups(sock) {
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({ id: g.id, name: g.subject || '(senza nome)' }));
    } catch (e) { console.error('bt getAllGroups:', e.message); return []; }
}

function extractText(m) {
    const msg = m.message || {};
    const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg;
    return inner.conversation ||
        inner.extendedTextMessage?.text ||
        inner.imageMessage?.caption ||
        inner.videoMessage?.caption ||
        inner.documentMessage?.caption ||
        '';
}

function buildContent(m, text) {
    const msg = m.message || {};
    const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg;
    const ctx = inner.extendedTextMessage?.contextInfo || inner.imageMessage?.contextInfo ||
        inner.videoMessage?.contextInfo || inner.documentMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (quoted) {
        if (quoted.imageMessage)    return { image: quoted.imageMessage, caption: text || quoted.imageMessage.caption || '' };
        if (quoted.videoMessage)    return { video: quoted.videoMessage, caption: text || quoted.videoMessage.caption || '', gifPlayback: quoted.videoMessage.gifPlayback };
        if (quoted.audioMessage)    return { audio: quoted.audioMessage, mimetype: quoted.audioMessage.mimetype, ptt: quoted.audioMessage.ptt };
        if (quoted.documentMessage) return { document: quoted.documentMessage, mimetype: quoted.documentMessage.mimetype, fileName: quoted.documentMessage.fileName, caption: text || '' };
        if (quoted.stickerMessage)  return { sticker: quoted.stickerMessage };
        const qtext = quoted.conversation || quoted.extendedTextMessage?.text || '';
        return { text: text || qtext };
    }
    if (inner.imageMessage)    return { image: inner.imageMessage, caption: text || inner.imageMessage.caption || '' };
    if (inner.videoMessage)    return { video: inner.videoMessage, caption: text || inner.videoMessage.caption || '', gifPlayback: inner.videoMessage.gifPlayback };
    if (inner.audioMessage)    return { audio: inner.audioMessage, mimetype: inner.audioMessage.mimetype, ptt: inner.audioMessage.ptt };
    if (inner.documentMessage) return { document: inner.documentMessage, mimetype: inner.documentMessage.mimetype, fileName: inner.documentMessage.fileName, caption: text || '' };
    if (inner.stickerMessage)  return { sticker: inner.stickerMessage };
    return { text: text || '' };
}

async function doBroadcast(sock, replyJid, m, targets, label, text) {
    const content = buildContent(m, text);
    const statusMsg = await sock.sendMessage(replyJid, {
        text: '📢 *Broadcast verso ' + label + '*\n\n📊 Gruppi: *' + targets.length + '*\n⏳ Avvio...'
    });

    let ok = 0, fail = 0;
    const failures = [];
    for (let i = 0; i < targets.length; i++) {
        try {
            await sock.sendMessage(targets[i], content);
            ok++;
        } catch (e) { fail++; failures.push(e.message.slice(0, 60)); }
        if (targets.length > 1) await sleep(2000 + Math.floor(Math.random() * 2000));
    }

    let report = '✅ *Broadcast completato*\n\n' +
        '📤 Inviato: *' + ok + '*' +
        (fail ? '\n❌ Falliti: *' + fail + '*' : '') +
        '\n📊 Totale: *' + targets.length + '*';
    if (failures.length) report += '\n\n*Errori:*\n' + failures.slice(0, 3).join('\n');

    try { await sock.sendMessage(replyJid, { text: report }); } catch {}
}

// Hook: cattura il messaggio successivo dopo la selezione
async function hook(sock, m) {
    if (m.key.fromMe) return;
    const jid = m.key.remoteJid;
    const sender = m.key.participant || jid;
    const p = pending.get(sender);
    if (!p) return;

    const Z = global.ZENO;
    const prefixes = [].concat(Z?.CONFIG?.prefix || '.', Z?.CONFIG?.prefixes || []).filter(Boolean);
    const raw = extractText(m);
    if (raw && prefixes.some(pr => raw.startsWith(pr))) return; // è un altro comando, ignora

    pending.delete(sender);
    await doBroadcast(sock, jid, m, p.targets, p.label, raw);
}

// Genero i comandi di selezione (0..29 + all)
const cmds = ['bt'];
for (let i = 0; i < 29; i++) cmds.push('bt_sel_' + i);
cmds.push('bt_sel_all');

module.exports = {
    commands: cmds,
    name: 'bt',
    category: 'creatore',
    author: 'ZENO',
    description: 'Broadcast con menu di selezione (stile menu)',
    usage: '[testo]',
    ownerOnly: true,
    hook,

    async run(sock, m, args, cmd, ctx) {
        const jid = ctx?.chatJid || m.key.remoteJid;
        const sender = m.key.participant || (m.key.fromMe && sock.user?.id) || m.key.remoteJid;

        if (!isOwner(sender)) {
            return sock.sendMessage(jid, { text: '❌ Solo il creatore può usare questo comando.' }, { quoted: m });
        }

        // ── Click da menu: bt_sel_all o bt_sel_N ──
        if (cmd === 'bt_sel_all' || /^bt_sel_\d+$/.test(cmd)) {
            const groups = await getAllGroups(sock);
            let targets = [], label = '';
            if (cmd === 'bt_sel_all') {
                targets = groups.map(g => g.id);
                label = 'TUTTI I GRUPPI';
            } else {
                const idx = parseInt(cmd.replace('bt_sel_', ''));
                const g = groups[idx];
                if (!g) return sock.sendMessage(jid, { text: '❌ Gruppo non trovato. Rifai `.bt`.' }, { quoted: m });
                targets = [g.id];
                label = g.name;
            }
            pending.set(sender, { targets, label });
            return sock.sendMessage(jid, {
                text: '✍️ *Scrivi adesso il messaggio*\n\n' +
                    '🎯 Destinazione: *' + label + '*\n' +
                    '📊 Gruppi: *' + targets.length + '*\n\n' +
                    'Manda il testo (o una foto/video con caption) e lo invio subito.\n' +
                    '_Se cambi idea, manda un altro comando con prefisso._'
            }, { quoted: m });
        }

        // ── Broadcast immediato con testo inline ──
        const text = args.join(' ').trim();
        if (text) {
            const groups = await getAllGroups(sock);
            if (!groups.length) return sock.sendMessage(jid, { text: '❌ Il bot non è in nessun gruppo.' }, { quoted: m });
            const targets = groups.map(g => g.id);
            return doBroadcast(sock, jid, m, targets, 'TUTTI I GRUPPI', text);
        }

        // ── Menu (senza argomenti): foto + didascalia + lista (stile menu) ──
        await sock.sendMessage(jid, { text: '⏳ Recupero la lista dei gruppi...' }, { quoted: m });
        const groups = await getAllGroups(sock);
        if (!groups.length) return sock.sendMessage(jid, { text: '❌ Il bot non è in nessun gruppo.' }, { quoted: m });

        const cfg = ctx.config;
        const name = ctx.pushName ? ' ' + ctx.pushName : '';
        const caption =
            '📢 *BROADCAST*\n' +
            '👋 Ciao' + name + '!\n' +
            '📦 ' + groups.length + ' gruppi disponibili\n\n' +
            '👇 Scegli la destinazione dal pulsante qui sotto';

        // 1) foto + didascalia (come il menu)
        let sent = false;
        try {
            await sock.sendMessage(jid, { image: { url: cfg.cardImage }, caption }, { quoted: m });
            sent = true;
        } catch {}
        if (!sent) await sock.sendMessage(jid, { text: caption }, { quoted: m });

        // 2) lista con pulsante (stile menu)
        const rows = groups.slice(0, 29).map((g, i) => ({
            title: '📢 ' + String(g.name).substring(0, 30),
            description: 'Invia solo a questo gruppo',
            id: 'bt_sel_' + i
        }));
        rows.unshift({
            title: '🎯 TUTTI I GRUPPI',
            description: 'Broadcast a ' + groups.length + ' gruppi',
            id: 'bt_sel_all'
        });

        try {
            await ctx.sendList({
                text: 'Seleziona dove inviare',
                footer: cfg.cardFooter,
                buttonText: '📢 Scegli destinazione',
                sections: [{ title: 'Destinazione', rows }]
            }, { mode: 'universal' });
        } catch (e) {
            await sock.sendMessage(jid, { text: '❌ Errore nel menu: ' + e.message }, { quoted: m });
        }
    }
};
