---
title: Make YouTube history and science documentaries with an AI agent
description: Turn a script into a narrated, YouTube-ready documentary with licensed Wikimedia Commons images, chapter cards, timelines, a music bed, -14 LUFS audio, a thumbnail and chapter timestamps.
---

# YouTube history and science documentaries with an AI agent

History channels and science channels share a format: narration over paintings, photos and maps, chapter cards, timelines, a quiet score, and a strong thumbnail. makevideo produces all of it from one Markdown file:

```bash
npx -y github:random00000000/makevideo t-rex.md
```

```md
---
title: Tyrannosaurus rex, the tyrant lizard king
style: nature            # documentary | history | nature
thumbnailText: The real T. rex
---

## Tyrannosaurus rex
![Tyrannosaurus rex skeleton museum]()
The tyrant lizard king
> Sixty six million years ago...

## Chapter: Built to kill
![Tyrannosaurus rex skull]()
> Chapter two. Built to kill.

## Timeline
- 68 Mya: T. rex appears
- 66 Mya: Asteroid impact
> Its story fits on one line. It appears sixty eight million years ago. It vanishes when the asteroid hits.
```

## What the style switch gives you

- **Images you can publish:** `![description]()` searches Wikimedia Commons and keeps only CC0, public domain, CC BY and CC BY-SA files. Each image shows a credit line, and the description lists every attribution.
- **Motion:** a slow Ken Burns move on every still, chapter cards with serif titles, timelines and animated charts.
- **Sound:** an original synthesized score (no licensing) ducked under the narration, and the master normalized to −14 LUFS for YouTube.
- **Publishing files:** `video.thumbnail.jpg` (1280×720) and `video.description.txt` with chapter timestamps YouTube accepts.

## Using transcripts responsibly

A transcript of someone else's video is research material. Let the agent write its own narration from your sources. Republishing another creator's script infringes their copyright, and YouTube demonetizes it as reused content.
