import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
} from 'discord.js';
import {
  COLORS, box, say, fail, actor, isSlash, pickUser, parseDuration, fmtDur, store,
} from '../lib/ui.js';

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const remDb = store('reminders.json');
const ts = (ms) => Math.floor(ms / 1000);

export const datas = [
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra l\'avatar in grande')
    .addUserOption((o) => o.setName('utente').setDescription('Di chi?')),
  new SlashCommandBuilder().setName('userinfo').setDescription('Scheda di un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Di chi?')),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Scheda del server'),
  new SlashCommandBuilder().setName('sondaggio').setDescription('Crea un sondaggio con reazioni')
    .addStringOption((o) => o.setName('domanda').setDescription('Domanda | opzione 1 | opzione 2 … (senza opzioni: ✅/❌)').setRequired(true)),
  new SlashCommandBuilder().setName('ricorda').setDescription('Ti ricordo qualcosa tra un po\'')
    .addStringOption((o) => o.setName('quando').setDescription('Es: 10m, 2h, 1d').setRequired(true))
    .addStringOption((o) => o.setName('testo').setDescription('Cosa devo ricordarti?').setRequired(true)),
];

// Controllo promemoria ogni 15s (ripartito pulito a ogni reload)
clearInterval(global.zenoRemTimer);
global.zenoRemTimer = setInterval(async () => {
  const client = global.zenoConn;
  if (!client?.isReady()) return;
  const list = remDb.read().list || [];
  const now = Date.now();
  const due = list.filter((r) => r.at <= now);
  if (!due.length) return;
  remDb.write({ list: list.filter((r) => r.at > now) });
  for (const r of due) {
    const msg = { content: `<@${r.user}>`, embeds: [box(COLORS.warn, '⏰ Promemoria!', r.text)] };
    const dm = async () => (await client.users.fetch(r.user).catch(() => null))?.send(msg).catch(() => {});
    const ch = await client.channels.fetch(r.channel).catch(() => null);
    if (ch?.send) await ch.send(msg).catch(dm); else await dm();
  }
}, 15_000);
global.zenoRemTimer.unref?.();

async function avatar(ctx, text) {
  const t = (await pickUser(ctx, text)) || actor(ctx);
  const url = (ext) => t.displayAvatarURL({ extension: ext, size: 1024 });
  const row = new ActionRowBuilder().addComponents(
    ...['png', 'webp', 'jpg'].map((x) => new ButtonBuilder().setLabel(x.toUpperCase()).setStyle(ButtonStyle.Link).setURL(url(x))),
  );
  return say(ctx, { embeds: [box(COLORS.main, `🖼️ Avatar di ${t.displayName}`).setImage(url('png'))], components: [row] });
}

