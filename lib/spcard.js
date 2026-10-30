import './spfont.js';
import fs from 'node:fs';
import path from 'node:path';

let C = null;
try { C = await import('@napi-rs/canvas'); } catch { /* canvas non installato */ }

export const hasCanvas = Boolean(C);
const BG_DIR = path.join(process.cwd(), 'data', 'sp_bg');
fs.mkdirSync(BG_DIR, { recursive: true });

const W = 900, H = 360;
export const bgPath = (id) => path.join(BG_DIR, `${id}.jpg`);
export const hasBg = (id) => fs.existsSync(bgPath(id));
export const removeBg = (id) => { try { fs.unlinkSync(bgPath(id)); return true; } catch { return false; } };

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('DOWNLOAD');
  return Buffer.from(await res.arrayBuffer());
}

function cover(g, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function accent(img) {
  const c = C.createCanvas(1, 1);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  const k = Math.max(r, gg, b, 1) < 150 ? 150 / Math.max(r, gg, b, 1) : 1;
  return [Math.min(255, Math.round(r * k)), Math.min(255, Math.round(gg * k)), Math.min(255, Math.round(b * k))];
}

// Salva lo sfondo personale di un utente (ritagliato 900x360, jpeg)
export async function saveBg(userId, url) {
  if (!C) throw new Error('NO_CANVAS');
  const buf = await download(url);
  if (buf.length > 10 * 1024 * 1024) throw new Error('TOO_BIG');
  let img;
  try { img = await C.loadImage(buf); } catch { throw new Error('BAD_IMAGE'); }
  const c = C.createCanvas(W, H);
  cover(c.getContext('2d'), img, 0, 0, W, H);
  fs.writeFileSync(bgPath(userId), c.toBuffer('image/jpeg', 85));
}

// Ritorna { buffer, color } oppure null se canvas non c'è
export async function renderCard({ overlay = false, badge = 'IN ASCOLTO SU SPOTIFY', title, artist, album, coverUrl, bgUserId, elapsed, total, userName, avatarUrl }) {
  if (!C) return null;

  let cov = null;
  if (coverUrl) { try { cov = await C.loadImage(await download(coverUrl)); } catch { /* ignora */ } }
  const [r, gr, b] = cov ? accent(cov) : [29, 185, 84];
  const acc = `rgb(${r},${gr},${b})`;

  const c = C.createCanvas(W, H);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  rr(g, 0, 0, W, H, 28);
  g.clip();

  // sfondo: immagine dell'utente, altrimenti copertina sfocata
  let drawn = overlay;
  if (!overlay && bgUserId && hasBg(bgUserId)) {
    try { cover(g, await C.loadImage(fs.readFileSync(bgPath(bgUserId))), 0, 0, W, H); drawn = true; } catch { /* ignora */ }
  }
  if (!drawn && cov) {
    const s = C.createCanvas(24, 10);
    s.getContext('2d').drawImage(cov, 0, 0, 24, 10);
    g.drawImage(s, 0, 0, W, H);
    drawn = true;
  }
  if (!drawn) {
    const gg = g.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, '#1a1a2e'); gg.addColorStop(1, '#0f3d2e');
    g.fillStyle = gg; g.fillRect(0, 0, W, H);
  }

  // velo scuro per leggere il testo
  const ov = g.createLinearGradient(0, 0, W, 0);
  ov.addColorStop(0, 'rgba(0,0,0,0.55)'); ov.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = ov; g.fillRect(0, 0, W, H);

  // copertina con ombra
  const cx = 44, cy = 60, cs = 240;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
  rr(g, cx, cy, cs, cs, 22);
  g.fillStyle = '#222'; g.fill();
  g.restore();
  if (cov) {
    g.save();
    rr(g, cx, cy, cs, cs, 22); g.clip();
    cover(g, cov, cx, cy, cs, cs);
    g.restore();
  }

  const tx = 320, mw = 540;

  g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 10;
  g.fillStyle = '#1db954';
  g.beginPath(); g.arc(tx + 8, 74, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = 'bold 18px ZenoSans, sans-serif';
  g.fillText(badge, tx + 26, 80);

  // utente in alto a destra
  g.textAlign = 'right';
  g.font = '18px ZenoSans, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(fit(g, userName || '', 160), W - 100, 80);
  g.textAlign = 'left';
  if (avatarUrl) {
    try {
      const av = await C.loadImage(await download(avatarUrl));
      g.save();
      g.beginPath(); g.arc(W - 70, 70, 26, 0, Math.PI * 2); g.clip();
      g.drawImage(av, W - 96, 44, 52, 52);
      g.restore();
    } catch { /* ignora */ }
  }

  // testi
  g.fillStyle = '#fff';
  g.font = 'bold 44px ZenoSans, sans-serif';
  g.fillText(fit(g, title, mw), tx, 150);
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.font = '28px ZenoSans, sans-serif';
  g.fillText(fit(g, artist, mw), tx, 194);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = '22px ZenoSans, sans-serif';
  g.fillText(fit(g, album, mw), tx, 230);

  // barra di progresso
  if (total > 0) {
    const p = Math.min(1, Math.max(0, elapsed / total));
    const by = 276;
    rr(g, tx, by, mw, 10, 5); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fill();
    if (p > 0) { rr(g, tx, by, Math.max(10, mw * p), 10, 5); g.fillStyle = acc; g.fill(); }
    g.beginPath(); g.arc(tx + mw * p, by + 5, 9, 0, Math.PI * 2);
    g.fillStyle = '#fff'; g.fill();
    g.font = '20px ZenoSans, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(mmss(elapsed), tx, 322);
    g.textAlign = 'right';
    g.fillText(mmss(total), tx + mw, 322);
    g.textAlign = 'left';
  }

  // linea colore in basso
  g.fillStyle = acc;

  return { buffer: c.toBuffer('image/png'), color: (r << 16) | (gr << 8) | b };
}
