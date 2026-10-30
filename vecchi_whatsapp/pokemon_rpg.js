'use strict'

const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, '../pokemon_db.json')

const readDb = () => {
    if (!fs.existsSync(dbPath)) return {}
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')) || {} } catch { return {} }
}
const writeDb = (data) => {
    const tmp = dbPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, dbPath)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const MAX_TEAM = 6

const BALLS = {
    pokeball: { label: 'Pokéball', emoji: '⚪', price: 100, bonus: 0 },
    superball: { label: 'Superball', emoji: '🔵', price: 250, bonus: 0.15 },
    ultraball: { label: 'Ultraball', emoji: '🟡', price: 500, bonus: 0.30 }
}

const RARITY = {
    comune: { label: 'Comune', weight: 55, catch: 0.75 },
    insolito: { label: 'Insolito', weight: 28, catch: 0.55 },
    raro: { label: 'Raro', weight: 14, catch: 0.35 },
    leggendario: { label: 'Leggendario', weight: 3, catch: 0.15 }
}

const S = (type, emoji, hp, atk, def, rarity, evo) => ({ type, emoji, hp, atk, def, rarity, evo })
const SPECIES = {
    Bulbasaur: S('Erba', '🌱', 45, 49, 49, 'starter', { to: 'Ivysaur', level: 16 }),
    Ivysaur: S('Erba', '🌿', 60, 62, 63, 'evoluto', { to: 'Venusaur', level: 32 }),
    Venusaur: S('Erba', '🌳', 80, 82, 83, 'evoluto'),
    Charmander: S('Fuoco', '🔥', 39, 52, 43, 'starter', { to: 'Charmeleon', level: 16 }),
    Charmeleon: S('Fuoco', '🔥', 58, 64, 58, 'evoluto', { to: 'Charizard', level: 36 }),
    Charizard: S('Fuoco', '🐲', 78, 84, 78, 'evoluto'),
    Squirtle: S('Acqua', '💧', 44, 48, 65, 'starter', { to: 'Wartortle', level: 16 }),
    Wartortle: S('Acqua', '🐢', 59, 63, 80, 'evoluto', { to: 'Blastoise', level: 36 }),
    Blastoise: S('Acqua', '🌊', 79, 83, 100, 'evoluto'),
    Pidgey: S('Volante', '🐦', 40, 45, 40, 'comune', { to: 'Pidgeotto', level: 18 }),
    Pidgeotto: S('Volante', '🦅', 63, 60, 55, 'evoluto', { to: 'Pidgeot', level: 36 }),
    Pidgeot: S('Volante', '🦅', 83, 80, 75, 'evoluto'),
    Rattata: S('Normale', '🐭', 30, 56, 35, 'comune', { to: 'Raticate', level: 20 }),
    Raticate: S('Normale', '🐀', 55, 81, 60, 'evoluto'),
    Zubat: S('Veleno', '🦇', 40, 45, 35, 'comune'),
    Magikarp: S('Acqua', '🐟', 20, 10, 55, 'comune', { to: 'Gyarados', level: 20 }),
    Pikachu: S('Elettro', '⚡', 35, 55, 40, 'insolito'),
    Eevee: S('Normale', '🦊', 55, 55, 50, 'insolito'),
    Machamp: S('Lotta', '💪', 90, 130, 80, 'insolito'),
    Arcanine: S('Fuoco', '🔥', 90, 110, 80, 'insolito'),
    Snorlax: S('Normale', '😴', 160, 110, 65, 'raro'),
    Gengar: S('Spettro', '👻', 60, 65, 60, 'raro'),
    Lucario: S('Lotta', '🐺', 70, 110, 70, 'raro'),
    Gyarados: S('Acqua', '🌊', 95, 125, 79, 'raro'),
    Dragonite: S('Drago', '🐉', 91, 134, 95, 'raro'),
    Mewtwo: S('Psico', '🧬', 106, 110, 90, 'leggendario')
}
const DEX_TOTAL = Object.keys(SPECIES).length

