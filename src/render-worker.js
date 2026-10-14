// Render worker process: draws and encodes whole scenes, so N scenes draw on N cores.
import { renderSegment, stillFor } from './render.js';

process.on('message', async ({ id, spec, tl, prevTl, file, tmp }) => {
  try {
    if (prevTl) tl.prevFrame = await stillFor(spec, prevTl, prevTl.dur - 1 / spec.fps, tmp, { contentOnly: true });
    await renderSegment(spec, tl, file);
    process.send({ id });
  } catch (e) {
    process.send({ id, error: String((e && e.stack) || e) });
  }
});
process.on('disconnect', () => process.exit(0));
