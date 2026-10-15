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
