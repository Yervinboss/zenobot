const { pureId } = require('../lib/utils');

global.tpNumeroSelection = global.tpNumeroSelection || {};
global.tpNumeroProcessing = global.tpNumeroProcessing || {};

function cleanNumber(text) {
    if (!text) return '';
    let num = String(text).replace(/[^0-9]/g, '');
    if (num.startsWith('00')) num = num.substring(2);
    return num;
}

function analyzeNumber(num) {
    if (!num || num.length < 8) return null;
    let info = { raw: num, country: 'Sconosciuto', flag: '🌍', type: 'Sconosciuto', operator: 'Sconosciuto', prefix: '' };

    if (num.startsWith('39') && num.length >= 11) {
        info.country = 'Italia'; info.flag = '🇮🇹';
        const local = num.substring(2);
        info.prefix = local.substring(0, 3);
        if (local.startsWith('3')) {
            info.type = '📱 Mobile';
            if (local.startsWith('33') || local.startsWith('34')) info.operator = 'TIM / Vodafone';
            else if (local.startsWith('32')) info.operator = 'WindTre';
            else if (local.startsWith('35')) info.operator = 'WindTre / Iliad';
            else if (local.startsWith('36')) info.operator = 'TIM';
            else if (local.startsWith('37')) info.operator = 'WindTre';
            else if (local.startsWith('38')) info.operator = 'Vodafone';
            else info.operator = 'Operatore italiano';
        } else if (local.startsWith('0')) {
            info.type = '☎️ Fisso'; info.operator = 'Telefono fisso';
        }
    } else if (num.startsWith('1') && num.length === 11) {
        info.country = 'USA / Canada'; info.flag = '🇺🇸'; info.type = '📱 Mobile'; info.operator = 'Operatore USA';
    } else if (num.startsWith('44')) { info.country = 'Regno Unito'; info.flag = '🇬🇧'; info.type = '📱 Mobile'; info.operator = 'Operatore UK'; }
    else if (num.startsWith('49')) { info.country = 'Germania'; info.flag = '🇩🇪'; info.type = '📱 Mobile'; info.operator = 'Operatore DE'; }
    else if (num.startsWith('33')) { info.country = 'Francia'; info.flag = '🇫🇷'; info.type = '📱 Mobile'; info.operator = 'Operatore FR'; }
    else if (num.startsWith('34')) { info.country = 'Spagna'; info.flag = '🇪🇸'; info.type = '📱 Mobile'; info.operator = 'Operatore ES'; }
    else { info.type = '📱 Numero internazionale'; }

    return info;
}

async function processSelection(sock, m, cardId) {
    const processKey = `${m.key.id}_${pureId(m.key.participant || m.key.remoteJid)}`;
    if (global.tpNumeroProcessing[processKey]) return;
    global.tpNumeroProcessing[processKey] = true;
    setTimeout(() => delete global.tpNumeroProcessing[processKey], 8000);

    const chatId = m.key.remoteJid;
    const sender = pureId(m.key.participant || m.key.remoteJid);
    const cache = global.tpNumeroSelection[sender] || global.tpNumeroSelection[chatId];

    if (!cache)
        return sock.sendMessage(chatId, { text: '❌ Sessione scaduta. Rifai `.tpnumero 3331234567`.' }, { quoted: m });

    const { num, info } = cache;

    if (cardId === 'tpnum_wa') return sock.sendMessage(chatId, { text: `📱 *APRI WHATSAPP*\n\n🔢 +${num}\n\nhttps://wa.me/${num}` }, { quoted: m });
    if (cardId === 'tpnum_info') {
        let t = `📞 *INFO NUMERO*\n\n🔢 +${num}\n${info.flag} ${info.country}\n📱 ${info.type}\n🏢 ${info.operator}\n`;
        if (info.prefix) t += `🔖 Prefisso: ${info.prefix}\n`;
        return sock.sendMessage(chatId, { text: t }, { quoted: m });
    }
    if (cardId === 'tpnum_google') return sock.sendMessage(chatId, { text: `🔎 https://www.google.com/search?q=${num}` }, { quoted: m });
    if (cardId === 'tpnum_facebook') return sock.sendMessage(chatId, { text: `📘 https://www.facebook.com/search/top?q=${num}` }, { quoted: m });
    if (cardId === 'tpnum_instagram') return sock.sendMessage(chatId, { text: `📷 https://www.instagram.com/web/search/topsearch/?query=${num}` }, { quoted: m });
}

// Registriamo tutti i tpnum_* come comandi separati
const cmds = ['tpnumero', 'tpnum_wa', 'tpnum_info', 'tpnum_google', 'tpnum_facebook', 'tpnum_instagram'];

module.exports = {
    commands: cmds,
    run: async (sock, m, args, cmd) => {
        const chatId = m.key.remoteJid;
        const sender = pureId(m.key.participant || m.key.remoteJid);

        if (cmd.startsWith('tpnum_')) return await processSelection(sock, m, cmd);

        if (cmd === 'tpnumero') {
            const query = args.join(' ').trim();
            if (!query)
                return sock.sendMessage(chatId, { text: '📱 *Uso:* `.tpnumero +39 333 1234567`' }, { quoted: m });

            const num = cleanNumber(query);
            if (num.length < 8 || num.length > 15)
                return sock.sendMessage(chatId, { text: '❌ Numero non valido.' }, { quoted: m });

            await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });
            const info = analyzeNumber(num);
            if (!info) return sock.sendMessage(chatId, { text: '❌ Numero non analizzabile.' }, { quoted: m });

            global.tpNumeroSelection[sender] = { num, info };
            if (chatId.endsWith('@g.us')) global.tpNumeroSelection[chatId] = { num, info };

            const txt = `📱 *ANALISI NUMERO*\n\n🔢 *+${num}*\n${info.flag} ${info.country} • ${info.type}\n🏢 ${info.operator}\n\n_Scegli un'azione:_`;

            return await sock.sendMessage(chatId, {
                text: txt,
                footer: 'Zeno Bot • Analisi Numero',
                buttons: [
                    { buttonId: 'tpnum_wa', buttonText: { displayText: '📱 WhatsApp' }, type: 1 },
                    { buttonId: 'tpnum_info', buttonText: { displayText: '📞 Info' }, type: 1 },
                    { buttonId: 'tpnum_google', buttonText: { displayText: '🔎 Google' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: m });
        }
    }
};
