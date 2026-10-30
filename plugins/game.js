import {
  SlashCommandBuilder, EmbedBuilder, ActivityType, AttachmentBuilder,
} from 'discord.js';
import { makeCard } from '../lib/spmake.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Mostra a cosa stai giocando')
  .addUserOption((o) =>
    o.setName('utente').setDescription('Utente di cui vuoi vedere il gioco (opzionale)').setRequired(false));

function since(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'appena iniziato';
  const h = Math.floor(m / 60);
  return h ? `gioca da ${h}h ${m % 60}m` : `gioca da ${m}m`;
}

async function game(ctx, { text = '' } = {}) {
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

  const act = (member.presence?.activities || []).find((a) => a.type === ActivityType.Playing);
  if (!act) {
    return ctx.reply({
      content: `🎮 **${member.displayName}** non sta giocando a niente in questo momento (o l'attività non è visibile).`,
      ephemeral: true,
    });
  }

  if (isSlash) await ctx.deferReply();
  else ctx.channel.sendTyping().catch(() => {});

  const userName = member.displayName || member.user.username;
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });

  let coverUrl = null;
  try { coverUrl = act.assets?.largeImageURL({ size: 512, extension: 'png' }) || null; } catch { /* ignora */ }
  if (!coverUrl) coverUrl = avatarUrl;

  const start = act.timestamps?.start ? new Date(act.timestamps.start).getTime() : null;
  const elapsedText = start ? since(Date.now() - start) : '';

  const title = act.name || 'Gioco sconosciuto';
  const details = act.details || 'In gioco';
  const album = [act.state, elapsedText].filter(Boolean).join(' · ') || ' ';

  const card = await makeCard({
    badge: 'STA GIOCANDO A',
    title, artist: details, album, coverUrl,
    bgUserId: 'game-' + member.id, elapsed: 0, total: 0, userName, avatarUrl,
  }).catch(() => null);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${userName} sta giocando`, iconURL: avatarUrl })
    .setFooter({ text: 'Zeno Games ✦ Zeno Bot', iconURL: guild.client.user.displayAvatarURL() })
    .setTimestamp();

  const files = [];
  if (card) {
    embed.setColor(card.color).setImage('attachment://game-card.' + card.ext);
    files.push(new AttachmentBuilder(card.buffer, { name: 'game-card.' + card.ext }));
  } else {
    embed.setColor(0x5865f2).setTitle(`🎮 ${title}`).setThumbnail(coverUrl);
    if (act.details) embed.addFields({ name: 'Dettagli', value: act.details, inline: true });
    if (act.state) embed.addFields({ name: 'Stato', value: act.state, inline: true });
    if (elapsedText) embed.addFields({ name: '⏱ Tempo', value: elapsedText });
  }

  const payload = { embeds: card ? [] : [embed], files };
  if (isSlash) await ctx.editReply(payload);
  else await ctx.channel.send(payload);
}

game.command = /^(game|gioco)$/i;
game.help = ['game'];
game.tags = ['utils'];
game.desc = 'Mostra la card del gioco a cui stai giocando';

export default game;
