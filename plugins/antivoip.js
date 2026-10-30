const { isAdmin: isAdminShared } = require('../lib/admin');
const { pureId } = require('../lib/utils');
const { isOwner } = require('../lib/owner');

const countryPrefixes = [
    { code: '+39', country: 'Italia', flag: '🇮🇹' },
    { code: '+1', country: 'USA / Canada', flag: '🇺🇸' },
    { code: '+44', country: 'Regno Unito', flag: '🇬🇧' },
    { code: '+33', country: 'Francia', flag: '🇫🇷' },
    { code: '+49', country: 'Germania', flag: '🇩🇪' },
    { code: '+34', country: 'Spagna', flag: '🇪🇸' },
    { code: '+7', country: 'Russia', flag: '🇷🇺' },
    { code: '+380', country: 'Ucraina', flag: '🇺🇦' },
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+62', country: 'Indonesia', flag: '🇮🇩' },
    { code: '+63', country: 'Filippine', flag: '🇵🇭' },
    { code: '+55', country: 'Brasile', flag: '🇧🇷' },
    { code: '+86', country: 'Cina', flag: '🇨🇳' },
    { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
    { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
    { code: '+20', country: 'Egitto', flag: '🇪🇬' },
    { code: '+27', country: 'Sud Africa', flag: '🇿🇦' },
    { code: '+212', country: 'Marocco', flag: '🇲🇦' },
    { code: '+213', country: 'Algeria', flag: '🇩🇿' },
    { code: '+216', country: 'Tunisia', flag: '🇹🇳' },
    { code: '+40', country: 'Romania', flag: '🇷🇴' },
    { code: '+48', country: 'Polonia', flag: '🇵🇱' },
    { code: '+351', country: 'Portogallo', flag: '🇵🇹' },
    { code: '+30', country: 'Grecia', flag: '🇬🇷' },
    { code: '+31', country: 'Paesi Bassi', flag: '🇳🇱' },
    { code: '+32', country: 'Belgio', flag: '🇧🇪' },
    { code: '+41', country: 'Svizzera', flag: '🇨🇭' },
    { code: '+43', country: 'Austria', flag: '🇦🇹' },
    { code: '+45', country: 'Danimarca', flag: '🇩🇰' },
    { code: '+46', country: 'Svezia', flag: '🇸🇪' },
    { code: '+47', country: 'Norvegia', flag: '🇳🇴' },
    { code: '+358', country: 'Finlandia', flag: '🇫🇮' },
    { code: '+353', country: 'Irlanda', flag: '🇮🇪' }
];

global.antivoipCache = global.antivoipCache || {};

function jidToNumber(jid) {
    if (!jid) return null;
    const num = jid.split('@')[0].split(':')[0].split('_')[0].replace(/[^0-9]/g, '');
    if (!num) return null;
    return '+' + num;
}

function getCountryInfo(number) {
    if (!number) return { code: '?', country: 'Sconosciuto', flag: '🌍' };
    const clean = String(number).replace(/[^0-9]/g, '');
    const sorted = [...countryPrefixes].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
        if (clean.startsWith(c.code.replace('+', ''))) return c;
    }
    return { code: '?', country: 'Sconosciuto', flag: '🌍' };
}

const isItalian = (n) => String(n || '').replace(/[^0-9]/g, '').startsWith('39');

// 🛡️ Check admin robusto (gestisce LID + bypass owner)
async function isSenderAdminOld(sock, jid, sender) {
    if (isOwner(sender)) return true;
    try {
        const meta = await sock.groupMetadata(jid);
        const sp = pureId(sender);
        return !!meta.participants.find(p => {
            const pid = pureId(p.id);
            const plid = p.lid ? pureId(p.lid) : '';
            return (pid === sp || plid === sp) && p.admin;
        });
    } catch (e) {
        console.log('isSenderAdmin errore:', e.message);
        return false;
    }
}

module.exports = {
    commands: ['antivoip'],
    run: async (sock, m, args, cmd) => {
        const chatId = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;

        if (!chatId.endsWith('@g.us'))
            return await sock.sendMessage(chatId, { text: '❌ Solo nei gruppi!' }, { quoted: m });

        const isAdminOk = await isSenderAdmin(sock, chatId, sender);
        if (!isAdminOk) {
            console.log(`[ANTIVOIP] Accesso negato. sender=${pureId(sender)} owner=${isOwner(sender)}`);
            return await sock.sendMessage(chatId, { text: '❌ Solo admin del gruppo o owner del bot.' }, { quoted: m });
        }

        // === BOTTONE: KICK ALL ===
        if (cmd === 'antivoip_kickall') {
            const sospetti = global.antivoipCache[chatId];
            if (!sospetti || sospetti.length === 0)
                return await sock.sendMessage(chatId, { text: '⚠️ Cache vuota. Rilancia `.antivoip`.' }, { quoted: m });

            await sock.sendMessage(chatId, { text: `⏳ Butto fuori ${sospetti.length} membri...` }, { quoted: m });

            const jids = sospetti.map(s => s.jid);
            try { await sock.groupParticipantsUpdate(chatId, jids, 'remove'); }
            catch (e) { console.error('antivoip kickall:', e.message); }

            delete global.antivoipCache[chatId];
            return await sock.sendMessage(chatId, {
                text: `✅ *OPERAZIONE COMPLETATA*\n🚪 Buttati fuori: *${jids.length}*`
            }, { quoted: m });
        }

        // === BOTTONE: LASCIA STARE ===
        if (cmd === 'antivoip_okall') {
            delete global.antivoipCache[chatId];
            return await sock.sendMessage(chatId, { text: '✅ *Nessuna azione.* I sospetti restano nel gruppo.' }, { quoted: m });
        }

        // === SCANSIONE ===
        await sock.sendMessage(chatId, { text: '🔍 Scansione membri...' }, { quoted: m });

        let meta;
        try { meta = await sock.groupMetadata(chatId); }
        catch { return await sock.sendMessage(chatId, { text: '❌ Errore lettura gruppo.' }, { quoted: m }); }

        const botId = pureId(sock.user?.id || '');
        const stranieri = [];
        let italiani = 0;

        for (const p of meta.participants) {
            // Preferisci JID @s.whatsapp.net se disponibile
            const pjid = (p.id && p.id.endsWith('@s.whatsapp.net')) ? p.id :
                         (p.lid && p.lid.endsWith('@s.whatsapp.net')) ? p.lid : (p.id || p.lid);
            const num = jidToNumber(pjid);
            if (!num) continue;

            if (num.replace('+', '') === botId) continue;

            if (p.admin || isItalian(num)) {
                italiani++;
            } else {
                stranieri.push({ jid: pjid, number: num, country: getCountryInfo(num) });
            }
        }

        if (stranieri.length === 0)
            return await sock.sendMessage(chatId, {
                text: `✅ *Pulito!*\n👥 Membri: ${meta.participants.length}\n🇮🇹 Italiani: ${italiani}\n🌍 Stranieri: 0`
            }, { quoted: m });

        global.antivoipCache[chatId] = stranieri;

        let lista = '';
        stranieri.slice(0, 15).forEach((s, i) => {
            lista += `${i + 1}. ${s.country.flag} \`${s.number}\` (${s.country.country})\n`;
        });
        if (stranieri.length > 15) lista += `\n_...e altri ${stranieri.length - 15}_`;

        const txt = `🚨 *RILEVAMENTO* 🚨\n\n👥 Membri: *${meta.participants.length}*\n🇮🇹 Italiani: *${italiani}*\n🌍 Sospetti: *${stranieri.length}*\n\n📋 *Lista:*\n${lista}\n⚡ _Cosa vuoi fare?_`;

        return await sock.sendMessage(chatId, {
            text: txt,
            footer: 'Zeno Bot • Antivoip',
            buttons: [
                { buttonId: 'antivoip_kickall', buttonText: { displayText: '🚪 Butta fuori tutti' }, type: 1 },
                { buttonId: 'antivoip_okall', buttonText: { displayText: '✅ Lascia stare' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: m });
    }
};

async function isSenderAdmin(sock, jid, sender) {
    if (isOwner(sender)) return true;
    return isAdminShared(sock, jid, sender);
}
