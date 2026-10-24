// Mini-helper condiviso dai plugin nuovi: box grafico + risposte rapide
module.exports = function zx(sock, m, ctx) {
    const jid = m.key.remoteJid
    const box = (title, lines = [], opts) => {
        if (ctx && ctx.ui && ctx.ui.box) return ctx.ui.box(title, lines, opts)
        return `*${title}*\n` + lines.filter(Boolean).map(l => typeof l === 'object' ? (l.raw || '') : (l === '---' ? '──────' : '• ' + l)).join('\n')
    }
    const reply = (text, mentions) =>
        sock.sendMessage(jid, { text, ...(mentions && mentions.length ? { mentions } : {}) }, { quoted: m })
    const note = (icon, title) => (msg, mentions) => reply(box(`${icon} ${title}`, [{ raw: msg }], { footer: false }), mentions)
    return {
        jid, box, reply,
        ok: note('✅', 'FATTO'),
        err: note('❌', 'ERRORE'),
        warn: note('⚠️', 'ATTENZIONE'),
        info: note('ℹ️', 'INFO')
    }
}
