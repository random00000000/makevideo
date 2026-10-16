// Trailer mode: the edit is built on the music. Every scene lasts a number of beats, every cut
// lands on a beat, cuts on the music's hits flash, and the generated score is shaped to the
// beat sheet (or the beat sheet is laid on the user's own track).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeTrailerScore, analyzeTrack } from './trailer-music.js';

export const SECTIONS = ['intro', 'build', 'drop', 'breakdown', 'finale', 'outro'];
const DEFAULT_BEATS = { clip: 4, slam: 2, logo: 8, cta: 8, image: 4, title: 8, statement: 2 };

/** Section plan for the generated score: consecutive scenes in one section are merged. */
export function sectionPlan(scenes) {
  const plan = [];
  for (const s of scenes) {
    const name = s.section || 'drop';
    const last = plan[plan.length - 1];
    if (last && last.name === name) last.beats += s.beats;
    else plan.push({ name, beats: s.beats });
  }
  return plan;
}

/** Fill in beats/section defaults so a bare beat sheet still has a shape. */
export function shapeScenes(scenes) {
  const n = scenes.length;
  return scenes.map((s, i) => {
    const beats = s.beats ?? DEFAULT_BEATS[s.type] ?? 4;
    // default arc when the agent didn't label sections: intro → build → drop → finale → outro
    const auto = s.type === 'cta' || s.type === 'logo' ? 'outro' : i < n * 0.15 ? 'intro' : i < n * 0.4 ? 'build' : i < n * 0.6 ? 'drop' : i < n * 0.7 ? 'breakdown' : 'finale';
    return { ...s, beats, section: s.section || auto };
  });
}

/**
 * Get the music map: generate a score shaped to the scenes, or analyze the user's track.
 * Returns { file, map, start } where `start` is the track time the video begins at.
 */
export async function trailerMusic(spec, tmp, ffmpeg, { dry = false } = {}) {
  if (!spec.music || spec.music === 'trailer') {
    const file = path.join(tmp, 'trailer-score.wav');
    const map = writeTrailerScore(file, sectionPlan(spec.scenes), { bpm: spec.bpm || 110, dry });
    return { file, map, start: 0 };
  }
  const map = await analyzeTrack(ffmpeg, spec.music, { bpm: spec.bpm, offset: spec.musicOffset });
  // begin on a downbeat: the first one, or the one nearest musicStart
  const want = spec.musicStart ?? 0;
  const start = map.downbeats.reduce((b, d) => (Math.abs(d - want) < Math.abs(b - want) ? d : b), map.downbeats[0] ?? 0);
  const shift = (ts) => ts.filter((t) => t >= start - 0.001).map((t) => +(t - start).toFixed(4));
  return {
    file: spec.music,
    start,
    map: { ...map, beats: shift(map.beats), downbeats: shift(map.downbeats), hits: shift(map.hits), sections: map.sections.map((x) => ({ ...x, start: x.start - start, end: x.end - start })) },
  };
}

/**
 * Lay the scenes on the beat grid. Boundaries snap to whole frames so every cut is within
 * half a frame of its beat. Scenes starting on a music hit get a flash cut unless told otherwise.
 */
export function layoutOnBeats(scenes, map, fps) {
  const beats = map.beats;
  const period = beats.length > 1 ? beats[1] - beats[0] : 0.5;
  const beatTime = (k) => (k < beats.length ? beats[k] : beats[beats.length - 1] + (k - beats.length + 1) * period);
  let k = 0;
  const out = [];
  for (const s of scenes) {
    const a = beatTime(k), b = beatTime(k + s.beats);
    const fa = Math.round(a * fps), fb = Math.max(fa + 1, Math.round(b * fps));
    const onHit = map.hits.some((h) => Math.abs(h - a) < 0.05);
    out.push({ start: fa / fps, frames: fb - fa, onHit, overrun: k + s.beats > beats.length });
    k += s.beats;
  }
  // close the gaps rounding could leave: each scene ends exactly where the next starts
  for (let i = 0; i < out.length - 1; i++) out[i].frames = Math.round(out[i + 1].start * fps) - Math.round(out[i].start * fps);
  return out;
}

// ------------------------------------------------------------------ motion: pick the best window

