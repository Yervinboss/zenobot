const bold = s => [...s].map(ch => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D400 + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D41A + c - 97);
    if (c >= 48 && c <= 57) return String.fromCodePoint(0x1D7CE + c - 48);
    return ch;
}).join('');

const BOT = '⚡ ' + bold('ZENO ULTIMATE');

const CATEGORIE = {
    fun: {
        emoji: '🎉', name: 'Fun', descr: 'Comandi divertenti',
        comandi: [
            ['dox @tag', 'Finto doxxing utente'],
            ['frocio @tag', 'Frocimetro'],
            ['cazzo @tag', 'Pisellometro'],
            ['negro @tag', 'Negrometro'],
            ['kiss @tag', 'Manda un bacio'],
            ['palla <domanda>', 'Palla magica sì/no'],
            ['doss @tag', 'Simula un attacco DDoS'],
            ['ban @tag', 'Simula un ban']
        ]
    },
    rpg: {
        emoji: '🎮', name: 'RPG', descr: 'Economia e giochi',
        comandi: [
            ['bal', 'Mostra il tuo bilancio'],
            ['work', 'Lavora per guadagnare'],
            ['slot', 'Slot machine'],
            ['ruba @tag', 'Ruba soldi a qualcuno'],
            ['bj <cifra>', 'Blackjack'],
            ['sposa @tag', 'Proponi matrimonio'],
            ['divorzio', 'Richiedi divorzio']
        ]
    },
    moderazione: {
        emoji: '🛡️', name: 'Moderazione', descr: 'Gestione gruppi',
        comandi: [
            ['warn @tag', 'Richiama un utente'],
            ['unwarn @tag', 'Rimuovi richiamo'],
            ['mute @tag', 'Muta un utente'],
            ['unmute @tag', 'Smuta un utente'],
            ['tag <testo>', 'Tagga tutti i membri'],
            ['aperto', 'Apri il gruppo'],
            ['chiuso', 'Chiudi il gruppo'],
            ['p @tag', 'Promuovi ad admin'],
            ['d @tag', 'Rimuovi da admin'],
            ['link', 'Link di invito'],
            ['qr', 'QR code del gruppo'],
            ['antilink', 'Pannello antilink'],
            ['antispam', 'Pannello antispam'],
            ['antivoip', 'Scansiona numeri stranieri'],
            ['antibot', 'Pannello antibot']
        ]
    },
    media: {
        emoji: '🎬', name: 'Media', descr: 'Sticker, audio, video',
        comandi: [
            ['s', 'Crea sticker (rispondi a foto/video)'],
            ['toaudio', 'Video → Audio (rispondi)'],
            ['vv', 'Apri view-once (rispondi)'],
            ['song <nome>', 'Cerca e scarica canzone'],
            ['shazam', 'Riconosci canzone (rispondi a vocale)']
        ]
    },
    tools: {
        emoji: '🔧', name: 'Tools', descr: 'Strumenti utili',
        comandi: [
            ['id', 'Mostra il tuo ID'],
            ['pp @tag', 'Foto profilo utente'],
            ['tpnumero <num>', 'Analizza un numero'],
            ['tx <testo>', 'Sticker con testo'],
            ['del', 'Elimina messaggio (rispondi)'],
            ['ping', 'Stato del bot'],
            ['pl', 'La tua playlist'],
            ['menu', 'Mostra questo menu']
        ]
    },
    welcome: {
        emoji: '👋', name: 'Welcome', descr: 'Benvenuto automatico',
        comandi: [
            ['setwelcome <frase>', 'Imposta messaggio benvenuto'],
            ['welcome', 'Vedi messaggio attuale'],
            ['resetwelcome', 'Rimuovi messaggio'],
            ['testwelcome', 'Testa benvenuto']
        ]
    },
    creatore: {
        emoji: '👑', name: 'Creatore', descr: 'Solo per owner',
        comandi: [
            ['zeno', 'Pannello antinuke'],
            ['owner', 'Gestisci owner'],
            ['setbotpp', 'Cambia foto profilo bot'],
            ['shutdown', 'Spegni il bot']
        ]
    }
};

module.exports = {
    commands: ['menu', ...Object.keys(CATEGORIE)],
    aliases: ['comandi'],
    name: 'menu',
    category: 'sistema',
    author: 'ZENO',
    description: 'Menu interattivo con lista a tendina',
    usage: '[categoria]',
    cooldown: 2000,

    async run(sock, m, args, cmd, ctx) {
        const jid = ctx.chatJid;
        const sender = ctx.senderJid;
        const nome = ctx.pushName || ctx.sender;

        // ──────────────── MENU PRINCIPALE ────────────────
        if (cmd === 'menu') {
            // Righe della lista a tendina — id = "menu <cat>"
            const rows = Object.entries(CATEGORIE).map(([k, c]) => ({
                header: '',
                title: c.emoji + ' ' + c.name,
                description: c.descr + ' (' + c.comandi.length + ')',
                id: 'menu ' + k
            }));

            // Immagine: prova foto profilo bot, altrimenti config
            let img = ctx.config.cardImage;
            try { img = await sock.profilePictureUrl(sock.user.id, 'image'); } catch {}

            // FORMATO CORRETTO per far uscire la tendina:
            // cards[].buttons[].name = 'single_select'
            const card = {
                image: { url: img },
                title: BOT,
                body: '👋 Ciao *' + nome + '*!\n\nScegli una categoria dal menu qui sotto 👇',
                footer: 'Zeno Ultimate',
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '📂 Apri categorie',
                        sections: [{ title: '📂 Categorie', rows }]
                    })
                }]
            };

            try {
                return await sock.sendMessage(jid, {
                    text: BOT + '\n\n👋 Ciao *' + nome + '*!',
                    footer: 'Zeno Ultimate',
                    cards: [card],
                    mentions: [sender]
                }, { quoted: m });
            } catch (e) {
                // fallback se il client non supporta le card
                const list = Object.entries(CATEGORIE)
                    .map(([k, c]) => c.emoji + ' *' + ctx.prefix + 'menu ' + k + '* — _' + c.descr + '_')
                    .join('\n');
                return ctx.reply(BOT + '\n\n👋 Ciao *' + nome + '*!\n\n' + list);
            }
        }

        // ──────────────── SOTTOMENU CATEGORIA ────────────────
        const c = CATEGORIE[cmd];
        if (!c) return;

        const text =
            '╭━━━〔 ' + c.emoji + ' *' + c.name.toUpperCase() + '* 〕━━━⬣\n' +
            '┃ _' + c.descr + '_\n' +
            '╰━━━━━━━━━━━━━━━━━━━━━━━⬣\n\n' +
            c.comandi.map(([cmdStr, desc]) => '• *' + ctx.prefix + cmdStr + '*\n   _' + desc + '_').join('\n') +
            '\n\n📌 _Torna al menu: ' + ctx.prefix + 'menu_';

        return ctx.reply(text, { mentions: [sender] });
    }
};
