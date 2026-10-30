import { SlashCommandBuilder } from 'discord.js';
import { handleSetBg } from '../lib/setbg.js';

export const data = new SlashCommandBuilder()
  .setName('setsp')
  .setDescription('Personalizza lo sfondo della tua card /sp (immagine, GIF o video)')
  .addAttachmentOption((o) =>
    o.setName('immagine').setDescription('Immagine, GIF o video da usare come sfondo').setRequired(false))
  .addBooleanOption((o) =>
    o.setName('reset').setDescription('Torna allo sfondo automatico').setRequired(false));

async function setsp(ctx, { text = '' } = {}) {
  return handleSetBg(ctx, text, { keyPrefix: '', cmd: 'setsp' });
}

setsp.command = /^setsp$/i;
setsp.help = ['setsp'];
setsp.tags = ['utils', 'music'];
setsp.desc = 'Imposta un\'immagine, GIF o video come sfondo della card .sp';

export default setsp;
