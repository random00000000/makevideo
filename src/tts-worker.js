// Child process: owns one Kokoro ONNX session and synthesizes one sentence at a time.
// (A process, not a worker_thread: onnxruntime-node is not safe inside worker threads.)
import { KokoroTTS } from 'kokoro-js';

const [model, dtype] = process.argv.slice(2);
let ttsP;
process.on('message', async ({ id, text, voice, speed }) => {
  try {
    ttsP ??= KokoroTTS.from_pretrained(model, { dtype, device: 'cpu' });
    const tts = await ttsP;
    const out = await tts.generate(text, { voice, speed });
    process.send({ id, audio: Float32Array.from(out.audio) });
  } catch (e) {
    process.send({ id, error: String((e && e.stack) || e) });
  }
});
process.on('disconnect', () => process.exit(0));
