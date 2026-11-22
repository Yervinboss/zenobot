const { downloadContentFromMessage } = require('@itsliaaa/baileys')

const TYPES = { imageMessage: 'image', videoMessage: 'video', stickerMessage: 'sticker', audioMessage: 'audio' }

function unwrap(msg) {
  while (msg) {
    const n = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message || msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message || msg.editedMessage?.message
    if (!n) break
    msg = n
  }
  return msg || {}
}

async function download(node, type) {
  const stream = await downloadContentFromMessage(node, type)
  const chunks = []
  for await (const c of stream) chunks.push(c)
  return Buffer.concat(chunks)
}

function build(k, node, buf, caption, mentions) {
  const extra = mentions ? { mentions } : {}
  if (k === 'imageMessage') return { image: buf, caption, ...extra }
  if (k === 'videoMessage') return { video: buf, caption, mimetype: node.mimetype, gifPlayback: !!node.gifPlayback, ...extra }
  if (k === 'stickerMessage') return { sticker: buf, ...extra }
  return { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: !!node.ptt, ...extra }
}

// ricorda ogni media in arrivo (id messaggio -> dati per scaricarlo)
const store = new Map()

function remember(m) {
  try {
    if (!m?.message) return
    const inner = unwrap(m.message)
    const k = Object.keys(TYPES).find(x => inner[x])
    if (!k) return
    const node = inner[k]
    const vo = !!node.viewOnce || Object.keys(m.message).some(x => /viewOnce/i.test(x))
    const entry = { k, node, vo }
    store.set(m.key.id, entry)
    if (store.size > 300) store.delete(store.keys().next().value)
    if (vo) {
      console.log('[vv] visualizzazione singola ricevuta, scarico…', m.key.id)
      download(node, TYPES[k])
        .then(b => { entry.buf = b; console.log('[vv] salvata', b.length, 'byte') })
        .catch(e => console.log('[vv] download fallito:', e.message))
    }
  } catch (e) { console.log('[mediautil]', e.message) }
}

async function recover(id) {
  const e = store.get(id)
  if (!e) return null
  const buf = e.buf || await download(e.node, TYPES[e.k])
  return { k: e.k, node: e.node, buf }
}

module.exports = { TYPES, unwrap, download, build, remember, recover }
