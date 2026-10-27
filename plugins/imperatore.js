module.exports = (() => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const { pureId } = require('../lib/utils');
    const { isOwner } = require('../lib/owner');

    const GROUP_LINK  = 'https://chat.whatsapp.com/H5ZmgxVQ0RE2FEyKjR79RZ?s=cl&p=a&mlu=4&ilr=4';
    const MESSAGGIO   = 'CI TRASFERIAMO TUTTI QUA';
    const RIPETIZIONI = 3;
    const DELAY_MS    = 800;

    const DECO = 'ꦾ'.repeat(300);
    const SEPARATOR = '░▒▓█' + '█'.repeat(20) + '▓▒░';

    const buildNote = () =>
        `${MESSAGGIO}\n\n` +
        `${DECO}\n\n` +
        `${SEPARATOR}\n` +
        `🚨 *ATTENZIONE TUTTI!* 🚨\n\n` +
        `📌 *Link gruppo:* ${GROUP_LINK}`;

    return {
        commands: ['imperatore'],
        category: 'owner',
        description: 'Invia il richiamo di trasferimento con card interattive',

        run: async (sock, m, args, cmd, ctx) => {
            try {
                const chatId = m.key.remoteJid;
                const sender = m.key.participant || m.key.remoteJid;

                /* ── 🔒 SOLO CREATORE ── */
                if (!isOwner(sender)) {
                    return await sock.sendMessage(chatId, {
                        text: '⛔ *ACCESSO NEGATO*\nSolo il *Creatore* può evocare l\'Imperatore.'
                    }, { quoted: m });
                }

                if (!chatId.endsWith('@g.us')) {
                    return await sock.sendMessage(chatId, {
                        text: '❌ Solo nei gruppi.'
                    }, { quoted: m });
                }

                const metadata = await sock.groupMetadata(chatId);
                const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
                const mentions = metadata.participants
                    .filter(p => pureId(p.id) !== botId)
                    .map(p => p.id);

                await sock.sendMessage(chatId, { react: { text: '⚡', key: m.key } });

                const noteText = buildNote();

                for (let i = 0; i < RIPETIZIONI; i++) {
                    try {
                        // Sfruttiamo il sistema di card e pulsanti nativi di ZenoBot
                        await ctx.sendCards({
                            text: `${noteText}\n\n💬 *Raffica ${i + 1}/${RIPETIZIONI}*`,
                            cards: [
                                {
                                    title: '🚨 TRASFERIMENTO URGENTE',
                                    body: MESSAGGIO,
                                    footer: 'ZENO ULTIMATE',
                                    buttons: [
                                        { text: '🔗 Unisciti al gruppo', url: GROUP_LINK }
                                    ]
                                }
                            ]
                        }, { quoted: m }); // Aggiunto quoted: m per rispondere al messaggio
                        
                        console.log(`[IMPERATORE] Card #${i + 1} inviata con successo.`);
                    } catch (err) {
                        console.error(`[IMPERATORE] Errore invio card #${i + 1}:`, err.message);
                        
                        // Fallback testuale di sicurezza con menzioni
                        await sock.sendMessage(chatId, {
                            text: `${noteText}\n\n💬 *Raffica ${i + 1}/${RIPETIZIONI}*`,
                            mentions: mentions
                        });
                    }

                    if (i < RIPETIZIONI - 1) await delay(DELAY_MS);
                }

                await sock.sendMessage(chatId, { react: { text: '💣', key: m.key } });

            } catch (err) {
                console.error('[IMPERATORE] ERRORE CRITICO:', err);
            }
        }
    };
})();