const POOL = { comune: [], insolito: [], raro: [], leggendario: [] }
for (const [n, s] of Object.entries(SPECIES)) if (POOL[s.rarity]) POOL[s.rarity].push(n)

const TYPES = {
    Fuoco: { forte: ['Erba'], debole: ['Acqua', 'Fuoco', 'Drago'] },
    Acqua: { forte: ['Fuoco'], debole: ['Acqua', 'Erba', 'Drago'] },
    Erba: { forte: ['Acqua'], debole: ['Fuoco', 'Erba', 'Veleno', 'Volante', 'Drago'] },
    Elettro: { forte: ['Acqua', 'Volante'], debole: ['Elettro', 'Erba', 'Drago'] },
    Normale: { forte: [], debole: [] },
    Lotta: { forte: ['Normale'], debole: ['Volante', 'Psico', 'Veleno'] },
    Spettro: { forte: ['Psico', 'Spettro'], debole: ['Normale'] },
    Psico: { forte: ['Lotta', 'Veleno'], debole: ['Psico'] },
    Drago: { forte: ['Drago'], debole: [] },
    Volante: { forte: ['Erba', 'Lotta'], debole: ['Elettro'] },
    Veleno: { forte: ['Erba'], debole: ['Veleno', 'Spettro'] }
}
const effect = (att, def) => {
    const t = TYPES[att]
    if (!t) return 1
    if (t.forte.includes(def)) return 1.5
    if (t.debole.includes(def)) return 0.67
    return 1
}

const xpNeeded = (lvl) => lvl * 25

function normalize(p) {
    const sp = SPECIES[p.name]
    if (sp) { p.type = sp.type; p.emoji = sp.emoji }
    p.level = Math.max(1, Number(p.level) || 1)
    p.xp = Math.max(0, Number(p.xp) || 0)
    return p
}

function ensureUser(u) {
    if (!Array.isArray(u.team)) u.team = []
    u.team.forEach(normalize)
    if (!u.balls || typeof u.balls !== 'object') u.balls = { pokeball: 5, superball: 0, ultraball: 0 }
    for (const k of Object.keys(BALLS)) if (typeof u.balls[k] !== 'number') u.balls[k] = 0
    if (!Array.isArray(u.dex)) u.dex = [...new Set(u.team.map(p => p.name))]
    if (!u.cd || typeof u.cd !== 'object') u.cd = {}
    u.coins = Number(u.coins) || 0
    u.wins = u.wins || 0
    u.losses = u.losses || 0
    u.lastBonus = u.lastBonus || 0
    return u
}

function statsOf(p) {
    const s = SPECIES[p.name] || { hp: 50, atk: 50, def: 50 }
    const l = p.level
    return {
        hp: Math.floor(s.hp * 2 * l / 50) + l + 10,
        atk: Math.floor(s.atk * 2 * l / 50) + 5,
        def: Math.floor(s.def * 2 * l / 50) + 5
    }
}

function rollWild() {
    const tot = Object.values(RARITY).reduce((a, r) => a + r.weight, 0)
    let x = Math.random() * tot
    let key = 'comune'
    for (const [k, r] of Object.entries(RARITY)) {
        x -= r.weight
        if (x < 0) { key = k; break }
    }
    return pick(POOL[key])
}

function gainXp(user, p, amount) {
    const lines = []
    p.xp += amount
    while (p.level < 100 && p.xp >= xpNeeded(p.level)) {
        p.xp -= xpNeeded(p.level)
        p.level++
        lines.push(`🎊 *${p.name}* è salito al livello *${p.level}*!`)
        const evo = SPECIES[p.name] && SPECIES[p.name].evo
        if (evo && p.level >= evo.level) {
            const old = p.name
            p.name = evo.to
            normalize(p)
            if (!user.dex.includes(p.name)) user.dex.push(p.name)
            lines.push(`✨ *${old}* si è evoluto in *${p.name}* ${p.emoji}!`)
        }
    }
    if (p.level >= 100) p.xp = 0
    return lines
}

