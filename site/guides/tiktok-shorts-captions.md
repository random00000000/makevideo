---
title: Make TikTok, Reels and YouTube Shorts programmatically, with word-by-word captions
description: Generate vertical 1080x1920 short-form videos with big word-by-word captions, a local voice-over and GIF export — from Markdown or JSON, on a CPU.
---

# TikTok, Reels and Shorts with word-by-word captions

Short-form video has a house style: vertical 9:16, a strong hook, and huge captions where the spoken word lights up. makevideo does that with one option:

```md
---
format: shorts
theme: forge
gif: true
---

## AI agents, listen up
Stop *hand-making* videos.
> Your agent can make a video like this in seconds.

## Proof
**1** JSON file in, one video out
> One JSON file in. One finished video out.

## Footage
![](captures/boss-fight.mp4)
> Drop in gameplay clips, GIFs or screen recordings.
```

```bash
npx -y github:random00000000/makevideo short.md
```

- `format: shorts` → 1080×1920 and **bold captions** (a few words at a time, heavy outline, current word in the accent colour) by default.
- `gif: true` (or `{ width, fps, duration }`) also exports an animated GIF for previews and READMEs.
- Statements, stats and clips work best in portrait; `check` warns when a dense scene (code, charts, comparisons) is used in a vertical video.
- Use `--fast` while iterating on the script; switch back to the default voice for the final cut.
