import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as eco from '../lib/eco.js';
import * as rpg from '../lib/rpg.js';

export const data = new SlashCommandBuilder()
  .setName('bal')
  .setDescription('Mostra il tuo portafoglio (o quello di un altro utente)')
  .addUserOption((o) => o.setName('utente').setDescription('Utente (opzionale)').setRequired(false));

async function bal(ctx, { text = '' } = {}) {
  const u = await eco.targetOf(ctx, text);
  const d = rpg.init(eco.user(u.id));
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: `Portafoglio di ${u.username}`, iconURL: u.displayAvatarURL({ extension: 'png' }) })
    .setDescription(`## ${eco.fmt(d.money)}`)
    .addFields(
      { name: '🏆 Posizione', value: `#${eco.rankOf(u.id)}`, inline: true },
      { name: '📈 Livello', value: `${d.level}${d.level >= rpg.MAX_LEVEL ? ' (MAX)' : ''}`, inline: true },
      { name: '💼 Lavoro', value: rpg.jobLabel(d), inline: true },
      { name: '🔥 Streak daily', value: `${d.streak} giorni`, inline: true },
      { name: '🎰 Casino', value: `Vinti ${eco.fmt(d.won || 0)}\nPersi ${eco.fmt(d.lost || 0)}`, inline: true },
    )
    .setFooter({ text: 'Zeno Bot • Economia' });
  return ctx.reply({ embeds: [embed] });
}

bal.command = /^(bal|wallet)$/i;
bal.help = ['bal'];
bal.tags = ['economy'];
bal.desc = 'Mostra il portafoglio';

export default bal;
