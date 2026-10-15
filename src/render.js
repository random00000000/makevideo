// Scene rendering: layout, frame planning, drawing, and the per-scene ffmpeg encode.
// Runs inside render worker processes (src/render-worker.js) so drawing uses many cores.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { cuesFor, revealTimes } from './spec.js';
import { drawFrame, makeLayout, wordTimes, isVideoScene, splitRect } from './draw.js';

export const FFMPEG = process.env.MAKEVIDEO_FFMPEG || ffmpegPath;

const QUALITY = {
  draft: ['-preset', 'ultrafast', '-crf', '28'],
  standard: ['-preset', 'veryfast', '-crf', '20'],
  high: ['-preset', 'medium', '-crf', '17'],
};

export async function sceneLayout(spec, tl) {
  const s = tl.scene;
  const assets = {};
  if (s.srcPath && (s.type === 'image' || s.type === 'chapter' || (s.type === 'split' && !isVideoScene(s)))) assets.image = await loadImage(fs.readFileSync(s.srcPath));
  let reveals, revealLen = 0.65;
  if (s.type === 'statement') {
    // words pop in at a speaking rhythm across the first ~70% of the narration
    const nW = String(s.text).split(/\s+/).filter(Boolean).length;
    const speechEnd = tl.spoken.length ? tl.spoken[tl.spoken.length - 1].end : tl.dur;
    const step = Math.min(0.3, Math.max(0.1, ((speechEnd - spec.padBefore) * 0.7) / nW));
    reveals = Array.from({ length: nW }, (_, i) => spec.padBefore * 0.6 + i * step);
    revealLen = 0.35;
  } else {
    const n = s.type === 'compare' ? 2 : s.type === 'timeline' ? s.events.length : s.type === 'chart' ? s.bars.length : s.items?.length || (s.type === 'split' && s.text ? 1 : 0);
    reveals = revealTimes(n, tl.spoken, tl.dur, spec.padBefore);
    if (s.type === 'chart') revealLen = 1.0;
  }
  return makeLayout(spec, s, {
    dur: tl.dur, index: tl.index ?? 0, count: tl.count ?? 1, assets, reveals, revealLen,
    transition: tl.transition ?? 'none', prevFrame: tl.prevFrame ?? null, nextDip: tl.nextDip ?? false,
    cues: cuesFor(tl.spoken.filter((x) => x.text), spec.captionStyle === 'bold' ? 4 : 12),
  });
}

export async function stillFor(spec, tl, t, tmp, extra = {}) {
  const L = { ...(await sceneLayout(spec, tl)), ...extra };
  const canvas = createCanvas(spec.width, spec.height);
  const ctx = canvas.getContext('2d');
  if (isVideoScene(tl.scene)) {
    const png = path.join(tmp, `v${tl.index ?? 0}-${Math.round(t * 1000)}.png`);
    const len = await mediaDuration(tl.scene.srcPath);
    const at = len ? ((tl.scene.start || 0) + t) % len : (tl.scene.start || 0) + t;
    await run(FFMPEG, ['-y', '-ss', at.toFixed(3), '-i', tl.scene.srcPath, '-frames:v', '1',
      '-vf', videoFilter(tl.scene, L, spec.width, spec.height), png]);
    const bg = await loadImage(fs.readFileSync(png));
    const over = createCanvas(spec.width, spec.height);
    drawFrame(over.getContext('2d'), tl.scene, t, L);
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(over, 0, 0);
  } else drawFrame(ctx, tl.scene, t, L);
  return canvas;
}

export async function writePoster(spec, timeline, file) {
  const tl = timeline.find((x) => x.scene.type === 'title') || timeline[0];
  const L = await sceneLayout(spec, tl);
  const canvas = createCanvas(spec.width, spec.height);
  const s = { ...tl.scene };
  if (isVideoScene(s)) return; // posters for clip-first videos: skip (no decoded frame here)
  drawFrame(canvas.getContext('2d'), s, Math.min(tl.dur - 0.3, 2.5), { ...L, captions: false, progress: false });
  fs.writeFileSync(file, canvas.toBuffer('image/jpeg', 88));
}

/**
 * Which frames can differ from the previous one? Everything in makevideo animates for a short
 * window after an event (scene start, list reveal, caption change, closing fade) and is still
 * otherwise. Only "live" frames are drawn and piped; holds are repeated inside ffmpeg by the
 * `loop` filter *after* colour conversion, where a repeated frame costs almost nothing.
 * Returns [{ frame, repeat }] holds (repeat = extra copies of that unique frame).
 */
/** Seconds until each scene type's entrance animation (excluding reveals) is finished. */
const ENTRANCE = {
  title: 1.3, outro: 1.3, chapter: 1.7, timeline: 0.95, stat: 1.65, quote: 1.2, code: 0.75, compare: 0.65, chart: 0.75,
  bullets: 0.65, steps: 0.65, decisions: 0.65, statement: 0.6, split: 0.85, clip: 0.85, image: 0.85,
};

