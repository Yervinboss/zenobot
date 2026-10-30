const { pureId, getTarget } = require('../lib/utils');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
    commands: ['doss', 'ddos', 'dossattacco'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const senderId = pureId(m.key.participant || m.key.remoteJid);

        const { jid: targetJid, source } = getTarget(m);
        const targetId = source === 'self' ? senderId : pureId(targetJid);

        await sock.sendMessage(jid, { react: { text: '💉', key: m.key } });

        let msg = await sock.sendMessage(jid, {
            text: `🛰️ [ZENO GUARD]: Acquisizione IP in corso su @${targetId}...`,
            mentions: [targetJid]
        }, { quoted: m });
        await delay(1200);

        msg = await sock.sendMessage(jid, {
            text: `💉 [RADAR NETWORK]: Protocollo DOSS forzato in attivazione...`
        }, { quoted: msg });
        await delay(1200);

        msg = await sock.sendMessage(jid, {
            text: `📦 [PACKETS]: Inondazione UDP Flood avviata.\n🔥 4096 kb/s -> @${targetId}\n🎛️ Porte: OVERLOAD`,
            mentions: [targetJid]
        }, { quoted: msg });
        await delay(1500);

        msg = await sock.sendMessage(jid, {
            text: `⚠️ [AVVISO]: Sincronizzazione hardware fallita.`
        }, { quoted: msg });
        await delay(1500);

        msg = await sock.sendMessage(jid, { text: `🔴 *3...*` }, { quoted: msg });
        await delay(1000);
        msg = await sock.sendMessage(jid, { text: `⚠️ *2...*` }, { quoted: msg });
        await delay(1000);
        msg = await sock.sendMessage(jid, { text: `💀 *1...*` }, { quoted: msg });
        await delay(1000);

        const bodyText = `💥 *CONNESSIONE REELETTA CON SUCCESSO!* 💥\n\n` +
                         `❌ Dispositivo di @${targetId} rimosso permanentemente. 🔌\n\n` +
                         `😈 🔒 *RECOVERY TERMINAL:* Clicca qui sotto per recuperare i dati:`;

        const targetUrl = 'https://files.catbox.moe/fx9n8k.mp4';

        const payload = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: bodyText },
                        footer: { text: 'Zeno Cyber-Security ⚙️' },
                        nativeFlowMessage: {
                            buttons: [{
                                name: 'cta_url',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '🔗 Sblocca Linea 🔓 💀',
                                    url: targetUrl,
                                    merchant_url: targetUrl
                                })
                            }]
                        },
                        contextInfo: { mentionedJid: [targetJid] }
                    }
                }
            }
        };

        return await sock.relayMessage(jid, payload, { quoted: msg });
    }
};
