import 'dotenv/config';
import {
  Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, MessageFlags, ActivityType,
} from 'discord.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { isOwner, solo, box, COLORS } from './lib/ui.js';
import { getPrefix } from './plugins/prefix.js';

const plugins = {};
const components = new Map(); // prefisso customId -> modulo
const pluginFolder = path.resolve('plugins');
const LOG_DIR = path.resolve('logs');
const cooldowns = new Map();
global.zenoStats = { started: Date.now(), commands: 0, byCmd: {} };

const client = new Client({
  rest: { timeout: 120_000 },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function logToFile(type, text) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'zenobot.log'), `[${new Date().toISOString()}] [${type.toUpperCase()}] ${text}\n`, 'utf-8');
  } catch (e) {}
}

global.saveJsonAtomic = function (filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
};

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || reason;
  console.log(chalk.red('[!] Promise non gestita (il bot resta acceso):'), msg);
  logToFile('error', `Unhandled Rejection: ${msg}`);
});
process.on('uncaughtException', (err) => {
  const msg = err?.message || err;
  console.log(chalk.red('[!] Eccezione non gestita (il bot resta acceso):'), msg);
  logToFile('error', `Uncaught Exception: ${msg}`);
});

// Un comando alla volta per utente: evita lo spam (owner escluso)
function cooldownLeft(userId, command, secs = 2) {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + secs * 1000);
  return 0;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cooldowns) if (v < now) cooldowns.delete(k);
}, 60_000).unref();

function bump(command) {
  global.zenoStats.commands++;
  global.zenoStats.byCmd[command] = (global.zenoStats.byCmd[command] || 0) + 1;
}

// Caricamento dinamico plugin (hot-reload)
async function loadPlugins() {
  if (!fs.existsSync(pluginFolder)) fs.mkdirSync(pluginFolder, { recursive: true });
  Object.keys(plugins).forEach((k) => delete plugins[k]);
  components.clear();
  global.zenoPluginsList = [];
  let loaded = 0, failed = 0;

  for (const file of fs.readdirSync(pluginFolder)) {
    if (!file.endsWith('.js')) continue;
    try {
      const mod = await import(`${pathToFileURL(path.join(pluginFolder, file))}?update=${Date.now()}`);
      if (typeof mod.default !== 'function') throw new Error('export default mancante o non è una funzione');

      plugins[file] = mod.default;
      if (typeof mod.messageHook === 'function') plugins[file].messageHook = mod.messageHook;
      // un plugin può avere più slash command: export const datas = [...]
      plugins[file].datas = mod.datas || (mod.data ? [mod.data] : []);
      if (mod.prefix && typeof mod.onComponent === 'function') components.set(mod.prefix, mod);

      let cmdName = mod.data?.name || file;
      if (!mod.data && mod.default.command?.source) {
        const first = mod.default.command.source.replace(/[\^$()]/g, '').split('|')[0];
        if (first) cmdName = first;
      }
      global.zenoPluginsList.push({
        file, name: cmdName, desc: mod.default.desc || '',
        tags: mod.default.tags || ['altro'], help: mod.default.help || [],
      });
      loaded++;
    } catch (e) {
      failed++;
      console.log(chalk.red(`[Errore Plugin] ${file}: ${e.message}`));
      logToFile('error', `Plugin Error [${file}]: ${e.message}`);
    }
  }
  console.log(chalk.green(`🟢 Caricati con successo ${loaded} plugin!`));
  logToFile('info', `Caricati ${loaded} plugin (${failed} falliti).`);
  if (failed > 0) console.log(chalk.yellow(`⚠️ ${failed} plugin non caricati (vedi errori sopra)`));
}

// Registrazione slash command in tutti i server
async function registerCommands() {
  const byName = new Map();
  for (const p of Object.values(plugins)) for (const d of p.datas || []) byName.set(d.name, d.toJSON());
  const body = [...byName.values()];
  const rest = new REST().setToken(process.env.TOKEN);
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body });
    } catch (e) {
      console.log(chalk.red(`[!] Registrazione comandi fallita in ${guild.name}: ${e.message}`));
    }
  }
}

async function reloadAll() {
  await loadPlugins();
  await registerCommands();
}
globalThis.zeno = { reload: reloadAll };

// Controllo SoloAdmin (vale per messaggi e slash command)
function isAllowed(ctx, command) {
  if (!ctx.guildId || !solo.has(ctx.guildId)) return true;
  if (command === 'soloadmin' || command.startsWith('soloadmin')) return true;
  const userId = ctx.user?.id ?? ctx.author?.id;
  if (isOwner(userId)) return true;
  return ctx.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
}

