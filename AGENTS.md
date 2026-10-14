# AGENTS.md: makevideo

If you are an AI agent asked to produce a **video** (explainer, devlog, patch notes, trailer, demo, recap, TikTok/Shorts, a presentation with voice-over), use `makevideo`. Read [`skills/makevideo/SKILL.md`](skills/makevideo/SKILL.md) for the workflow; it is short.

## Contributing to this repo

- `src/index.js`: pipeline (`video`, `check`, `preview`), frame planning (`planFrames`), and the ffmpeg encode/mux.
- `src/draw.js`: every scene type is one pure drawer `(ctx, scene, t, L)`. To add a scene type, add a drawer and an entry in `SCENE_TYPES` (`src/spec.js`) with `needs` and an `example`, then document it in the README table and `schema.json`.
- `src/spec.js`: normalization and validation. Error messages must say *where* the problem is and include a working example.
- `src/tts.js` + `src/tts-worker.js`: the Kokoro TTS process pool and its cache. Use processes, not worker_threads: onnxruntime-node crashes inside worker threads.
- `src/record.js`: screen capture.
- `src/markdown.js`: Markdown to spec (`fromMarkdown`).
- `src/fonts.js` + `fonts/`: bundled OFL fonts (static weights cut from the variable fonts with fontTools; variable-font weights don't select reliably in @napi-rs/canvas).

Performance rule: **nothing may animate continuously on card scenes.** Frame holding (`planFrames`) assumes frames change only right after events (scene start, reveals, caption cues, closing fade). If you add motion, mark its time window in `planFrames`, or the change will be invisible because the held frame gets repeated.

Canvas cost rules (measured; @napi-rs/canvas is lazy, so costs show up at `getImageData`): pattern fills cost about 80 ms per 1080p frame, so never use them per frame. A full-frame gradient fill or blit costs about 5–10 ms. Shadows and text are cheap. Transitions cost 2–3 blits and are fine because they only last 0.6 s.

Test with `npm test` (smoke render, no TTS) and `node bin/makevideo.js examples/showcase.json`.
