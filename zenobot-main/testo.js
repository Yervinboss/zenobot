module.exports = (m) => {
  const x = m.message
  if (!x) return ''
  let t = x.conversation || x.extendedTextMessage?.text || ''
  const nf = x.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
  if (nf) { try { t = JSON.parse(nf).id || t } catch {} }
  return x.buttonsResponseMessage?.selectedButtonId || x.listResponseMessage?.singleSelectReply?.selectedRowId || t
}
