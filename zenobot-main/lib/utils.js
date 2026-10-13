function pureId(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function getCtx(m) {
    const msg = m.message || m.msg || {};
    return msg.extendedTextMessage?.contextInfo ||
           msg.imageMessage?.contextInfo ||
           msg.videoMessage?.contextInfo ||
           msg.audioMessage?.contextInfo ||
           msg.documentMessage?.contextInfo ||
           msg.stickerMessage?.contextInfo ||
           msg.buttonsResponseMessage?.contextInfo ||
           msg.templateButtonReplyMessage?.contextInfo ||
           msg.listResponseMessage?.contextInfo ||
           msg.interactiveResponseMessage?.contextInfo || {};
}

function getTarget(m) {
    const ctx = getCtx(m);
    const sender = m.key.participant || m.key.remoteJid;
    if (ctx.mentionedJid && ctx.mentionedJid.length > 0) return { jid: ctx.mentionedJid[0], source: 'mention' };
    if (ctx.participant) return { jid: ctx.participant, source: 'quote' };
    return { jid: sender, source: 'self' };
}

// 🛡️ isAdmin: match su id + lid
async function isAdminOld(sock, jid, targetJid) {
    try {
        const meta = await sock.groupMetadata(jid);
        const tp = pureId(targetJid);
        return meta.participants.some(p => {
            const pId = pureId(p.id);
            const pLid = p.lid ? pureId(p.lid) : '';
            return (pId === tp || (pLid && pLid === tp)) && p.admin;
        });
    } catch { return false; }
}

async function isImmune(sock, jid, sender) {
    try {
        const { isOwner } = require('./owner');
        if (isOwner(sender)) return true;
    } catch {}
    return await isAdmin(sock, jid, sender);
}

function buildQuickReplies(buttons) {
    return buttons.map(b => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id })
    }));
}

async function sendButtons(sock, jid, text, footer, buttons, quoted) {
    const payload = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text },
                    footer: { text: footer || 'Zeno Bot' },
                    nativeFlowMessage: { buttons: buildQuickReplies(buttons) }
                }
            }
        }
    };
    return await sock.relayMessage(jid, payload, { quoted });
}

module.exports = { pureId, getCtx, getTarget, isAdmin, isImmune, buildQuickReplies, sendButtons };

// isAdmin con conversione numero <-> LID
async function isAdmin(sock, jid, targetJid) {
    try {
        const meta = await sock.groupMetadata(jid);
        const ids = new Set([pureId(targetJid)]);

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
    } catch { return false; }
}
