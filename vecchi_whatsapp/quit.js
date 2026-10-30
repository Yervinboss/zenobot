const { isOwner } = require('../lib/owner');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pending = new Map(); // sender -> Set di jid selezionati

async function getAllGroups(sock) {
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({ id: g.id, name: g.subject || '(senza nome)' }));
    } catch (e) { console.error('quit getAllGroups:', e.message); return []; }
}

async function showList(sock, m, ctx, sender, jid) {
    const groups = await getAllGroups(sock);
    if (!groups.length) {
        return sock.sendMessage(jid, { text: '❌ Il bot non è in nessun gruppo.' }, { quoted: m });
    }

    const sel = pending.get(sender) || new Set();
    pending.set(sender, sel);

    const cfg = ctx.config;
    const name = ctx.pushName ? ' ' + ctx.pushName : '';
    const caption =
        '🚪 *ABBANDONA GRUPPI*\n' +
        '👋 Ciao' + name + '!\n' +
        '📦 ' + groups.length + ' gruppi • selezionati: *' + sel.size + '*\n\n' +
        '👇 Tocca un gruppo per selezionarlo / toglierlo';

    // 1) foto + didascalia (stile menu)
    let sent = false;
    try {
        await sock.sendMessage(jid, { image: { url: cfg.cardImage }, caption }, { quoted: m });
        sent = true;
    } catch {}
    if (!sent) await sock.sendMessage(jid, { text: caption }, { quoted: m });

    // 2) lista
    const rows = [];

    // Azioni in cima (solo se c'è almeno 1 selezionato)
    if (sel.size > 0) {
        rows.push({
            title: '✅ Conferma uscita (' + sel.size + ')',
            description: 'Fai uscire il bot dai ' + sel.size + ' gruppi selezionati',
            id: 'quit_ok'
        });
        rows.push({
            title: '🗑️ Azzera selezione',
            description: 'Deseleziona tutti i gruppi',
            id: 'quit_reset'
        });
    }

    // Gruppi (max 28 per non sforare)
    groups.slice(0, 28).forEach((g, i) => {
        const isSel = sel.has(g.id);
        rows.push({
            title: (isSel ? '✅ ' : '⬜ ') + String(g.name).substring(0, 28),
            description: isSel ? 'Selezionato — tocca per rimuovere' : 'Tocca per selezionare',
            id: 'quit_sel_' + i
        });
    });

    try {
        await ctx.sendList({
            text: sel.size > 0 ? 'Tocca ✅ Conferma per uscire dai ' + sel.size + ' gruppi' : 'Seleziona i gruppi',
            footer: cfg.cardFooter,
            buttonText: '🚪 Scegli gruppi',
            sections: [{
                title: 'Gruppi' + (sel.size > 0 ? ' • ' + sel.size + ' selezionati' : ''),
                rows
            }]
        }, { mode: 'universal' });
    } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Errore menu: ' + e.message }, { quoted: m });
    }
}

// Comandi generati dinamicamente
const cmds = ['quit', 'esci', 'leave', 'quit_ok', 'quit_reset'];
for (let i = 0; i < 28; i++) cmds.push('quit_sel_' + i);

module.exports = {
    commands: cmds,
    name: 'quit',
    category: 'creatore',
    author: 'ZENO',
    description: 'Fai uscire il bot da uno o più gruppi (multi-select)',
    usage: '',
    ownerOnly: true,

    async run(sock, m, args, cmd, ctx) {
        const jid = ctx?.chatJid || m.key.remoteJid;
        const sender = m.key.participant || (m.key.fromMe && sock.user?.id) || m.key.remoteJid;

        // ── Solo owner ──
        if (!isOwner(sender)) {
            return sock.sendMessage(jid, { text: '❌ Solo il creatore può usare questo comando.' }, { quoted: m });
        }

        // ── Toggle selezione: quit_sel_N ──
        if (/^quit_sel_\d+$/.test(cmd)) {
            const idx = parseInt(cmd.replace('quit_sel_', ''));
            const groups = await getAllGroups(sock);
            const g = groups[idx];
            if (!g) return sock.sendMessage(jid, { text: '❌ Gruppo non trovato. Rifai `.quit`.' }, { quoted: m });

            const sel = pending.get(sender) || new Set();
            if (sel.has(g.id)) sel.delete(g.id);
            else sel.add(g.id);
            pending.set(sender, sel);

            // Rimanda la lista aggiornata
            return showList(sock, m, ctx, sender, jid);
        }

        // ── Azzera selezione ──
        if (cmd === 'quit_reset') {
            pending.delete(sender);
            return showList(sock, m, ctx, sender, jid);
        }

        // ── Conferma: esci da tutti i gruppi selezionati ──
        if (cmd === 'quit_ok') {
            const sel = pending.get(sender);
            if (!sel || sel.size === 0) {
                return sock.sendMessage(jid, { text: '⚠️ Nessun gruppo selezionato. Tocca ⬜ per selezionare.' }, { quoted: m });
            }

            const groups = await getAllGroups(sock);
            const targets = groups.filter(g => sel.has(g.id));

            await sock.sendMessage(jid, {
                text: '⏳ *Uscita in corso...*\n\nGruppi: *' + targets.length + '*'
            }, { quoted: m });

            let ok = 0, fail = 0;
            const failures = [];

            for (const g of targets) {
                try {
                    await sock.sendMessage(g.id, {
                        text: '👋 *Arrivederci!*\n\nIl bot sta uscendo dal gruppo...'
                    }).catch(() => {});
                } catch {}

                await sleep(1200);

                try {
                    await sock.groupLeave(g.id);
                    ok++;
                } catch (e) {
                    fail++;
                    failures.push(g.name + ': ' + e.message.slice(0, 50));
                }

                await sleep(1500 + Math.floor(Math.random() * 1000));
            }

            pending.delete(sender);

            let report = '✅ *Uscita completata*\n\n' +
                '🚪 Uscito da: *' + ok + '*' + (fail ? '\n❌ Falliti: *' + fail + '*' : '') +
                '\n📊 Totale: *' + targets.length + '*';
            if (failures.length) report += '\n\n*Errori:*\n' + failures.slice(0, 5).join('\n');

            return sock.sendMessage(jid, { text: report }, { quoted: m });
        }

        // ── .quit / .esci / .leave → mostra la lista (in privato o gruppo) ──
        return showList(sock, m, ctx, sender, jid);
    }
};