async function userinfo(ctx, text) {
  const base = (await pickUser(ctx, text)) || actor(ctx);
  const user = await base.fetch(true).catch(() => base);
  const member = ctx.guild ? await ctx.guild.members.fetch(user.id).catch(() => null) : null;
  const e = box(user.accentColor || COLORS.main, `👤 ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
      { name: '🤖 Bot', value: user.bot ? 'Sì' : 'No', inline: true },
      { name: '📅 Account creato', value: `<t:${ts(user.createdTimestamp)}:D> (<t:${ts(user.createdTimestamp)}:R>)` },
    );
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position).first(8).map((r) => r.toString()).join(' ');
    e.addFields({ name: '📥 Entrato nel server', value: `<t:${ts(member.joinedTimestamp)}:R>`, inline: true });
    if (member.nickname) e.addFields({ name: '🏷️ Nickname', value: member.nickname, inline: true });
    if (roles) e.addFields({ name: '🎭 Ruoli', value: roles });
  }
  const banner = user.bannerURL({ size: 1024 });
  if (banner) e.setImage(banner);
  return say(ctx, { embeds: [e] });
}

async function serverinfo(ctx) {
  const g = ctx.guild;
  if (!g) return fail(ctx, 'Funziona solo nei server.');
  const ch = g.channels.cache;
  const e = box(COLORS.info, `🏰 ${g.name}`)
    .setThumbnail(g.iconURL({ size: 256 }))
    .addFields(
      { name: '👑 Owner', value: `<@${g.ownerId}>`, inline: true },
      { name: '👥 Membri', value: `${g.memberCount}`, inline: true },
      { name: '📅 Creato', value: `<t:${ts(g.createdTimestamp)}:R>`, inline: true },
      { name: '💬 Canali', value: `${ch.filter((c) => c.type === ChannelType.GuildText).size} testo • ${ch.filter((c) => c.type === ChannelType.GuildVoice).size} vocali`, inline: true },
      { name: '🎭 Ruoli', value: `${g.roles.cache.size}`, inline: true },
      { name: '💎 Boost', value: `Lv.${g.premiumTier} • ${g.premiumSubscriptionCount || 0}`, inline: true },
    );
  const banner = g.bannerURL({ size: 1024 });
  if (banner) e.setImage(banner);
  return say(ctx, { embeds: [e] });
}

async function sondaggio(ctx, text) {
  const raw = isSlash(ctx) ? ctx.options.getString('domanda') : text;
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const q = parts.shift();
  if (!q) return fail(ctx, 'Es: `.sondaggio Pizza o sushi? | Pizza | Sushi`');
  const opts = parts.slice(0, 9);
  const multi = opts.length >= 2;
  const emojis = multi ? NUM.slice(0, opts.length) : ['✅', '❌'];
  const u = actor(ctx);
  const e = box(COLORS.info, `📊 ${q}`, multi ? opts.map((o, i) => `${NUM[i]} ${o}`).join('\n') : 'Vota con ✅ o ❌')
    .setAuthor({ name: `Sondaggio di ${u.displayName}`, iconURL: u.displayAvatarURL() });
  const msg = await say(ctx, { embeds: [e] });
  for (const em of emojis) await msg?.react(em).catch(() => {});
  return msg;
}

async function ricorda(ctx, text) {
  const raw = isSlash(ctx) ? `${ctx.options.getString('quando')} ${ctx.options.getString('testo')}` : text.trim();
  const m = raw.match(/^(\d+\s*[smhd]?)\s+(.+)$/is);
  if (!m) return fail(ctx, 'Es: `.ricorda 10m comprare il pane`');
  const ms = parseDuration(m[1]);
  if (!ms || ms < 5000 || ms > 30 * 864e5) return fail(ctx, 'Scegli un tempo tra **5 secondi** e **30 giorni**.');
  const d = remDb.read();
  const list = d.list || [];
  const user = actor(ctx).id;
  if (list.filter((r) => r.user === user).length >= 20) return fail(ctx, 'Hai già 20 promemoria attivi!');
  list.push({ user, channel: ctx.channel?.id, text: m[2].slice(0, 500), at: Date.now() + ms });
  remDb.write({ list });
  return say(ctx, { embeds: [box(COLORS.ok, '⏰ Promemoria impostato', `Tra **${fmtDur(ms)}** (<t:${ts(Date.now() + ms)}:R>) ti ricordo:\n> ${m[2].slice(0, 200)}`)] });
}

const FN = {
  avatar, pfp: avatar, userinfo, serverinfo, sondaggio, poll: sondaggio, ricorda, remind: ricorda,
};

async function utility(ctx, { text = '', command = '' } = {}) {
  return FN[command.toLowerCase()]?.(ctx, text);
}

utility.command = /^(avatar|pfp|userinfo|serverinfo|sondaggio|poll|ricorda|remind)$/i;
utility.help = ['avatar', 'userinfo', 'serverinfo', 'sondaggio', 'ricorda'];
utility.tags = ['utility'];
utility.desc = 'Strumenti utili';
export default utility;
