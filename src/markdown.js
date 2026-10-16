// Markdown → video spec. Agents already write Markdown; this makes a .md file a video.
//
//   ---                      optional front matter: any top-level spec key
//   theme: forge
//   ---
//   # Title                  → title scene (the next plain line is the subtitle)
//   ## Heading               → a new scene; its body decides the type:
//   - item / 1. item         →   bullets / steps ("Decisions" heading → decisions)
//   - Label: 42 unit         →   chart, when every item is "label: number"
//   ![alt](file.png|.mp4)    →   image / clip, or split when there are items too
//   ```code```               →   code
//   **42%** label            →   stat
//   plain paragraph          →   statement (use *stars* for accent words)
//   > spoken line            → narration for the scene. Without it, the visible text is read.
//   <!-- transition: slide --> scene options as key: value pairs
//   ![a T. rex skull]()      → stock image: searches Wikimedia Commons for the alt text
//   ## Chapter: The Hunt     → chapter card (numbered automatically)
//   ## Timeline + "- When: what" items → timeline

const VID = /\.(mp4|webm|mov|mkv|m4v|avi|gif)$/i;

export function fromMarkdown(md) {
  const spec = { scenes: [] };
  let text = String(md).replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (m) spec[m[1]] = parseValue(m[2]);
    }
    text = text.slice(fm[0].length);
  }
  const blocks = [];
  let cur = null;
  let inCode = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (!cur) blocks.push((cur = { level: 2, heading: '', lines: [] }));
      inCode = !inCode;
      cur.lines.push(line);
      continue;
    }
    const h = !inCode && /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) blocks.push((cur = { level: h[1].length, heading: h[2].trim(), lines: [] }));
    else {
      if (!cur) blocks.push((cur = { level: 2, heading: '', lines: [] }));
      cur.lines.push(line);
    }
  }
  for (const b of blocks) {
    const scene = toScene(b);
    if (scene) spec.scenes.push(scene);
  }
  if (!spec.title) spec.title = spec.scenes.find((s) => s.title)?.title;
  return spec;
}

function toScene({ level, heading, lines }) {
  const say = [];
  const items = [];
  const paras = [];
  const opts = {};
  let code = null, lang = '', media = null, stat = null, inCode = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (inCode) inCode = false;
      else { inCode = true; code = []; lang = line.slice(3).trim(); }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    const t = line.trim();
    if (!t || t === '---') continue;
    let m;
    if ((m = /^<!--\s*(.*?)\s*-->$/.exec(t))) {
      for (const kv of m[1].split(/,\s*/)) {
        const [k, ...v] = kv.split(':');
        if (k && v.length) opts[k.trim()] = parseValue(v.join(':').trim());
      }
    } else if (t.startsWith('>')) say.push(t.replace(/^>\s?/, ''));
    else if ((m = /^!\[(.*?)\]\((.*?)\)/.exec(t))) media = /^(|search)$/i.test(m[2].trim()) ? { alt: m[1], search: m[1] } : { alt: m[1], src: m[2] };
    else if ((m = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(t))) items.push({ text: m[1], ordered: /^\d/.test(t) });
    else if ((m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(t)) && !paras.length && !items.length) stat = { value: m[1], label: m[2] };
    else paras.push(t);
  }
  const s = {};
  const title = heading || undefined;
  const para = paras.join(' ');
  const bars = items.map((it) => /^(.+?):\s*(-?[\d.,]+)\s*(.*)$/.exec(it.text));
  const mediaRef = media ? (media.search ? { search: media.search } : { src: media.src }) : {};
  const chapterM = /^chapter\b[\s\d.:–-]*(.*)$/i.exec(heading || '');
  if (chapterM && level >= 2) {
    Object.assign(s, { type: 'chapter', title: chapterM[1].trim() || heading, subtitle: para || undefined, ...mediaRef });
  } else if (/timeline/i.test(heading || '') && items.length && items.every((i) => i.text.includes(':'))) {
    Object.assign(s, { type: 'timeline', title, events: items.map((i) => ({ when: i.text.split(':')[0].trim(), label: i.text.split(':').slice(1).join(':').trim() })) });
  } else if (level === 1 && !media && !items.length && !code) {
    Object.assign(s, { type: 'title', title, subtitle: para || undefined });
  } else if (code) {
    Object.assign(s, { type: 'code', title, code: code.join('\n'), lang });
  } else if (media && items.length) {
    Object.assign(s, { type: 'split', ...mediaRef, title, items: items.map((i) => i.text) });
  } else if (media) {
    Object.assign(s, { type: media.src && VID.test(media.src) ? 'clip' : 'image', ...mediaRef, title, subtitle: para || undefined });
  } else if (items.length && bars.every(Boolean)) {
    const unit = bars[0][3] ? ' ' + bars[0][3] : '';
    Object.assign(s, { type: 'chart', title, unit, bars: bars.map((b) => ({ label: b[1], value: Number(b[2].replace(/,/g, '')) })) });
  } else if (items.length) {
    const type = /decision/i.test(heading) ? 'decisions' : items.every((i) => i.ordered) ? 'steps' : 'bullets';
    Object.assign(s, { type, title, items: items.map((i) => i.text) });
  } else if (stat) {
    Object.assign(s, { type: 'stat', value: stat.value, label: stat.label || para || title }); // a paragraph under **value** is its label
  } else if (para) {
    Object.assign(s, { type: 'statement', text: para, kicker: title });
  } else if (title) {
    Object.assign(s, { type: 'title', title });
  } else return null;
  s.say = say.length ? say.join(' ') : autoSay(s);
  Object.assign(s, opts);
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
  return s;
}

/** Narration is the default: with no "> line", read the visible text as sentences. */
function autoSay(s) {
  const sentence = (x) => { x = String(x).replace(/\*/g, '').trim(); return x && !/[.!?]$/.test(x) ? x + '.' : x; };
  const parts = [];
  if (s.type === 'statement') parts.push(s.text);
  else if (s.type === 'stat') parts.push(`${s.value} ${s.label || ''}`);
  else {
    if (s.title) parts.push(s.title);
    if (s.subtitle) parts.push(s.subtitle);
    if (s.text) parts.push(s.text);
    for (const it of s.items || []) parts.push(it);
    for (const b of s.bars || []) parts.push(`${b.label}: ${b.value}${s.unit || ''}`);
  }
  return parts.map(sentence).filter(Boolean).join(' ');
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^["']|["']$/g, '');
}
