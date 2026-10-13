function fixSections(sections) {
    if (!Array.isArray(sections)) return sections;
    return sections.map(sec => ({
        ...sec,
        rows: (sec.rows || []).map(r => ({
            header: '',
            description: '',
            ...r
        }))
    }));
}

function toLib(b) {
    try {
        if (b && b.name && b.buttonParamsJson) {
            const p = JSON.parse(b.buttonParamsJson);
            if (b.name === 'single_select') return { text: p.title, sections: fixSections(p.sections) };
            if (b.name === 'quick_reply') return { text: p.display_text, id: p.id };
            if (b.name === 'cta_url') return { text: p.display_text, url: p.url };
            if (b.name === 'cta_copy') return { text: p.display_text, copy: p.copy_code };
            if (b.name === 'cta_call') return { text: p.display_text, call: p.phone_number };
        }
        if (b && Array.isArray(b.sections)) return { ...b, sections: fixSections(b.sections) };
    } catch {}
    return b;
}

const isOld = (arr) => Array.isArray(arr) && arr.length > 0 &&
    arr.every(b => b && b.name && b.buttonParamsJson);

function convert(o) {
    if (isOld(o.buttons)) {
        o.nativeFlow = o.buttons.map(toLib);
        delete o.buttons;
        if (o.headerType === 1) delete o.headerType;
    }
    if (Array.isArray(o.nativeFlow)) o.nativeFlow = o.nativeFlow.map(toLib);
    return o;
}

function fixCard(card) {
    const c = convert({ ...card });
    if (!c.caption && (c.title || c.body)) {
        c.caption = [c.title, c.body].filter(Boolean).join('\n\n');
    }
    delete c.title;
    delete c.body;
    return c;
}

function fixContent(c) {
    if (!c || typeof c !== 'object') return c;
    convert(c);
    if (Array.isArray(c.cards)) c.cards = c.cards.map(fixCard);
    return c;
}

module.exports = { toLib, fixContent };
