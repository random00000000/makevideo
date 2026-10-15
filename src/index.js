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
import { createCanvas } from '@napi-rs/canvas';
import { FFMPEG, run, stillFor, writePoster } from './render.js';
import { createRenderPool } from './render-pool.js';
import { createSpeaker, SAMPLE_RATE, estimateSeconds, VOICES, DEFAULT_VOICE, setup } from './tts.js';
import { normalize, sentences, forSpeech, cuesFor, SpecError, SCENE_TYPES, FORMATS, lint, speakable } from './spec.js';
import { fromMarkdown } from './markdown.js';
import { MOODS, writeScore } from './music.js';
import { resolveMedia } from './media.js';
import { writeYouTubePackage } from './youtube.js';
import { chooseTransition, TRANSITIONS } from './draw.js';
import { THEMES } from './themes.js';

export { record } from './record.js';
export { setup };
export { THEMES, VOICES, DEFAULT_VOICE, SCENE_TYPES, FORMATS, TRANSITIONS, SpecError, normalize, lint, speakable, fromMarkdown };
export { FFMPEG, planFrames } from './render.js';

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
  input = await prepare(input, opts.baseDir, log);
  const spec = normalize(input, { baseDir: opts.baseDir });
  for (const w of lint(spec)) log({ stage: 'lint', message: w });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-'));
  fs.mkdirSync(path.dirname(spec.output), { recursive: true });
  const cores = os.cpus().length;
  const speaker = spec.voice ? createSpeaker({ voice: spec.voice, speed: spec.speed, ...ttsShape(cores, opts) }) : null;
  // scene renders run in worker processes: one canvas + one ffmpeg each
  const renderer = createRenderPool(opts.concurrency ?? Math.max(2, Math.min(6, Math.floor(cores / 3))));

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
      const prev = i > 0 ? spec.scenes[i - 1] : null;
      tl.transition = chooseTransition(s, prev, spec.transition);
      tl.nextDip = i < n - 1 && chooseTransition(spec.scenes[i + 1], s, spec.transition) === 'dip';
      // the transition blends real pixels: the worker renders the previous scene's final frame
      const prevTl = prev && !['none', 'cut', 'dip'].includes(tl.transition)
        ? Object.assign(timeScene(spec, prev, await voiced[i - 1]), { index: i - 1, count: n })
        : null;
      const ts = Date.now();
      await renderer.render({ spec, tl, prevTl, file: segs[i], tmp });
      if (process.env.MAKEVIDEO_DEBUG) console.error(`scene ${i} ${s.type} ${tl.frames} frames ${Date.now() - ts} ms`);
      log({ stage: 'render', message: `scene ${i + 1}/${n} (${s.type})`, progress: ++done / n });
    }), n);
    speaker?.close();
    renderer.close();
    let offset = 0;
    for (const tl of timeline) { tl.offset = offset; offset += tl.dur; }
    const total = offset;

    // 4) audio track + mux
    const wav = path.join(tmp, 'narration.wav');
    writeNarration(wav, timeline, total);
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav];
    // Audio: narration (+ music ducked under it by a sidechain compressor), then loudness-
    // normalized to -14 LUFS / -1.5 dBTP, the YouTube/TikTok/Spotify playback target.
    const master = `loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo`;
    if (spec.music) {
      let musicFile = spec.music;
      if (MOODS[spec.music]) musicFile = writeScore(path.join(tmp, 'score.wav'), spec.music, total);
      args.push('-stream_loop', '-1', '-i', musicFile, '-filter_complex',
        `[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v1][v2];` +
        `[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=${spec.musicVolume},afade=t=out:st=${Math.max(0, total - 3)}:d=3[m];` +
        `[m][v2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=450[duck];` +
        `[v1][duck]amix=inputs=2:normalize=0:duration=first,${master}[a]`,
        '-map', '0:v', '-map', '[a]');
    } else args.push('-filter_complex', `[1:a]${master}[a]`, '-map', '0:v', '-map', '[a]');
    // a quiet credit in the file metadata (spec.credit: false removes it)
    if (spec.credit !== false) args.push('-metadata', `title=${spec.title}`, '-metadata', 'comment=Made with makevideo, https://github.com/random00000000/makevideo');
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', spec.output);
    log({ stage: 'mux', message: 'muxing' });
    // mux, poster and GIF are independent: run them side by side (GIF reads the silent segments)
    const base = spec.output.replace(/\.[^.]+$/, '');
    const poster = base + '.jpg';
    let gif = null;
    const sidecars = [run(FFMPEG, args), writePoster(spec, timeline, poster)];
    if (spec.gif) {
      gif = base + '.gif';
      const g = typeof spec.gif === 'object' ? spec.gif : {};
      const gw = g.width ?? Math.min(640, spec.width), gfps = g.fps ?? 12;
      sidecars.push(run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', ...(g.start != null ? ['-ss', String(g.start)] : []), ...(g.duration ? ['-t', String(g.duration)] : []), '-i', list,
        '-vf', `fps=${gfps},scale=${gw}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, gif]));
    }
    const cues = timeline.flatMap((tl) => cuesFor(tl.spoken.filter((s) => s.text)).map((c) => ({ ...c, start: c.start + tl.offset, end: c.end + tl.offset })));
    fs.writeFileSync(base + '.srt', toSrt(cues));
    await Promise.all(sidecars);
    let youtube = null;
    if (spec.youtube) youtube = await writeYouTubePackage(spec, timeline, base, input._credits || []);
    const scenes = timeline.map((tl, i) => ({ index: i, type: tl.scene.type, title: tl.scene.title ?? null, start: +tl.offset.toFixed(3), duration: +tl.dur.toFixed(3), say: tl.scene.say ?? null }));
    const result = {
      output: spec.output, srt: base + '.srt', report: base + '.report.json', poster, gif, ...(youtube || {}),
      credits: input._credits || [],
      duration: +total.toFixed(3), seconds: +((Date.now() - t0) / 1000).toFixed(1),
      width: spec.width, height: spec.height, fps: spec.fps, voice: spec.voice, scenes,
    };
    fs.writeFileSync(result.report, JSON.stringify(result, null, 2));
    log({ stage: 'done', message: `${spec.output} (${total.toFixed(1)} s video in ${result.seconds} s)` });
    return result;
  } finally {
    speaker?.close();
    renderer.close();
    if (!opts.keepTemp) try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} // never mask the real error
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
    return { ok: true, problems: [], warnings: lint(spec), estimatedSeconds: +est.toFixed(1), scenes: spec.scenes.length, output: spec.output };
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
  input = await prepare(input, opts.baseDir);
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
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

// ------------------------------------------------------------------ internals

/** Resolve stock-image searches and number chapters before validation. Returns a copy. */
async function prepare(input, baseDir, log = () => {}) {
  if (Array.isArray(input)) input = { scenes: input };
  input = { ...input, scenes: (input.scenes || []).map((s) => ({ ...s })) };
  let chapter = 0;
  for (const s of input.scenes) if (s.type === 'chapter') { if (s.number === undefined) s.number = ++chapter; s.duration ??= 4; } // chapter cards hold at least 4 s
  if (input.scenes.some((s) => s.search && !s.src)) {
    const portrait = input.format && /portrait|shorts|9:16/.test(input.format);
    input._credits = await resolveMedia(input, { log: (m) => log({ stage: 'media', message: m }), portrait });
  }
  return input;
}

/**
 * TTS processes x ONNX threads. Measured on 6C/12T: 1 process using every core = 1.7x real
 * time; 3 processes each using every core fight (1.5x); 2-3 processes with cores/4 threads
 * each = ~2x. More processes also cost ~330 MB RAM each, so cap at 3.
 */
function ttsShape(cores, opts) {
  const workers = opts.ttsWorkers ?? Math.max(1, Math.min(3, Math.floor(cores / 4)));
  const threads = opts.ttsThreads ?? Math.max(1, Math.floor(cores / 2 / workers));
  return { workers, threads };
}

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

async function pool(jobs, n) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) await jobs[i++](); }));
}
