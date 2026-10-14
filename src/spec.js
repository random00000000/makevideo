// Spec normalization + validation. Errors are written for agents: they say what is wrong,
// where, and show the fix.
import fs from 'node:fs';
import path from 'node:path';
import { THEMES } from './themes.js';
import { VOICES, DEFAULT_VOICE } from './tts.js';

export const FORMATS = {
  landscape: [1920, 1080], '16:9': [1920, 1080],
  portrait: [1080, 1920], '9:16': [1080, 1920], shorts: [1080, 1920],
  square: [1080, 1080], '1:1': [1080, 1080],
  '720p': [1280, 720],
};

export const SCENE_TYPES = {
  title: { needs: ['title'], example: { type: 'title', title: 'Hacksilver', subtitle: 'What changed this week', say: 'Here is what changed this week.' } },
  bullets: { needs: ['items'], example: { type: 'bullets', title: 'Highlights', items: ['Faster pathing', 'New siege units'], say: 'Two highlights. Pathing is faster. And siege units are in.' } },
  steps: { needs: ['items'], example: { type: 'steps', title: 'How it works', items: ['Write a spec', 'Run makevideo'], say: 'First, write a spec. Then run makevideo.' } },
  decisions: { needs: ['items'], example: { type: 'decisions', title: 'Decisions for you', items: ['Ship Friday or wait?'], say: 'One decision for you: ship Friday, or wait.' } },
  image: { needs: ['src'], example: { type: 'image', src: 'screenshot.png', title: 'The new HUD', say: 'This is the new HUD.' } },
  clip: { needs: ['src'], example: { type: 'clip', src: 'gameplay.mp4', start: 2, title: 'Siege in action', say: 'Watch the ram breach the gate.' } },
  code: { needs: ['code'], example: { type: 'code', title: 'The fix', code: 'const x = 1;', highlight: [1], say: 'The fix is one line.' } },
  stat: { needs: ['value'], example: { type: 'stat', value: '42%', label: 'faster load times', say: 'Load times dropped forty two percent.' } },
  quote: { needs: ['text'], example: { type: 'quote', text: 'It finally feels fair.', by: 'Playtester', say: 'One playtester said it finally feels fair.' } },
  compare: { needs: ['left', 'right'], example: { type: 'compare', title: 'Before vs after', left: { title: 'Before', items: ['12 s load'] }, right: { title: 'After', items: ['3 s load'] }, say: 'Before, twelve seconds. After, three.' } },
  outro: { needs: ['title'], example: { type: 'outro', title: 'Thanks for watching', say: 'That is all for now.' } },
};

/** Built-in pronunciations so every video says common tech words the same way. */
export const DEFAULT_PRONOUNCE = {
  makevideo: 'make video', JSON: 'jason', ffmpeg: 'F F mpeg', npm: 'N P M', npx: 'N P X',
  GPU: 'G P U', CPU: 'C P U', API: 'A P I', TTS: 'T T S', MP4: 'M P 4', SRT: 'S R T', GIF: 'gif', GIFs: 'gifs',
};

export class SpecError extends Error {
  constructor(problems) {
    super('Invalid video spec:\n' + problems.map((p) => '  - ' + p).join('\n'));
    this.name = 'SpecError';
    this.problems = problems;
  }
}

const IMG = /\.(png|jpe?g|webp|bmp|avif)$/i;
const VID = /\.(mp4|webm|mov|mkv|m4v|avi|gif)$/i; // GIFs play as clips

