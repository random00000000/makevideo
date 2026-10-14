// Smoke test: validation messages, frame planning, and a silent render of every card scene type.
// No TTS (voice: false), so it runs in seconds and offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { video, check, preview, SCENE_TYPES } from '../src/index.js';
import { sentences } from '../src/spec.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-test-'));
const media = path.resolve('examples/media');

// validation is agent-readable
const bad = check({ scenes: [{ type: 'clip' }, { type: 'nope', say: 'x' }, { type: 'title', title: 'x' }] });
assert.equal(bad.ok, false);
assert.match(bad.problems.join('\n'), /scenes\[0\] \(clip\) is missing "src"\. Example:/);
assert.match(bad.problems.join('\n'), /scenes\[1\]\.type "nope" is unknown/);
assert.match(bad.problems.join('\n'), /scenes\[2\] has no "say"/);

assert.deepEqual(sentences('One. two, e.g. three! Four?'), ['One.', 'two, e.g. three!', 'Four?']);

const scenes = Object.entries(SCENE_TYPES).map(([type, def]) => {
  const s = { ...def.example, duration: 1.5 };
  delete s.say;
  if (type === 'image') s.src = path.join(media, 'sample-image.jpg');
  if (type === 'clip') s.src = path.join(media, 'sample.gif');
  return s;
});
const spec = { title: 'smoke', voice: false, format: '720p', quality: 'draft', output: path.join(dir, 'smoke.mp4'), gif: { width: 160 }, scenes };
assert.equal(check(spec).ok, true);
const t0 = Date.now();
const p = await preview(spec);
assert.ok(fs.statSync(p.output).size > 10000);
const r = await video(spec);
assert.ok(fs.statSync(r.output).size > 10000, 'mp4 written');
assert.ok(fs.existsSync(r.srt) && fs.existsSync(r.report) && fs.existsSync(r.gif));
assert.equal(r.scenes.length, scenes.length);
assert.ok(Math.abs(r.duration - scenes.length * 1.5) < 0.2, 'durations add up: ' + r.duration);
console.log(`ok: ${scenes.length} scene types, ${r.duration}s silent video in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
fs.rmSync(dir, { recursive: true, force: true });