export function planFrames(tl, L, fps) {
  const N = tl.frames;
  if ((tl.scene.type === 'image' || (tl.scene.type === 'chapter' && tl.scene.srcPath)) && tl.scene.zoom !== false) return { live: N, holds: [] }; // Ken Burns moves every frame
  const live = new Uint8Array(N);
  const mark = (t0, len) => {
    for (let f = Math.max(0, Math.floor(t0 * fps)); f < Math.min(N, Math.ceil((t0 + len) * fps) + 1); f++) live[f] = 1;
  };
  // Opening window: exactly as long as this scene's own entrance + the transition into it.
  // (A generic 1.75 s window made ~half of all frames "live"; sizing it per type halves that.)
  const enterEnd = Math.max(ENTRANCE[tl.scene.type] ?? 0.7, L.transition && !['none', 'cut'].includes(L.transition) ? 0.62 : 0, L.index === 0 ? 0.5 : 0);
  mark(0, enterEnd);
  if (L.index === L.count - 1) mark(L.dur - 0.75, 0.75); // closing fade to black
  else if (L.nextDip) mark(L.dur - 0.3, 0.3);
  for (const r of L.reveals) mark(r, L.revealLen ?? 0.65);
  for (const c of L.cues) {
    mark(c.start, L.captionStyle === 'bold' ? 0.2 : 0); // bold captions pop in
    mark(c.end, 0);
    if (L.captionStyle === 'bold') for (const w of wordTimes(c)) mark(w, 0);
  }
  const holds = [];
  let uniq = -1;
  for (let f = 0; f < N; f++) {
    if (live[f] || uniq < 0) uniq++;
    else if (holds.length && holds[holds.length - 1].frame === uniq) holds[holds.length - 1].repeat++;
    else holds.push({ frame: uniq, repeat: 1 });
    live[f] = live[f] || f === 0 ? 1 : 0;
  }
  return { live: uniq + 1, holds, mask: live };
}

/** ffmpeg filter that expands held frames. Applied last-hold-first so indices stay valid. */
function loopChain(holds) {
  return holds.slice().reverse().map((h) => `loop=loop=${h.repeat}:size=1:start=${h.frame}`).join(',');
}

export async function renderSegment(spec, tl, file) {
  const { width: W, height: H, fps } = spec;
  const s = tl.scene;
  const L = await sceneLayout(spec, tl);
  const plan = planFrames(tl, L, fps);
  const video = isVideoScene(s);
  const loops = plan.holds.length ? ',' + loopChain(plan.holds) : '';
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
  const enc = ['-c:v', 'libx264', ...QUALITY[spec.quality], '-threads', String(spec.encoderThreads), '-pix_fmt', 'yuv420p', '-r', String(fps), '-frames:v', String(tl.frames), '-an', file];
  let args;
  if (isVideoScene(s)) {
    const fitV = videoFilter(s, L, W, H);
    args = ['-y', '-stream_loop', '-1', '-ss', String(s.start || 0), '-i', s.srcPath, ...raw,
      '-filter_complex', `[0:v]fps=${fps},${fitV},setsar=1[bg];[1:v]format=yuva420p${loops},setpts=N/${fps}/TB[ov];[bg][ov]overlay=format=auto:eof_action=repeat[v]`,
      '-map', '[v]', ...enc];
  } else {
    args = ['-y', ...raw, '-vf', `format=yuv420p${loops},setpts=N/${fps}/TB`, ...enc];
  }
  if (loops.length > 30000) throw new Error('scene too long to plan; split it into smaller scenes');
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
  const closed = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg failed for scene "${s.title || s.type}":
${err}`)))));
  ff.stdin.on('error', () => {}); // surfaced via `closed`
  const prof = { draw: 0, wait: 0, live: 0, t0: Date.now() };
  for (let f = 0; f < tl.frames; f++) {
    if (plan.mask && !plan.mask[f]) continue;
    const a = Date.now();
    drawFrame(ctx, s, f / fps, L);
    // opaque frames: raw canvas bytes (premultiplied == straight when alpha is 255, ~1.5 ms cheaper);
    // video-scene overlays have real alpha, so they need un-premultiplied getImageData
    const buf = video ? ctx.getImageData(0, 0, W, H).data : canvas.data();
    prof.draw += Date.now() - a; prof.live++;
    if (!ff.stdin.write(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))) {
      const b = Date.now();
      await new Promise((r) => ff.stdin.once('drain', r));
      prof.wait += Date.now() - b;
    }
  }
  ff.stdin.end();
  const c = Date.now();
  await closed;
  if (process.env.MAKEVIDEO_DEBUG) console.error(`  ${s.type}: ${prof.live}/${tl.frames} live, draw ${prof.draw} ms, pipe-wait ${prof.wait} ms, encode-tail ${Date.now() - c} ms, total ${Date.now() - prof.t0} ms`);
}

/** Where the video goes: full frame for clips, the media box for split scenes. */
function videoFilter(s, L, W, H) {
  if (s.type !== 'split') return fitFilter(s, W, H);
  const r = splitRect(s, L);
  return `${fitFilter(s, r.w, r.h)},pad=${W}:${H}:${r.x}:${r.y}:color=black`;
}

const durations = new Map();
/** Media length in seconds (parsed from ffmpeg's banner; ffmpeg-static ships no ffprobe). */
export async function mediaDuration(file) {
  if (durations.has(file)) return durations.get(file);
  const out = await new Promise((res) => {
    const p = spawn(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => res(err));
  });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  const d = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  durations.set(file, d);
  return d;
}

/** ffmpeg scale filter for a clip: fill-and-crop (default) or letterbox (`fit: "contain"`). */
function fitFilter(s, W, H) {
  return s.fit === 'contain'
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
}

export function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', rej);
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${path.basename(cmd)} exited ${c}:\n${err}`))));
  });
}

