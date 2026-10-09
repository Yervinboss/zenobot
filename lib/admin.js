const { pureId } = require('./utils');

async function isAdmin(sock, jid, sender) {
    try {
        const meta = await sock.groupMetadata(jid);
        const ids = new Set([pureId(sender)]);

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

module.exports = { isAdmin };
