module.exports = (() => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const { pureId } = require('../lib/utils');
    const { isOwner } = require('../lib/owner');

    /* ═══════════════════════════════════════════════════
       CONFIGURAZIONE
    ═══════════════════════════════════════════════════ */
    const GROUP_LINK  = 'https://chat.whatsapp.com/LD4KX7ZnXnX7ftBAjRYtAr?s=cl&p=a&mlu=4&ilr=4';
    const MESSAGGIO   = 'CI TRASFERIAMO TUTTI QUA';
    const RIPETIZIONI = 5;
    const DELAY_MS    = 400;

    const DECO = 'ꦾ'.repeat(800);
    const SEPARATOR = '░▒▓█' + '█'.repeat(25) + '▓▒░';

    /* ═══════════════════════════════════════════════════
       THUMBNAIL — generata una volta con ffmpeg
    ═══════════════════════════════════════════════════ */
    const THUMB_PATH = path.join(__dirname, '..', 'temp', 'imperatore_thumb.jpg');
    let THUMB_BUFFER = null;

    const ensureThumbnail = () => {
        if (THUMB_BUFFER) return THUMB_BUFFER;
        try {
            fs.mkdirSync(path.dirname(THUMB_PATH), { recursive: true });
            if (!fs.existsSync(THUMB_PATH)) {
                execSync(
                    `ffmpeg -y -f lavfi -i color=c=black:s=300x300:d=1 -frames:v 1 "${THUMB_PATH}"`,
                    { stdio: 'ignore' }
                );
            }
            THUMB_BUFFER = fs.readFileSync(THUMB_PATH);
            console.log('[IMPERATORE] Thumbnail pronta ✅');
        } catch (e) {
            console.error('[IMPERATORE] Errore thumbnail:', e.message);
            THUMB_BUFFER = Buffer.from(
                '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
                'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
                'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
                'MjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAU' +
                'EAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAA' +
                'AAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAYgA/9k=',
                'base64'
            );
        }
        return THUMB_BUFFER;
    };

    /* ═══════════════════════════════════════════════════
       UTILITY
    ═══════════════════════════════════════════════════ */
    const getInviteCode = (link) => link.split('/').pop().split('?')[0];

    const buildCaption = () =>
        `${MESSAGGIO}\n\n` +
        `${DECO}\n\n` +
        `${SEPARATOR}\n` +
        `🚨 *ATTENZIONE TUTTI!* 🚨`;

    /* ═══════════════════════════════════════════════════
       EXPORTS
    ═══════════════════════════════════════════════════ */
    return {
        commands: ['imperatore'],

        run: async (sock, m, args, cmd) => {
            try {
                const chatId = m.key.remoteJid;
                const sender = m.key.participant || m.key.remoteJid;

                /* ── 🔒 SOLO CREATORE ── */
                if (!isOwner(sender)) {
                    console.log('[IMPERATORE] Bloccato: non owner →', sender);
                    return await sock.sendMessage(chatId, {
                        text: '⛔ *ACCESSO NEGATO*\nSolo il *Creatore* può evocare l\'Imperatore.'
                    }, { quoted: m });
                }

                if (!chatId.endsWith('@g.us')) {
                    return await sock.sendMessage(chatId, {
                        text: '❌ Solo nei gruppi.'
                    }, { quoted: m });
                }

                let metadata;
                try {
                    metadata = await sock.groupMetadata(chatId);
                } catch (e) {
                    console.error('[IMPERATORE] Metadata error:', e);
                    return await sock.sendMessage(chatId, {
                        text: '❌ Impossibile leggere il gruppo.'
                    }, { quoted: m });
                }

                /* ── Menzioni nascoste (esclude il bot) ── */
                const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
                const mentions = metadata.participants
                    .filter(p => pureId(p.id) !== botId)
                    .map(p => p.id);

                if (!mentions.length) {
                    return await sock.sendMessage(chatId, {
                        text: '❌ Nessun membro da notificare.'
                    }, { quoted: m });
                }

                /* ── Recupera info gruppo del link ── */
                const inviteCode = getInviteCode(GROUP_LINK);
                let inviteInfo;
                try {
                    inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                    console.log('[IMPERATORE] Gruppo target:', inviteInfo.subject);
                } catch (e) {
                    console.error('[IMPERATORE] groupGetInviteInfo error:', e);
                    return await sock.sendMessage(chatId, {
                        text:
                            `❌ Impossibile leggere il gruppo del link.\n` +
                            `Verifica che il link sia valido.`
                    }, { quoted: m });
                }

                const thumb = ensureThumbnail();

                /* ── React + annuncio ── */
                await sock.sendMessage(chatId, { react: { text: '⚡', key: m.key } });

                await sock.sendMessage(chatId, {
                    text:
                        `💥 *ATTACCO IMPERATORE AVVIATO* 💥\n` +
                        `${SEPARATOR}\n` +
                        `👥 Bersagli: *${mentions.length}*\n` +
                        `🎯 Target: *${inviteInfo.subject}*\n` +
                        `🔥 Modalità: *CARD SPAM*\n\n` +
                        `_Inizio raffica..._`
                }, { quoted: m });

                await delay(500);

                /* ═══════════════════════════════════════════
                   🎴 SPAM COME CARD
                ═══════════════════════════════════════════ */
                const caption = buildCaption();

                for (let i = 0; i < RIPETIZIONI; i++) {
                    try {
                        await sock.sendMessage(chatId, {
                            groupInviteMessage: {
                                groupJid: inviteInfo.id,
                                inviteCode: inviteCode,
                                inviteExpiration: 0,
                                groupName: inviteInfo.subject,
                                caption: caption,
                                jpegThumbnail: thumb
                            },
                            mentions
                        });
                    } catch (cardErr) {
                        console.error(`[IMPERATORE] Card #${i + 1} fallita:`, cardErr.message);
                        await sock.sendMessage(chatId, {
                            text: `${caption}\n\n📌 ${GROUP_LINK}`,
                            mentions
                        });
                    }
                    if (i < RIPETIZIONI - 1) await delay(DELAY_MS);
                }

                await sock.sendMessage(chatId, { react: { text: '💣', key: m.key } });

            } catch (err) {
                console.error('[IMPERATORE] ERRORE:', err);
                try {
                    await sock.sendMessage(m.key.remoteJid, {
                        text: `❌ Errore: \`${err.message}\``
                    }, { quoted: m });
                } catch {}
            }
        }
    };
})();
