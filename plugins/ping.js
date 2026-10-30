import os from 'os';
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const toMathematicalAlphanumericSymbols = (number) => {
  const map = {
    '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒',
    '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗', '.': '.',
  };
  return number.toString().split('').map((d) => map[d] || d).join('');
};

const clockString = (ms) => {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const f = (n) => toMathematicalAlphanumericSymbols(n.toString().padStart(2, '0'));
  return `${f(days)}:${f(hours)}:${f(minutes)}:${f(seconds)}`;
};

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Pannello di controllo: stato e risorse del bot');

function runClean() {
  if (global.gc) {
    try {
      global.gc();
      return '🧹 Pulizia completata, RAM ottimizzata';
    } catch (e) {}
  }
  return '🧹 Pulizia eseguita (avvia con --expose-gc per liberare davvero la RAM)';
}

function buildPanel(client, latency, note = '') {
  const uptime = clockString(process.uptime() * 1000);

  const totalMemMB = (os.totalmem() / (1024 * 1024)).toFixed(2);
  const usedMemMB = ((os.totalmem() - os.freemem()) / (1024 * 1024)).toFixed(2);

  const mem = process.memoryUsage();
  const heapUsedMB = (mem.heapUsed / (1024 * 1024)).toFixed(2);
  const heapTotalMB = (mem.heapTotal / (1024 * 1024)).toFixed(2);

  const embed = new EmbedBuilder()
    .setTitle('𝐙𝐞𝐧𝐨𝐁𝐨𝐭 🭵 𝐒𝐲𝐬𝐭𝐞𝚖 𝐌𝐨𝐧𝐢𝐭𝐨𝐫')
    .setColor(0x5865f2)
    .setDescription(
      `🌐 𝚲𝐓𝐓𝕀𝐕𝕀𝐓𝚲: ${uptime}\n` +
      `⚡ 𝐕𝚵𝐋Ꮻ𝐂𝕀𝐓𝚲: ${toMathematicalAlphanumericSymbols(latency)} 𝐦𝐬\n` +
      `📡 Gateway: ${toMathematicalAlphanumericSymbols(Math.round(client.ws.ping))} ms\n\n` +
      `💾 𝐑𝐀𝐌 (server): ${usedMemMB} MB / ${totalMemMB} MB\n` +
      `📊 𝐌𝐄𝐌 (process): ${heapUsedMB} MB / ${heapTotalMB} MB`
    )
    .setFooter({ text: note ? `ZenoBot • ${note}` : 'ZenoBot • Pannello di Controllo' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ping:refresh').setLabel('🔄 Aggiorna Stato').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ping:clean').setLabel('🧹 Pulisci RAM').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// Funziona sia con /ping sia con i comandi col prefisso (.ping, .stats, .clean...)
async function ping(ctx, { conn, command = 'ping' } = {}) {
  let note = '';
  if (command === 'clean' || command === 'pulisci') note = runClean();

  const latency = Math.max(0, Date.now() - ctx.createdTimestamp);
  return ctx.reply(buildPanel(conn, latency, note));
}

ping.command = /^(ping|stats|status|clean|pulisci)$/i;
ping.help = ['ping'];
ping.tags = ['info'];
ping.desc = 'Stato e risorse del bot';

export default ping;

// Bottoni del pannello
export const prefix = 'ping';
export async function onComponent(i, client) {
  const action = i.customId.split(':')[1];
  const note = action === 'clean' ? runClean() : '';
  const latency = Math.max(0, Date.now() - i.createdTimestamp);
  await i.update(buildPanel(client, latency, note));
}
