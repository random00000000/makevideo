---
title: Turn a Markdown file into a narrated MP4 video
description: Write a video as Markdown — headings are scenes, quote lines are narration — and render it to a narrated, captioned MP4 with one command.
---

# Turn a Markdown file into a narrated MP4

```bash
npx -y github:random00000000/makevideo notes.md
```

## The syntax

~~~md
---
theme: midnight        # front matter: any top-level option (theme, format, voice, brand, output)
brand: My Game
---

# Patch 1.2                      ← title scene
The siege update                 ← subtitle
> Here is what changed.          ← narration

## Rams breach gates             ← each ## heading is a scene
![](captures/ram.mp4)            ← media: video/GIF clip or image
- Wooden gates break in 3 hits   ← with items → a split scene (media + points)
- Stone gates still hold
> Rams now breach wooden gates. Three hits and they are down. Stone gates still hold.

## Load time
<!-- highlight: Now -->          ← scene options as key: value
- Before: 12 s                   ← "label: number" items → animated bar chart
- Now: 3 s

## The goal
Renders in *seconds*.            ← a lone paragraph → huge kinetic statement (*stars* = accent)

## Big number
**4.6x** faster renders          ← bold value + label → stat with count-up

## The fix
```js                            ← fenced code → code scene with line numbers
const x = 1;
```

## Decisions                     ← a list under a "Decisions" heading → numbered decisions
- Ship Friday?
~~~

## Rules that make videos better

- **Narration is the default.** Without a `>` line, the visible text is read aloud.
- **Write one intro sentence plus one sentence per list item** — items then appear exactly when the voice reaches them.
- **Write naturally.** `42%`, `v1.2`, `$3M`, `4.6x` and `35 s` are spoken correctly; captions keep what you wrote.
- Run `makevideo check notes.md` — it suggests fixes for walls of text, too many bullets, and repetitive pacing.