// Stato del bot che cambia ogni 30 secondi
let statusIdx = 0;
function rotatePresence() {
  if (!client.isReady()) return;
  const list = [
    { name: '🎵 .menu • tutti i comandi', type: ActivityType.Listening },
    { name: `${client.guilds.cache.size} server`, type: ActivityType.Watching },
    { name: `${global.zenoPluginsList.length} plugin attivi`, type: ActivityType.Playing },
    { name: `${global.zenoStats.commands} comandi eseguiti`, type: ActivityType.Competing },
  ];
  client.user.setPresence({ activities: [list[statusIdx++ % list.length]], status: 'online' });
}

client.once('clientReady', async () => {
  global.zenoConn = client;
  console.log(chalk.green(`\n✓ Zeno connesso a Discord come ${client.user.tag}!\n`));
  logToFile('info', `Zeno connesso a Discord come ${client.user.tag}.`);
  await registerCommands();
  rotatePresence();
  setInterval(rotatePresence, 30_000).unref();
});

client.on('guildCreate', () => registerCommands());

// Comandi con prefisso + messageHook
client.on('messageCreate', async (m) => {
  try {
    if (m.author.bot) return;

    for (const name in plugins) {
      const hook = plugins[name].messageHook;
      if (typeof hook === 'function') {
        try { await hook(client, m); } catch (e) { console.error(`Errore messageHook in ${name}:`, e); }
      }
    }

    const budy = m.content?.trim();
    if (!budy) return;

    const customPrefix = getPrefix();
    let prefix = '';
    if (budy.startsWith(customPrefix)) prefix = customPrefix;
    else if (/^[.!?#~+=|_^&*$%\/]/.test(budy[0])) prefix = budy[0];
    if (!prefix) return;

    const cmdPart = budy.slice(prefix.length).trim().split(/\s+/);
    const command = (cmdPart[0] || '').toLowerCase();
    if (!command) return;
    const textArg = budy.slice(prefix.length + command.length).trim();

    if (command === 'reload' && isOwner(m.author.id)) {
      await reloadAll();
      await m.reply({ embeds: [box(COLORS.ok, '🟢 Plugin ricaricati', `${global.zenoPluginsList.length} plugin attivi, comandi slash aggiornati.`)] });
      return;
    }

    if (!isAllowed(m, command)) return;

    for (const name in plugins) {
      const plugin = plugins[name];
      if (!plugin.command || !plugin.command.test(command)) continue;

      if (!isOwner(m.author.id)) {
        const left = cooldownLeft(m.author.id, command, plugin.cooldown ?? 2);
        if (left) { m.react('⏳').catch(() => {}); return; }
      }
      bump(command);
      try {
        await plugin(m, { conn: client, text: textArg, command });
      } catch (e) {
        console.error(`Errore nel plugin "${name}" (comando "${command}"):`, e);
        logToFile('error', `Plugin Execution Error [${name} / ${command}]: ${e.message}`);
        m.reply({ embeds: [box(COLORS.err, '💥 Errore', 'Il comando ha avuto un problema, riprova tra poco.')] }).catch(() => {});
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Slash command, bottoni, menu a tendina e modali
client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (!isAllowed(i, i.commandName)) {
        return i.reply({ content: '⛔ Solo admin.', flags: MessageFlags.Ephemeral });
      }
      const plugin = Object.values(plugins).find((p) => p.datas?.some((d) => d.name === i.commandName));
      if (!plugin) return;
      bump(i.commandName);
      await plugin(i, { conn: client, text: '', command: i.commandName });
    } else if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
      const [prefix] = i.customId.split(':');
      await components.get(prefix)?.onComponent(i, client);
    }
  } catch (e) {
    console.error(e);
    logToFile('error', `Interaction Error: ${e.message}`);
    const msg = { content: '❌ Errore nel comando.', flags: MessageFlags.Ephemeral };
    if (i.deferred || i.replied) await i.followUp(msg).catch(() => {});
    else await i.reply(msg).catch(() => {});
  }
});

async function startZenoBot() {
  await loadPlugins();
  client.login(process.env.TOKEN);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(chalk.yellow(`\n[!] Arresto richiesto (${sig}), chiudo Zeno...`));
    logToFile('info', `Arresto richiesto (${sig}).`);
    client.destroy();
    process.exit(0);
  });
}

startZenoBot();
