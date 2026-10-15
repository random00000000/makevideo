// Text/voice cohesion: on-screen words appear when they are spoken, and captions never
// repeat what the screen already shows.

/** Normalized word for matching: lowercase letters/digits, plural "s" dropped ("arms" == "arm"). */
export const norm = (w) => {
  const n = String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
  return n.length > 3 && n.endsWith('s') && !n.endsWith('ss') ? n.slice(0, -1) : n;
};
const STOP = new Set('the and are for with that this its was were has have but not you your our from into now than then they them there what when which who how all any can will just also about more most very only one'.split(' '));
const content = (w) => (w.length >= 3 && !STOP.has(w)) || /^\d+$/.test(w);

/** Every spoken word with its estimated start time (character-weighted within each sentence). */
export function spokenWords(spoken) {
  const out = [];
  for (const sp of spoken) {
    if (!sp.text) continue;
    const words = String(sp.text).split(/\s+/).filter(Boolean);
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    let acc = 0;
    for (const w of words) {
      out.push({ w: norm(w), t: sp.start + ((sp.end - sp.start) * acc) / total });
      acc += w.length + 1;
    }
  }
  return out;
}

/**
 * When should each on-screen token appear? At the moment the narrator says it.
 * Tokens are matched in order against the spoken words; tokens that are not spoken
 * (e.g. "200" read as "two hundred") are interpolated between their neighbours.
 * If nothing matches, the line lands as one beat on the first spoken word.
 */
export function syncTokens(tokens, spoken, fallbackStart) {
  const stream = spokenWords(spoken);
  const times = new Array(tokens.length).fill(undefined);
  let j = 0;
  tokens.forEach((tok, i) => {
    const n = norm(tok);
    if (!n) return;
    for (let k = j; k < Math.min(stream.length, j + 40); k++) {
      if (stream[k].w === n) { times[i] = stream[k].t; j = k + 1; return; }
    }
  });
  const known = times.map((t, i) => (t === undefined ? -1 : i)).filter((i) => i >= 0);
  const first = stream.length ? stream[0].t : fallbackStart;
  if (!known.length) return tokens.map((_, i) => first + i * 0.06); // one confident beat, slight cascade
  for (let i = 0; i < tokens.length; i++) {
    if (times[i] !== undefined) continue;
    const prev = known.filter((k) => k < i).pop(), next = known.find((k) => k > i);
    if (prev === undefined) times[i] = Math.max(first, times[next] - (next - i) * 0.18);
    else if (next === undefined) times[i] = times[prev] + (i - prev) * 0.18;
    else times[i] = times[prev] + ((times[next] - times[prev]) * (i - prev)) / (next - prev);
  }
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1]); // never out of order
  return times;
}

const NUMBER_WORDS = 'one two three four five six seven eight nine ten eleven twelve';

/** All the words a viewer can read in this scene (titles, big text, items, labels). */
export function visibleWords(s) {
  const parts = [s.title, s.subtitle, s.kicker, s.text, s.value, s.label, s.by, ...(s.items || [])];
  for (const b of s.bars || []) parts.push(b.label, b.value);
  for (const e of s.events || []) parts.push(e.when, e.label);
  for (const side of [s.left, s.right]) if (side) parts.push(side.title, ...(side.items || []));
  if (s.type === 'chapter') parts.push('chapter', NUMBER_WORDS);
  return new Set(parts.filter((p) => p != null).join(' ').split(/\s+/).map(norm).filter(Boolean));
}

/**
 * Drop on-screen caption cues whose words are already displayed (>= 60% of their content
 * words). The .srt keeps every line; this only removes visual duplication.
 */
export function dedupeCues(cues, scene) {
  const seen = visibleWords(scene);
  if (!seen.size) return cues;
  return cues.filter((c) => {
    const words = c.text.split(/\s+/).map(norm).filter(content);
    if (!words.length) return true;
    const shown = words.filter((w) => seen.has(w)).length;
    return shown / words.length < 0.6;
  });
}
