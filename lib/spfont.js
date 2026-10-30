import fs from 'node:fs';
import path from 'node:path';

const C = await import('@napi-rs/canvas').catch(() => null);

function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1, out);
    else if (/\.(ttf|otf)$/i.test(e.name)) out.push(p);
  }
  return out;
}

if (C?.GlobalFonts) {
  const dirs = [
    path.join(process.cwd(), 'data', 'fonts'),
    '/system/fonts',
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    process.env.PREFIX ? path.join(process.env.PREFIX, 'share', 'fonts') : null,
  ].filter(Boolean);

  const files = dirs.flatMap((d) => walk(d)).filter((f) => !/italic|oblique|mono|condensed/i.test(path.basename(f)));
  const pick = (res) => {
    for (const re of res) {
      const f = files.find((x) => re.test(path.basename(x)));
      if (f) return f;
    }
    return null;
  };

  const reg = pick([/^Inter.*Regular/i, /^Roboto-Regular/i, /^RobotoStatic-Regular/i, /^NotoSans-Regular/i,
    /^OpenSans-Regular/i, /^DejaVuSans\.ttf$/i, /^DroidSans\.ttf$/i, /^LiberationSans-Regular/i, /^Roboto/i, /Regular\.(ttf|otf)$/i]);
  const bold = pick([/^Inter.*Bold/i, /^Roboto-Bold/i, /^RobotoStatic-Bold/i, /^NotoSans-Bold/i,
    /^OpenSans-Bold/i, /^DejaVuSans-Bold/i, /^DroidSans-Bold/i, /^LiberationSans-Bold/i, /Bold\.(ttf|otf)$/i]);

  if (reg) C.GlobalFonts.registerFromPath(reg, 'ZenoSans');
  if (bold) C.GlobalFonts.registerFromPath(bold, 'ZenoSans');
  if (reg || bold) console.log('[spcard] font:', reg, bold);
  else console.warn('[spcard] nessun font trovato: metti un file .ttf dentro data/fonts/');
}
