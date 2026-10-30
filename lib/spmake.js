import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderCard } from './spcard.js';
import { hasAnim, animPath, animateCard } from './spanim.js';

const CACHE = path.join(process.cwd(), 'data', 'sp_cache');
fs.mkdirSync(CACHE, { recursive: true });

// tiene solo le 40 GIF più recenti
function trim() {
  try {
    const files = fs.readdirSync(CACHE)
      .map((f) => ({ f, t: fs.statSync(path.join(CACHE, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(40).forEach(({ f }) => fs.unlinkSync(path.join(CACHE, f)));
  } catch { /* ignora */ }
}

// Card animata (con cache) se c'è lo sfondo animato, altrimenti card normale
export async function makeCard(params) {
  const key = params.bgUserId;
  if (key && hasAnim(key)) {
    const p = { ...params, elapsed: 0, total: 0 }; // senza barra: la card si può riusare
    const id = crypto.createHash('sha1').update(JSON.stringify([
      p.badge, p.title, p.artist, p.album, p.coverUrl, p.userName, p.avatarUrl,
      key, fs.statSync(animPath(key)).mtimeMs,
    ])).digest('hex');
    const file = path.join(CACHE, `${id}.gif`);

    if (fs.existsSync(file)) {
      const now = new Date();
      fs.utimesSync(file, now, now);
      return { buffer: fs.readFileSync(file), color: 0x1db954, ext: 'gif' };
    }

    const base = await renderCard({ ...p, overlay: true }).catch(() => null);
    if (base) {
      const gif = await animateCard(key, base.buffer);
      if (!gif) console.warn('[spcard] GIF animata non generata, uso la card normale');
      else if (gif.length < 8 * 1024 * 1024) {
        fs.writeFileSync(file, gif);
        trim();
        return { buffer: gif, color: base.color, ext: 'gif' };
      }
    }
  }
  const s = await renderCard(params);
  return s ? { ...s, ext: 'png' } : null;
}
