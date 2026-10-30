import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import yts from 'yt-search';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder, MessageFlags,
} from 'discord.js';

const run = promisify(execFile);
const MAX_UPLOAD = 10 * 1024 * 1024;

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (p) => { try { if (p && fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {} };
const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';
const cid = (action, uid) => `txt:${action}:${uid}`;
const url = (id) => `https://www.youtube.com/watch?v=${id}`;

// ───────────── RICERCA SU YOUTUBE ─────────────
async function findYtUrl(query) {
    try {
        const r = await yts(query);
        if (r.videos && r.videos.length > 0) {
            let img = r.videos[0].image || r.videos[0].thumbnail || '';
            if (img && img.includes('default.jpg')) {
                img = img.replace('default.jpg', 'hqdefault.jpg');
            }
            let croppedImage = img ? `https://images.weserv.nl/?url=${encodeURIComponent(img)}&w=500&h=500&fit=cover` : '';
            return { 
                url: r.videos[0].url, 
                title: r.videos[0].title,
                image: croppedImage || img
            };
        }
    } catch (e) {
        console.error('Errore findYtUrl:', e.message);
    }
    return null;
}

// ───────────── RICERCA DEL TESTO ─────────────
async function getLyrics(query) {
    let artist = '';
    let title = query;

    if (query.includes(' - ')) {
        const parts = query.split(' - ');
        artist = parts[0] ? parts[0].trim() : '';
        title = parts[1] ? parts[1].trim() : query;
    }

    try {
        const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const lrclibRes = await axios.get(lrclibUrl);
        if (lrclibRes.data && lrclibRes.data.length > 0) {
            const song = lrclibRes.data[0]; 
            return { lyrics: song.plainLyrics, source: `🎵 ${song.artistName} - ${song.trackName}` };
        }
    } catch (e) {
        console.error('Errore LrcLib:', e.message);
    }

    try {
        if (artist) {
            let urlApi = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
            const res = await axios.get(urlApi);
            if (res.data && res.data.lyrics) {
                return { lyrics: res.data.lyrics, source: '📝 Lyrics.ovh' };
            }
        }
    } catch (e) {
        console.error('Errore Lyrics.ovh:', e.message);
    }

    return null;
}

// ───────────── DOWNLOAD AUDIO ─────────────
async function downloadAudio(id) {
    const base = tmp(`zeno_txt_${id}_${Date.now()}`);
    await run('yt-dlp', [
        '--no-playlist', '-q', '--no-warnings', '--no-progress',
        '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
        '--extractor-args', 'youtube:player-client=android,web',
        '-o', `${base}.%(ext)s`, url(id),
    ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    const file = `${base}.mp3`;
    if (!fs.existsSync(file)) throw new Error('file non generato');
    return file;
}

// ───────────── COMANDO /text ─────────────
export const data = new SlashCommandBuilder()
    .setName('text')
    .setDescription('Cerca il testo di una canzone')
    .addStringOption(option => 
        option.setName('query')
        .setDescription('Artista - Titolo della canzone')
        .setRequired(true)
    );

export async function execute(ctx) {
    const slash = isInteraction(ctx);
    const user = slash ? ctx.user : ctx.author;
    const say = (payload) => (slash ? ctx.editReply(payload) : ctx.reply(payload));

    // 🔥 FIX: Estrazione argomenti super-robusta per i comandi con il punto
    let query = '';
    if (slash) {
        query = ctx.options.getString('query');
    } else {
        if (ctx.args && Array.isArray(ctx.args) && ctx.args.length > 0) {
            query = ctx.args.join(' ');
        } else if (typeof ctx.text === 'string' && ctx.text.trim() !== '') {
            query = ctx.text.trim();
        } else if (typeof ctx.content === 'string') {
            const parts = ctx.content.trim().split(/\s+/);
            if (parts.length > 1) query = parts.slice(1).join(' ');
        }
    }

    // Pulisce la query da eventuali residui del comando (es. ".text", "text", "testo")
    if (query) {
        const commandNames = ['text', 'testo', 'lyrics', 'cerca'];
        let words = query.split(/\s+/);
        let firstWordClean = words[0].toLowerCase().replace(/^[.!?\-]/, '');
        if (words.length > 1 && commandNames.includes(firstWordClean)) {
            query = words.slice(1).join(' ');
        }
    }

    if (!query || query.trim() === '') {
        return say('📝 **CERCA TESTO CANZONE**\n\n📌 *Uso:* `.text [artista - titolo]`\n📎 *Esempio:* `.text Sfera Ebbasta - Visiera H`');
    }

    if (slash) await ctx.deferReply();
    else await ctx.react('🔍').catch(() => {});

    try {
        let result = await getLyrics(query);

        if (!result || !result.lyrics) {
            if (!slash) await ctx.react('❌').catch(() => {});
            return say(`❌ Testo non trovato per: "${query}"`);
        }

        let { lyrics, source } = result;
        let ytUrl = '';
        let ytTitle = '';
        let ytImage = '';
        
        try {
            const yt = await findYtUrl(query); 
            if (yt) {
                ytUrl = yt.url;
                ytTitle = yt.title;
                ytImage = yt.image;
            }
        } catch (e) {}

        let displayLyrics = lyrics.length > 3500 ? lyrics.substring(0, 3500) + '...' : lyrics;
        
        const embed = new EmbedBuilder()
            .setTitle(`📝 Testo: ${source}`)
            .setDescription(displayLyrics)
            .setColor(0x5865f2);

        if (ytImage) embed.setThumbnail(ytImage);
        if (ytTitle) embed.setFooter({ text: `🎵 ${ytTitle}` });

        let row = null;
        if (ytUrl) {
            const videoId = ytUrl.match(/[?&]v=([\w-]{11})/)?.[1];
            if (videoId) {
                row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`txt:play:${videoId}`)
                        .setLabel('🎵 Riproduci')
                        .setStyle(ButtonStyle.Primary)
                );
            }
        }

        if (!slash) await ctx.react('✅').catch(() => {});
        await say({ embeds: [embed], components: row ? [row] : [] });

        if (lyrics.length > 3500) {
            const parts = lyrics.substring(3500).match(/[\s\S]{1,1900}/g) || [];
            for (let part of parts) {
                if (slash) await ctx.followUp({ content: part });
                else await ctx.channel.send(part);
            }
        }

    } catch (error) {
        console.error('Errore text handler:', error);
        if (!slash) await ctx.react('❌').catch(() => {});
        return say('❌ Errore nella ricerca del testo.');
    }
}

execute.command = /^(text|testo|lyrics)$/i;
execute.help = ['text'];
execute.tags = ['musica'];
execute.desc = 'Cerca il testo di una canzone';
execute.data = data;

// ───────────── PULSANTI ─────────────
export const prefix = 'txt';
export async function onComponent(i) {
    const [, action, videoId] = i.customId.split(':');
    
    if (action === 'play') {
        await i.deferReply();
        
        let file = null;
        try {
            file = await downloadAudio(videoId);
            if (fs.statSync(file).size > MAX_UPLOAD) {
                return await i.editReply('❌ Il file supera il limite di upload di Discord (10 MB).');
            }
            
            await i.editReply({
                content: `🎧 **Riproduzione in corso...**`,
                files: [new AttachmentBuilder(file, { name: 'canzone.mp3' })],
            });
        } catch (e) {
            console.error('Errore download textplay:', e.stderr || e.message);
            await i.editReply('❌ Errore durante il download.').catch(() => {});
        } finally {
            rm(file);
        }
    }
}

execute.onComponent = onComponent;
export default execute;
