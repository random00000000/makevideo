// Trailer music: the spine every cut hangs off.
//  - writeTrailerScore(): a royalty-free trailer cue synthesized to fit the beat sheet exactly
//    (intro → build → drop → breakdown → finale → outro), returning its beat/section/hit map.
//  - analyzeTrack(): beat, downbeat and energy-section detection for the user's own track.
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const SR = 44100;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ tiny DSP helpers
function addTone(buf, t0, dur, fn) {
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(buf.length, Math.floor((t0 + dur) * SR));
  for (let i = a; i < b; i++) buf[i] += fn((i - a) / SR);
}
let seed = 1;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1;

/** Low tom / kick: pitch-dropping sine. */
const drum = (buf, t, f0, f1, len, amp) => addTone(buf, t, len, (x) => amp * Math.exp(-x * 7 / len) * Math.sin(2 * Math.PI * (f1 * x + (f0 - f1) * (1 - Math.exp(-x * 25)) / 25)));
/** Snare/clap: noise burst. */
const snare = (buf, t, amp) => addTone(buf, t, 0.25, (x) => amp * Math.exp(-x * 18) * noise());
/** BRAAM: detuned low saw stack with a slow filter bloom (the classic trailer hit). */
function braam(buf, t, note, len, amp) {
  let lp = 0;
  addTone(buf, t, len, (x) => {
    let v = 0;
    for (const d of [0.996, 1, 1.004]) for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * hz(note) * d * h * x) / h;
    const env = Math.min(1, x / 0.04) * Math.exp(-x * 1.6 / len * 2);
    const cut = 0.04 + 0.25 * Math.min(1, x / 0.3) * Math.exp(-x * 1.2);
    lp += cut * (v - lp);
    return amp * env * lp * 0.35;
  });
}
/** Riser: noise + gliding sine that swells into the next section. */
function riser(buf, t, len, amp) {
  let lp = 0;
  addTone(buf, t, len, (x) => {
    const p = x / len;
    lp += (0.02 + 0.5 * p * p) * (noise() - lp);
    return amp * p * p * (lp * 0.8 + 0.4 * Math.sin(2 * Math.PI * (150 * x + 900 * x * p)));
  });
}
/** Soft minor pad (sustain). */
function pad(buf, t, len, chord, amp) {
  addTone(buf, t, len, (x) => {
    const env = Math.min(1, x / 0.8, (len - x) / 0.8);
    let v = 0;
    for (const n of chord) v += Math.sin(2 * Math.PI * hz(n) * x) + 0.5 * Math.sin(2 * Math.PI * hz(n) * 1.003 * x);
    return amp * env * v / chord.length;
  });
}
/** 8th-note sub pulse (the "ticking" tension bed). */
function pulse(buf, t, len, note, bpm, amp) {
  const step = 60 / bpm / 2;
  for (let s = t; s < t + len - 0.01; s += step) addTone(buf, s, step * 0.9, (x) => amp * Math.exp(-x * 9) * Math.sin(2 * Math.PI * hz(note) * x));
}

function reverb(dry, offset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ b: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441].map((d) => ({ b: new Float32Array(d), i: 0 }));
  const out = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i++) {
    let s = 0;
    for (const c of combs) { const y = c.b[c.i]; c.lp = y * 0.5 + c.lp * 0.5; c.b[c.i] = dry[i] + c.lp * 0.84; c.i = (c.i + 1) % c.b.length; s += y; }
    for (const a of aps) { const y = a.b[a.i]; a.b[a.i] = s + y * 0.5; a.i = (a.i + 1) % a.b.length; s = y - s * 0.5; }
    out[i] = dry[i] * 0.7 + s * 0.09;
  }
  return out;
}

const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]]; // Am F G Em

/**
 * Synthesize a trailer cue that fits the plan exactly.
 * @param plan  [{ name: 'intro'|'build'|'drop'|'breakdown'|'finale'|'outro', beats }], in order
 * @returns { bpm, beats: [s], downbeats: [s], sections: [{name,start,end}], hits: [s], duration }
 */
