// Generated score: a royalty-free music bed synthesized from scratch (no samples, no licenses).
// Chord pads + sub bass + reverb, with an optional slow drum pulse. Deterministic: same
// mood + length = same audio.
import fs from 'node:fs';

export const MOODS = {
  documentary: { chords: [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]], bar: 8, drum: 0, brightness: 900 },   // A minor, reflective
  epic:        { chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], bar: 6, drum: 2, brightness: 1300 },  // D minor, war-drum pulse
  wonder:      { chords: [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]], bar: 8, drum: 0, brightness: 1600 },  // C major, open
  tension:     { chords: [[45, 48, 52], [46, 49, 53], [45, 48, 52], [44, 47, 51]], bar: 5, drum: 4, brightness: 700 },   // A minor, chromatic
};

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Render `seconds` of the mood to a 44.1 kHz stereo 16-bit WAV. */
export function writeScore(file, mood, seconds) {
  const M = MOODS[mood] || MOODS.documentary;
  const SR = 44100;
  const n = Math.ceil((seconds + 1) * SR);
  const dry = new Float32Array(n);
  const barN = M.bar * SR, xf = 2.5 * SR; // chord length, crossfade length
  // pads: 3 detuned sines per chord tone, slow swell, crossfaded between chords
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = Math.floor(i / barN), pos = i - k * barN;
    let v = 0;
    for (const [idx, w] of [[k, 1], [k - 1, pos < xf ? 1 - pos / xf : 0]]) {
      if (w <= 0 || idx < 0) continue;
      const fade = idx === k ? Math.min(1, pos / xf) : w;
      const chord = M.chords[idx % M.chords.length];
      for (const note of chord) {
        const f = hz(note);
        v += fade * (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.0015 * t) + 0.6 * Math.sin(2 * Math.PI * f * 0.9985 * t)) / 7;
      }
      v += fade * 0.5 * Math.sin(2 * Math.PI * hz(chord[0] - 12) * t); // sub bass on the root
    }
    v *= 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.07 * t); // slow breathing swell
    dry[i] = v;
  }
  // one-pole lowpass for warmth, cutoff drifting slowly
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const fc = M.brightness * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.03 * i / SR));
    const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
    lp += a * (dry[i] - lp);
    dry[i] = lp;
  }
  // drum pulse: low tom (pitch-dropping sine) every `drum` beats of a 75 bpm grid
  if (M.drum) {
    const step = (60 / 75) * M.drum * SR;
    for (let s = 2 * SR; s < n; s += step) {
      for (let j = 0; j < 0.9 * SR && s + j < n; j++) {
        const tt = j / SR, env = Math.exp(-tt * 5);
        dry[Math.floor(s) + j] += 0.55 * env * Math.sin(2 * Math.PI * (48 + 40 * Math.exp(-tt * 12)) * tt);
      }
    }
  }
  // reverb: 4 damped combs + 2 allpasses (Schroeder), left/right with different delays
  const reverb = (offset) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
    const aps = [556, 441].map((d) => ({ buf: new Float32Array(d), i: 0 }));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.lp = y * 0.6 + c.lp * 0.4;
        c.buf[c.i] = dry[i] + c.lp * 0.82;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      for (const a of aps) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s * 0.5;
      }
      out[i] = dry[i] * 0.55 + s * 0.12;
    }
    return out;
  };
  const L = reverb(0), R = reverb(23);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak ? 0.6 / peak : 1;
  const fadeIn = 2 * SR, fadeOut = 3 * SR;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * env)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * env)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
  return file;
}
