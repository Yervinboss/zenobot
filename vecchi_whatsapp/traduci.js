'use strict';

// Funzione 1: Prova con Google
async function translateGoogle(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data[0]) throw new Error('Risposta Google non valida');
    return { text: data[0].map(item => item[0]).join(''), lang: data[2] || 'auto' };
}

// Funzione 2: Se Google fallisce, prova con MyMemory
async function translateMyMemory(text, targetLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const data = await res.json();
    if (!data.responseData || !data.responseData.translatedText) throw new Error('Risposta MyMemory non valida');
    return { text: data.responseData.translatedText, lang: data.responseData.detectedLanguage || 'auto' };
}

module.exports = {
    commands: ['traduci', 'tradu', 'translate', 'tr'],
    name: 'traduci',
    category: 'tools',
    author: 'ZENO',
    description: 'Traduce un testo in un\'altra lingua (es. .traduci en Ciao)',
    usage: '<lingua> <testo>',
    minArgs: 1,

    async run(sock, m, args, cmd, ctx) {
        const targetLang = args[0].toLowerCase();
        let textToTranslate = '';

        // Prendi il testo dal messaggio citato o dal comando
        if (ctx.quoted && ctx.quoted.message) {
            const qMsg = ctx.quoted.message;
            textToTranslate = qMsg.conversation || 
                              qMsg.extendedTextMessage?.text || 
                              qMsg.imageMessage?.caption || 
                              qMsg.videoMessage?.caption || '';
        } else {
            textToTranslate = args.slice(1).join(' ');
        }

        if (!textToTranslate) {
            return ctx.err('Scrivi il testo da tradurre o rispondi a un messaggio con il comando.\nEsempio: *.traduci en Ciao come stai?*');
        }

        try {
            let result;
            try {
                // Prova prima Google
                result = await translateGoogle(textToTranslate, targetLang);
            } catch (e1) {
                // Se Google fallisce, logga l'errore e passa a MyMemory
                console.log('[TRADUCI] Google fallito:', e1.message, '→ provo MyMemory...');
                result = await translateMyMemory(textToTranslate, targetLang);
            }

            await ctx.reply(ctx.ui.box('🌍 TRADUZIONE', [
                `📝 *Originale:* ${textToTranslate}`,
                `🔤 *Lingua:* ${result.lang} → ${targetLang}`,
                { raw: `🇬🇧 *Tradotto:*\n${result.text}` }
            ], { footer: ctx.config?.botName || 'ZENO' }));

        } catch (e) {
            console.error('[TRADUCI] Errore definitivo:', e.message);
            ctx.err(`Errore durante la traduzione.\nDettaglio: ${e.message}`);
        }
    }
};
