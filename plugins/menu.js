import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags,
} from 'discord.js';
import {
  COLORS, box, say, actor, isOwner,
} from '../lib/ui.js';

// ⚠️ Link mostrato a chi non è owner quando apre la categoria Owner
const REDIRECT_LINK = 'https://discord.gg/IL_TUO_INVITO';

const CATS = {
  musica: {
    label: 'Musica', emoji: '🎵', color: 0x5865f2, description: 'Cerca, scarica, testi, quiz e classifica',
    commands: [
      { cmd: 'song', desc: 'Cerca una canzone e scaricala' },
      { cmd: 'tp', desc: 'Le canzoni top di un cantante' },
      { cmd: 'text', desc: 'Testo di una canzone' },
      { cmd: 'shazam', desc: 'Riconosce una canzone da audio/video' },
      { cmd: 'sp', desc: 'Il brano Spotify in ascolto' },
      { cmd: 'pl', desc: 'La tua playlist personale' },
      { cmd: 'profilo', desc: 'Il tuo profilo musicale' },
      { cmd: 'consiglia', desc: 'Ti consiglio una canzone (anche per genere)' },
      { cmd: 'quiz', desc: 'Indovina la canzone dal testo' },
      { cmd: 'classifica', desc: 'Top ascoltatori, canzoni e campioni del quiz' },
    ],
  },
  fun: {
    label: 'Giochi & Fun', emoji: '🎮', color: 0xf472b6, description: 'Giochi, GIF e tanto divertimento',
    commands: [
      { cmd: 'bj', desc: 'Blackjack contro il banco' },
      { cmd: 'tris', desc: 'Tris contro il bot o un amico' },
      { cmd: 'rps', desc: 'Sasso carta forbici' },
      { cmd: '8ball', desc: 'La palla magica risponde' },
      { cmd: 'ship', desc: 'Compatibilità tra due persone' },
      { cmd: 'roast', desc: 'Una battuta cattiva (con affetto)' },
      { cmd: 'rate', desc: 'Voto a qualsiasi cosa' },
      { cmd: 'dado', desc: 'Tira un dado' },
      { cmd: 'moneta', desc: 'Testa o croce' },
      { cmd: 'scegli', desc: 'Scelgo io tra più opzioni' },
      { cmd: 'abbraccia', desc: 'Abbraccio con GIF' },
      { cmd: 'bacia', desc: 'Bacio con GIF' },
      { cmd: 'schiaffo', desc: 'Schiaffo con GIF' },
      { cmd: 'coccola', desc: 'Coccole con GIF' },
      { cmd: 'mordi', desc: 'Morso con GIF' },
      { cmd: 'balla', desc: 'Balla con GIF' },
    ],
  },
  mod: {
    label: 'Moderazione', emoji: '🛡️', color: 0xf97316, description: 'Tieni in ordine il server',
    commands: [
      { cmd: 'mute', desc: 'Silenzia un utente (timeout)' },
      { cmd: 'unmute', desc: 'Toglie il timeout' },
      { cmd: 'kick', desc: 'Espelle un utente' },
      { cmd: 'ban', desc: 'Banna un utente' },
      { cmd: 'unban', desc: 'Rimuove un ban' },
      { cmd: 'warn', desc: 'Avvisa un utente (3 warn = timeout)' },
      { cmd: 'warns', desc: 'Lista dei warn di un utente' },
      { cmd: 'unwarn', desc: 'Toglie un warn (o tutti)' },
      { cmd: 'del', desc: 'Cancella messaggi' },
      { cmd: 'slowmode', desc: 'Imposta la modalità lenta' },
      { cmd: 'lock', desc: 'Blocca il canale' },
      { cmd: 'unlock', desc: 'Sblocca il canale' },
      { cmd: 'tag', desc: 'Tagga tutti in modo pulito' },
      { cmd: 'soloadmin', desc: 'Il bot risponde solo agli admin' },
    ],
  },
  utility: {
    label: 'Utility', emoji: '🛠️', color: 0x22c55e, description: 'Strumenti utili di tutti i giorni',
    commands: [
      { cmd: 'avatar', desc: 'Avatar in grande' },
      { cmd: 'userinfo', desc: 'Scheda di un utente' },
      { cmd: 'serverinfo', desc: 'Scheda del server' },
      { cmd: 'sondaggio', desc: 'Crea un sondaggio con reazioni' },
      { cmd: 'ricorda', desc: 'Ti ricordo qualcosa tra un po\'' },
      { cmd: 's', desc: 'Crea uno sticker' },
      { cmd: 'invita', desc: 'Link di invito del bot' },
      { cmd: 'ping', desc: 'Stato e risorse del bot' },
    ],
  },
  owner: {
    label: 'Owner', emoji: '👑', color: 0xdc2626, description: 'Solo per il creatore del bot', ownerOnly: true,
    commands: [
      { cmd: 'bot', desc: 'Cambia nome/avatar del bot' },
      { cmd: 'reload', desc: 'Ricarica i plugin' },
      { cmd: 'sterminio', desc: 'Distruzione totale del server' },
    ],
  },
};

