const { pureId, getTarget } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

async function isAdmin(sock, jid, m) {
    try {
        const meta = await sock.groupMetadata(jid);
        const ids = new Set(
            [m.key.participant, m.key.participantAlt, m.participant]
                .filter(Boolean).map(pureId)
        );

        // Converte numero <-> LID con la mappa interna di Baileys
        const lm = sock.signalRepository?.lidMapping;
        for (const id of [...ids]) {
            try {
                const lid = await lm?.getLIDForPN?.(id + '@s.whatsapp.net');
                if (lid) ids.add(pureId(lid));
            } catch {}
            try {
                const pn = await lm?.getPNForLID?.(id + '@lid');
                if (pn) ids.add(pureId(pn));
            } catch {}
        }

        console.log('isAdmin ids:', [...ids]);

        return meta.participants.some(p =>
            p.admin &&
            [p.id, p.lid, p.phoneNumber].filter(Boolean)
                .map(pureId).some(x => ids.has(x))
        );
    } catch (e) {
        console.log('isAdmin err:', e.message);
        return false;
    }
}

module.exports = {
    commands: ['p', 'd'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!jid.endsWith('@g.us'))
            return await sock.sendMessage(jid, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        if (!isOwner(sender) && !(await isAdmin(sock, jid, m)))
            return await sock.sendMessage(jid, { text: '❌ Solo owner o admin.' }, { quoted: m });

        const { jid: targetJid, source } = getTarget(m);
        if (source === 'self')
            return await sock.sendMessage(jid, { text: '❌ Rispondi o tagga un utente per cambiare i suoi permessi!' }, { quoted: m });

        const targetId = pureId(targetJid);
        const botPure = pureId(sock.user?.id || '');
        if (targetId === botPure)
            return await sock.sendMessage(jid, { text: '❌ Impossibile modificare i permessi del bot!' }, { quoted: m });

        if (isOwner(targetJid) && !isOwner(sender))
            return await sock.sendMessage(jid, { text: '❌ Non puoi toccare un owner!' }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            // Prova a trovare il JID canonico dal groupMetadata
            const meta = await sock.groupMetadata(jid);
            const participant = meta.participants.find(p => pureId(p.id) === targetId || (p.lid && pureId(p.lid) === targetId));
            const finalTarget = participant?.id || targetJid;

            let msgText = '';
            if (cmd === 'p') {
                await sock.groupParticipantsUpdate(jid, [finalTarget], 'promote');
                msgText = `⚡ @${targetId} *È DIVENTATO UN DIO!* 👑`;
            } else if (cmd === 'd') {
                await sock.groupParticipantsUpdate(jid, [finalTarget], 'demote');
                msgText = `☠️ @${targetId} *È RITORNATO UN COMUNE MORTALE!* 📉`;
            }

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            return await sock.sendMessage(jid, { text: msgText, mentions: [finalTarget] }, { quoted: m });

        } catch (e) {
            console.error('promote_demote:', e.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return await sock.sendMessage(jid, { text: '❌ Errore. Assicurati che il bot sia admin.' }, { quoted: m });
        }
    }
};
