import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as eco from '../lib/eco.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Ritira il bonus giornaliero');

const DAY = 24 * 60 * 60 * 1000;

async function daily(ctx) {
  const id = eco.isSlash(ctx) ? ctx.user.id : ctx.author.id;
  const u = eco.user(id);

  const left = eco.cooldownLeft(u.lastDaily, DAY);
  if (left) return eco.say(ctx, `⏳ Hai già ritirato il bonus di oggi. Torna tra **${eco.fmtTime(left)}**.`, true);

  if (Date.now() - u.lastDaily > 2 * DAY) u.streak = 0; // streak persa
  u.streak += 1;
  u.lastDaily = Date.now();

  const bonus = Math.min(u.streak - 1, 10) * 100;
  const reward = 500 + bonus;
  const total = eco.add(id, reward);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎁 Bonus giornaliero')
    .setDescription(
      `Hai ricevuto **${eco.fmt(reward)}**!\n`
      + `🔥 Streak: **${u.streak}** ${u.streak === 1 ? 'giorno' : 'giorni'}${bonus ? ` (bonus +${eco.fmt(bonus)})` : ''}\n`
      + `💰 Saldo: **${eco.fmt(total)}**`,
    )
    .setFooter({ text: 'Torna domani per aumentare la streak (bonus fino a +1.000)' });
  return ctx.reply({ embeds: [embed] });
}

daily.command = /^daily$/i;
daily.help = ['daily'];
daily.tags = ['economy'];
daily.desc = 'Bonus giornaliero con streak';

export default daily;
