//Plugin by plugins zero

const WHITELIST_DOMAINS = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be']
const RAW_LINK = /(https?:\/\/[^\s"\\]+)|(www\.[^\s"\\]+\.[a-z]{2,})/gi
const CRASH = /[\u0600-\u06FF\u0900-\u0DFF\u200B-\u200F]{300,}/
const MAX_RAW = 8000
const SKIP = new Set([
  'url', 'directPath', 'mediaKey', 'fileSha256', 'fileEncSha256', 'mediaKeyTimestamp',
  'jpegThumbnail', 'thumbnailDirectPath', 'thumbnailSha256', 'thumbnailEncSha256',
  'waveform', 'streamingSidecar', 'scansSidecar', 'scanLengths',
  'midQualityFileSha256', 'quotedMessage'
])
const MEDIA = [
  'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage',
  'documentMessage', 'ptvMessage', 'lottieStickerMessage'
]

const strip = (k, v) =>
  (SKIP.has(k) || v?.type === 'Buffer' || v instanceof Uint8Array) ? undefined : v

const isWhitelisted = (l) => WHITELIST_DOMAINS.some(d => l.toLowerCase().includes(d))

export async function before(m, { conn, isAdmin, isBotAdmin }) {
  if (m.isBaileys && m.fromMe) return true
  if (!m.isGroup) return false

  const chat = global.db.data.chats[m.chat]
  if (!chat?.antiLink || chat?.isBanned) return true

  if (isAdmin || !isBotAdmin) return true

  try {
    const msg = m.message || {}
    const inner =
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.ephemeralMessage?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg

    const mediaKey = MEDIA.find(k => inner[k])
    let raw = ''

    if (mediaKey) {
      raw = inner[mediaKey].caption || ''
    } else {
      try { raw = JSON.stringify(inner, strip) } catch {}
    }

    const crash = CRASH.test(raw) || (!mediaKey && raw.length > MAX_RAW)
    const hasLink = (raw.match(RAW_LINK) || []).some(l => !isWhitelisted(l))

    if (!crash && !hasLink) return true

    try { await conn.sendMessage(m.chat, { delete: m.key }) } catch {}

    if (crash || chat.antiLinkMode === 'kick') {
      try {
        await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
        await conn.sendMessage(m.chat, {
          text: `🚫 @${m.sender.split('@')[0]} rimosso per link.`,
          mentions: [m.sender]
        })
      } catch {
        await conn.sendMessage(m.chat, {
          text: `⚠️ @${m.sender.split('@')[0]} ha mandato un link ma non riesco a rimuoverlo.`,
          mentions: [m.sender]
        })
      }
    } else {
      await conn.sendMessage(m.chat, {
        text: `⚠️ @${m.sender.split('@')[0]}, link non consentiti!`,
        mentions: [m.sender]
      })
    }

    return false
  } catch (e) {
    console.error('antilink before:', e.message)
    return true
  }
}

export const commands = ['antilink', 'antilinkkick', 'antilinkwarn', 'antilinkoff']

export async function run(m, { conn, command, isAdmin, isOwner }) {
  if (!m.isGroup)
    return conn.sendMessage(m.chat, { text: '❌ Solo nei gruppi!' }, { quoted: m })

  if (!isAdmin && !isOwner)
    return conn.sendMessage(m.chat, { text: '❌ Solo admin!' }, { quoted: m })

  if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}
  const chat = global.db.data.chats[m.chat]

  if (command === 'antilinkkick') {
    chat.antiLink = true
    chat.antiLinkMode = 'kick'
    return conn.sendMessage(m.chat, { text: '🔗🦵 Antilink *KICK* attivato.' }, { quoted: m })
  }

  if (command === 'antilinkwarn') {
    chat.antiLink = true
    chat.antiLinkMode = 'warn'
    return conn.sendMessage(m.chat, { text: '🔗⚠️ Antilink *WARN* attivato.' }, { quoted: m })
  }

  if (command === 'antilinkoff') {
    chat.antiLink = false
    delete chat.antiLinkMode
    return conn.sendMessage(m.chat, { text: '🔗❌ Antilink disattivato.' }, { quoted: m })
  }

  const status = chat.antiLink
    ? `Attivo (${(chat.antiLinkMode || 'warn').toUpperCase()})`
    : 'Disattivo'

  return conn.sendMessage(m.chat, {
    text:
`🔗 *GESTIONE ANTILINK*

Stato: *${status}*
Whitelist: TikTok, Instagram, YouTube

Comandi disponibili:
• .antilinkkick
• .antilinkwarn
• .antilinkoff`
  }, { quoted: m })
}

export const disabled = false
