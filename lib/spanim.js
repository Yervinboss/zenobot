import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DIR = path.join(process.cwd(), 'data', 'sp_bg');
fs.mkdirSync(DIR, { recursive: true });

export const animPath = (key) => path.join(DIR, `${key}.mp4`);
export const hasAnim = (key) => fs.existsSync(animPath(key));
export const removeAnim = (key) => { try { fs.unlinkSync(animPath(key)); return true; } catch { return false; } };

let ff = null;
export async function hasFfmpeg() {
  if (ff !== null) return ff;
  try { await run('ffmpeg', ['-version']); ff = true; } catch { ff = false; }
  return ff;
}

const tmp = (name) => path.join(os.tmpdir(), `spz-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
const rm = (...files) => files.forEach((f) => { try { fs.unlinkSync(f); } catch { /* ignora */ } });

// Converte GIF/video in un loop mp4 900x360 di max 4 secondi
export async function saveAnim(key, url) {
  if (!(await hasFfmpeg())) throw new Error('NO_FFMPEG');
  const res = await fetch(url);
  if (!res.ok) throw new Error('DOWNLOAD');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) throw new Error('TOO_BIG');
  const input = tmp('in');
  const out = tmp('out.mp4');
  fs.writeFileSync(input, buf);
  try {
    await run('ffmpeg', [
      '-y', '-stream_loop', '-1', '-i', input, '-t', '4', '-an',
      '-vf', 'fps=12,scale=900:360:force_original_aspect_ratio=increase,crop=900:360',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '26', out,
    ], { timeout: 90000 });
    fs.copyFileSync(out, animPath(key));
  } catch {
    throw new Error('FFMPEG');
  } finally {
    rm(input, out);
  }
}

// Mette la card (png con trasparenza) sopra lo sfondo animato -> GIF leggera
export async function animateCard(key, png) {
  if (!hasAnim(key) || !(await hasFfmpeg())) return null;
  const card = tmp('card.png');
  const out = tmp('out.gif');
  fs.writeFileSync(card, png);
  try {
    await run('ffmpeg', [
      '-y', '-stream_loop', '-1', '-t', '3', '-i', animPath(key), '-loop', '1', '-t', '3', '-i', card,
      '-filter_complex',
      '[0:v]scale=640:256[b];[1:v]scale=640:256[c];[b][c]overlay=0:0:shortest=1,split[a][d];[a]palettegen=max_colors=96[p];[d][p]paletteuse=dither=bayer:bayer_scale=5',
      '-r', '10', '-loop', '0', out,
    ], { timeout: 45000, maxBuffer: 1 << 26 });
    return fs.readFileSync(out);
  } catch {
    return null;
  } finally {
    rm(card, out);
  }
}
