const fs = require('fs');
let s = fs.readFileSync('plugins/zeno.js', 'utf8');
const marker = "    if (sub === 'voce') {";
const i = s.indexOf(marker);
if (i < 0) { console.log('ERRORE: punto non trovato'); process.exit(1); }
s = s.slice(0, i) + fs.readFileSync('blocco.txt', 'utf8') + s.slice(i);
const a1 = "        try {\n          await ctx.sendButtons({";
const a2 = "        if (ai.getAuto('btn:' + userId, false)) try {\n          await ctx.sendButtons({";
const h1 = "await ctx.reply(risposta + '\\n\\n_Altre azioni: .zeno rigenera • .zeno riassumi • .zeno traduci • .zeno ascolta_');";
const h2 = "await ctx.reply(risposta);";
if (!s.includes(a1) || !s.includes(h1)) { console.log('ERRORE: blocco bottoni non trovato'); process.exit(1); }
s = s.replace(a1, a2).replace(h1, h2);
fs.writeFileSync('plugins/zeno.js', s);
console.log('Fatto');
