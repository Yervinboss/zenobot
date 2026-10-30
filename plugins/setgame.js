import { SlashCommandBuilder } from 'discord.js';
import { handleSetBg } from '../lib/setbg.js';

export const data = new SlashCommandBuilder()
  .setName('setgame')
  .setDescription('Personalizza lo sfondo della tua card /game (immagine, GIF o video)')
  .addAttachmentOption((o) =>
    o.setName('immagine').setDescription('Immagine, GIF o video da usare come sfondo').setRequired(false))
  .addBooleanOption((o) =>
    o.setName('reset').setDescription('Torna allo sfondo automatico').setRequired(false));

async function setgame(ctx, { text = '' } = {}) {
  return handleSetBg(ctx, text, { keyPrefix: 'game-', cmd: 'setgame' });
}

setgame.command = /^setgame$/i;
setgame.help = ['setgame'];
setgame.tags = ['utils'];
setgame.desc = 'Imposta un\'immagine, GIF o video come sfondo della card .game';

export default setgame;
