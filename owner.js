// Configurazione Owner — supporta sia LID che numero di telefono
// Per aggiungere un owner, metti UNA delle due forme:
//   - '12786855841877@lid'          (LID WhatsApp nuovo)
//   - '393513673426@s.whatsapp.net' (numero internazionale)
// Puoi mettere ENTRAMBE le forme per sicurezza.
const OWNER = ['12786855841877@lid',
];
// Rimuove suffix device (es. ":12@lid" → "@lid")
function normJid(jid) {
    if (!jid) return '';
    let s = String(jid).trim();
    if (s.includes(':') && s.includes('@')) s = s.replace(/:\d+@/, '@');
    return s;
}

// Estrae solo le cifre significative (per confronto "telefono")
function digitsOf(jid) {
    return normJid(jid).split('@')[0].replace(/\D/g, '');
}

function isOwner(jid) {
    if (!jid) return false;
    const target = normJid(jid);
    if (!target) return false;

    const targetDigits = digitsOf(target);
    const targetIsLid = target.endsWith('@lid');

    for (const entry of OWNER) {
        const owner = normJid(entry);
        if (!owner) continue;

        // 1) Match esatto normalizzato
        if (owner === target) return true;

        // 2) Se owner è LID e target è LID → confronta le cifre
        if (owner.endsWith('@lid') && targetIsLid) {
            const od = digitsOf(owner);
            if (od.length >= 8 && od === targetDigits) return true;
            continue;
        }

        // 3) Se entrambi sono numeri di telefono → confronta le cifre
        if (!owner.endsWith('@lid') && !targetIsLid) {
            const od = digitsOf(owner);
            if (od.length >= 8 && od === targetDigits) return true;
            // match suffisso (es. +39 vs senza prefisso)
            if (od.length >= 8 && targetDigits.length >= 8) {
                if (od.endsWith(targetDigits) || targetDigits.endsWith(od)) return true;
            }
            continue;
        }

        // 4) Uno è LID, l'altro no → prova a risolvere tramite lidCache
        try {
            if (global.lidCache) {
                const lidOne = owner.endsWith('@lid') ? owner : target;
                const numOne = owner.endsWith('@lid') ? target : owner;
                const mapped = global.lidCache.get(lidOne);
                if (mapped) {
                    const mappedNorm = String(mapped).includes('@')
                        ? String(mapped).replace(/:\d+@/, '@')
                        : (String(mapped).replace(/\D/g, '') + '@s.whatsapp.net');
                    if (mappedNorm === numOne) return true;
                    const md = digitsOf(mappedNorm);
                    const nd = digitsOf(numOne);
                    if (md.length >= 8 && md === nd) return true;
                }
            }
        } catch {}
    }

    return false;
}

module.exports = { isOwner, OWNER };
