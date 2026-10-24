const fs = require('fs');
const f = process.argv[2] || 'pl.js';
const L = fs.readFileSync(f, 'utf8').split('\n');
function chk(n, s) {
  if (!L[n - 1] || !L[n - 1].includes(s)) {
    console.log('ERRORE riga ' + n + ': non trovo "' + s + '". File diverso, non tocco niente.');
    process.exit(1);
  }
}
chk(489, "sections: [{ title: 'Azioni', rows: azioni }");
chk(485, 'total > 7');
chk(455, 'rows.slice(0, 7)');
chk(404, 'MENU PLAYLIST');
chk(244, 'pl_del_');
chk(242, 'i < 30');

L[488] = "                sections: [{ title: 'Azioni', rows: azioni }, { title: `I tuoi brani (${page + 1}/${pages})`, rows: brani }]";
L[484] = "                text: `🎵 *PLAYLIST DI ${name.toUpperCase()}*\\n📀 Brani salvati: *${total}*\\n📄 Pagina ${page + 1}/${pages}\\n\\nTocca il pulsante e scegli cosa fare.`,";
L[454] = [
  "            const PER = 5;",
  "            const pages = Math.max(1, Math.ceil(total / PER));",
  "            if (page < 0) page = 0;",
  "            if (page > pages - 1) page = pages - 1;",
  "            const brani = userTracks.slice(page * PER, page * PER + PER).map((t, k) => {",
  "                const i = page * PER + k;",
  "                return { title: `${i + 1}. ${String(t.title || 'Sconosciuto').substring(0, 40)}`, rowId: `pl_select_${i}`, description: t.duration ? `⏱️ ${t.duration} • tocca per ascoltare` : 'Tocca per ascoltare' };",
  "            });",
  "            if (page > 0) brani.push({ title: '⬅️ Pagina precedente', rowId: `pl_page_${page - 1}`, description: `Vai a pagina ${page}/${pages}` });",
  "            if (page < pages - 1) brani.push({ title: '➡️ Pagina successiva', rowId: `pl_page_${page + 1}`, description: `Vai a pagina ${page + 2}/${pages}` });"
].join('\n');
L[403] = L[403] + '\n' + [
  "        let page = 0;",
  "        if (/^page_\\d+$/.test(sub)) page = parseInt(sub.replace('page_', ''));",
  "        else if (sub === 'page') page = (parseInt(rest) || 1) - 1;"
].join('\n');
L[243] = L[243] + '\n    allCommands.push(`pl_page_${i}`);';
L[241] = L[241].replace('i < 30', 'i < 100');

fs.writeFileSync(f, L.join('\n'), 'utf8');
console.log('Fatto!');
