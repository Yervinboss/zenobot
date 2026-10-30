module.exports = {
    commands: ['palla'],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        const text = args.join(' ').trim();

        if (!text)
            return await sock.sendMessage(jid, {
                text: '🔮 *PALLA ZENO* 🔮\n\n❌ Fammi una domanda dopo il comando!\nEsempio: `.palla oggi c\'è il sole?`'
            }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        const risposte = [
            'Sì.',
            'No.',
            'Molto probabilmente.',
            'Forse.',
            'Non credo.',
            'Assolutamente sì.',
            'Scordatelo.',
            'Riprova più tardi.'
        ];
        const finale = risposte[Math.floor(Math.random() * risposte.length)];

        await sock.sendMessage(jid, { react: { text: '🔮', key: m.key } });
        return await sock.sendMessage(jid, {
            text: `🔮 *PALLA ZENO* 🔮\n\n❓ *Domanda:* _${text}_\n\n👉 *Risposta:* *${finale}*`
        }, { quoted: m });
    }
};