function cooldown(user, key, sec) {
    const now = Date.now()
    const left = Math.ceil(((user.cd[key] || 0) + sec * 1000 - now) / 1000)
    if (left > 0) return left
    user.cd[key] = now
    return 0
}

function battle(a, b) {
    const sa = statsOf(a)
    const sb = statsOf(b)
    let ha = sa.hp
    let hb = sb.hp
    const dmg = (att, def, sAtt, sDef) => Math.max(2, Math.round(
        sAtt.atk * effect(att.type, def.type) * (0.85 + Math.random() * 0.3) * (sAtt.atk / (sAtt.atk + sDef.def)) * 0.9
    ))
    let turns = 0
    while (ha > 0 && hb > 0 && turns < 30) {
        turns++
        hb -= dmg(a, b, sa, sb)
        if (hb <= 0) break
        ha -= dmg(b, a, sb, sa)
    }
    const win = hb <= 0 ? true : ha <= 0 ? false : (ha / sa.hp >= hb / sb.hp)
    return { win, turns, hpLeft: Math.max(0, Math.round(ha / sa.hp * 100)) }
}

const fmtTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

const teamLine = (p, i) =>
    `${i + 1}. ${p.emoji} *${p.name}*${p.shiny ? ' ✨' : ''} — Lv *${p.level}* (${p.xp}/${xpNeeded(p.level)} XP)`

// ── BOTTONI ──
// Se premendo un bottone non succede niente, metti il tuo prefisso qui sotto (es. '.')
const BTN_PREFIX = ''
const FOOTER = '⚡ Zeno Ultimate • Pokémon RPG'
const BTN = (cmdline, label) => ({ buttonId: BTN_PREFIX + cmdline, buttonText: { displayText: label }, type: 1 })

async function sendB(ctx, out, buttons) {
    const pk = ctx.__pk
    if (!buttons || !buttons.length || !pk) return ctx.reply(out)
    try {
        const base = typeof out === 'string' ? { text: out } : out
        return await pk.sock.sendMessage(pk.m.key.remoteJid, {
            ...base, footer: FOOTER, buttons: buttons.slice(0, 3), headerType: base.image ? 4 : 1
        }, { quoted: pk.m })
    } catch (e) {
        console.error('[pokemon] bottoni:', e && e.message)
        return ctx.reply(out)
    }
}
const box = async (ctx, title, lines, buttons) => sendB(ctx, await ctx.ui.box(title, lines.filter(Boolean)), buttons)

const CMD = {}

CMD.pokemenu = async ({ ctx, P }) => {
    await box(ctx, '🔴 POKÉMON RPG', [
        { section: 'Inizio' },
        `▸ *${P}starter* scegli il tuo primo Pokémon`,
        { section: 'Azioni' },
        `▸ *${P}cattura [ball]* cerca e cattura`,
        `▸ *${P}allena* allena il principale`,
        `▸ *${P}pokelotta* combatti un selvatico`,
        `▸ *${P}pokebonus* premio ogni 24 ore`,
        { section: 'Squadra' },
        `▸ *${P}poketeam* la tua squadra`,
        `▸ *${P}pokeprincipale <n>* scegli il principale`,
        `▸ *${P}pokerilascia <n> si* libera un Pokémon`,
        `▸ *${P}pokedexrpg* Pokémon incontrati`,
        { section: 'Negozio' },
        `▸ *${P}pokeshop* lista ball`,
        `▸ *${P}pokecompra <ball> [quantità]*`
    ], [BTN('poketeam', '🎒 Squadra'), BTN('cattura', '🌿 Cattura'), BTN('allena', '⚔️ Allena')])
    return sendB(ctx, '➕ *Altre azioni*', [BTN('pokelotta', '🥊 Lotta'), BTN('pokedexrpg', '📖 Pokédex'), BTN('pokeshop', '🛒 Negozio')])
}

