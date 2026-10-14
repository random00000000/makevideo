import { createSpeaker } from './src/tts.js';
import { fromMarkdown } from './src/markdown.js';
import { sentences, forSpeech, DEFAULT_PRONOUNCE } from './src/spec.js';
import fs from 'fs';
const spec = fromMarkdown(fs.readFileSync('examples/whats-new-0.2.md', 'utf8'));
const ss = spec.scenes.flatMap((s) => sentences(s.say)).map((t) => forSpeech(t, DEFAULT_PRONOUNCE));
const workers = Number(process.argv[2]);
process.env.MAKEVIDEO_CACHE = process.env.TEMP + '/mv-bench-' + Date.now();
const sp = createSpeaker({ workers, threads: Number(process.argv[3] || 0) });
const t0 = Date.now();
await sp.speak('Warm up.');  // forces one model load
const tl = Date.now();
const outs = await Promise.all(ss.map((s) => sp.speak(s)));
const audio = outs.reduce((n, a) => n + a.length, 0) / 24000;
const t1 = Date.now();
console.log(`workers=${workers} threads=${process.argv[3]} sentences=${ss.length} audio=${audio.toFixed(1)}s firstLoad=${tl - t0}ms gen=${t1 - tl}ms rt=${(audio / ((t1 - tl) / 1000)).toFixed(2)}x`);
sp.close();
