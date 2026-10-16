# AGENTS.md: makevideo

If you are an AI agent asked to produce a **video** (explainer, devlog, patch notes, trailer, demo, recap, TikTok/Shorts, a presentation with voice-over), use `makevideo`. Read [`skills/makevideo/SKILL.md`](skills/makevideo/SKILL.md) for the workflow; it is short.

## Contributing to this repo

- `src/index.js`: pipeline (`video`, `check`, `preview`), frame planning (`planFrames`), and the ffmpeg encode/mux.
- `src/draw.js`: every scene type is one pure drawer `(ctx, scene, t, L)`. To add a scene type, add a drawer and an entry in `SCENE_TYPES` (`src/spec.js`) with `needs` and an `example`, then document it in the README table and `schema.json`.
- `src/spec.js`: normalization and validation. Error messages must say *where* the problem is and include a working example.
- `src/tts.js` + `src/tts-worker.js`: the Kokoro TTS process pool and its cache. Use processes, not worker_threads: onnxruntime-node crashes inside worker threads. Pin ONNX `intraOpNumThreads` and keep `allow_spinning: '0'`; see `ttsShape()` in index.js for the measured shape.
- `src/piper.js`: the "fast" voices (Piper VITS via onnxruntime-node, espeak phonemes from `phonemizer`, resampled to 24 kHz). Ship only permissively licensed voices: lessac is research-only, and ryan/hfc are non-commercial.
- `src/render.js` + `src/render-worker.js` + `src/render-pool.js`: scene layout, frame planning, drawing and ffmpeg encoding, run in a pool of processes.
- `src/record.js`: screen capture.
- `src/trailer.js` + `src/trailer-music.js`: trailer mode. It lays scenes on a beat grid, generates the trailer score, analyzes the beats of a user's track, picks the best clip window, and runs trailer lint.
- `src/electron.cjs` (`makevideo/electron`) + `src/shoot.js`: the shot runner inside an Electron game (frame-stepped capture on virtual time, camera moves, F8 instant replay) and the `shoot` CLI that drives it. `examples/game` is a sample game to test it with (`cd examples/game && npm i`).
- `src/markdown.js`: Markdown to spec (`fromMarkdown`).
- `src/fonts.js` + `fonts/`: bundled OFL fonts (static weights cut from the variable fonts with fontTools; variable-font weights don't select reliably in @napi-rs/canvas).

Performance rule: **nothing may animate continuously on card scenes.** Frame holding (`planFrames`) assumes frames change only right after events (scene start, reveals, caption cues, closing fade). If you add motion, mark its time window in `planFrames`, or the change will be invisible because the held frame gets repeated.

Canvas cost rules (measured; @napi-rs/canvas is lazy, so costs show up at `getImageData`): pattern fills cost about 80 ms per 1080p frame, so never use them per frame. A full-frame gradient fill or blit costs about 5–10 ms. Shadows and text are cheap. Transitions cost 2–3 blits and are fine because they only last 0.6 s.

Test with `npm test` (smoke render, no TTS) and `node bin/makevideo.js examples/showcase.json`.
