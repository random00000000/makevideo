// Bundled fonts (SIL Open Font License, see fonts/): every machine renders the same,
// including bare cloud Linux boxes whose only system font is DejaVu Sans.
import { GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
let done = false;
export function registerBundledFonts() {
  if (done) return;
  done = true;
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.ttf')) GlobalFonts.registerFromPath(path.join(dir, f));
}
registerBundledFonts();
