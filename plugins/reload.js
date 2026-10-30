import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Ricarica i plugin senza riavviare (solo owner)');

export default async function reload(i) {
  if (i.user.id !== process.env.OWNER_ID) {
    return i.reply({ content: '⛔ Solo owner.', flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await globalThis.zeno.reload();
  await i.editReply('🟢 Plugin ricaricati!');
}
