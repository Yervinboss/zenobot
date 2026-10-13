async function getWaVersion(fallbackFn) {
    try {
        const res = await fetch('https://web.whatsapp.com/sw.js');
        const text = await res.text();
        const m = text.match(/client_revision\\?"?:\s*(\d+)/);
        if (m) {
            const v = [2, 3000, parseInt(m[1], 10)];
            console.log('Versione WhatsApp:', v.join('.'));
            return v;
        }
    } catch (e) {
        console.log('waversion errore:', e.message);
    }
    const { version } = await fallbackFn();
    console.log('Versione WhatsApp (fallback):', version.join('.'));
    return version;
}

module.exports = { getWaVersion };