CMD.starter = async ({ ctx, args, db, sender, P }) => {
    if (db[sender]) return ctx.err(`Hai già scelto il tuo Pokémon iniziale! Usa *${P}poketeam* per vederlo.`)

    const starters = { bulbasaur: 'Bulbasaur', charmander: 'Charmander', squirtle: 'Squirtle' }
    const scelta = (args[0] || '').toLowerCase()
    if (!starters[scelta]) {
        return box(ctx, '🔴 SCEGLI IL TUO STARTER', [
            'Tocca un bottone oppure scrivi:',
            `🌱 *${P}starter bulbasaur*`,
            `🔥 *${P}starter charmander*`,
            `💧 *${P}starter squirtle*`
        ], [BTN('starter bulbasaur', '🌱 Bulbasaur'), BTN('starter charmander', '🔥 Charmander'), BTN('starter squirtle', '💧 Squirtle')])
    }

    const p = normalize({ name: starters[scelta], level: 5, xp: 0 })
    db[sender] = ensureUser({ coins: 500, team: [p], dex: [p.name] })
    writeDb(db)

    return box(ctx, '🎉 BENVENUTO NEL MONDO POKÉMON', [
        `Hai scelto *${p.name}*! ${p.emoji}`,
        `Tipo: *${p.type}*`,
        '🎁 Regalo: 500 monete e 5 Pokéball',
        { section: 'Cosa fare ora?' },
        'Tocca un bottone per iniziare!'
    ], [BTN('cattura', '🌿 Cattura'), BTN('allena', '⚔️ Allena'), BTN('poketeam', '🎒 Squadra')])
}

CMD.poketeam = async ({ ctx, user, P }) => box(ctx, '🎒 LA TUA SQUADRA', [
    `💰 Monete: *${user.coins}*`,
    `👥 Pokémon: *${user.team.length}/${MAX_TEAM}*`,
    `🏆 Lotte: *${user.wins}* vinte / *${user.losses}* perse`,
    `⚪ ${user.balls.pokeball}  🔵 ${user.balls.superball}  🟡 ${user.balls.ultraball}`,
    { section: 'Squadra' },
    user.team.map(teamLine).join('\n') || 'Nessun Pokémon.',
    { raw: `_Il numero 1 è il principale: cambialo con ${P}pokeprincipale <n>_` }
], [BTN('pokelotta', '🥊 Lotta'), BTN('cattura', '🌿 Cattura'), BTN('pokeshop', '🛒 Negozio')])

CMD.pokeprincipale = async ({ ctx, args, db, user, P }) => {
    const n = parseInt(args[0], 10)
    if (!n || n < 1 || n > user.team.length) return ctx.err(`Scrivi il numero del Pokémon (1-${user.team.length}).\nEsempio: *${P}pokeprincipale 2*`)
    if (n === 1) return ctx.err('È già il tuo Pokémon principale!')
    const [p] = user.team.splice(n - 1, 1)
    user.team.unshift(p)
    writeDb(db)
    return sendB(ctx, `✅ *${p.name}* ${p.emoji} è il nuovo Pokémon principale!`, [BTN('poketeam', '🎒 Squadra'), BTN('pokelotta', '🥊 Lotta')])
}

CMD.pokerilascia = async ({ ctx, args, db, user, P }) => {
    const n = parseInt(args[0], 10)
    if (!n || n < 1 || n > user.team.length) return ctx.err(`Scrivi il numero del Pokémon (1-${user.team.length}).`)
    if (user.team.length <= 1) return ctx.err('Non puoi liberare il tuo ultimo Pokémon!')
    const p = user.team[n - 1]
    if ((args[1] || '').toLowerCase() !== 'si') {
        return sendB(ctx, `⚠️ Stai per liberare *${p.name}* (Lv ${p.level}) per sempre!\nConferma col bottone oppure scrivi *${P}pokerilascia ${n} si*`,
            [BTN(`pokerilascia ${n} si`, '✅ Sì, libera'), BTN('poketeam', '❌ Annulla')])
    }
    const reward = p.level * 5 + 10
    user.team.splice(n - 1, 1)
    user.coins += reward
    writeDb(db)
    return sendB(ctx, `👋 Hai liberato *${p.name}* ${p.emoji}.\n💰 Hai ricevuto *${reward}* monete.`, [BTN('poketeam', '🎒 Squadra')])
}

