// Spec normalization + validation. Errors are written for agents: they say what is wrong,
// where, and show the fix.
import fs from 'node:fs';
import path from 'node:path';
import { THEMES } from './themes.js';
import { VOICES, DEFAULT_VOICE } from './tts.js';
import { TRANSITIONS } from './draw.js';
import { MOODS } from './music.js';

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
  statement: { needs: ['text'], example: { type: 'statement', text: 'Renders in *seconds*, not minutes.', say: 'It renders in seconds, not minutes.' } },
  chart: { needs: ['bars'], example: { type: 'chart', title: 'Render time', unit: ' s', bars: [{ label: 'Before', value: 160 }, { label: 'After', value: 35 }], say: 'Render time. Before, one hundred sixty seconds. After, thirty five.' } },
  split: { needs: ['src'], example: { type: 'split', src: 'screenshot.png', title: 'The new HUD', items: ['Cleaner', 'Faster to read'], say: 'The new HUD. It is cleaner. And faster to read.' } },
  chapter: { needs: ['title'], example: { type: 'chapter', number: 2, title: 'The Tyrant King', search: 'Tyrannosaurus rex skeleton', say: 'Chapter two. The tyrant king.' } },
  timeline: { needs: ['events'], example: { type: 'timeline', title: 'When it lived', events: [{ when: '68 Mya', label: 'T. rex appears' }, { when: '66 Mya', label: 'Asteroid impact' }], say: 'When it lived. It appears sixty eight million years ago. Two million years later, the asteroid hits.' } },
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

/**
 * Style presets: one word that sets the whole look and sound. Anything set in the spec wins.
 *   documentary: serif titles, warm palette, reflective score, slow crossfades (history channels)
 *   history:     documentary look with a war-drum score (battles, empires)
 *   nature:      green palette, open "wonder" score (science, dinosaurs, nature)
 */
export const STYLES = {
  documentary: { theme: 'documentary', music: 'documentary', musicVolume: 0.3, transition: 'fade', padAfter: 0.75, youtube: true },
  history: { theme: 'documentary', music: 'epic', musicVolume: 0.3, transition: 'fade', padAfter: 0.75, youtube: true },
  nature: { theme: 'nature', music: 'wonder', musicVolume: 0.3, transition: 'fade', padAfter: 0.75, youtube: true },
  explainer: {},
};

