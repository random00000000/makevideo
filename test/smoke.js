// Smoke test: validation, lint, speech cleanup, markdown, frame planning, and a silent render
// of every scene type with transitions. No TTS (voice: false), so it runs in seconds, offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { video, check, preview, SCENE_TYPES, speakable, fromMarkdown } from '../src/index.js';
import { sentences, normalize } from '../src/spec.js';
import { DEFAULT_VOICE } from '../src/tts.js';

// The house voice is af_heart (warm female). It is the product's identity: never change it silently.
assert.equal(DEFAULT_VOICE, 'af_heart');
assert.equal(normalize({ scenes: [{ title: 'x', say: 'y' }] }, { checkFiles: false }).voice, 'af_heart');
assert.equal(normalize(fromMarkdown('# Hi\n> Hello.'), { checkFiles: false }).voice, 'af_heart');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-test-'));
const media = path.resolve('examples/media');

// validation is agent-readable
const bad = check({ scenes: [{ type: 'clip' }, { type: 'nope', say: 'x' }, { type: 'title', title: 'x' }] });
assert.equal(bad.ok, false);
assert.match(bad.problems.join('\n'), /scenes\[0\] \(clip\) is missing "src"\. Example:/);
assert.match(bad.problems.join('\n'), /scenes\[1\]\.type "nope" is unknown/);
assert.match(bad.problems.join('\n'), /scenes\[2\] has no "say"/);
assert.match(check({ transition: 'spin', scenes: [{ title: 'x', say: 'y' }] }).problems[0], /transition "spin" is unknown/);

// lint suggests, never blocks
const loud = check({ scenes: [{ type: 'bullets', items: ['a', 'b', 'c'], say: 'Only one sentence.' }] });
assert.ok(loud.ok && loud.warnings.some((w) => /one sentence per item/.test(w)) && loud.warnings.some((w) => /open with a hook/.test(w)));

assert.deepEqual(sentences('One. two, e.g. three! Four?'), ['One.', 'two, e.g. three!', 'Four?']);
assert.equal(speakable('v1.2 is 4.6x faster, 42% less, $3M'), 'version 1 point 2 is 4.6 times faster, 42 percent less, 3 million dollars');

const md = fromMarkdown('---\ntheme: forge\n---\n# Hi\nSub\n## Speed\n- Before: 160 s\n- After: 35 s\n## Wow\nIt is *fast*.\n## Do\n1. One\n2. Two\n> First one. Then two.\n');
assert.deepEqual(md.scenes.map((s) => s.type), ['title', 'chart', 'statement', 'steps']);
assert.equal(md.theme, 'forge');
assert.equal(md.scenes[3].say, 'First one. Then two.');

// documentary layer: style presets, markdown chapters/timelines/search, YouTube chapters
const doc = fromMarkdown('---\nstyle: nature\n---\n## Chapter: The Hunt\n![a skull]()\n> Hunt.\n## Timeline\n- 68 Mya: appears\n- 66 Mya: gone\n> Two. One. Two.\n## Bones\n![bones]()\nBig\n> Bones.');
assert.deepEqual(doc.scenes.map((s) => s.type), ['chapter', 'timeline', 'image']);
assert.equal(doc.scenes[0].search, 'a skull');
const ns = normalize({ ...doc, scenes: doc.scenes.map((s) => ({ ...s, search: undefined, src: path.join(media, 'sample-image.jpg') })) }, { checkFiles: false });
assert.equal(ns.theme, 'nature'); assert.equal(ns.music, 'wonder'); assert.equal(ns.youtube, true); assert.equal(ns.voice, 'af_heart');
const { chapters } = await import('../src/youtube.js');
assert.deepEqual(chapters([{ offset: 0, scene: {} }, { offset: 12, scene: { type: 'chapter', title: 'A' } }, { offset: 30, scene: { type: 'chapter', title: 'B' } }]).map((c) => c.label), ['Intro', 'A', 'B']);

// cohesion: big words land when spoken; captions never duplicate on-screen text
const { syncTokens, dedupeCues } = await import('../src/sync.js');
const said = [{ text: 'And the famous tiny arms? About a meter long.', start: 0.35, end: 3 }, { text: 'Yet each arm could curl two hundred kilograms.', start: 3.2, end: 6 }];
const tt = syncTokens('Those tiny arms could curl 200 kilograms.'.split(' '), said, 0.35);
assert.ok(tt[1] < 1.5 && tt[3] > 3.2 && tt[6] > tt[5] && tt[5] > tt[4], 'statement words follow the voice: ' + tt.map((t) => t.toFixed(2)));
assert.deepEqual(dedupeCues([{ text: 'Chapter one.' }, { text: 'Discovery.' }, { text: 'In 1902 Barnum Brown dug it up.' }], { type: 'chapter', title: 'Discovery' }).map((c) => c.text), ['In 1902 Barnum Brown dug it up.']);
assert.deepEqual(dedupeCues([{ text: 'Builds are faster.' }, { text: 'Three things changed.' }], { type: 'bullets', title: 'What changed', items: ['Faster builds'] }).map((c) => c.text), ['Three things changed.']);

