const { pureId, isAdmin, sendButtons } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

async function extractInfo(sock, req) {
    const rawJid = req.jid || req.id || req.userJid || '';
    if (!rawJid) return null;

    let realPhone = req.phone_number || req.phoneNumber || req.phone || null;

    // Se è un LID senza numero, prova a convertirlo con la mappa di Baileys
    if (!realPhone && rawJid.includes('@lid')) {
        try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(rawJid);
            if (pn) realPhone = pn;
        } catch {}
    }

    const isLid = rawJid.includes('@lid') && !realPhone;
    const phone = realPhone ? pureId(realPhone) : pureId(rawJid);
    return { jid: rawJid, phone, isLid };
}

const isItalian = (phone) => phone && phone.startsWith('39');

async function doAction(sock, jid, m, filter) {
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    const requests = await sock.groupRequestParticipantsList(jid).catch(() => []);
    if (!requests || requests.length === 0) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return await sock.sendMessage(jid, { text: '📝 Nessuna richiesta in coda.' }, { quoted: m });
    }

    const action = filter === 'reject' ? 'reject' : 'approve';
    const toProcess = [];

    for (const req of requests) {
        const info = await extractInfo(sock, req);
        if (!info) continue;

        let match = false;
        if (filter === 'it') match = !info.isLid && isItalian(info.phone);
        else if (filter === 'voip') match = !info.isLid && info.phone && !isItalian(info.phone);
        else if (filter === 'lid') match = info.isLid;
        else if (filter === 'all' || filter === 'reject') match = true;

        if (match) toProcess.push(info.jid);
    }

    if (toProcess.length === 0) {
        await sock.sendMessage(jid, { react: { text: '⚠️', key: m.key } });
        return await sock.sendMessage(jid, { text: `⚠️ Nessun utente per il filtro *${filter}*.` }, { quoted: m });
    }

    let successCount = 0;
    let failCount = 0;
    for (const userJid of toProcess) {
        try {
            await sock.groupRequestParticipantsUpdate(jid, [userJid], action);
            successCount++;
        } catch (e) {
            console.error('req action errore su', userJid, ':', e.message);
            failCount++;
        }
    }

    await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    const actionText = action === 'approve' ? '✅ Approvati' : '❌ Rifiutati';
    let txt = `${actionText}: *${successCount}*`;
    if (failCount > 0) txt += `\n⚠️ Falliti: *${failCount}*`;
    return await sock.sendMessage(jid, { text: txt }, { quoted: m });
}

module.exports = {
    commands: ['req', 'richieste', 'richiesta', 'req_it', 'req_voip', 'req_lid', 'req_all', 'req_reject'],

    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        if (!isOwner(sender) && !(await isAdmin(sock, jid, sender)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        // === AZIONI (bottone con _) ===
        if (cmd.startsWith('req_')) {
            const filter = cmd.replace('req_', '');
            return await doAction(sock, jid, m, filter);
        }

        // === AZIONE DA TESTO (.req all) ===
        const filter = (args[0] || '').toLowerCase();
        if (['it', 'voip', 'lid', 'all', 'reject'].includes(filter))
            return await doAction(sock, jid, m, filter);

        // === PANNELLO ===
        const requests = await sock.groupRequestParticipantsList(jid).catch(() => []);
        const total = requests ? requests.length : 0;


        let itCount = 0, voipCount = 0, lidCount = 0;
        if (requests && requests.length > 0) {
            for (const req of requests) {
                const info = await extractInfo(sock, req);
                if (!info) continue;
                if (info.isLid) lidCount++;
                else if (isItalian(info.phone)) itCount++;
                else voipCount++;
            }
        }

        const buttons = [];
        if (itCount > 0) buttons.push({ text: `🇮🇹 Accetta IT (${itCount})`, id: 'req_it' });
        if (voipCount > 0) buttons.push({ text: `🌐 Accetta VoIP (${voipCount})`, id: 'req_voip' });
        if (lidCount > 0) buttons.push({ text: `❓ Accetta LID (${lidCount})`, id: 'req_lid' });
        buttons.push({ text: '✅ Accetta Tutti', id: 'req_all' });
        buttons.push({ text: '❌ Rifiuta Tutti', id: 'req_reject' });

        let bodyText =
            `📝 *RICHIESTE DI ACCESSO*\n\n` +
            `👥 In coda: *${total}*\n` +
            `🇮🇹 Italiani (+39): *${itCount}*\n` +
            `🌐 VoIP/Esteri: *${voipCount}*\n`;
        if (lidCount > 0) bodyText += `❓ LID (numeri nascosti): *${lidCount}*\n`;
        bodyText += `\nScegli un'opzione:`;

        return await sendButtons(sock, jid, bodyText, 'Zeno Bot • Security 🛡️', buttons, m);
    }
};
