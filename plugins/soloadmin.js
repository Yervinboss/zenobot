import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  solo, say, fail, box, can, isSlash, COLORS,
} from '../lib/ui.js';

export const data = new SlashCommandBuilder()
  .setName('soloadmin')
  .setDescription('Il bot risponde solo agli admin (on/off)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) => o.setName('stato').setDescription('on oppure off')
    .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }));

async function soloadmin(ctx, { text = '', command = 'soloadmin' } = {}) {
  if (!ctx.guild) return fail(ctx, 'Funziona solo nei server.');
  if (!(await can(ctx, PermissionFlagsBits.Administrator))) return fail(ctx, 'Solo gli **admin** possono usarlo.');

  const suffix = command.toLowerCase().replace('soloadmin', '');
  const arg = suffix || (isSlash(ctx) ? ctx.options.getString('stato') : text.trim().toLowerCase());

  if (arg !== 'on' && arg !== 'off') {
    const now = solo.has(ctx.guild.id);
    return say(ctx, { embeds: [box(COLORS.info, '🛡️ Solo Admin', `Stato attuale: **${now ? 'ATTIVO 🔒' : 'SPENTO 🔓'}**\nUsa \`.soloadmin on\` oppure \`.soloadmin off\``)] });
  }
  solo.set(ctx.guild.id, arg === 'on');
  return say(ctx, {
    embeds: [box(arg === 'on' ? COLORS.warn : COLORS.ok,
      arg === 'on' ? '🔒 Solo Admin ATTIVO' : '🔓 Solo Admin SPENTO',
      arg === 'on' ? 'Da ora il bot risponde **solo agli admin** del server.' : 'Il bot torna a rispondere a **tutti**.')],
  });
}

soloadmin.command = /^soloadmin(on|off)?$/i;
soloadmin.help = ['soloadmin'];
soloadmin.tags = ['admin'];
soloadmin.desc = 'Il bot risponde solo agli admin';
export default soloadmin;