const motionCache = new Map();
/** Per-second motion energy of a clip (frame differences), cached per file. */
export function motionProfile(ffmpeg, file) {
  if (motionCache.has(file)) return motionCache.get(file);
  const p = new Promise((resolve) => {
    const proc = spawn(ffmpeg, ['-v', 'info', '-i', file, '-vf', 'scale=160:-2,fps=10,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.on('close', () => {
      const t = [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
      const v = [...err.matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1]);
      resolve(t.map((ti, i) => ({ t: ti, v: v[i] ?? 0 })));
    });
  });
  motionCache.set(file, p);
  return p;
}

/** Start time of the most active `len`-second window (the "best moment" of a long clip). */
export async function bestWindow(ffmpeg, file, len) {
  const prof = await motionProfile(ffmpeg, file);
  if (!prof.length) return 0;
  const end = prof[prof.length - 1].t;
  if (end <= len) return 0;
  let best = 0, bestV = -1;
  for (let s = 0; s + len <= end; s += 0.25) {
    let v = 0;
    for (const p of prof) if (p.t >= s && p.t < s + len) v += p.v;
    if (v > bestV) { bestV = v; best = s; }
  }
  return +best.toFixed(2);
}

/** Source seconds a shot consumes (speed and two-phase ramps change it). */
export function sourceSeconds(s, dur) {
  if (s.ramp) return 0.6 * dur * s.ramp[0] + 0.4 * dur * s.ramp[1];
  return dur * (s.speed || 1);
}

// ------------------------------------------------------------------ trailer lint

const words = (x) => String(x || '').split(/\s+/).filter(Boolean).length;
/** Rules from how good Steam trailers are cut. Suggestions, never blockers. */
export function lintTrailer(spec, layout) {
  const w = [];
  const scenes = spec.scenes;
  const firstShot = scenes.findIndex((s) => s.type === 'clip');
  if (firstShot < 0) w.push('no gameplay shots: a trailer sells the game by showing it. Add clips or shots.');
  else if (layout[firstShot].start > 5) w.push(`first gameplay appears at ${layout[firstShot].start.toFixed(1)} s. Viewers decide in seconds: show gameplay before 5 s.`);
  const logo = scenes.findIndex((s) => s.type === 'logo');
  if (logo >= 0 && firstShot >= 0 && logo < firstShot) w.push('the logo comes before any gameplay. Open on the game, reveal the title later.');
  const total = layout.length ? layout[layout.length - 1].start + layout[layout.length - 1].frames / spec.fps : 0;
  if (total < 25) w.push(`trailer is ${total.toFixed(0)} s. Steam trailers work best at 30 to 90 s.`);
  if (total > 95) w.push(`trailer is ${total.toFixed(0)} s. Steam viewers drop off; aim for 30 to 90 s.`);
  if (scenes[scenes.length - 1]?.type !== 'cta') w.push('end on a call to action ("Wishlist on Steam" card): it is the point of the trailer.');
  scenes.forEach((s, i) => {
    const where = `scenes[${i}] (${s.type})`;
    const text = s.type === 'clip' ? s.text : s.type === 'slam' ? s.text : null;
    if (text && words(text) > 6) w.push(`${where}: "${text}" is ${words(text)} words. Trailer text hits harder at 5 words or fewer.`);
    if (i >= 2 && s.type === 'slam' && scenes[i - 1].type === 'slam' && scenes[i - 2].type === 'slam') w.push(`${where}: three text cards in a row. Put gameplay between them.`);
    if (s.type === 'clip' && s._srcSeconds && s._clipSeconds && s._srcSeconds > s._clipSeconds + 0.05) w.push(`${where}: needs ${s._srcSeconds.toFixed(1)} s of footage but the clip has ${s._clipSeconds.toFixed(1)} s, so it will loop. Use a longer clip or fewer beats.`);
    if (layout[i]?.overrun) w.push(`${where}: runs past the end of the music. Shorten the trailer or use a longer track.`);
  });
  return w;
}

export function fileExists(p) { try { return fs.statSync(p).size > 0; } catch { return false; } }

/** Does this media file carry an audio stream? */
export function hasAudio(ffmpeg, file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => resolve(/Stream #.*Audio:/.test(err)));
  });
}

/** atempo only spans 0.5..2 per instance: chain it for bigger changes. */
export function atempoChain(speed) {
  if (!speed || speed === 1) return '';
  const parts = [];
  let r = speed;
  while (r < 0.5) { parts.push(0.5); r /= 0.5; }
  while (r > 2) { parts.push(2); r /= 2; }
  parts.push(+r.toFixed(4));
  return parts.map((p) => `atempo=${p}`).join(',') + ',';
}