const scenes = Object.entries(SCENE_TYPES).map(([type, def]) => {
  const s = { ...def.example, duration: 1.5 };
  delete s.say;
  if (type === 'image' || type === 'split' || type === 'chapter') { s.src = path.join(media, 'sample-image.jpg'); delete s.search; }
  if (type === 'clip') s.src = path.join(media, 'sample.gif');
  return s;
});
scenes.push({ type: 'split', side: 'left', src: path.join(media, 'sample-clip.mp4'), title: 'Video split', items: ['One', 'Two'], duration: 1.5, transition: 'slide' });
const spec = { title: 'smoke', voice: false, format: '720p', quality: 'draft', output: path.join(dir, 'smoke.mp4'), gif: { width: 160 }, scenes };
assert.equal(check(spec).ok, true, JSON.stringify(check(spec).problems));
const t0 = Date.now();
const p = await preview(spec);
assert.ok(fs.statSync(p.output).size > 10000);
const r = await video(spec);
assert.ok(fs.statSync(r.output).size > 10000, 'mp4 written');
assert.ok(fs.existsSync(r.srt) && fs.existsSync(r.report) && fs.existsSync(r.gif));
assert.equal(r.scenes.length, scenes.length);
assert.ok(Math.abs(r.duration - scenes.length * 1.5) < 0.2, 'durations add up: ' + r.duration);
console.log(`ok: ${scenes.length} scenes (${Object.keys(SCENE_TYPES).length} types), ${r.duration}s silent video in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
fs.rmSync(dir, { recursive: true, force: true });

// every `init --style` starter is a valid, lint-clean video
const { STARTERS } = await import('../src/starters.js');
for (const [name, md] of Object.entries(STARTERS)) {
  const r = check(fromMarkdown(md));
  assert.ok(r.ok, `${name} starter: ${JSON.stringify(r.problems)}`);
  const warnings = r.warnings.filter((w) => !/not been filmed/.test(w)); // trailer shots are filmed later
  assert.deepEqual(warnings, [], `${name} starter has lint warnings: ${warnings}`);
}
console.log(`ok: ${Object.keys(STARTERS).length} starters valid and lint-clean`);

// trailer mode: beat sheet parsing, beat-grid layout, lint, and the injected Electron script
{
  const { layoutOnBeats, lintTrailer, shapeScenes, atempoChain } = await import('../src/trailer.js');
  const { createRequire } = await import('node:module');
  const md = fs.readFileSync(new URL('../examples/game/trailer.md', import.meta.url), 'utf8');
  const spec = fromMarkdown(md);
  assert.equal(spec.style, 'trailer');
  const types = spec.scenes.map((s) => s.type).join(',');
  assert.equal(types, 'clip,slam,clip,slam,clip,clip,clip,clip,clip,clip,logo,cta');
  assert.equal(spec.scenes[0].shot.camera, 'orbit hero 12 3 20 80');
  assert.match(spec.scenes[9].shot.setup, /game\.explode/);
  assert.equal(spec.scenes[0].src, 'shots/calm-open.mp4');

  // every cut lands within half a frame of its beat
  const scenes = shapeScenes([{ type: 'clip', beats: 3 }, { type: 'slam', text: 'GO' }, { type: 'cta' }]);
  const beat = 60 / 113, map = { beats: Array.from({ length: 40 }, (_, i) => i * beat), hits: [3 * beat] };
  const lay = layoutOnBeats(scenes, map, 30);
  [0, 3, 5].forEach((b, i) => assert.ok(Math.abs(lay[i].start - b * beat) <= 0.5 / 30 + 1e-9, `cut ${i} off beat`));
  assert.equal(lay[1].onHit, true);
  for (let i = 0; i < lay.length - 1; i++) assert.equal(Math.round(lay[i].start * 30) + lay[i].frames, Math.round(lay[i + 1].start * 30));

  // lint catches the classic mistakes
  const bad = { fps: 30, scenes: [{ type: 'logo' }, { type: 'slam', text: 'a b c d e f g h' }, { type: 'clip' }] };
  const w = lintTrailer(bad, [{ start: 0, frames: 200 }, { start: 6.7, frames: 30 }, { start: 7.7, frames: 30 }]).join('\n');
  for (const k of ['before any gameplay', 'before 5 s', 'call to action', 'words']) assert.ok(w.includes(k), `lint should flag: ${k}`);
  assert.equal(atempoChain(0.25), 'atempo=0.5,atempo=0.5,');

  // check() works before shooting: unfilmed shots are suggestions, not errors
  const c = check({ ...spec, scenes: spec.scenes.map((s) => (s.type === 'clip' ? { ...s, src: 'shots/never-filmed.mp4' } : s)) });
  assert.ok(c.ok && c.unfilmed === 8, JSON.stringify(c));

  // the script injected into the game parses
  const { RENDERER } = createRequire(import.meta.url)('../src/electron.cjs');
  new Function(RENDERER);
  console.log('ok: trailer beat sheet, beat grid, lint, check, electron script');
}