CMD.pokedexrpg = async ({ ctx, user }) => {
    const names = Object.keys(SPECIES)
    const seen = names.filter(n => user.dex.includes(n))
    return box(ctx, '📖 POKÉDEX', [
        `Incontrati: *${seen.length}/${DEX_TOTAL}*`,
        { section: 'Visti' },
        seen.map(n => `${SPECIES[n].emoji} ${n}`).join('  ') || 'Nessuno.',
        { section: 'Mancanti' },
        names.filter(n => !seen.includes(n)).map(() => '❔').join(' ') || '🎉 Hai completato il Pokédex!'
    ], [BTN('cattura', '🌿 Cattura'), BTN('poketeam', '🎒 Squadra')])
}

CMD.pokebonus = async ({ ctx, db, user }) => {
    const wait = 24 * 3600 * 1000
    const left = Math.ceil((user.lastBonus + wait - Date.now()) / 1000)
    if (left > 0) return ctx.err(`⏳ Il prossimo bonus tra *${fmtTime(left)}*.`)
    user.lastBonus = Date.now()
    user.coins += 150
    user.balls.pokeball += 3
    writeDb(db)
    return box(ctx, '🎁 BONUS GIORNALIERO', [
        '+ *150* monete 💰',
        '+ *3* Pokéball ⚪',
        { raw: `💰 Monete: *${user.coins}*` }
    ], [BTN('cattura', '🌿 Cattura'), BTN('pokeshop', '🛒 Negozio')])
}

CMD.pokeshop = async ({ ctx, user, P }) => box(ctx, '🛒 NEGOZIO POKÉMON', [
    `💰 Monete: *${user.coins}*`,
    { section: 'Ball' },
    ...Object.entries(BALLS).map(([k, b]) =>
        `${b.emoji} *${b.label}* — ${b.price} monete (hai: ${user.balls[k]})`),
    { raw: '_Superball e Ultraball catturano più facilmente. Tocca un bottone per comprarne una._' }
], Object.entries(BALLS).map(([k, b]) => BTN(`pokecompra ${k}`, `${b.emoji} ${b.label} (${b.price})`)))

CMD.pokecompra = async ({ ctx, args, db, user, P }) => {
    const key = (args[0] || '').toLowerCase()
    const ball = BALLS[key]
    if (!ball) return sendB(ctx, `Scegli quale ball comprare.\nEsempio: *${P}pokecompra superball 3*`, [BTN('pokeshop', '🛒 Negozio')])
    const qty = clamp(parseInt(args[1], 10) || 1, 1, 20)
    const cost = ball.price * qty
    if (user.coins < cost) return ctx.err(`Ti servono *${cost}* monete, ne hai *${user.coins}*.`)
    user.coins -= cost
    user.balls[key] += qty
    writeDb(db)
    return sendB(ctx, `✅ Hai comprato *${qty}x ${ball.label}* ${ball.emoji} per *${cost}* monete.\n💰 Monete rimaste: *${user.coins}*`,
        [BTN(`cattura ${key}`, '🌿 Cattura'), BTN('pokeshop', '🛒 Negozio')])
}

