// Stock media for documentaries: search Wikimedia Commons for freely licensed images,
// download them once (cached), and keep the attribution every license requires.
// A scene asks with `search: "Tyrannosaurus skull"` instead of `src`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir } from './tts.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'makevideo/0.5 (https://github.com/random00000000/makevideo)'; // Wikimedia asks for a descriptive UA
// Publish-safe licenses only. Everything else (GFDL-only, unclear, fair use) is skipped.
const OK_LICENSE = /^(cc0|public domain|pd\b|pdm|no restrictions|cc by(-sa)? \d(\.\d)?)/i;

const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Search Commons; returns candidates sorted best-first. */
export async function searchCommons(query, { orientation = 'landscape', limit = 12 } = {}) {
  const url = `${API}?${new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: String(limit),
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '1920',
    iiextmetadatafilter: 'LicenseShortName|Artist|AttributionRequired|ObjectName|Credit',
  })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikimedia Commons search failed: HTTP ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages || {});
  const out = [];
  for (const p of pages) {
    const i = p.imageinfo?.[0];
    if (!i || !/^image\/(jpeg|png|webp)$/.test(i.mime)) continue;
    const m = i.extmetadata || {};
    const license = strip(m.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) continue;
    if (i.width < 1000) continue; // too small for 1080p
    const ratio = i.width / i.height;
    const fits = orientation === 'portrait' ? ratio < 1 : ratio >= 1.15;
    out.push({
      title: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      page: i.descriptionurl, url: i.thumburl || i.url, width: i.width, height: i.height,
      license, author: strip(m.Artist?.value) || 'Unknown author',
      score: (fits ? 2 : 0) + (/cc0|public domain|pd\b|pdm/i.test(license) ? 0.5 : 0) + Math.min(i.width / 4000, 1) - (p.index ?? 0) * 0.08,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

async function download(url, file) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`image download failed (${res.status}): ${url}`);
  fs.writeFileSync(file + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(file + '.part', file);
  return file;
}

/**
 * Resolve every `search:` scene to a downloaded, licensed image. Mutates scenes (sets `src`),
 * returns the credits list. Never uses the same file twice in one video.
 */
export async function resolveMedia(input, { log = () => {}, portrait = false } = {}) {
  const credits = [];
  const used = new Set();
  const dir = path.join(cacheDir(), 'media');
  const cache = path.join(dir, 'search.json');
  let memo = {};
  try { memo = JSON.parse(fs.readFileSync(cache, 'utf8')); } catch {}
  for (const s of input.scenes || []) {
    if (!s.search || s.src) continue;
    const key = `${s.search}|${portrait ? 'p' : 'l'}`;
    let found = memo[key];
    if (!found || !found.some((c) => !used.has(c.page))) {
      // forgiving search: drop words from the end until something licensed turns up
      const words = String(s.search).split(/\s+/);
      found = found || [];
      for (let n = words.length; n >= Math.min(2, words.length); n--) {
        const q = words.slice(0, n).join(' ');
        log(`searching Wikimedia Commons: ${q}`);
        found = found.concat(await searchCommons(q, { orientation: portrait ? 'portrait' : 'landscape' }));
        if (found.some((c) => !used.has(c.page))) break;
      }
      memo[key] = found;
    }
    const pick = found.find((c) => !used.has(c.page));
    if (!pick) throw new Error(`No freely licensed image found on Wikimedia Commons for "${s.search}". Try a broader search, or set "src" to your own image.`);
    used.add(pick.page);
    const file = path.join(dir, createHash('sha1').update(pick.url).digest('hex').slice(0, 16) + path.extname(new URL(pick.url).pathname).toLowerCase().replace('.jpeg', '.jpg'));
    await download(pick.url, file);
    s.src = file;
    s.credit = s.credit ?? `${pick.author} · ${pick.license}`;
    // does the picked file look like what was asked for? (shared words between query and title)
    const words = (x) => new Set(String(x).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    const q = words(s.search), t = words(pick.title);
    const match = [...q].some((w) => [...t].some((v) => v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5))));
    credits.push({ search: s.search, title: pick.title, author: pick.author, license: pick.license, url: pick.page, match });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(memo));
  return credits;
}
