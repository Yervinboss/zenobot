import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const prefix = 'like';

// Mappa per memorizzare gli utenti che hanno messo like: messageId -> Set(userId)
const likedUsersMap = new Map();

export async function onComponent(interaction, client) {
  if (!interaction.isButton()) return;

  const messageId = interaction.message.id;
  const userId = interaction.user.id;

  if (!likedUsersMap.has(messageId)) {
    likedUsersMap.set(messageId, new Set());
  }
  const likedUsers = likedUsersMap.get(messageId);

  const parts = interaction.customId.split('_');
  let count = parseInt(parts[2]) || 0;

  let hasLiked = likedUsers.has(userId);

  if (hasLiked) {
    // Ha già messo like -> lo toglie (unlike)
    likedUsers.delete(userId);
    count = Math.max(0, count - 1);
  } else {
    // Non ha messo like -> lo mette
    likedUsers.add(userId);
    count++;
  }

  // Se l'utente ha messo like, il bottone diventa verde/primario (o secondario con la stella)
  const newRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`like_sp_${count}`)
        .setLabel(`${count}`)
        .setStyle(hasLiked ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('⭐')
    );

  await interaction.update({
    components: [newRow]
  });

  await interaction.followUp({
    content: hasLiked ? '❌ Hai rimosso il "Mi piace" dal brano.' : '⭐ Brano aggiunto ai tuoi preferiti!',
    flags: 6 // MessageFlags.Ephemeral equivalente numerico per evitare warning
  }).catch(() => {});
}

export default function likePlugin() {}
likePlugin.desc = 'Gestisce i like dei bottoni in stile toggle';
likePlugin.tags = ['utils'];