CMD.cattura = async ({ ctx, args, db, user, P }) => {
    if (user.team.length >= MAX_TEAM) return ctx.err(`La tua squadra è piena (max ${MAX_TEAM})! Libera qualcuno con *${P}pokerilascia*.`)

    const key = (args[0] || 'pokeball').toLowerCase()
    const ball = BALLS[key]
    if (!ball) return ctx.err('Ball non valida. Usa: pokeball, superball o ultraball.')
    if (!user.balls[key]) {
        return sendB(ctx, `❌ Non hai nessuna ${ball.label}!\nComprane una oppure ritira il bonus.`,
            [BTN(`pokecompra ${key}`, `${ball.emoji} Compra (${ball.price})`), BTN('pokebonus', '🎁 Bonus'), BTN('pokeshop', '🛒 Negozio')])
    }

    const left = cooldown(user, 'cattura', 15)
    if (left) return ctx.err(`⏳ Aspetta ancora *${left}s* prima di cercare di nuovo.`)
    writeDb(db)

    await ctx.react('🌿')
    await ctx.reply('_Ti addentri nell\'erba alta..._')
    await sleep(1500)

    if (Math.random() > 0.65) {
        return sendB(ctx, '_Non hai trovato nessun Pokémon... Riprova!_', [BTN(`cattura ${key}`, '🌿 Riprova')])
    }

    const lead = user.team[0]
    const name = rollWild()
    const sp = SPECIES[name]
    const level = Math.max(1, lead.level + rnd(-2, 2))
    const shiny = Math.random() < 1 / 64
    const chance = clamp(RARITY[sp.rarity].catch + ball.bonus - level * 0.004, 0.05, 0.95)

    user.balls[key]--
    await sleep(1200)

    if (Math.random() < chance) {
        const p = normalize({ name, level, xp: 0, shiny })
        user.team.push(p)
        if (!user.dex.includes(name)) user.dex.push(name)
        writeDb(db)
        return box(ctx, '✨ POKÉMON CATTURATO!', [
            `Hai lanciato una ${ball.label} ${ball.emoji} e... *CLICK!*`,
            `🎉 Hai catturato *${name}* ${sp.emoji}${shiny ? ' ✨ SHINY!' : ''}`,
            `Tipo: *${sp.type}* | Livello: *${level}* | ${RARITY[sp.rarity].label}`,
            { raw: `${ball.emoji} ${ball.label} rimaste: *${user.balls[key]}*` }
        ], [BTN(`cattura ${key}`, '🌿 Ancora'), BTN('pokelotta', '🥊 Lotta'), BTN('poketeam', '🎒 Squadra')])
    }

    writeDb(db)
    return box(ctx, '💨 FUGGITO!', [
        `Hai trovato un *${name}* ${sp.emoji} (Lv ${level}, ${RARITY[sp.rarity].label})!`,
        `Ma è scappato dalla ${ball.label}... 😢`,
        `Probabilità di cattura: *${Math.round(chance * 100)}%*`,
        { raw: `${ball.emoji} ${ball.label} rimaste: *${user.balls[key]}*` }
    ], [BTN(`cattura ${key}`, '🌿 Riprova'), BTN('pokeshop', '🛒 Negozio')])
}

CMD.allena = async ({ ctx, db, user }) => {
    const lead = user.team[0]
    if (!lead) return ctx.err('Non hai Pokémon da allenare!')

    const left = cooldown(user, 'allena', 30)
    if (left) return ctx.err(`⏳ Il tuo Pokémon è stanco, riposa ancora *${left}s*.`)

    await ctx.react('⚔️')

    const coinsEarned = rnd(20, 50) + lead.level
    const xpEarned = rnd(15, 35) + Math.floor(lead.level / 2)
    user.coins += coinsEarned
    const ups = gainXp(user, lead, xpEarned)
    writeDb(db)

    return box(ctx, '⚔️ ALLENAMENTO', [
        `Il tuo *${lead.name}* si è allenato duramente!`,
        `+ *${xpEarned}* XP`,
        `+ *${coinsEarned}* Monete 💰`,
        ...ups,
        { section: 'Statistiche' },
        `Livello: *${lead.level}*`,
        `XP: *${lead.xp}/${xpNeeded(lead.level)}*`
    ], [BTN('allena', '🔁 Ancora'), BTN('pokelotta', '🥊 Lotta'), BTN('poketeam', '🎒 Squadra')])
}

