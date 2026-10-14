// Text-to-speech: Kokoro-82M (Apache-2.0) running locally via kokoro-js.
// Same model + same voice + same text = byte-identical audio, cached on disk.
// Synthesis runs in a small pool of child processes so long scripts finish fast.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SAMPLE_RATE = 24000;
export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const DEFAULT_VOICE = 'af_heart';

/** Kokoro voices that ship with the model. Grades come from the model card. */
export const VOICES = {
  af_heart: 'American female, warm (default, best quality)',
  af_bella: 'American female, bright',
  af_nicole: 'American female, soft/ASMR',
  af_sarah: 'American female, neutral',
  am_michael: 'American male, calm',
  am_fenrir: 'American male, deep',
  am_puck: 'American male, lively',
  am_echo: 'American male, neutral',
  bf_emma: 'British female, clear',
  bf_isabella: 'British female, warm',
  bm_george: 'British male, documentary',
  bm_fable: 'British male, storyteller',
};

export function cacheDir() {
  return process.env.NARRATED_CACHE || path.join(os.homedir(), '.cache', 'narrated');
}

class Pool {
  constructor(size, dtype) {
    this.queue = [];
    this.pending = new Map();
    this.idle = [];
    this.workers = [];
    this.seq = 0;
    for (let i = 0; i < size; i++) {
      const w = fork(fileURLToPath(new URL('./tts-worker.js', import.meta.url)), [MODEL_ID, dtype], {
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      w.on('message', ({ id, audio, error }) => {
        const p = this.pending.get(id);
        this.pending.delete(id);
        this.idle.push(w);
        this.pump();
        if (error) p.reject(new Error('Kokoro TTS failed: ' + error));
        else p.resolve(audio);
      });
      w.on('exit', (c) => { if (c && this.pending.size) w.emit('error', new Error('TTS process exited with code ' + c)); });
      w.on('error', (e) => { for (const p of this.pending.values()) p.reject(e); this.pending.clear(); });
      this.workers.push(w);
      this.idle.push(w);
    }
  }
  run(job) {
    return new Promise((resolve, reject) => { this.queue.push({ job, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const { job, resolve, reject } = this.queue.shift();
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      w.send({ id, ...job });
    }
  }
  close() { for (const w of this.workers) if (w.connected) w.disconnect(); }
}

/**
 * Create a speaker. `speak(text)` resolves to a Float32Array of mono samples at 24 kHz.
 * Results are cached by (model, voice, speed, text) so re-renders cost nothing.
 */
export function createSpeaker({ voice = DEFAULT_VOICE, speed = 1, workers = 3, dtype = 'fp32', cache = true } = {}) {
  let pool;
  const dir = path.join(cacheDir(), 'tts');
  if (cache) fs.mkdirSync(dir, { recursive: true });

  async function speak(text) {
    const key = createHash('sha1').update(JSON.stringify([MODEL_ID, dtype, voice, speed, text])).digest('hex');
    const file = path.join(dir, key + '.f32');
    if (cache && fs.existsSync(file)) {
      const b = fs.readFileSync(file);
      return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
    }
    pool ??= new Pool(workers, dtype);
    const audio = await pool.run({ text, voice, speed });
    if (cache) fs.writeFileSync(file, Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength));
    return audio;
  }
  return { speak, close: () => pool?.close() };
}

/** Rough speech-duration estimate (seconds) used by preview/check without running TTS. */
export function estimateSeconds(text, speed = 1) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return words / (2.55 * speed) + 0.15;
}
