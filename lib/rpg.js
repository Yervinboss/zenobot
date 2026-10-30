import * as eco from './eco.js';

export const MAX_LEVEL = 65;
export const WORK_COOLDOWN = 30 * 1000;
export const xpNeeded = (l) => 40 + l * 20;
export const tierOf = (l) => (l < 5 ? 1 : l < 10 ? 2 : l < 30 ? 3 : l < 60 ? 4 : 5);
export const inRandomBracket = (l) => l >= 30 && l < 60;
const CHOICE_LEVELS = new Set([5, 10, 15, 20, 25, 60, 65]);

// paga base per fascia (min, max), poi moltiplicata per il livello
const BASE = { 1: [30, 70], 2: [70, 140], 3: [130, 280], 4: [250, 600], 5: [600, 1400] };

export const JOBS = [
  // fascia 1 (livello 1-4)
  { id: 'pizza', tier: 1, emoji: '🛵', name: 'Fattorino di pizze', t: 'hai consegnato pizze in scooter per tutta la città' },
  { id: 'piatti', tier: 1, emoji: '🍽️', name: 'Lavapiatti', t: 'hai lavato una montagna di piatti' },
  { id: 'cani', tier: 1, emoji: '🐕', name: 'Dog sitter', t: 'hai portato a spasso dei cani' },
  { id: 'limonata', tier: 1, emoji: '🍋', name: 'Venditore di limonata', t: 'hai venduto limonata davanti a casa' },
  { id: 'giornali', tier: 1, emoji: '📰', name: 'Giornalaio', t: 'hai consegnato i giornali all\'alba' },
  { id: 'autolavaggio', tier: 1, emoji: '🚗', name: 'Lavaggio auto', t: 'hai lavato auto a mano' },
  { id: 'prato', tier: 1, emoji: '🌿', name: 'Giardiniere', t: 'hai tagliato il prato ai vicini' },
  { id: 'volantini', tier: 1, emoji: '📄', name: 'Volantinaggio', t: 'hai distribuito volantini in centro' },
  // fascia 2 (livello 5-9)
  { id: 'barista', tier: 2, emoji: '☕', name: 'Barista', t: 'hai preparato caffè a raffica' },
  { id: 'cassiere', tier: 2, emoji: '🛒', name: 'Cassiere', t: 'hai passato la spesa alla cassa' },
  { id: 'corriere', tier: 2, emoji: '📦', name: 'Corriere', t: 'hai consegnato pacchi col furgone' },
  { id: 'cameriere', tier: 2, emoji: '🍝', name: 'Cameriere', t: 'hai servito ai tavoli di un ristorante' },
  { id: 'commesso', tier: 2, emoji: '👕', name: 'Commesso', t: 'hai servito clienti in negozio' },
  { id: 'magazziniere', tier: 2, emoji: '🏭', name: 'Magazziniere', t: 'hai smistato scatole in magazzino' },
  // fascia 3 (livello 10-29)
  { id: 'elettricista', tier: 3, emoji: '⚡', name: 'Elettricista', t: 'hai sistemato l\'impianto di una casa' },
  { id: 'sviluppatore', tier: 3, emoji: '💻', name: 'Sviluppatore junior', t: 'hai sistemato dei bug fino a sera' },
  { id: 'dj', tier: 3, emoji: '🎧', name: 'DJ', t: 'hai fatto ballare una festa intera' },
  { id: 'meccanico', tier: 3, emoji: '🔧', name: 'Meccanico', t: 'hai riparato un motore in officina' },
  { id: 'barman', tier: 3, emoji: '🍸', name: 'Barman', t: 'hai preparato cocktail tutta la sera' },
  { id: 'fotografo', tier: 3, emoji: '📸', name: 'Fotografo', t: 'hai fatto un servizio fotografico' },
  { id: 'tester', tier: 3, emoji: '🎮', name: 'Tester di videogiochi', t: 'hai testato un videogioco in beta' },
  { id: 'chef', tier: 3, emoji: '👨‍🍳', name: 'Chef', t: 'hai cucinato per un locale pieno' },
  { id: 'trainer', tier: 3, emoji: '🏋️', name: 'Personal trainer', t: 'hai allenato dei clienti in palestra' },
  { id: 'tassista', tier: 3, emoji: '🚕', name: 'Tassista', t: 'hai girato la città con il taxi' },
  { id: 'streamer', tier: 3, emoji: '📺', name: 'Streamer', t: 'hai fatto una diretta con la chat in delirio' },
  { id: 'grafico', tier: 3, emoji: '🎨', name: 'Grafico', t: 'hai disegnato un logo per un cliente' },
  // fascia 4 (livello 30-59, lavoro casuale)
  { id: 'avvocato', tier: 4, emoji: '⚖️', name: 'Avvocato', t: 'hai vinto una causa in tribunale' },
  { id: 'medico', tier: 4, emoji: '🩺', name: 'Medico', t: 'hai visitato pazienti tutto il giorno' },
  { id: 'ingegnere', tier: 4, emoji: '🏗️', name: 'Ingegnere', t: 'hai progettato un ponte' },
  { id: 'gamedev', tier: 4, emoji: '🕹️', name: 'Game developer', t: 'hai rilasciato una nuova patch del tuo gioco' },
  { id: 'architetto', tier: 4, emoji: '📐', name: 'Architetto', t: 'hai disegnato una villa da sogno' },
  { id: 'producer', tier: 4, emoji: '🎹', name: 'Producer musicale', t: 'hai prodotto una hit in studio' },
  { id: 'pilota', tier: 4, emoji: '✈️', name: 'Pilota di linea', t: 'hai portato un volo dall\'altra parte del mondo' },
  { id: 'detective', tier: 4, emoji: '🕵️', name: 'Detective', t: 'hai risolto un caso difficilissimo' },
  { id: 'professore', tier: 4, emoji: '🎓', name: 'Professore universitario', t: 'hai tenuto una lezione piena di gente' },
  // fascia 5 (livello 60-65)
  { id: 'ceo', tier: 5, emoji: '🏢', name: 'CEO', t: 'hai chiuso un accordo da milioni' },
  { id: 'astronauta', tier: 5, emoji: '🚀', name: 'Astronauta', t: 'hai completato una missione in orbita' },
  { id: 'regista', tier: 5, emoji: '🎬', name: 'Regista da Oscar', t: 'hai girato una scena da film premiato' },
  { id: 'rockstar', tier: 5, emoji: '🎸', name: 'Rockstar', t: 'hai riempito uno stadio' },
  { id: 'scienziato', tier: 5, emoji: '🔬', name: 'Scienziato', t: 'hai fatto una scoperta che cambia tutto' },
  { id: 'esports', tier: 5, emoji: '🏆', name: 'Campione eSport', t: 'hai vinto un torneo mondiale' },
];
export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
const poolOf = (tier) => JOBS.filter((j) => j.tier === tier);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export function init(u) {
  u.level ??= 1; u.xp ??= 0; u.job ??= null; u.pending ??= null; u.works ??= 0; u.lastWork ??= 0;
  return u;
}