export function normalize(input, { baseDir = process.cwd(), checkFiles = true } = {}) {
  const p = [];
  if (Array.isArray(input)) input = { scenes: input };
  if (input && input.style) {
    if (!STYLES[input.style]) throw new SpecError([`style "${input.style}" is unknown. Use one of: ${Object.keys(STYLES).join(', ')}.`]);
    input = { ...STYLES[input.style], ...input };
  }
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
    if (s.search && !s.src && !s.type) s.type = 'image';
    if (!s.type) s.type = s.src ? (s.items || s.text ? 'split' : VID.test(s.src) ? 'clip' : 'image') : s.bars ? 'chart' : s.items ? 'bullets' : s.code ? 'code' : s.value != null ? 'stat' : s.text ? 'statement' : 'title';
    const def = SCENE_TYPES[s.type];
    if (!def) { p.push(`${where}.type "${s.type}" is unknown. Use one of: ${Object.keys(SCENE_TYPES).join(', ')}.`); return s; }
    for (const k of def.needs) if ((s[k] == null || s[k] === '') && !(k === 'src' && s.search)) p.push(`${where} (${s.type}) is missing "${k}". Example: ${JSON.stringify(def.example)}`);
    if (s.items && !Array.isArray(s.items)) p.push(`${where}.items must be an array of strings.`);
    if (s.say != null && typeof s.say !== 'string' && !Array.isArray(s.say)) p.push(`${where}.say must be a string (or array of sentences).`);
    if (Array.isArray(s.say)) s.say = s.say.join(' ');
    if (s.type === 'chapter' && s.number == null) s.number = undefined;
    if (!s.say && !s.duration) p.push(`${where} has no "say" (narration) and no "duration". Narration is the default in makevideo: add "say": "..." or set "duration": seconds for a silent beat.`);
    if (s.type === 'timeline' && s.events) {
      if (!Array.isArray(s.events)) p.push(`${where}.events must be an array like ${JSON.stringify(def.example.events)}`);
      else s.events = s.events.map((e) => (typeof e === 'string' ? { when: e.split(':')[0], label: e.split(':').slice(1).join(':').trim() } : e));
    }
    if (s.type === 'chart' && s.bars) {
      s.bars = Array.isArray(s.bars)
        ? s.bars.map((b) => (Array.isArray(b) ? { label: String(b[0]), value: Number(b[1]) } : { label: String(b.label), value: Number(b.value) }))
        : Object.entries(s.bars).map(([label, value]) => ({ label, value: Number(value) }));
      if (s.bars.some((b) => !Number.isFinite(b.value))) p.push(`${where}.bars values must be numbers. Example: ${JSON.stringify(def.example.bars)}`);
    }
    if (s.transition && !TRANSITIONS.includes(s.transition)) p.push(`${where}.transition "${s.transition}" is unknown. Use one of: ${TRANSITIONS.join(', ')}.`);
    if (s.search && !s.src) { /* resolved from Wikimedia Commons at render time */ }
    if (s.src) {
      s.srcPath = path.resolve(baseDir, s.src);
      if (checkFiles && !fs.existsSync(s.srcPath)) p.push(`${where}.src not found: ${s.srcPath}`);
      if ((s.type === 'image' || s.type === 'chapter') && !IMG.test(s.src)) p.push(`${where}.src should be a still image (png/jpg/webp). For video or GIF use type "clip".`);
      if (s.type === 'split' && !VID.test(s.src) && !IMG.test(s.src)) p.push(`${where}.src should be an image or a video.`);
      if (s.type === 'clip' && !VID.test(s.src)) p.push(`${where}.src should be a video or GIF (mp4/webm/mov/gif). For stills use type "image".`);
    }
    return s;
  });

  let music = null;
  if (input.music && MOODS[input.music]) music = input.music; // generated score
  else if (input.music) {
    music = path.resolve(baseDir, input.music);
    if (checkFiles && !fs.existsSync(music)) p.push(`music not found: ${music}. Use a file, or a generated mood: ${Object.keys(MOODS).join(', ')}.`);
  }
  if (input.transition && !TRANSITIONS.includes(input.transition)) p.push(`transition "${input.transition}" is unknown. Use one of: ${TRANSITIONS.join(', ')}.`);
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
    captions: (input.captions ?? true) !== false && captionStyle !== 'none',
    captionsAll: input.captions === 'all',
    captionStyle,
    font,
    gif: input.gif ?? false,
    transition: input.transition ?? 'auto',
    credit: input.credit ?? true,
    style: input.style ?? null,
    youtube: input.youtube ?? false,
    thumbnailText: input.thumbnailText ?? null,
    description: input.description ?? null,
    progressBar: input.progressBar ?? true,
    music, musicVolume: input.musicVolume ?? 0.12,
    pronounce: { ...DEFAULT_PRONOUNCE, ...(input.pronounce ?? {}) },
    padBefore: input.padBefore ?? 0.35,
    padAfter: input.padAfter ?? 0.55,
    gap: input.sentenceGap ?? 0.18,
    quality: input.quality ?? 'standard',
    encoderThreads: input.encoderThreads ?? Number(process.env.MAKEVIDEO_THREADS || 2), // measured: 2 beats 4 when several scenes encode at once
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
const SCALE = { k: 'thousand', K: 'thousand', m: 'million', M: 'million', b: 'billion', B: 'billion' };
/**
 * Make written text speakable, so agents can write naturally ("42%", "v1.2", "$3M", "4.6x")
 * and the voice still says it right. Captions keep the original text.
 */
