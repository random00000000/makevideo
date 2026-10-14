// Child process: owns one Kokoro ONNX session and synthesizes one sentence at a time.
// (A process, not a worker_thread: onnxruntime-node is not safe inside worker threads.)
// The model is loaded directly so we can pin ONNX's thread count: N processes that each
// grab every core fight each other, N processes with cores/N threads each scale.
import { KokoroTTS } from 'kokoro-js';
import { StyleTextToSpeech2Model, AutoTokenizer } from '@huggingface/transformers';

const [model, dtype, threads] = process.argv.slice(2);
const intra = Number(threads) || 0;
let ttsP;
async function load() {
  // allow_spinning=0: idle ONNX threads sleep instead of spinning, leaving the CPU to the renderer
  const session_options = {
    ...(intra ? { intraOpNumThreads: intra, interOpNumThreads: 1 } : {}),
    extra: { session: { intra_op: { allow_spinning: '0' }, inter_op: { allow_spinning: '0' } } },
  };
  const [m, tok] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(model, { dtype, device: 'cpu', session_options }),
    AutoTokenizer.from_pretrained(model),
  ]);
  return new KokoroTTS(m, tok);
}
process.on('message', async ({ id, text, voice, speed }) => {
  try {
    ttsP ??= load();
    const tts = await ttsP;
    const out = await tts.generate(text, { voice, speed });
    process.send({ id, audio: Float32Array.from(out.audio) });
  } catch (e) {
    process.send({ id, error: String((e && e.stack) || e) });
  }
});
process.on('disconnect', () => process.exit(0));
