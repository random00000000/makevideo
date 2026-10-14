/**
 * makevideo — fast, standard video generation for AI agents (JSON/JS script → narrated MP4).
 *
 *   import { video } from 'makevideo';
 *   await video({ title: 'Demo', scenes: [{ type: 'title', title: 'Hello', say: 'Hello there.' }] });
 *
 * Pipeline: narration (Kokoro TTS, cached, parallel) → scene timings from real audio length
 * → each scene rendered to its own H.264 segment in parallel (Skia canvas → ffmpeg)
 * → concat + mux narration (+ optional music) → .mp4, .srt, .json report, poster .jpg.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { createSpeaker, SAMPLE_RATE, estimateSeconds, VOICES, DEFAULT_VOICE } from './tts.js';
import { normalize, sentences, forSpeech, cuesFor, revealTimes, SpecError, SCENE_TYPES, FORMATS } from './spec.js';
import { drawFrame, makeLayout, wordTimes } from './draw.js';
import { THEMES } from './themes.js';

export { record } from './record.js';
export { THEMES, VOICES, DEFAULT_VOICE, SCENE_TYPES, FORMATS, SpecError, normalize };
export const FFMPEG = process.env.MAKEVIDEO_FFMPEG || ffmpegPath;

const QUALITY = {
  draft: ['-preset', 'ultrafast', '-crf', '28'],
  standard: ['-preset', 'veryfast', '-crf', '20'],
  high: ['-preset', 'medium', '-crf', '17'],
};

/**
 * Render a makevideo video.
 * @param {object} input  the video spec (see README / schema.json)
 * @param {object} [opts]
 * @param {string} [opts.baseDir]  resolve relative paths (src, music, output) against this dir
 * @param {(e: {stage: string, message: string, progress?: number}) => void} [opts.onProgress]
 * @param {number} [opts.concurrency]  scenes rendered at once (default: cpu/3)
 * @param {number} [opts.ttsWorkers]   parallel TTS sessions (default 3)
 * @returns {Promise<{output: string, srt: string, report: string, poster: string, duration: number, seconds: number, scenes: object[]}>}
 */
