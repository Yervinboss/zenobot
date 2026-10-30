import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  COLORS, box, say, fail, can, actor, isSlash, isOwner, pickUser, stripIds, parseDuration, store,
} from '../lib/ui.js';

const MAX_WARNS = 3;
const warnDb = store('warns.json');
const P = PermissionFlagsBits;

const userOpt = (req = true) => (o) => o.setName('utente').setDescription('Utente').setRequired(req);
const motivo = (o) => o.setName('motivo').setDescription('Motivo');

export const datas = [
  new SlashCommandBuilder().setName('ban').setDescription('Banna un utente').setDefaultMemberPermissions(P.BanMembers)
    .addUserOption(userOpt()).addStringOption(motivo),
  new SlashCommandBuilder().setName('unban').setDescription('Rimuove il ban a un utente').setDefaultMemberPermissions(P.BanMembers)
    .addUserOption(userOpt()),
  new SlashCommandBuilder().setName('warn').setDescription('Avvisa un utente (3 warn = timeout di 1 ora)').setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(userOpt()).addStringOption(motivo),
  new SlashCommandBuilder().setName('warns').setDescription('Mostra i warn di un utente').addUserOption(userOpt(false)),
  new SlashCommandBuilder().setName('unwarn').setDescription('Toglie l\'ultimo warn (o tutti)').setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(userOpt()).addBooleanOption((o) => o.setName('tutti').setDescription('Cancella tutti i warn')),
  new SlashCommandBuilder().setName('slowmode').setDescription('Imposta la modalità lenta del canale').setDefaultMemberPermissions(P.ManageChannels)
    .addStringOption((o) => o.setName('durata').setDescription('Es: 10s, 5m oppure off').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Blocca il canale (nessuno può scrivere)').setDefaultMemberPermissions(P.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('Sblocca il canale').setDefaultMemberPermissions(P.ManageChannels),
];

// Ritorna un messaggio d'errore se l'utente non va colpito
async function protect(ctx, target) {
  const g = ctx.guild;
  const me = actor(ctx);
  if (target.id === g.ownerId) return 'Non puoi colpire il **proprietario del server**.';
  if (isOwner(target.id)) return 'Non puoi colpire il **creatore del bot**.';
  if (target.id === g.client.user.id) return 'Non posso farlo a me stesso 🤖';
  if (target.id === me.id) return 'Non puoi farlo a te stesso.';
  const tm = await g.members.fetch(target.id).catch(() => null);
  const mm = await g.members.fetch(me.id).catch(() => null);
  if (tm && mm && !isOwner(me.id) && me.id !== g.ownerId && tm.roles.highest.position >= mm.roles.highest.position) {
    return 'Il suo ruolo è uguale o superiore al tuo.';
  }
  return null;
}

const reasonOf = (ctx, text) => (isSlash(ctx) ? ctx.options.getString('motivo') : stripIds(text)) || 'Nessun motivo';
const needUser = (ctx, cmd) => fail(ctx, `Menziona un utente o rispondi a un suo messaggio.\n\`.${cmd} @utente\``);
const bar = (n) => '🟥'.repeat(Math.min(n, MAX_WARNS)) + '⬜'.repeat(Math.max(0, MAX_WARNS - n));

async function ban(ctx, text) {
  if (!(await can(ctx, P.BanMembers))) return fail(ctx, 'Ti serve il permesso **Banna membri**.');
  const target = await pickUser(ctx, text);
  if (!target) return needUser(ctx, 'ban');
  const err = await protect(ctx, target);
  if (err) return fail(ctx, err);
  const reason = reasonOf(ctx, text);
  const member = await ctx.guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) return fail(ctx, 'Non posso bannare questo utente (ruolo troppo alto).');
  await target.send({ embeds: [box(COLORS.err, `🔨 Sei stato bannato da ${ctx.guild.name}`, `Motivo: ${reason}`)] }).catch(() => {});
  try {
    await ctx.guild.members.ban(target.id, { reason: `${reason} | Mod: ${actor(ctx).tag}` });
  } catch (e) {
    return fail(ctx, 'Ban non riuscito (permessi insufficienti?).');
  }
  return say(ctx, {
    embeds: [box(COLORS.err, '🔨 Utente bannato', `${target} (\`${target.id}\`)\n📝 ${reason}\n👮 ${actor(ctx)}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))],
  });
}

async function unban(ctx, text) {
  if (!(await can(ctx, P.BanMembers))) return fail(ctx, 'Ti serve il permesso **Banna membri**.');
  const target = await pickUser(ctx, text);
  if (!target) return fail(ctx, 'Scrivi l\'ID o menziona l\'utente.\n`.unban 123456789012345678`');
  try {
    await ctx.guild.members.unban(target.id, `Unban da ${actor(ctx).tag}`);
  } catch (e) {
    return fail(ctx, 'Questo utente non risulta bannato.');
  }
  return say(ctx, { embeds: [box(COLORS.ok, '✅ Ban rimosso', `**${target.tag}** può rientrare nel server.\n👮 ${actor(ctx)}`)] });
}

async function warn(ctx, text) {
  if (!(await can(ctx, P.ModerateMembers))) return fail(ctx, 'Ti serve il permesso **Modera membri**.');
  const target = await pickUser(ctx, text);
  if (!target) return needUser(ctx, 'warn');
  if (target.bot) return fail(ctx, 'Non puoi avvisare un bot.');
  const err = await protect(ctx, target);
  if (err) return fail(ctx, err);

  const reason = reasonOf(ctx, text);
  const db = warnDb.read();
  db[ctx.guild.id] ||= {};
  db[ctx.guild.id][target.id] ||= [];
  const list = db[ctx.guild.id][target.id];
  list.push({ reason, by: actor(ctx).id, ts: Date.now() });
  warnDb.write(db);

  const n = list.length;
  let extra = '';
  if (n >= MAX_WARNS) {
    const m = await ctx.guild.members.fetch(target.id).catch(() => null);
    if (m?.moderatable) {
      await m.timeout(3_600_000, `${MAX_WARNS} warn raggiunti`).then(() => {
        extra = `\n\n🔇 **${MAX_WARNS} warn raggiunti → timeout automatico di 1 ora.**`;
      }).catch(() => {});
    }
  }
  target.send({ embeds: [box(COLORS.warn, `⚠️ Warn in ${ctx.guild.name}`, `Motivo: ${reason}\nWarn totali: ${n}/${MAX_WARNS}`)] }).catch(() => {});
  return say(ctx, {
    embeds: [box(COLORS.warn, '⚠️ Utente avvisato', `${target}\n${bar(n)} **${n}/${MAX_WARNS}**\n📝 ${reason}\n👮 ${actor(ctx)}${extra}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))],
  });
}

