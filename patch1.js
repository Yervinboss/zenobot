// Sistemazioni ai plugin esistenti (sicuro da rilanciare: crea un .bak2 e salta se già fatto)
const fs = require('fs')
const edit = (f, fn) => {
    if (!fs.existsSync(f)) return console.log('— manca     ', f)
    const a = fs.readFileSync(f, 'utf8'), b = fn(a)
    if (a === b) return console.log('= già ok    ', f)
    fs.copyFileSync(f, f + '.bak2'); fs.writeFileSync(f, b); console.log('✔ sistemato ', f)
}

// 1) ping: NON cancellare più pre-key / sender-key (causavano "in attesa del messaggio" e errori di decrittazione)
//    + latenza vera invece di un numero a caso
edit('plugins/ping.js', s => s
    .replace("if (f.startsWith('pre-key-') || f.endsWith('.tmp') || f.startsWith('sender-key-'))", "if (f.endsWith('.tmp'))")
    .replace(/let latency = Date\.now\(\) - start;\s*\n\s*if \(latency < 1\) latency = Math\.floor\(Math\.random\(\) \* 15\) \+ 5;/,
        "let latency = (() => { const ts = Number(m.messageTimestamp && m.messageTimestamp.toNumber ? m.messageTimestamp.toNumber() : m.messageTimestamp) * 1000; const d = Date.now() - ts; return d > 0 && d < 60000 ? d : Math.max(1, Date.now() - start); })();")
    .replace("🗑️ Elimina Sessioni", "🗑️ Pulisci temp"))

// 2) RPG: stesso saldo iniziale (1000) in tutti i comandi
for (const f of ['bal', 'blackjack', 'ruba', 'slot', 'work'])
    edit(`plugins/${f}.js`, s => s.replace(/money: (5000|2000|0), lastWork: 0/g, 'money: 1000, lastWork: 0'))
edit('plugins/sposa.js', s => s.replace('money: 0, spouse: null', 'money: 1000, spouse: null'))