export async function video(input, opts = {}) {
  const t0 = Date.now();
  const log = opts.onProgress || (() => {});
  const spec = normalize(input, { baseDir: opts.baseDir });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-'));
  fs.mkdirSync(path.dirname(spec.output), { recursive: true });
  const speaker = spec.voice ? createSpeaker({ voice: spec.voice, speed: spec.speed, workers: opts.ttsWorkers ?? 3 }) : null;

  try {
    // 1) narration — every sentence queued at once; the TTS pool works through them in parallel
    log({ stage: 'voice', message: `narrating ${spec.scenes.length} scenes with ${spec.voice || 'no voice'}` });
    const voiced = spec.scenes.map((s) =>
      Promise.all(
        sentences(s.say).map(async (text) => ({
          text: s.caption ? null : text,
          audio: speaker ? await speaker.speak(forSpeech(text, spec.pronounce)) : null,
          est: estimateSeconds(text, spec.speed),
        }))
      )
    );

    // 2+3) each scene is timed from its real audio and rendered as soon as its narration is
    // ready, so TTS and video encoding overlap instead of running back to back.
    const n = spec.scenes.length;
    const timeline = new Array(n);
    const segs = spec.scenes.map((_, i) => path.join(tmp, `seg${String(i).padStart(3, '0')}.mp4`));
    let done = 0;
    await pool(spec.scenes.map((s, i) => async () => {
      const tl = (timeline[i] = timeScene(spec, s, await voiced[i]));
      Object.assign(tl, { index: i, count: n });
      const ts = Date.now();
      await renderSegment(spec, tl, segs[i]);
      if (process.env.MAKEVIDEO_DEBUG) console.error(`scene ${i} ${s.type} ${tl.frames} frames ${Date.now() - ts} ms`);
      log({ stage: 'render', message: `scene ${i + 1}/${n} (${s.type})`, progress: ++done / n });
    }), opts.concurrency ?? 2);
    speaker?.close();
    let offset = 0;
    for (const tl of timeline) { tl.offset = offset; offset += tl.dur; }
    const total = offset;

    // 4) audio track + mux
    const wav = path.join(tmp, 'narration.wav');
    writeNarration(wav, timeline, total);
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav];
    if (spec.music) {
      args.push('-stream_loop', '-1', '-i', spec.music, '-filter_complex',
        `[2:a]volume=${spec.musicVolume},afade=t=out:st=${Math.max(0, total - 2.5)}:d=2.5[m];[1:a][m]amix=inputs=2:normalize=0:duration=first[a]`,
        '-map', '0:v', '-map', '[a]');
    } else args.push('-map', '0:v', '-map', '1:a');
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(3), '-movflags', '+faststart', spec.output);
    log({ stage: 'mux', message: 'muxing' });
    await run(FFMPEG, args);

    // 5) sidecars: captions, report, poster
    const base = spec.output.replace(/\.[^.]+$/, '');
    const cues = timeline.flatMap((tl) => cuesFor(tl.spoken.filter((s) => s.text)).map((c) => ({ ...c, start: c.start + tl.offset, end: c.end + tl.offset })));
    fs.writeFileSync(base + '.srt', toSrt(cues));
    const poster = base + '.jpg';
    await writePoster(spec, timeline, poster);
    let gif = null;
    if (spec.gif) {
      gif = base + '.gif';
      const g = typeof spec.gif === 'object' ? spec.gif : {};
      const gw = g.width ?? Math.min(640, spec.width), gfps = g.fps ?? 12;
      log({ stage: 'gif', message: 'writing ' + path.basename(gif) });
      await run(FFMPEG, ['-y', ...(g.start != null ? ['-ss', String(g.start)] : []), ...(g.duration ? ['-t', String(g.duration)] : []), '-i', spec.output,
        '-vf', `fps=${gfps},scale=${gw}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, gif]);
    }
    const scenes = timeline.map((tl, i) => ({ index: i, type: tl.scene.type, title: tl.scene.title ?? null, start: +tl.offset.toFixed(3), duration: +tl.dur.toFixed(3), say: tl.scene.say ?? null }));
    const result = {
      output: spec.output, srt: base + '.srt', report: base + '.report.json', poster, gif,
      duration: +total.toFixed(3), seconds: +((Date.now() - t0) / 1000).toFixed(1),
      width: spec.width, height: spec.height, fps: spec.fps, voice: spec.voice, scenes,
    };
    fs.writeFileSync(result.report, JSON.stringify(result, null, 2));
    log({ stage: 'done', message: `${spec.output} (${total.toFixed(1)} s video in ${result.seconds} s)` });
    return result;
  } finally {
    speaker?.close();
    if (!opts.keepTemp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}
export default video;

/** Validate a spec without rendering. Returns { ok, problems, estimatedSeconds }. */
export function check(input, opts = {}) {
  try {
    const spec = normalize(input, opts);
    const est = spec.scenes.reduce((n, s) => {
      const sp = sentences(s.say).reduce((m, x) => m + estimateSeconds(x, spec.speed) + spec.gap, 0);
      return n + Math.max(sp ? sp + spec.padBefore + spec.padAfter : 0, s.duration || 0, 1.2);
    }, 0);
    return { ok: true, problems: [], estimatedSeconds: +est.toFixed(1), scenes: spec.scenes.length, output: spec.output };
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, problems: e.problems };
    throw e;
  }
}

/**
 * Fast visual check: one still per scene (fully revealed) in a contact sheet PNG.
 * No TTS, no video encode — takes about a second. Use it before `video()`.
 */
export async function preview(input, opts = {}) {
  const spec = normalize(input, opts);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-prev-'));
  try {
    const timeline = estimatedTimeline(spec);
    const total = timeline.reduce((n, t) => n + t.dur, 0);
    const cols = Math.min(3, timeline.length);
    const rows = Math.ceil(timeline.length / cols);
    const tw = Math.round(spec.width / 3), th = Math.round(spec.height / 3), pad = 16, lab = 34;
    const sheet = createCanvas(cols * (tw + pad) + pad, rows * (th + pad + lab) + pad);
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#111'; sc.fillRect(0, 0, sheet.width, sheet.height);
    for (const [i, tl] of timeline.entries()) {
      const frame = await stillFor(spec, tl, tl.dur - spec.padAfter - 0.05, tmp);
      const x = pad + (i % cols) * (tw + pad), y = pad + Math.floor(i / cols) * (th + pad + lab);
      sc.fillStyle = '#ddd'; sc.font = '600 20px sans-serif'; sc.textBaseline = 'top';
      sc.fillText(`${i + 1}. ${tl.scene.type}  ~${tl.dur.toFixed(1)}s`, x, y + 4);
      sc.drawImage(frame, x, y + lab, tw, th);
    }
    const out = opts.output || spec.output.replace(/\.[^.]+$/, '') + '.preview.png';
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, sheet.toBuffer('image/png'));
    return { output: out, estimatedSeconds: +total.toFixed(1), scenes: timeline.length };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ internals

function timeScene(spec, s, parts) {
  let t = spec.padBefore;
  const spoken = parts.map((p, k) => {
    const len = p.audio ? trimmedLength(p.audio) / SAMPLE_RATE : p.est;
    const seg = { text: p.text, start: t, end: t + len, audio: p.audio };
    t += len + (k < parts.length - 1 ? spec.gap : 0);
    return seg;
  });
  const speech = spoken.length ? t + spec.padAfter : 0;
  const frames = Math.max(1, Math.round(Math.max(speech, s.duration || 0, 1.2) * spec.fps));
  if (s.caption) spoken.forEach((sp, k) => (sp.text = k === 0 ? s.caption : null));
  return { scene: s, offset: 0, dur: frames / spec.fps, frames, spoken };
}

function estimatedTimeline(spec) {
  let offset = 0;
  return spec.scenes.map((s, index) => {
    let t = spec.padBefore;
    const ss = sentences(s.say);
    const spoken = ss.map((text, k) => {
      const len = estimateSeconds(text, spec.speed);
      const seg = { text: s.caption ? (k ? null : s.caption) : text, start: t, end: t + len };
      t += len + (k < ss.length - 1 ? spec.gap : 0);
      return seg;
    });
    const dur = Math.max(spoken.length ? t + spec.padAfter : 0, s.duration || 0, 1.2);
    const tl = { scene: s, offset, dur, frames: Math.round(dur * spec.fps), spoken, index, count: spec.scenes.length };
    offset += dur;
    return tl;
  });
}

async function sceneLayout(spec, tl) {
  const s = tl.scene;
  const assets = {};
  if (s.type === 'image') assets.image = await loadImage(fs.readFileSync(s.srcPath));
  const n = s.type === 'compare' ? 2 : s.items?.length || 0;
  return makeLayout(spec, s, {
    dur: tl.dur, index: tl.index ?? 0, count: tl.count ?? 1, assets,
    cues: cuesFor(tl.spoken.filter((x) => x.text), spec.captionStyle === 'bold' ? 4 : 12),
    reveals: revealTimes(n, tl.spoken, tl.dur, spec.padBefore),
  });
}

async function stillFor(spec, tl, t, tmp) {
  const L = await sceneLayout(spec, tl);
  const canvas = createCanvas(spec.width, spec.height);
  const ctx = canvas.getContext('2d');
  if (tl.scene.type === 'clip') {
    const png = path.join(tmp, `clip${tl.offset}.png`);
    await run(FFMPEG, ['-y', '-ss', String((tl.scene.start || 0) + Math.min(t, 2)), '-i', tl.scene.srcPath, '-frames:v', '1',
      '-vf', fitFilter(tl.scene, spec.width, spec.height), png]);
    const bg = await loadImage(fs.readFileSync(png));
    const over = createCanvas(spec.width, spec.height);
    drawFrame(over.getContext('2d'), tl.scene, t, L);
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(over, 0, 0);
  } else drawFrame(ctx, tl.scene, t, L);
  return canvas;
}

async function writePoster(spec, timeline, file) {
  const tl = timeline.find((x) => x.scene.type === 'title') || timeline[0];
  const L = await sceneLayout(spec, tl);
  const canvas = createCanvas(spec.width, spec.height);
  const s = { ...tl.scene };
  if (s.type === 'clip') return; // posters for clip-first videos: skip (no decoded frame here)
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
export function planFrames(tl, L, fps) {
  const N = tl.frames;
  if (tl.scene.type === 'image' && tl.scene.zoom !== false) return { live: N, holds: [] }; // Ken Burns moves every frame
  const live = new Uint8Array(N);
  const mark = (t0, len) => {
    for (let f = Math.max(0, Math.floor(t0 * fps)); f < Math.min(N, Math.ceil((t0 + len) * fps) + 1); f++) live[f] = 1;
  };
  mark(0, 1.75); // entrance animations, count-ups, opening fade
  mark(L.dur - 0.3, 0.3); // closing fade
  for (const r of L.reveals) mark(r, 0.65);
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

async function renderSegment(spec, tl, file) {
  const { width: W, height: H, fps } = spec;
  const s = tl.scene;
  const L = await sceneLayout(spec, tl);
  const plan = planFrames(tl, L, fps);
  const loops = plan.holds.length ? ',' + loopChain(plan.holds) : '';
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
  const enc = ['-c:v', 'libx264', ...QUALITY[spec.quality], '-threads', String(spec.encoderThreads), '-pix_fmt', 'yuv420p', '-r', String(fps), '-frames:v', String(tl.frames), '-an', file];
  let args;
  if (s.type === 'clip') {
    const fitV = fitFilter(s, W, H);
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
  for (let f = 0; f < tl.frames; f++) {
    if (plan.mask && !plan.mask[f]) continue;
    drawFrame(ctx, s, f / fps, L);
    const buf = ctx.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
  }
  ff.stdin.end();
  await closed;
}

/** ffmpeg scale filter for a clip: fill-and-crop (default) or letterbox (`fit: "contain"`). */
function fitFilter(s, W, H) {
  return s.fit === 'contain'
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
}

/** Kokoro pads clips with near-silence; trim the tail so pacing feels tight. */
function trimmedLength(a) {
  let end = a.length;
  while (end > 0 && Math.abs(a[end - 1]) < 0.004) end--;
  return Math.min(a.length, end + Math.round(SAMPLE_RATE * 0.05));
}

function writeNarration(file, timeline, total) {
  const n = Math.ceil(total * SAMPLE_RATE);
  const mix = new Float32Array(n);
  let peak = 0;
  for (const tl of timeline) {
    for (const sp of tl.spoken) {
      if (!sp.audio) continue;
      const at = Math.round((tl.offset + sp.start) * SAMPLE_RATE);
      const len = Math.min(trimmedLength(sp.audio), n - at);
      for (let i = 0; i < len; i++) { mix[at + i] += sp.audio[i]; peak = Math.max(peak, Math.abs(mix[at + i])); }
    }
  }
  const gain = peak > 0 ? Math.min(0.89 / peak, 3) : 1;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SAMPLE_RATE, 24);
  pcm.writeUInt32LE(SAMPLE_RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * gain * 32767))), 44 + i * 2);
  fs.writeFileSync(file, pcm);
}

function toSrt(cues) {
  const ts = (t) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', rej);
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${path.basename(cmd)} exited ${c}:\n${err}`))));
  });
}

async function pool(jobs, n) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) await jobs[i++](); }));
}