const mul = (level) => 1 + (level - 1) * 0.12;
export function payRange(tier, level) {
  const [a, b] = BASE[tier];
  return [Math.floor(a * mul(level)), Math.floor(b * mul(level))];
}

function makeChoice(level) {
  const pool = poolOf(tierOf(level));
  let list = pool;
  if (level === 1) list = shuffle(pool).slice(0, 3);
  else if (level === 5) list = shuffle(pool).slice(0, 2);
  return { level, ids: list.map((j) => j.id) };
}

// se non hai un lavoro (e non sei nella fascia casuale) devi sceglierne uno
export function ensureChoice(u) {
  if (u.pending) return;
  if (!inRandomBracket(u.level) && !JOB_BY_ID[u.job]) u.pending = makeChoice(u.level);
}

export function jobLabel(u) {
  if (inRandomBracket(u.level)) return '🎲 Lavori casuali';
  const j = JOB_BY_ID[u.job];
  return j ? `${j.emoji} ${j.name}` : '— nessun lavoro (usa `.work`)';
}

// Esegue un turno di lavoro: soldi, XP, eventuale salita di livello
export function runShift(u, id) {
  init(u);
  const job = inRandomBracket(u.level) ? pick(poolOf(4)) : JOB_BY_ID[u.job];
  const [lo, hi] = payRange(job.tier, u.level);
  let pay = lo + Math.floor(Math.random() * (hi - lo + 1));
  const tip = Math.random() < 0.05;
  if (tip) pay *= 3;

  u.lastWork = Date.now();
  u.works += 1;

  const xp = 10 + Math.floor(Math.random() * 9) + Math.floor(u.level / 3);
  const ups = [];
  if (u.level < MAX_LEVEL) {
    u.xp += xp;
    while (u.level < MAX_LEVEL && u.xp >= xpNeeded(u.level)) {
      u.xp -= xpNeeded(u.level);
      u.level += 1;
      ups.push(u.level);
      if (CHOICE_LEVELS.has(u.level)) u.pending = makeChoice(u.level);
    }
    if (u.level >= MAX_LEVEL) u.xp = 0;
  }

  const total = eco.add(id, pay); // salva anche il resto
  return { job, pay, tip, xp, ups, total, random: inRandomBracket(u.level) };
}