// Comandi di plugin nuovi non ancora nel menu finiscono in "Altro"
function allCats() {
  const known = new Set(Object.values(CATS).flatMap((c) => c.commands.map((x) => x.cmd)));
  const extra = new Map();
  for (const p of global.zenoPluginsList || []) {
    for (const h of p.help || []) if (!known.has(h)) extra.set(h, p.desc || '—');
  }
  if (!extra.size) return CATS;
  return {
    ...CATS,
    altro: {
      label: 'Altro', emoji: '✨', color: COLORS.main, description: 'Altri comandi del bot',
      commands: [...extra].map(([cmd, desc]) => ({ cmd, desc })),
    },
  };
}

const selectRow = (current) => new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId('menu:sel')
    .setPlaceholder('📂 Scegli una categoria…')
    .addOptions(Object.entries(allCats()).map(([key, c]) => ({
      label: c.label, value: key, emoji: c.emoji, description: c.description.slice(0, 90), default: key === current,
    }))),
);

function home(user) {
  const cats = allCats();
  const total = Object.values(cats).reduce((n, c) => n + c.commands.length, 0);
  const e = box(COLORS.main, '⚡ ZENO BOT • MENU PRINCIPALE',
    `Ciao **${user.displayName}**! 👋\nScegli una categoria dal menu qui sotto.\n\n> Usa **.comando** oppure **/comando**`)
    .addFields(...Object.values(cats).map((c) => ({ name: `${c.emoji} ${c.label}`, value: `${c.commands.length} comandi`, inline: true })))
    .setFooter({ text: `⚡ ZENO BOT • ${total} comandi • ${global.zenoStats?.commands || 0} eseguiti` });
  return { embeds: [e], components: [selectRow()] };
}

function category(key) {
  const c = allCats()[key];
  if (!c) return null;
  const list = c.commands.map((x) => `🔹 **.${x.cmd}** — ${x.desc}`).join('\n');
  const e = box(c.color, `${c.emoji} ${c.label}`, `*${c.description}*\n\n${list}`)
    .setFooter({ text: `⚡ ZENO BOT • ${c.commands.length} comandi` });
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu:home').setLabel('Torna alla Home').setEmoji('🏠').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [selectRow(key), back] };
}

export const data = new SlashCommandBuilder().setName('menu').setDescription('Mostra il menu con tutti i comandi');

async function menuCmd(ctx) {
  return say(ctx, home(actor(ctx)));
}
menuCmd.command = /^(menu|help)$/i;
menuCmd.help = ['menu'];
menuCmd.tags = ['main'];
menuCmd.desc = 'Mostra il menu con tutti i comandi';
export default menuCmd;

export const prefix = 'menu';
export async function onComponent(i) {
  if (i.isButton()) return i.update(home(i.user));
  const key = i.values?.[0];
  if (CATS[key]?.ownerOnly && !isOwner(i.user.id)) {
    return i.reply({
      content: `👑 **Zona riservata al creatore del bot.**\n🔗 Entra nel server ufficiale: ${REDIRECT_LINK}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  const payload = category(key);
  if (!payload) return i.reply({ content: '❌ Categoria non trovata.', flags: MessageFlags.Ephemeral });
  return i.update(payload);
}