export function writeTrailerScore(file, plan, { bpm = 110, dry = false } = {}) {
  seed = 7;
  const beat = 60 / bpm;
  const total = plan.reduce((n, p) => n + p.beats, 0) * beat + 4; // + tail
  const buf = new Float32Array(Math.ceil(total * SR));
  const map = { bpm, beats: [], downbeats: [], sections: [], hits: [], duration: total - 4 };
  let t = 0, bar = 0;
  for (const p of plan) {
    const start = t, len = p.beats * beat;
    map.sections.push({ name: p.name, start, end: start + len });
    for (let b = 0; b < p.beats; b++) {
      const bt = start + b * beat;
      map.beats.push(bt);
      if (b % 4 === 0) map.downbeats.push(bt);
    }
    const chordAt = (k) => CHORDS[(bar + k) % CHORDS.length];
    const bars = Math.max(1, Math.round(p.beats / 4));
    if (dry) { if (['drop', 'finale'].includes(p.name)) for (let k = 0; k < bars; k++) map.hits.push(start + k * 4 * beat); else if (p.name === 'outro') map.hits.push(start); t += len; bar += bars; continue; }
    switch (p.name) {
      case 'intro':
        for (let k = 0; k < bars; k++) pad(buf, start + k * 4 * beat, 4 * beat + 0.8, chordAt(k), 0.18);
        drum(buf, start, 60, 38, 1.6, 0.5); // a single low hit to open
        break;
      case 'build':
        for (let k = 0; k < bars; k++) pad(buf, start + k * 4 * beat, 4 * beat + 0.8, chordAt(k), 0.16);
        pulse(buf, start, len, 33, bpm, 0.35);
        for (let b = 0; b < p.beats; b += 2) drum(buf, start + b * beat, 120, 80, 0.5, 0.22 + 0.4 * (b / p.beats));
        riser(buf, start + Math.max(0, len - 4 * beat), Math.min(len, 4 * beat), 0.35);
        break;
      case 'drop':
      case 'finale': {
        const big = p.name === 'finale' ? 1.25 : 1;
        for (let k = 0; k < bars; k++) {
          const bt = start + k * 4 * beat;
          braam(buf, bt, 33 + (k % 2 ? 3 : 0), 4 * beat, 0.5 * big);
          map.hits.push(bt);
          pad(buf, bt, 4 * beat + 0.5, chordAt(k), 0.12);
        }
        pulse(buf, start, len, 33, bpm, 0.25 * big);
        for (let b = 0; b < p.beats; b++) {
          const bt = start + b * beat;
          if (b % 2 === 0) drum(buf, bt, 70, 42, 0.7, 0.6 * big);
          else snare(buf, bt, 0.3 * big);
          if (p.name === 'finale' && b % 4 === 3) drum(buf, bt + beat / 2, 140, 90, 0.4, 0.3);
        }
        if (p.name === 'finale') riser(buf, start + Math.max(0, len - 2 * beat), Math.min(len, 2 * beat), 0.4);
        break;
      }
      case 'breakdown':
        for (let k = 0; k < bars; k++) pad(buf, start + k * 4 * beat, 4 * beat + 0.8, chordAt(k), 0.2);
        riser(buf, start + Math.max(0, len - 2 * beat), Math.min(len, 2 * beat), 0.25);
        break;
      default: // outro: the title hit and its ring-out
        braam(buf, start, 33, 3.5, 0.7);
        drum(buf, start, 60, 35, 2.5, 0.8);
        map.hits.push(start);
        pad(buf, start, Math.max(len, 3), [45, 52, 57], 0.12);
    }
    t += len;
    bar += bars;
  }
  if (dry) return map;
  const L = reverb(buf, 0), R = reverb(buf, 23);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak ? 0.89 / peak : 1;
  const out = Buffer.alloc(44 + buf.length * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + buf.length * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(buf.length * 4, 40);
  for (let i = 0; i < buf.length; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, out);
  return map;
}

// ------------------------------------------------------------------ analysis of a user track

function decode(ffmpeg, file, rate) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => {
      if (c) return reject(new Error('could not decode music: ' + err));
      const b = Buffer.concat(chunks);
      resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4)));
    });
  });
}

/**
 * Detect tempo, beats, downbeats and energy sections of a music file.
 * Onset envelope (positive energy flux) → tempo by autocorrelation (70–180 bpm) →
 * beat phase by maximizing onset strength on the grid → bars → energy sections.
 */
