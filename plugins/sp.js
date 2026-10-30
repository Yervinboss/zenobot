import {
  SlashCommandBuilder, EmbedBuilder, ActivityType, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { hasBg } from '../lib/spcard.js';
import { hasAnim } from '../lib/spanim.js';
import { makeCard } from '../lib/spmake.js';

export const data = new SlashCommandBuilder()
  .setName('sp')
  .setDescription('Mostra la card del brano Spotify in ascolto')
  .addUserOption((o) =>
    o.setName('utente').setDescription('Utente di cui vuoi vedere la canzone (opzionale)').setRequired(false));

const likes = new Map(); // messageId -> Set(userId)

const bar = (p) => {
  const n = 14, f = Math.round(p * n);
  return '▰'.repeat(f) + '▱'.repeat(n - f);
};
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function buildRow(count, url) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sp:like')
      .setLabel(String(count))
      .setStyle(count ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('⭐'),
  );
  if (url) {
    row.addComponents(
      new ButtonBuilder().setLabel('Apri su Spotify').setStyle(ButtonStyle.Link).setURL(url),
    );
  }
  return row;
}

async function sp(ctx, { text = '' } = {}) {
  const isSlash = typeof ctx.isChatInputCommand === 'function';
  const guild = ctx.guild;
  if (!guild) return ctx.reply('❌ Questo comando funziona solo nei server.');

  let targetUser = isSlash ? ctx.options.getUser('utente') : null;
  if (!targetUser && !isSlash) {
    const m = text.match(/<@!?(\d+)>/);
    if (m) targetUser = await guild.client.users.fetch(m[1]).catch(() => null);
  }

  const memberId = targetUser ? targetUser.id : (isSlash ? ctx.user.id : ctx.author.id);
  const member = await guild.members.fetch({ user: memberId, force: true }).catch(() => null);
  if (!member) return ctx.reply({ content: '❌ Utente non trovato.', ephemeral: true });

  const act = (member.presence?.activities || []).find(
    (a) => a.type === ActivityType.Listening && (a.name === 'Spotify' || a.details),
  );
  if (!act) {
    return ctx.reply({
      content: `⚠ **${member.user.username}** non sta ascoltando Spotify in questo momento (o la presenza non è pubblica).`,
      ephemeral: true,
    });
  }

  if (isSlash) await ctx.deferReply();
  else ctx.channel.sendTyping().catch(() => {});

  const title = act.details || 'Brano sconosciuto';
  const artist = act.state || 'Artista sconosciuto';
  const album = act.assets?.largeText || 'Album sconosciuto';

  let coverUrl = null;
  if (act.assets?.largeImage) {
    const id = act.assets.largeImage.replace('spotify:', '');
    coverUrl = `https://i.scdn.co/image/${id}`;
  }
  const trackUrl = act.syncId ? `https://open.spotify.com/track/${act.syncId}` : null;

  const start = act.timestamps?.start ? new Date(act.timestamps.start).getTime() : null;
  const end = act.timestamps?.end ? new Date(act.timestamps.end).getTime() : null;
  const total = start && end ? end - start : 0;
  const elapsed = total ? Math.min(total, Math.max(0, Date.now() - start)) : 0;

  const userName = member.displayName || member.user.username;
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });

  const card = await makeCard({
    title, artist, album, coverUrl, bgUserId: member.id, elapsed, total, userName, avatarUrl,
  }).catch(() => null);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${userName} sta ascoltando`, iconURL: avatarUrl })
    .setFooter({
      text: (hasBg(member.id) || hasAnim(member.id)) ? 'Zeno Music ✦ Zeno Bot' : 'Zeno Music ✦ personalizza la card con /setsp',
      iconURL: guild.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  const files = [];
  if (card) {
    embed.setColor(card.color).setImage('attachment://sp-card.' + card.ext);
    files.push(new AttachmentBuilder(card.buffer, { name: 'sp-card.' + card.ext }));
  } else {
    embed.setColor(0x1db954).setTitle(title).setThumbnail(coverUrl);
    if (trackUrl) embed.setURL(trackUrl);
    embed.addFields(
      { name: '🎤 Artista', value: artist, inline: true },
      { name: '💿 Album', value: album, inline: true },
    );
    if (total) {
      embed.addFields({
        name: '⏱ Progresso',
        value: `\`${mmss(elapsed)}\` ${bar(elapsed / total)} \`${mmss(total)}\``,
      });
    }
  }

  const payload = { embeds: card ? [] : [embed], components: [buildRow(0, trackUrl)], files };
  if (isSlash) await ctx.editReply(payload);
  else await ctx.channel.send(payload);
}

sp.command = /^sp$/i;
sp.help = ['sp'];
sp.tags = ['utils', 'music'];
sp.desc = 'Mostra la card del brano Spotify in ascolto';

export default sp;

// ───────────── Pulsante stellina (una per utente, richiicca per toglierla) ─────────────
export const prefix = 'sp';
export async function onComponent(i) {
  if (i.customId !== 'sp:like') return;
  const set = likes.get(i.message.id) ?? new Set();
  if (set.has(i.user.id)) set.delete(i.user.id); else set.add(i.user.id);
  likes.set(i.message.id, set);
  if (likes.size > 500) likes.delete(likes.keys().next().value);
  const url = i.message.components?.[0]?.components?.find((c) => c.url)?.url;
  await i.update({ components: [buildRow(set.size, url)] });
}
