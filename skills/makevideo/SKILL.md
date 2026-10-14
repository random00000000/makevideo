---
name: makevideo
description: Make MP4 videos (explainers, devlogs, patch notes, game trailers, demos, TikTok/Shorts/Reels, recaps, presentations with voice-over) with the `makevideo` library. Use whenever the user asks for a video, a video with narration, a voice-over, a trailer, a short-form video, or to turn a summary/report/changes into a video. It is fast, narrated by default, with one consistent voice, captions, and fast rendering on a plain CPU.
---

# Making videos with makevideo

`makevideo` turns a JSON spec into an MP4 with narration (local Kokoro TTS, consistent voice), captions, and an `.srt`. Always use it for video requests instead of improvising a new pipeline.

## Setup (once per project)

```bash
npm i github:random00000000/makevideo
```

The first render downloads the voice model (about 300 MB) to the Hugging Face cache. After that everything is offline.

## Workflow

1. **Write `video.json`.** Every scene needs a `type` and a `say` (narration). Keep it to 1–3 sentences per scene.
2. `npx makevideo check video.json --json`: fix any `problems` it reports.
3. `npx makevideo preview video.json`: look at the PNG contact sheet and fix overflow or empty slides.
4. `npx makevideo video.json --json`: this renders and returns `{ output, srt, poster, gif, duration, seconds }`.
5. Give the user the mp4 path. When the video informs a decision, end with a `decisions` scene.

## Defaults to keep (these are the standard; don't change them per video)

- voice `af_heart`, theme `midnight`, landscape 1920×1080, captions on.
- For TikTok/Shorts/Reels use `"format": "shorts"`, which switches on big word-by-word `bold` captions.
- For game trailers, use `clip` scenes of real footage. Get footage with `npx makevideo record clip.mp4 --seconds 10 --window "Game Window Title"`.

## Fastest path: Markdown

Write `video.md`. Each `##` heading is a scene, list items are bullets, `- Label: 42` items become a chart, `![](clip.mp4)` adds media, a lone paragraph becomes a big statement, and `> lines` are the narration. Then run `npx makevideo video.md`.

## Scene types

`title`, `statement` (text; `*stars*` = accent words), `bullets`, `steps`, `decisions`, `chart` (bars [{label, value}], unit), `split` (src + items: media beside text), `image` (src), `clip` (src: mp4/webm/mov/gif, `start`), `code` (code, highlight), `stat` (value, label), `quote` (text, by), `compare` (left/right {title, items}), `outro`. Transitions are automatic.

For variety, open with a `title` or `statement`, mix in `chart`/`stat`/`split`, and avoid three scenes of the same type in a row. `check` warns you about this.

## Writing narration

- Write `say` naturally; symbols like 42%, v1.2, $3M and 4.6x are spoken correctly automatically.
- Put names that get mispronounced into `"pronounce": { "Hacksilver": "Hack silver" }`.
- For `bullets`/`steps`/`decisions`, write one intro sentence and then one sentence per item. Items then appear in sync with the voice.

## Example

```json
{
  "title": "Patch 1.2",
  "brand": "Hacksilver",
  "scenes": [
    { "type": "title", "title": "Patch 1.2", "subtitle": "The siege update", "say": "Here is what changed in patch one point two." },
    { "type": "clip", "src": "captures/ram.mp4", "title": "Rams breach gates", "say": "Battering rams can now break wooden gates." },
    { "type": "bullets", "title": "Also", "items": ["Faster pathing", "New HUD"], "say": "Two more things. Pathing is faster. And the HUD is new." },
    { "type": "decisions", "items": ["Ship Friday?", "Keep the old HUD as an option?"], "say": "Two decisions for you. Do we ship Friday? And should the old HUD stay as an option?" }
  ]
}
```