export async function analyzeTrack(ffmpeg, file, { bpm: knownBpm, offset: knownOffset } = {}) {
  const rate = 11025, hop = 256, win = 512;
  const x = await decode(ffmpeg, file, rate);
  const n = Math.floor((x.length - win) / hop);
  const energy = new Float32Array(n), onset = new Float32Array(n), lowOnset = new Float32Array(n);
  let prev = 0, prevLow = 0, lp = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 160 / rate); // kick/boom band
  for (let i = 0; i < n; i++) {
    let e = 0, el = 0, last = 0;
    for (let k = 0; k < win; k++) { const v = x[i * hop + k]; const hp = v - last; last = v; lp += a * (v - lp); e += hp * hp + 0.3 * v * v; el += lp * lp; }
    energy[i] = Math.sqrt(e / win);
    const low = Math.sqrt(el / win);
    onset[i] = Math.max(0, energy[i] - prev);
    lowOnset[i] = Math.max(0, low - prevLow);
    prev = energy[i]; prevLow = low;
  }
  // beats sit on the low end (kicks, booms); snares on the off-beat must not win the phase
  const strength = onset; // measured: weighting the low band made phase worse on bass-pulse tracks
  const fps = rate / hop;
  // tempo
  let best = { bpm: 120, score: -1 };
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let i = 0; i + lag * 4 < n; i++) {
      const j = i + lag, j2 = i + 2 * lag;
      s += onset[i] * (onset[Math.round(j)] + 0.5 * onset[Math.round(j2)]);
    }
    s *= 1 + 0.15 * Math.exp(-((bpm - 115) ** 2) / (2 * 30 ** 2)); // mild prior toward trailer tempos
    if (s > best.score) best = { bpm, score: s };
  }
  // refine tempo finely around the coarse peak
  for (let bpm = best.bpm - 1; bpm <= best.bpm + 1; bpm += 0.05) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let i = 0; i + lag * 4 < n; i++) s += onset[i] * (onset[Math.round(i + lag)] + 0.5 * onset[Math.round(i + 2 * lag)] + 0.25 * onset[Math.round(i + 4 * lag)]);
    if (s > best.fine || best.fine === undefined) { best.fine = s; best.fineBpm = bpm; }
  }
  best.bpm = +best.fineBpm.toFixed(2);
  while (best.bpm < 80) best.bpm *= 2; // half-tempo locks are the classic failure; trailer music lives at 80-170 bpm
  while (best.bpm > 170) best.bpm /= 2;
  if (knownBpm) best.bpm = knownBpm;
  const period = (60 / best.bpm) * fps;
  // phase
  let phase = 0, phaseScore = -1;
  for (let ph = 0; ph < period; ph += 0.25) {
    let s = 0;
    for (let k = ph; k < n; k += period) s += strength[Math.round(k)];
    if (s > phaseScore) { phaseScore = s; phase = ph; }
  }
  // track: each beat snaps to the strongest onset within ±12% of a period of its prediction,
  // so a slightly-off tempo can't drift (cuts must land within a frame or two of the beat)
  const snap = (pred) => {
    const r = Math.max(1, Math.round(period * 0.12));
    let bi = Math.round(pred), bv = -1;
    for (let k = Math.round(pred) - r; k <= Math.round(pred) + r; k++) {
      if (k < 0 || k >= n) continue;
      const v = strength[k] * (1 - 0.5 * Math.abs(k - pred) / r);
      if (v > bv) { bv = v; bi = k; }
    }
    return bv > 0 ? bi : pred;
  };
  if (knownOffset != null) phase = knownOffset * fps;
  const exact = knownBpm && knownOffset != null;
  const frames = [exact ? phase : snap(phase)];
  for (let k = frames[0] - period; k >= -period * 0.12; k -= period) frames.unshift(Math.max(0, exact ? k : snap(k)));
  while (frames[frames.length - 1] + period < n) frames.push(exact ? frames[frames.length - 1] + period : snap(frames[frames.length - 1] + period));
  const beats = [...new Set(frames.map((k) => +(k / fps).toFixed(3)))];
  // downbeat: which of the 4 offsets carries the most energy
  let bestOff = 0, bestE = -1; // eslint-disable-line prefer-const
  for (let off = 0; off < 4; off++) {
    let s = 0;
    for (let b = off; b < beats.length; b += 4) s += strength[Math.round(beats[b] * fps)] || 0;
    if (s > bestE) { bestE = s; bestOff = off; }
  }
  if (exact) bestOff = beats.findIndex((b) => Math.abs(b - knownOffset) < 0.02) % 4;
  const downbeats = beats.filter((_, i) => i % 4 === bestOff);
  // sections by bar energy (low / mid / high), merged into runs of >= 2 bars
  const barE = downbeats.map((t, i) => {
    const a = Math.round(t * fps), b = Math.round((downbeats[i + 1] ?? t + 4 * 60 / best.bpm) * fps);
    let s = 0; for (let k = a; k < Math.min(b, n); k++) s += energy[k];
    return s / Math.max(1, b - a);
  });
  const sorted = [...barE].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.33)] ?? 0, q2 = sorted[Math.floor(sorted.length * 0.66)] ?? 0;
  const level = barE.map((e) => (e <= q1 ? 'low' : e <= q2 ? 'mid' : 'high'));
  const sections = [];
  level.forEach((lv, i) => {
    const last = sections[sections.length - 1];
    if (last && (last.level === lv || i - last.from < 2)) { last.to = i; return; }
    sections.push({ level: lv, from: i, to: i });
  });
  const duration = x.length / rate;
  return {
    bpm: best.bpm, beats, downbeats, duration,
    sections: sections.map((s) => ({ name: s.level === 'high' ? 'drop' : s.level === 'mid' ? 'build' : 'breakdown', start: downbeats[s.from], end: downbeats[s.to + 1] ?? duration })),
    hits: downbeats.filter((_, i) => level[i] === 'high'),
  };
}
