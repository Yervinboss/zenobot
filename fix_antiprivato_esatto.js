const fs = require('fs');
const file = 'index.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Rimuovi i vecchi blocchi antiprivato (se ci sono)
const oldBlockRegex = /\/\/ 🛡️ CONTROLLO ANTIPRIVATO[\s\S]*?return;\s*\}/g;
code = code.replace(oldBlockRegex, '');

// 2. Trova il punto esatto: subito dopo il controllo "if (!cmd) return"
const anchor = "if (!cmd) return";
const insertion = `

        // 🛡️ CONTROLLO ANTIPRIVATO (Blocca solo i comandi in privato)
        const isPrivate = !isGroupJid(chatJid);
        const antiPrivato = db.settings.get('antiprivato', false);
        
        if (isPrivate && antiPrivato && !isOwner(sender)) {
            log.dbg(\`🚫 Antiprivato attivo: ignorato comando da @\${sender}\`);
            await sock.sendMessage(chatJid, { 
                text: 'no negro non sei un onnipotente come il mio re Zeno' 
            }, { quoted: m });
            return; 
        }
`;

if (code.includes(anchor)) {
    code = code.replace(anchor, anchor + insertion);
    fs.writeFileSync(file, code);
    console.log('✅ Patch esatta! Ora l\\'antiprivato blocca SOLO i comandi in privato.');
    console.log('   - Se scrivono "ciao" → silenzio');
    console.log('   - Se scrivono ".ping" → manda il messaggio');
} else {
    console.log('❌ Ancora non trovata. Prova manualmente con nano.');
}
