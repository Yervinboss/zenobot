const filtra = (orig) => (...a) => {
  if (typeof a[0] === 'string' && /^(Closing|Opening|Removing|Migrating) .*session|Bad MAC|Session error/i.test(a[0])) return
  orig(...a)
}
console.info = filtra(console.info)
console.warn = filtra(console.warn)
console.log = filtra(console.log)
