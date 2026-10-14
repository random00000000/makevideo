// "fast" voices: Piper (VITS) models run through onnxruntime-node. Roughly 10x faster than
// Kokoro on CPU, at lower naturalness. Only permissively licensed voices are offered:
//   joe (CC0 dataset), norman (public-domain LibriVox recordings).
import fs from 'node:fs';
import path from 'node:path';
import ort from 'onnxruntime-node';
import { phonemize } from 'phonemizer';

export const FAST_VOICES = {
  fast: 'en/en_US/joe/medium/en_US-joe-medium', // alias: the default fast voice
  joe: 'en/en_US/joe/medium/en_US-joe-medium',
  norman: 'en/en_US/norman/medium/en_US-norman-medium',
};
const BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const PUNCT = /(\s*[;:,.!?¡¿—…"«»“”()]+\s*)+/g;

async function download(url, file) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url}: HTTP ${res.status}`);
  const tmp = file + '.part';
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, file);
  return file;
}

/** IPA for text, keeping punctuation (Piper models are trained with it). */
async function toPhonemes(text, lang) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ punct: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  const out = await Promise.all(parts.map(async (p) => (p.punct ?? (await phonemize(p.text, lang)).join(' '))));
  return out.join('');
}

/** Linear resample to 24 kHz so Piper audio drops into the same pipeline as Kokoro. */
function resample(input, from, to) {
  if (from === to) return input;
  const n = Math.round((input.length * to) / from);
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step, i0 = Math.floor(x), f = x - i0;
    out[i] = (input[i0] ?? 0) * (1 - f) + (input[i0 + 1] ?? input[i0] ?? 0) * f;
  }
  return out;
}

/** Load a fast voice. `speak(text)` → Float32Array, mono, 24 kHz. */
export async function createPiper(voice, { cacheDir, threads = 2, speed = 1 }) {
  const rel = FAST_VOICES[voice];
  const dir = path.join(cacheDir, 'piper');
  const model = await download(BASE + rel + '.onnx', path.join(dir, path.basename(rel) + '.onnx'));
  const cfgFile = await download(BASE + rel + '.onnx.json', path.join(dir, path.basename(rel) + '.onnx.json'));
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const session = await ort.InferenceSession.create(model, { intraOpNumThreads: threads, interOpNumThreads: 1 });
  const map = cfg.phoneme_id_map;
  const { noise_scale = 0.667, length_scale = 1, noise_w = 0.8 } = cfg.inference || {};
  return async function speak(text) {
    const ipa = await toPhonemes(text, cfg.espeak?.voice || 'en-us');
    const ids = [...map['^']];
    for (const ch of ipa) {
      const id = map[ch];
      if (!id) continue; // espeak can emit symbols this voice was not trained on
      ids.push(...id, ...map['_']);
    }
    ids.push(...map['$']);
    const input = new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
    const lengths = new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]);
    const scales = new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale / speed, noise_w]), [3]);
    const out = await session.run({ input, input_lengths: lengths, scales });
    const audio = out[session.outputNames[0]].data;
    return resample(audio, cfg.audio.sample_rate, 24000);
  };
}
