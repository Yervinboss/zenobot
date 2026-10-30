import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as eco from '../lib/eco.js';

export const data = new SlashCommandBuilder()
  .setName('ricchi')
  .setDescription('Classifica dei più ricchi');

async function ricchi(ctx) {
  const slash = eco.isSlash(ctx);
  if (slash) await ctx.deferReply();

  const medals = ['🥇', '🥈', '🥉'];
  const lines = [];
  for (const [i, e] of eco.top(10).entries()) {
    const m = await ctx.guild?.members.fetch({ user: e.id }).catch(() => null);
    const name = m?.displayName
      ?? (await ctx.client.users.fetch(e.id).catch(() => null))?.username
      ?? 'Utente sconosciuto';
    lines.push(`${medals[i] ?? `**${i + 1}.**`} ${name} — ${eco.fmt(e.money)}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 Classifica dei più ricchi')
    .setDescription(lines.join('\n') || 'Ancora nessuno in classifica.')
    .setFooter({ text: 'Zeno Bot • Economia' });
  const payload = { embeds: [embed] };
  return slash ? ctx.editReply(payload) : ctx.reply(payload);
}

ricchi.command = /^(ricchi|classifica|richest)$/i;
ricchi.help = ['ricchi'];
ricchi.tags = ['economy'];
ricchi.desc = 'Classifica dei più ricchi del server';

export default ricchi;
