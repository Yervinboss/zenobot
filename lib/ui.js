import fs from 'fs';
import path from 'path';
import { EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';

export const COLORS = { main: 0x8b5cf6, ok: 0x22c55e, err: 0xef4444, warn: 0xf59e0b, info: 0x38bdf8, pink: 0xf472b6, gold: 0xfacc15 };
export const isSlash = (c) => typeof c.isChatInputCommand === 'function';
export const actor = (c) => (isSlash(c) ? c.user : c.author);
export const isOwner = (id) => id === process.env.OWNER_ID;
export const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function box(color, title, desc) {
  const e = new EmbedBuilder().setColor(color).setFooter({ text: '⚡ ZENO BOT' }).setTimestamp();
  if (title) e.setTitle(title);
  if (desc) e.setDescription(desc);
  return e;
}

// Risponde allo stesso modo a /comando e .comando
export async function say(ctx, payload, ephemeral = false) {
  const p = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (isSlash(ctx)) {
    if (ctx.deferred) return ctx.editReply(p);
    if (ctx.replied) return ctx.followUp(p);
    if (ephemeral) p.flags = MessageFlags.Ephemeral;
    await ctx.reply(p);
    return ctx.fetchReply().catch(() => null);
  }
  p.allowedMentions = { repliedUser: false, ...(p.allowedMentions || {}) };
  return ctx.reply(p).catch(() => ctx.channel.send(p));
}

export const fail = (ctx, msg) => say(ctx, { embeds: [box(COLORS.err, '❌ Ops', msg)] }, true);

// Owner del bot, admin o permesso specifico
export async function can(ctx, flag) {
  const u = actor(ctx);
  if (isOwner(u.id)) return true;
  if (!ctx.guild) return false;
  const m = ctx.member || await ctx.guild.members.fetch(u.id).catch(() => null);
  return !!m && (m.permissions.has(PermissionFlagsBits.Administrator) || m.permissions.has(flag));
}

// Utente da: opzione slash, menzione, ID o messaggio a cui si risponde
export async function pickUser(ctx, text = '', opt = 'utente') {
  if (isSlash(ctx)) return ctx.options.getUser(opt);
  const id = text.match(/<@!?(\d+)>/)?.[1] || text.match(/\b(\d{17,20})\b/)?.[1];
  if (id) return ctx.client.users.fetch(id).catch(() => null);
  if (ctx.reference?.messageId) return (await ctx.fetchReference().catch(() => null))?.author || null;
  return null;
}
export const stripIds = (t = '') => t.replace(/<@!?\d+>|\b\d{17,20}\b/g, '').trim();

const UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
export function parseDuration(str) {
  const m = String(str || '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)?/);
  return m ? parseInt(m[1], 10) * UNITS[m[2] || 'm'] : null;
}
export function fmtDur(ms) {
  if (ms < 6e4) return `${Math.round(ms / 1e3)} sec`;
  if (ms < 36e5) return `${Math.round(ms / 6e4)} min`;
  if (ms < 864e5) return `${Math.round(ms / 36e5)} ore`;
  return `${Math.round(ms / 864e5)} giorni`;
}

// Mini database JSON in database/<file>
export function store(file) {
  const p = path.resolve('database', file);
  return {
    read() { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } },
    write(d) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (global.saveJsonAtomic) global.saveJsonAtomic(p, d);
      else fs.writeFileSync(p, JSON.stringify(d, null, 2));
    },
  };
}

// Stato "solo admin" condiviso (resiste al reload dei plugin)
const soloDb = store('soloadmin.json');
const soloData = soloDb.read();
const soloSet = new Set(Object.keys(soloData).filter((k) => soloData[k]));
export const solo = {
  has: (g) => soloSet.has(g),
  set(g, on) {
    if (on) soloSet.add(g); else soloSet.delete(g);
    soloDb.write(Object.fromEntries([...soloSet].map((k) => [k, true])));
  },
};
