import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags,
} from 'discord.js';
import * as eco from '../lib/eco.js';
import * as rpg from '../lib/rpg.js';

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('Lavora per guadagnare soldi ed esperienza');

const bar = (xp, need) => {
  const f = Math.max(0, Math.min(10, Math.round((xp / need) * 10)));
  return '▰'.repeat(f) + '▱'.repeat(10 - f);
};

function choiceIntro(p) {
  if (p.level === 1) return '👋 **Benvenuto nel mondo del lavoro!** Ecco tre lavoretti per iniziare, scegli da dove partire:';
  if (p.level === 5) return '🎉 **Livello 5!** Ti hanno fatto due offerte, scegli quella che preferisci:';
  return `🎉 **Livello ${p.level}!** Scegli il tuo nuovo lavoro:`;
}

function choiceEmbed(u) {
  const jobs = u.pending.ids.map((x) => rpg.JOB_BY_ID[x]);
  const lines = jobs.map((j) => {
    const [lo, hi] = rpg.payRange(j.tier, u.level);
    return `${j.emoji} **${j.name}** — ${eco.fmt(lo)} / ${eco.fmt(hi)} a turno`;
  });
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('💼 Scegli il tuo lavoro')
    .setDescription(`${choiceIntro(u.pending)}\n\n${lines.join('\n')}`)
    .setFooter({ text: 'Zeno Bot • Lavoro' });
}

function choiceComponents(u, id) {
  const jobs = u.pending.ids.map((x) => rpg.JOB_BY_ID[x]);
  if (jobs.length <= 5) {
    return [new ActionRowBuilder().addComponents(jobs.map((j) =>
      new ButtonBuilder().setCustomId(`work:pick:${id}:${j.id}`).setLabel(j.name).setEmoji(j.emoji).setStyle(ButtonStyle.Primary)))];
  }
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`work:sel:${id}`)
      .setPlaceholder('Scegli il tuo lavoro…')
      .addOptions(jobs.map((j) => {
        const [lo, hi] = rpg.payRange(j.tier, u.level);
        return { label: j.name, value: j.id, emoji: j.emoji, description: `${lo} - ${hi} a turno` };
      })),
  )];
}

function shiftEmbed(u, r, intro = '') {
  const need = rpg.xpNeeded(u.level);
  const lvl = u.level >= rpg.MAX_LEVEL
    ? `⭐ Livello **${u.level} (MAX)**`
    : `📈 Livello **${u.level}**  ${bar(u.xp, need)}  ${u.xp}/${need} XP`;
  let desc = `${intro}${r.random ? '🎲 Lavoro di oggi: ' : ''}${r.job.emoji} **${r.job.name}**\n`
    + `Oggi ${r.job.t}.\n\n`
    + `${eco.CURRENCY} **+${eco.fmt(r.pay).replace(`${eco.CURRENCY} `, '')}**${r.tip ? ' — 🤑 **mancia enorme!**' : ''}\n`
    + `✨ +${r.xp} XP\n${lvl}\n💰 Saldo: **${eco.fmt(r.total)}**`;
  if (r.ups.length) desc += `\n\n🎉 **Sei salito al livello ${u.level}!**`;
  return new EmbedBuilder()
    .setColor(r.tip ? 0xf1c40f : 0x3498db)
    .setTitle('💼 Turno completato')
    .setDescription(desc)
    .setFooter({ text: 'Puoi lavorare ogni 30 secondi' });
}

function shiftPayload(u, id, intro = '') {
  const r = rpg.runShift(u, id);
  const embeds = [shiftEmbed(u, r, intro)];
  let components = [];
  if (u.pending) { embeds.push(choiceEmbed(u)); components = choiceComponents(u, id); }
  return { embeds, components };
}

async function work(ctx) {
  const id = eco.isSlash(ctx) ? ctx.user.id : ctx.author.id;
  const u = rpg.init(eco.user(id));

  rpg.ensureChoice(u);
  if (u.pending) {
    eco.touch();
    return ctx.reply({ embeds: [choiceEmbed(u)], components: choiceComponents(u, id) });
  }

  const left = eco.cooldownLeft(u.lastWork, rpg.WORK_COOLDOWN);
  if (left) return eco.say(ctx, `😮‍💨 Sei stanco! Puoi lavorare di nuovo tra **${eco.fmtTime(left)}**.`, true);

  return ctx.reply(shiftPayload(u, id));
}

work.command = /^work$/i;
work.help = ['work'];
work.tags = ['economy'];
work.desc = 'Lavora per guadagnare soldi ed esperienza';

export default work;

// ───────────── Scelta del lavoro (bottoni / menu) ─────────────
export const prefix = 'work';
export async function onComponent(i) {
  const parts = i.customId.split(':');
  const ownerId = parts[2];
  const hidden = (content) => i.reply({ content, flags: MessageFlags.Ephemeral });

  if (i.user.id !== ownerId) return hidden('⛔ Questa scelta non è tua.');

  const jobId = parts[1] === 'pick' ? parts[3] : i.values?.[0];
  const u = rpg.init(eco.user(ownerId));
  if (!u.pending || !u.pending.ids.includes(jobId)) return hidden('⌛ Questa scelta non è più valida. Usa `/work`.');

  const job = rpg.JOB_BY_ID[jobId];
  u.job = jobId;
  u.pending = null;
  eco.touch();

  const intro = `✅ Ora sei **${job.emoji} ${job.name}**!\n\n`;
  if (eco.cooldownLeft(u.lastWork, rpg.WORK_COOLDOWN) > 0) {
    const e = new EmbedBuilder().setColor(0x2ecc71).setDescription(`${intro}Torna a lavorare con \`.work\` tra pochi secondi.`);
    return i.update({ embeds: [e], components: [] });
  }
  return i.update(shiftPayload(u, ownerId, intro));
}
