---
title: Narrated text-to-video on a CPU — no GPU, no API key (Node.js)
description: Generate narrated MP4 videos from text on a plain CPU in Node.js, with a local neural TTS voice, captions and transitions. Measured timings included.
---

# Narrated text-to-video on a CPU, with no GPU and no API key

Most "text to video" tools either call a paid cloud API or need a GPU. Agent sandboxes and CI runners usually have neither. makevideo renders on a plain CPU:

- **Voice:** Kokoro-82M (Apache-2.0) running locally through ONNX Runtime — or a Piper voice with `--fast` that speaks ~10x faster than real time on two CPU threads.
- **Frames:** drawn with Skia (`@napi-rs/canvas`) — no headless browser.
- **Encoding:** H.264 via a bundled ffmpeg (`ffmpeg-static`).

```bash
npm i github:random00000000/makevideo
npx makevideo setup          # pre-download voice models once (CI / cloud images)
npx makevideo video.md       # or video.json
npx makevideo video.md --fast
```

## How fast is it?

Measured on a 6-core laptop CPU (i7-10750H), no GPU, for the same 74-second, 8-scene video:

| | time |
|---|---|
| first render, default voice | ~81 s |
| first render, `--fast` voice | ~36 s |
| re-render with cached speech | ~28 s |

## Why it is fast on a CPU

1. **Frame holding.** Slide videos are mostly still frames. makevideo knows each scene type's animation timing, draws only frames that can change (about 30%), and lets ffmpeg repeat held frames after colour conversion, where repeats are almost free.
2. **Render processes.** Scenes draw and encode in a pool of processes, so drawing uses many cores.
3. **Tuned speech.** ONNX threads are pinned per process; processes that each grab every core fight and get slower.
4. **Caching.** Every sentence's audio is cached by voice + text, so re-renders after a layout fix skip speech entirely.

## From code

```js
import { video } from 'makevideo';

const r = await video({
  title: 'Patch notes',
  scenes: [
    { type: 'title', title: 'Patch 1.2', say: 'Here is what changed in patch one point two.' },
    { type: 'chart', title: 'Load time', unit: ' s', bars: { Before: 12, Now: 3 }, say: 'Load time. Twelve seconds before. Three now.' },
  ],
});
console.log(r.output, r.duration, r.seconds);
```
