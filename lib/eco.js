import fs from 'node:fs';
import path from 'node:path';
import { MessageFlags } from 'discord.js';

const FILE = path.join(process.cwd(), 'data', 'eco.json');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

export const START_MONEY = 1000;
export const CURRENCY = '💶';

const db = global.__ecoDb ?? (global.__ecoDb = (() => {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: {} }; }
})());
db.users ??= {};

function flush() {
  try {
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (e) { console.error('[eco] salvataggio fallito:', e.message); }
}
let timer = null;
function save() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 500);
}
if (!global.__ecoExit) {
  global.__ecoExit = true;
  process.on('exit', flush);
}

export function user(id) {
  if (!db.users[id]) {
    db.users[id] = { money: START_MONEY, lastDaily: 0, lastWork: 0, streak: 0, won: 0, lost: 0 };
  }
  return db.users[id];
}
export const balance = (id) => user(id).money;

export function add(id, n) {
  const u = user(id);
  u.money = Math.max(0, Math.floor(u.money + n));
  save();
  return u.money;
}
export function take(id, n) {
  const u = user(id);
  if (!Number.isFinite(n) || n <= 0 || u.money < n) return false;
  u.money -= n;
  save();
  return true;
}
export function stat(id, key, n = 1) {
  const u = user(id);
  u[key] = (u[key] || 0) + n;
  save();
}
export function touch() { save(); }

export const top = (n = 10) => Object.entries(db.users)
  .sort((a, b) => b[1].money - a[1].money).slice(0, n).map(([id, u]) => ({ id, ...u }));
export const rankOf = (id) => Object.values(db.users).filter((u) => u.money > user(id).money).length + 1;

export const fmt = (n) => `${CURRENCY} ${Math.floor(n).toLocaleString('it-IT')}`;
export const cooldownLeft = (last, ms) => Math.max(0, last + ms - Date.now());
export function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export const isSlash = (ctx) => typeof ctx.isChatInputCommand === 'function';

export function say(ctx, content, hidden = false) {
  return ctx.reply(hidden && isSlash(ctx) ? { content, flags: MessageFlags.Ephemeral } : { content });
}

// utente "bersaglio": menzione/opzione, altrimenti chi scrive
export async function targetOf(ctx, text = '') {
  if (isSlash(ctx)) return ctx.options.getUser('utente') ?? ctx.user;
  const m = text.match(/<@!?(\d+)>/);
  if (m) {
    const u = await ctx.client.users.fetch(m[1]).catch(() => null);
    if (u) return u;
  }
  return ctx.author;
}
