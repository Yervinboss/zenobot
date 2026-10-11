const delay = (ms) => new Promise(r => setTimeout(r, ms));

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━';
const TITLE = `☢️  *Z E N O   N U K E*  ☢️\n${DIV}`;
const line = (t) => `${TITLE}\n\n${t}\n\n${DIV}`;

/* Estrae "1234567890" da qualsiasi formato (@s.whatsapp.net, @lid, :device) */
const bareJid = (jid = '') => String(jid).split('@')[0].split(':')[0];

/* Estrae il numero "pulito" (solo cifre) da un jid */
const phoneOf = (jid = '') => bareJid(jid).replace(/\D/g, '');

module.exports = {
    commands: ['nuke', 'nukeall', 'purge'],

    run: async (sock, m) => {
        try {
            const chatId = m.key.remoteJid;
            const sender = m.key.participant || m.participant || chatId;
            console.log('[NUKE] chat:', chatId, '| sender:', sender);

            /* ── 1. Solo gruppi ── */
            if (!chatId.endsWith('@g.us')) {
                return sock.sendMessage(chatId, {
                    text: line('❌  Questo comando funziona solo nei *gruppi*.')
                }, { quoted: m });
            }

            /* ── 2. Metadata gruppo ── */
            let metadata;
            try {
                metadata = await sock.groupMetadata(chatId);
            } catch (e) {
                console.error('[NUKE] groupMetadata error:', e);
                return sock.sendMessage(chatId, {
                    text: line('❌  Impossibile leggere i dati del gruppo.')
                }, { quoted: m });
            }

            /* ── 3. Admin check (tollerante) ── */
            const senderPhone = phoneOf(sender);
            const isAdmin = metadata.participants.some(p => {
                const samePhone = phoneOf(p.id) === senderPhone && senderPhone.length > 5;
                const sameId = p.id === sender;
                const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
                return (samePhone || sameId) && isAdm;
            });

            if (!isAdmin) {
                console.log('[NUKE] bloccato: sender non admin');
                return sock.sendMessage(chatId, {
                    text: line('🚫  Solo gli *admin* possono lanciare la nuke.')
                }, { quoted: m });
            }

            /* ── 4. Bot id corretto ── */
            const botBare = bareJid(sock.user?.id || '');
            const botId = botBare + '@s.whatsapp.net';
            const isBotAdmin = metadata.participants.some(
                p => bareJid(p.id) === botBare &&
                     (p.admin === 'admin' || p.admin === 'superadmin')
            );

            const participants = metadata.participants.filter(
                p => bareJid(p.id) !== botBare
            );
            const total = participants.length;

            console.log('[NUKE] totale partecipanti:', total, '| bot admin:', isBotAdmin);

            /* ═══════ FASE 1 — Briefing ═══════ */
            await sock.sendMessage(chatId, { react: { text: '☢️', key: m.key } });
            await sock.sendMessage(chatId, {
                text: line(
                    `☢️  *INIZIALIZZAZIONE PROTOCOLLO NUKE*\n\n` +
                    `📡  Target: *${metadata.subject || 'N/D'}*\n` +
                    `👥  Bersagli: *${total}*\n` +
                    `🔐  Permessi bot: ${isBotAdmin ? '✅ Admin' : '⚠️ Non admin'}\n` +
                    `⚡  Modalità: *DISTRUZIONE TOTALE*\n\n` +
                    `_Avvio in corso..._`
                )
            }, { quoted: m });
            await delay(1800);

            /* ═══════ FASE 2 — Scansione ═══════ */
            const phases = [
                '🔍  Scansione membri attivi...',
                '🔍  Analisi permessi utente...',
                '🔍  Verifica connessione al server...',
                '🔍  Bypass crittografia end-to-end...',
                '🔍  Iniezione payload nei nodi...'
            ];
            let scan = `${TITLE}\n\n*📡 SCANSIONE IN CORSO*\n\n`;
            for (const ph of phases) {
                scan += `${ph}\n`;
                await sock.sendMessage(chatId, { text: scan + `\n${DIV}` });
                await delay(700);
            }
            await delay(800);

            /* ═══════ FASE 3 — Rimozione finta ═══════ */
            const shuffled = [...participants].sort(() => Math.random() - 0.5);
            const chunkSize = Math.max(1, Math.ceil(shuffled.length / 6));

            await sock.sendMessage(chatId, {
                text: line('🚨  *PROTOCOLLO NUKE AVVIATO*  🚨\n\n⚡  Espulsione in corso...')
            }, { quoted: m });
            await delay(1200);

            for (let i = 0; i < shuffled.length; i += chunkSize) {
                const chunk = shuffled.slice(i, i + chunkSize);
                const list = chunk.map(p => `  💀  +${phoneOf(p.id) || '???'}`).join('\n');

                const progress = Math.min(100, Math.round(((i + chunk.length) / shuffled.length) * 100));
                const filled = Math.floor(progress / 10);
                const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

                await sock.sendMessage(chatId, {
                    text: `${TITLE}\n\n*⚡ RIMOZIONE IN CORSO*\n\n${list}\n\n\`[${bar}] ${progress}%\`\n\n${DIV}`
                }, { quoted: m });
                await delay(900);
            }
            await delay(1000);

            /* ═══════ FASE 4 — Completato ═══════ */
            await sock.sendMessage(chatId, {
                text: line(
                    `✅  *NUKE COMPLETATA*\n\n` +
                    `💀  Rimossi: *${total}* membri\n` +
                    `📊  Stato gruppo: *VUOTO*\n` +
                    `⚡  Tempo impiegato: *${(total * 0.9).toFixed(1)}s*\n\n` +
                    `_Il gruppo verrà chiuso a breve..._`
                )
            }, { quoted: m });
            await delay(2200);

            await sock.sendMessage(chatId, {
                text: `${TITLE}\n\n🔒  *Chiusura gruppo in corso...*\n\n\`[██████████] 100%\`\n\n${DIV}`
            }, { quoted: m });
            await delay(2500);

            /* ═══════ FASE 5 — REVEAL ═══════ */
            await sock.sendMessage(chatId, { react: { text: '🤣', key: m.key } });
            await sock.sendMessage(chatId, {
                text:
                    `${DIV}\n` +
                    `🤣  *SORPRESA!*  ✌️\n` +
                    `${DIV}\n\n` +
                    `_Nessuno è stato rimosso_\n` +
                    `_Era tutto uno scherzo_\n\n` +
                    `> 🎭 *SONO UN LARPER* 🤣✌️\n\n` +
                    `${DIV}\n` +
                    `💀 *Zeno Nuke* — 100% fake, 200% memes`
            }, { quoted: m });

        } catch (err) {
            console.error('[NUKE] ERRORE:', err);
            try {
                await sock.sendMessage(m.key.remoteJid, {
                    text: `❌ Errore interno: \`${err.message}\``
                }, { quoted: m });
            } catch {}
        }
    }
};