export function normalize(input, { baseDir = process.cwd(), checkFiles = true } = {}) {
  const p = [];
  if (Array.isArray(input)) input = { scenes: input };
  if (!input || typeof input !== 'object') throw new SpecError(['Spec must be an object like { title, scenes: [...] }.']);
  const fmt = input.format ?? 'landscape';
  let [width, height] = FORMATS[fmt] || [];
  if (input.width && input.height) [width, height] = [input.width, input.height];
  if (!width) p.push(`format "${fmt}" is unknown. Use one of: ${Object.keys(FORMATS).join(', ')}.`);
  if (width % 2 || height % 2) p.push('width and height must be even numbers (H.264 requirement).');

  const theme = input.theme ?? 'midnight';
  if (typeof theme === 'string' && !THEMES[theme]) p.push(`theme "${theme}" is unknown. Use one of: ${Object.keys(THEMES).join(', ')}, or an object of overrides.`);
  const voice = input.voice ?? DEFAULT_VOICE;
  if (voice !== false && !VOICES[voice] && !/^[ab][fm]_\w+$/.test(voice)) p.push(`voice "${voice}" is unknown. Use one of: ${Object.keys(VOICES).join(', ')} (or false for no narration).`);

  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    p.push('scenes must be a non-empty array. Minimal example: { "scenes": [ { "type": "title", "title": "Hello", "say": "Hello there." } ] }');
  }
  const scenes = (input.scenes || []).map((raw, i) => {
    const s = { ...raw };
    const where = `scenes[${i}]`;
    if (!s.type) s.type = s.src ? (VID.test(s.src) ? 'clip' : 'image') : s.items ? 'bullets' : s.code ? 'code' : s.value != null ? 'stat' : 'title';
    const def = SCENE_TYPES[s.type];
    if (!def) { p.push(`${where}.type "${s.type}" is unknown. Use one of: ${Object.keys(SCENE_TYPES).join(', ')}.`); return s; }
    for (const k of def.needs) if (s[k] == null || s[k] === '') p.push(`${where} (${s.type}) is missing "${k}". Example: ${JSON.stringify(def.example)}`);
    if (s.items && !Array.isArray(s.items)) p.push(`${where}.items must be an array of strings.`);
    if (s.say != null && typeof s.say !== 'string' && !Array.isArray(s.say)) p.push(`${where}.say must be a string (or array of sentences).`);
    if (Array.isArray(s.say)) s.say = s.say.join(' ');
    if (!s.say && !s.duration) p.push(`${where} has no "say" (narration) and no "duration". Narration is the default in makevideo: add "say": "..." or set "duration": seconds for a silent beat.`);
    if (s.src) {
      s.srcPath = path.resolve(baseDir, s.src);
      if (checkFiles && !fs.existsSync(s.srcPath)) p.push(`${where}.src not found: ${s.srcPath}`);
      if (s.type === 'image' && !IMG.test(s.src)) p.push(`${where}.src should be a still image (png/jpg/webp). For video or GIF use type "clip".`);
      if (s.type === 'clip' && !VID.test(s.src)) p.push(`${where}.src should be a video or GIF (mp4/webm/mov/gif). For stills use type "image".`);
    }
    return s;
  });

  let music = null;
  if (input.music) {
    music = path.resolve(baseDir, input.music);
    if (checkFiles && !fs.existsSync(music)) p.push(`music not found: ${music}`);
  }
  const captionStyle = input.captionStyle ?? (height > width ? 'bold' : 'classic');
  if (!['classic', 'bold', 'none'].includes(captionStyle)) p.push(`captionStyle "${captionStyle}" is unknown. Use classic | bold | none.`);
  let font = input.font ?? null;
  if (font && /\.(ttf|otf|woff2?)$/i.test(font)) {
    font = path.resolve(baseDir, font);
    if (checkFiles && !fs.existsSync(font)) p.push(`font file not found: ${font}`);
  }
  if (p.length) throw new SpecError(p);

  return {
    title: input.title ?? scenes.find((s) => s.title)?.title ?? 'video',
    output: path.resolve(baseDir, input.output ?? slug(input.title ?? 'video') + '.mp4'),
    width, height,
    fps: input.fps ?? 30,
    theme, voice,
    speed: input.speed ?? 1,
    brand: input.brand ?? null,
    captions: (input.captions ?? true) && captionStyle !== 'none',
    captionStyle,
    font,
    gif: input.gif ?? false,
    progressBar: input.progressBar ?? true,
    music, musicVolume: input.musicVolume ?? 0.12,
    pronounce: { ...DEFAULT_PRONOUNCE, ...(input.pronounce ?? {}) },
    padBefore: input.padBefore ?? 0.35,
    padAfter: input.padAfter ?? 0.55,
    gap: input.sentenceGap ?? 0.18,
    quality: input.quality ?? 'standard',
    encoderThreads: input.encoderThreads ?? Number(process.env.MAKEVIDEO_THREADS || 4),
    scenes,
  };
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video';
}

/** Split narration into sentences; each is synthesized separately so we know exact timings. */
export function sentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<!(?:e\.g|i\.e|vs|etc|Mr|Mrs|Ms|Dr|St|No)\.)(?<=[.!?…])\s+(?=[\p{L}0-9"'“(])/u)
    .flatMap((s) => (s.length > 280 ? s.split(/(?<=[,;:])\s+/) : [s]))
    .filter(Boolean);
}

/** Apply the pronunciation dictionary to text sent to the voice (captions keep the original). */
export function forSpeech(text, pronounce) {
  let out = text;
  for (const [word, say] of Object.entries(pronounce)) {
    out = out.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), say);
  }
  return out;
}

/** Break each spoken sentence into caption cues of <= ~12 words, timed by character share. */
export function cuesFor(spoken, maxWords = 12) {
  const cues = [];
  for (const { text, start, end } of spoken) {
    const words = text.split(' ');
    const chunks = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.length >= maxWords || (cur.length >= Math.ceil(maxWords / 2) && /[,;:.!?]$/.test(w))) { chunks.push(cur.join(' ')); cur = []; }
    }
    if (cur.length) {
      if (cur.length < Math.min(3, maxWords / 2) && chunks.length) chunks[chunks.length - 1] += ' ' + cur.join(' ');
      else chunks.push(cur.join(' '));
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let t = start;
    for (const c of chunks) {
      const d = ((end - start) * c.length) / total;
      cues.push({ start: t, end: t + d, text: c });
      t += d;
    }
  }
  return cues;
}

/**
 * When does each list item appear? Synced to sentence starts:
 *  - one more sentence than items → the first sentence introduces, item i appears with sentence i+1
 *  - otherwise items spread across the sentences (or across the scene when there are fewer).
 */
export function revealTimes(n, spoken, dur, padBefore) {
  if (!n) return [];
  const starts = spoken.map((s) => s.start);
  if (starts.length >= n + 1) return Array.from({ length: n }, (_, i) => starts[i + 1]);
  if (starts.length === n) return starts.map((s, i) => (i === 0 ? Math.max(0.3, s) : s));
  const span = Math.max(dur - padBefore - 1, 0.5);
  return Array.from({ length: n }, (_, i) => padBefore + (span * i) / n);
}