CMD.pokelotta = async ({ ctx, db, user }) => {
    const lead = user.team[0]
    if (!lead) return ctx.err('Non hai Pokémon per combattere!')

    const left = cooldown(user, 'lotta', 20)
    if (left) return ctx.err(`⏳ Riposa ancora *${left}s* prima di un'altra lotta.`)

    await ctx.react('⚔️')

    const name = rollWild()
    const foe = normalize({ name, level: Math.max(1, lead.level + rnd(-2, 2)), xp: 0 })
    const res = battle(lead, foe)

    const eff = effect(lead.type, foe.type)
    const effLine = eff > 1 ? '💥 È superefficace!' : eff < 1 ? '🛡 Non è molto efficace...' : ''

    let lines
    if (res.win) {
        const coins = 20 + foe.level * 4 + rnd(0, 20)
        const xp = 20 + foe.level * 3
        user.coins += coins
        user.wins++
        const ups = gainXp(user, lead, xp)
        lines = [
            `*${lead.name}* ${lead.emoji} (Lv ${lead.level}) VS *${foe.name}* ${foe.emoji} (Lv ${foe.level})`,
            effLine,
            `🏆 *Hai vinto* in ${res.turns} turni! (HP rimasti: ${res.hpLeft}%)`,
            `+ *${xp}* XP`,
            `+ *${coins}* Monete 💰`,
            ...ups
        ]
    } else {
        const lost = Math.min(user.coins, 15)
        user.coins -= lost
        user.losses++
        const ups = gainXp(user, lead, 5)
        lines = [
            `*${lead.name}* ${lead.emoji} (Lv ${lead.level}) VS *${foe.name}* ${foe.emoji} (Lv ${foe.level})`,
            effLine,
            `💀 *Hai perso* contro ${foe.name}...`,
            `- *${lost}* Monete 💰`,
            '+ *5* XP di consolazione',
            ...ups
        ]
    }
    writeDb(db)
    return box(ctx, '⚔️ LOTTA POKÉMON', lines,
        [BTN('pokelotta', res.win ? '🥊 Altra lotta' : '🔥 Rivincita'), BTN('allena', '💪 Allena'), BTN('poketeam', '🎒 Squadra')])
}

const ALIAS = { inizia: 'starter', squadra: 'poketeam', pokenegozio: 'pokeshop', pokehelp: 'pokemenu' }

module.exports = {
    commands: [
        'starter', 'inizia', 'poketeam', 'squadra', 'cattura', 'allena',
        'pokemenu', 'pokehelp', 'pokelotta', 'pokeprincipale', 'pokerilascia',
        'pokedexrpg', 'pokebonus', 'pokeshop', 'pokenegozio', 'pokecompra'
    ],
    category: 'pokemon',
    description: 'Il mondo Pokémon RPG',
    author: 'ZENO',

    async run(sock, m, args, cmd, ctx) {
        const sender = m.key.participant || m.key.remoteJid
        const P = (ctx && ctx.prefix) || '.'
        ctx.__pk = { sock, m }
        const raw = String(cmd || '').toLowerCase()
        const c = ALIAS[raw] || raw
        const db = readDb()

        if (c === 'pokemenu') return CMD.pokemenu({ ctx, P })
        if (c === 'starter') return CMD.starter({ ctx, args, db, sender, P })

        if (!db[sender]) {
            return sendB(ctx, `Prima di iniziare devi scegliere il tuo Pokémon!\nTocca un bottone oppure scrivi *${P}starter*`,
                [BTN('starter bulbasaur', '🌱 Bulbasaur'), BTN('starter charmander', '🔥 Charmander'), BTN('starter squirtle', '💧 Squirtle')])
        }
        const user = ensureUser(db[sender])

        const fn = CMD[c]
        if (!fn) return
        try {
            return await fn({ sock, m, ctx, args, db, user, sender, P })
        } catch (e) {
            console.error('[pokemon] ' + c + ':', e && e.message)
            return ctx.err('Errore imprevisto, riprova.')
        }
    }
}