export function speakable(text) {
  return String(text)
    .replace(/\bv(\d+(?:\.\d+)+)\b/g, (_, v) => 'version ' + v.split('.').join(' point '))
    .replace(/\$(\d[\d,]*(?:\.\d+)?)\s?([kKmMbB])\b/g, (_, n, s) => `${n} ${SCALE[s]} dollars`)
    .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/(\d)x\b/g, '$1 times')
    .replace(/(\d) ?ms\b/g, '$1 milliseconds')
    .replace(/(\d) s\b/g, '$1 seconds')
    .replace(/(\d) ?fps\b/gi, '$1 frames per second')
    .replace(/ & /g, ' and ')
    .replace(/\s*(?:->|\u2192)\s*/g, ' to ')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .replace(/\bvs\.?(?=\s)/gi, 'versus')
    .replace(/#(\d+)/g, 'number $1')
    .replace(/~\s?(\d)/g, 'about $1')
    .replace(/(\d),(\d{3})\b/g, '$1$2');
}

export function forSpeech(text, pronounce) {
  let out = speakable(text);
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

const LIST_TYPES = new Set(['bullets', 'steps', 'decisions']);
/**
 * Quality lint: things that make a video worse but not invalid. Each warning names the scene
 * and says what to do. `check()` and `video()` both report these.
 */
export function lint(spec) {
  const w = [];
  const words = (x) => String(x || '').split(/\s+/).filter(Boolean).length;
  spec.scenes.forEach((s, i) => {
    const where = `scenes[${i}] (${s.type})`;
    const n = words(s.say);
    if (n > 60) w.push(`${where}: narration is ${n} words (about ${Math.round(n / 2.5)} s on one slide). Split it into two scenes.`);
    if (LIST_TYPES.has(s.type) && s.items) {
      if (s.items.length > 6) w.push(`${where}: ${s.items.length} items. Keep lists to 6 or fewer; split the rest into another scene.`);
      const long = s.items.filter((it) => words(it) > 12);
      if (long.length) w.push(`${where}: ${long.length} item(s) over 12 words. Keep on-screen items short; put detail in "say".`);
      const ss = sentences(s.say).length;
      if (s.say && ss < s.items.length) w.push(`${where}: ${s.items.length} items but ${ss} sentence(s). Write one intro sentence plus one sentence per item so items appear with the voice.`);
    }
    if (s.title && words(s.title) > 10) w.push(`${where}: title is ${words(s.title)} words. Aim for 3 to 8.`);
    if (s.type === 'statement' && s.say) {
      const said = new Set(String(s.say).toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')));
      const big = String(s.text).toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 3);
      if (big.length && big.filter((w) => said.has(w)).length / big.length < 0.5) w.push(`${where}: the big text isn't in the narration, so its words can't land with the voice. Put the statement's words in "say".`);
    }
    if (s.type === 'statement' && words(s.text) > 14) w.push(`${where}: statement is ${words(s.text)} words. Statements hit hardest under 12 words.`);
    if (s.type === 'chart' && s.bars && s.bars.length > 8) w.push(`${where}: ${s.bars.length} bars. Use 8 or fewer.`);
    if (spec.height > spec.width && ['code', 'compare', 'chart'].includes(s.type)) w.push(`${where}: dense scene in a portrait video. Prefer statement, stat, clip or split for shorts.`);
    if (i >= 2 && spec.scenes[i - 1].type === s.type && spec.scenes[i - 2].type === s.type) w.push(`${where}: third ${s.type} scene in a row. Vary scene types (statement, stat, split, chart) to keep it moving.`);
  });
  const first = spec.scenes[0]?.type;
  if (first && !['title', 'statement', 'clip', 'stat', 'image', 'chapter'].includes(first)) w.push(`scenes[0] (${first}): open with a hook: a title, statement, stat, clip or full-bleed image.`);
  return w;
}
