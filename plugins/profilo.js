import fs from 'fs';
import path from 'path';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags,
} from 'discord.js';

const PROFILES_DB = path.resolve('profiles_db.json');

const readDb = () => {
  if (!fs.existsSync(PROFILES_DB)) return {};
  try { return JSON.parse(fs.readFileSync(PROFILES_DB, 'utf8')); } catch { return {}; }
};

const writeDb = (data) => {
  if (typeof global.saveJsonAtomic === 'function') global.saveJsonAtomic(PROFILES_DB, data);
  else { try { fs.writeFileSync(PROFILES_DB, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.error('Errore scrittura profilo:', e); } }
};

// Ricostruisce l'embed del profilo (usata sia dal comando sia dal pulsante)
function buildProfileEmbed(guild, user, profile) {
  const stars = profile.stars || 0;
  const totalSongs = (profile.topSongs || []).reduce((acc, song) => acc + (song.count || 0), 0);
  const topSongs = [...(profile.topSongs || [])].sort((a, b) => b.count - a.count).slice(0, 3);

  let topText = '';
  if (topSongs.length === 0) {
    topText = 'Nessuna canzone ascoltata ancora con il bot.';
  } else {
    topSongs.forEach((song, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
      topText += `${medal} **${song.title}**\n🎤 ${song.artist} • \`${song.count} ascolti\`\n\n`;
    });
  }

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `Profilo Musicale di ${user.username}`,
      iconURL: user.displayAvatarURL({ extension: 'png', size: 256 }),
    })
    .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 512 }))
    .addFields(
      { name: '⭐ Stelle Totali', value: `\`${stars}\``, inline: true },
      { name: '🎵 Canzoni Ascoltate', value: `\`${totalSongs}\``, inline: true },
    )
    .addFields({ name: '🏆 Le tue Top 3 Canzoni', value: topText })
    .setFooter({ text: 'Zeno Music ✦ Zeno Bot', iconURL: guild.client.user.displayAvatarURL() })
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName('profilo')
  .setDescription('Mostra il tuo profilo musicale con le tue top 3 canzoni')
  .addUserOption((option) =>
    option.setName('utente').setDescription('Utente di cui vedere il profilo (opzionale)').setRequired(false));

async function profiloCmd(ctx, { text = '' } = {}) {
  const isSlash = typeof ctx.isChatInputCommand === 'function';
  const guild = ctx.guild;

  if (!guild) return ctx.reply('❌ Questo comando funziona solo nei server.');

  let targetUser = isSlash ? ctx.options.getUser('utente') : null;
  if (!targetUser && !isSlash) {
    const mentionMatch = text.match(/<@!?(\d+)>/);
    if (mentionMatch) targetUser = await guild.client.users.fetch(mentionMatch[1]).catch(() => null);
  }

  const user = targetUser || (isSlash ? ctx.user : ctx.author);
  const db = readDb();

  if (!db[user.id]) {
    db[user.id] = { stars: 0, topSongs: [] };
    writeDb(db);
  }

  const profile = db[user.id];
  const embed = buildProfileEmbed(guild, user, profile);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prof:star:${user.id}`)
      .setLabel('Dai una Stella')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⭐')
  );

  if (isSlash) await ctx.reply({ embeds: [embed], components: [row] });
  else await ctx.channel.send({ embeds: [embed], components: [row] });
}

profiloCmd.command = /^profilo$/i;
profiloCmd.help = ['profilo'];
profiloCmd.tags = ['utils', 'music'];
profiloCmd.desc = 'Mostra il tuo profilo musicale con top 3 canzoni';

export default profiloCmd;

// ───────────── Gestione Pulsante Stella ─────────────
export const prefix = 'prof';
export async function onComponent(i) {
  const [, action, targetId] = i.customId.split(':');
  if (action !== 'star') return;

  // Impedisci di mettere stelle a se stessi
  if (i.user.id === targetId) {
    return i.reply({ content: '❌ Non puoi mettere una stella al tuo stesso profilo!', flags: MessageFlags.Ephemeral });
  }

  const db = readDb();
  db[targetId] = db[targetId] || { stars: 0, topSongs: [] };
  db[targetId].stars = (db[targetId].stars || 0) + 1;
  writeDb(db);

  // Ricostruisci l'embed aggiornato con il nuovo numero di stelle
  try {
    const targetUser = await i.client.users.fetch(targetId);
    const newEmbed = buildProfileEmbed(i.guild, targetUser, db[targetId]);

    // Aggiorna il messaggio della card visibile a tutti
    await i.message.edit({
      embeds: [newEmbed],
      components: i.message.components,
    });
  } catch (e) {
    console.error('Errore aggiornamento card profilo:', e.message);
  }

  // Feedback privato all'utente che ha cliccato
  await i.reply({
    content: `✅ Hai dato una stella a <@${targetId}>! Ora ha **${db[targetId].stars}** stelle.`,
    flags: MessageFlags.Ephemeral,
  });
}
