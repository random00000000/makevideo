---
title: makevideo vs Remotion vs MoviePy vs ffmpeg scripts — which to use for programmatic video?
description: An honest comparison of ways to generate video from code, and when an opinionated, narration-first tool like makevideo is the right choice.
---

# makevideo vs Remotion vs MoviePy vs ffmpeg scripts

All four make video from code. They aim at different jobs.

| | makevideo | Remotion | MoviePy | raw ffmpeg |
|---|---|---|---|---|
| You write | Markdown or JSON scenes | React components | Python | filter graphs / shell |
| Narration (TTS) | built in, local voice, default on | bring your own | bring your own | bring your own |
| Captions | built in (+ .srt) | build it | build it | subtitles filter |
| Rendering | Skia canvas + ffmpeg, CPU | headless Chrome | Python + ffmpeg | ffmpeg |
| Custom motion design | limited (scene types, transitions) | unlimited | flexible | flexible, hard |
| Best for | agents and fast, consistent explainers | bespoke, designed videos | Python editing pipelines | exact control |

## Choose makevideo when

- An **agent** (or a busy human) needs a narrated explainer, recap, changelog, devlog, demo or short — on a CPU, without an API key — and it should look and sound the same every time.
- You care more about *getting a good video in one try* than about designing every frame.

## Choose something else when

- **Remotion** — you want full React-level control over motion design and are happy to run a browser. Check its license terms for company use.
- **MoviePy** — your pipeline is Python and you are editing existing footage more than generating explainers.
- **raw ffmpeg** — you need precise control over a specific transform and nothing else.

makevideo also uses ffmpeg under the hood; it simply decides the things agents tend to get wrong: voice, timing, captions, layout, pacing and encoding settings.