async function warns(ctx, text) {
  const target = (await pickUser(ctx, text)) || actor(ctx);
  const list = warnDb.read()[ctx.guild.id]?.[target.id] || [];
  if (!list.length) return say(ctx, { embeds: [box(COLORS.ok, '✅ Fedina pulita', `**${target.displayName}** non ha nessun warn.`)] });
  const shown = list.slice(-10);
  const off = list.length - shown.length;
  const body = shown.map((w, i) => `**${off + i + 1}.** ${w.reason}\n└ <t:${Math.floor(w.ts / 1000)}:R> • <@${w.by}>`).join('\n\n');
  return say(ctx, { embeds: [box(COLORS.warn, `⚠️ Warn di ${target.displayName}`, `${bar(list.length)} **${list.length}/${MAX_WARNS}**\n\n${body}`)] });
}

async function unwarn(ctx, text) {
  if (!(await can(ctx, P.ModerateMembers))) return fail(ctx, 'Ti serve il permesso **Modera membri**.');
  const target = await pickUser(ctx, text);
  if (!target) return needUser(ctx, 'unwarn');
  const all = isSlash(ctx) ? ctx.options.getBoolean('tutti') : /\b(all|tutti)\b/i.test(text);
  const db = warnDb.read();
  const list = db[ctx.guild.id]?.[target.id] || [];
  if (!list.length) return fail(ctx, 'Questo utente non ha warn.');
  if (all) list.length = 0; else list.pop();
  warnDb.write(db);
  return say(ctx, { embeds: [box(COLORS.ok, '✅ Warn rimosso', `${target} ora ha **${list.length}/${MAX_WARNS}** warn.`)] });
}

async function slowmode(ctx, text) {
  if (!(await can(ctx, P.ManageChannels))) return fail(ctx, 'Ti serve il permesso **Gestisci canali**.');
  const raw = (isSlash(ctx) ? ctx.options.getString('durata') : text).trim().toLowerCase();
  if (!raw) return fail(ctx, 'Es: `.slowmode 10s`, `.slowmode 2m` oppure `.slowmode off`');
  const off = ['off', '0', 'stop'].includes(raw);
  const secs = off ? 0 : Math.round((parseDuration(/^\d+$/.test(raw) ? `${raw}s` : raw) || 0) / 1000);
  if (!off && !secs) return fail(ctx, 'Durata non valida. Es: `10s`, `5m`.');
  if (secs > 21600) return fail(ctx, 'Il massimo è **6 ore**.');
  try {
    await ctx.channel.setRateLimitPerUser(secs, `Slowmode da ${actor(ctx).tag}`);
  } catch (e) {
    return fail(ctx, 'Non riesco a cambiare la modalità lenta qui.');
  }
  return say(ctx, { embeds: [box(secs ? COLORS.warn : COLORS.ok, secs ? '🐢 Modalità lenta attiva' : '🚀 Modalità lenta disattivata', secs ? `Un messaggio ogni **${secs}s**.` : 'Si può scrivere liberamente.')] });
}

async function lock(ctx, text, cmd) {
  if (!(await can(ctx, P.ManageChannels))) return fail(ctx, 'Ti serve il permesso **Gestisci canali**.');
  if (!ctx.channel?.permissionOverwrites) return fail(ctx, 'Non posso bloccare questo canale.');
  const locking = cmd === 'lock';
  try {
    await ctx.channel.permissionOverwrites.edit(ctx.guild.members.me, { SendMessages: true, ViewChannel: true, EmbedLinks: true }, { reason: 'lock' });
    await ctx.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: locking ? false : null }, { reason: `${cmd} da ${actor(ctx).tag}` });
  } catch (e) {
    return fail(ctx, 'Non ho i permessi per modificare questo canale.');
  }
  return say(ctx, { embeds: [box(locking ? COLORS.err : COLORS.ok, locking ? '🔒 Canale bloccato' : '🔓 Canale sbloccato', locking ? 'Solo lo staff può scrivere.' : 'Tutti possono scrivere di nuovo.')] });
}

const FN = { ban, unban, warn, warns, unwarn, slowmode, lock, unlock: lock };

async function moderazione(ctx, { text = '', command = '' } = {}) {
  if (!ctx.guild) return fail(ctx, 'Questo comando funziona solo nei server.');
  const cmd = command.toLowerCase();
  return FN[cmd]?.(ctx, text, cmd);
}

moderazione.command = /^(ban|unban|warn|warns|unwarn|slowmode|lock|unlock)$/i;
moderazione.help = ['ban', 'unban', 'warn', 'warns', 'unwarn', 'slowmode', 'lock', 'unlock'];
moderazione.tags = ['admin'];
moderazione.desc = 'Moderazione avanzata';
export default moderazione;
