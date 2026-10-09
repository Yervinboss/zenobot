const fs = require('fs');
const path = require('path');

const ids = ['testios_1', 'testios_2', 'testios_3', 'testios_4', 'testios_5', 'testios_6'];

module.exports = {
    commands: ['testios', ...ids],
    run: async (sock, m, args, cmd) => {
        const jid = m.key.remoteJid;
        if (cmd !== 'testios') {
            return sock.sendMessage(jid, { text: `✅ Tocco ricevuto: ${cmd.replace('testios_', 'TEST ')}` }, { quoted: m });
        }

        const imgPath = path.join(__dirname, '../media/menu.jpg');
        const img = fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null;
        const pausa = (ms) => new Promise(r => setTimeout(r, ms));
        const prove = [
            ['TEST 1 — bottoni semplici', { text: 'TEST 1 — bottoni semplici', footer: 'Zeno test', buttons: [{ text: 'Uno', id: 'testios_1' }] }],
            ['TEST 2 — native flow', { text: 'TEST 2 — native flow', footer: 'Zeno test', nativeFlow: [{ text: 'Tocca qui', id: 'testios_2' }] }],
            ['TEST 3 — native flow come template', { text: 'TEST 3 — native flow come template', footer: 'Zeno test', nativeFlow: [{ text: 'Tocca qui', id: 'testios_3' }], interactiveAsTemplate: true }],
            ['TEST 4 — template classico', img
                ? { title: 'TEST 4', image: img, caption: 'TEST 4 — template classico', footer: 'Zeno test', templateButtons: [{ text: 'Tocca qui', id: 'testios_4' }] }
                : { title: 'TEST 4', text: 'TEST 4 — template classico', footer: 'Zeno test', templateButtons: [{ text: 'Tocca qui', id: 'testios_4' }] }],
            ['TEST 5 — card a scorrimento', img
                ? { text: 'TEST 5 — card a scorrimento', footer: 'Zeno test', cards: [{ image: img, caption: 'Card 1', footer: 'Zeno', nativeFlow: [{ text: 'Tocca qui', id: 'testios_5' }] }] }
                : null],
            ['TEST 6 — card come template', img
                ? { text: 'TEST 6 — card come template', footer: 'Zeno test', cards: [{ image: img, caption: 'Card 1', footer: 'Zeno', nativeFlow: [{ text: 'Tocca qui', id: 'testios_6' }] }], interactiveAsTemplate: true }
                : null]
        ];

        await sock.sendMessage(jid, { text: '🧪 Test: ora arrivano 6 messaggi numerati. Dimmi i numeri che vedi su iPhone e quelli su Android.' }, { quoted: m });
        for (const [nome, contenuto] of prove) {
            await pausa(1200);
            if (!contenuto) { await sock.sendMessage(jid, { text: `${nome}: saltato (manca media/menu.jpg)` }); continue; }
            try { await sock.sendMessage(jid, contenuto); }
            catch (e) { await sock.sendMessage(jid, { text: `${nome}: ❌ errore: ${e.message}` }); }
        }
    }
};
