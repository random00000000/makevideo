---
title: makevideo 0.5
output: out/whats-new-0.5.mp4
brand: makevideo
music: documentary
musicVolume: 0.22
---

## 
Your agent can now make *documentaries*.
> Your agent can now make documentaries.

## YouTube-ready, from one file
![](../docs/t-rex.mp4)
- Licensed images, found automatically
- Chapter cards, timelines and a score
- YouTube loudness, thumbnail and chapters
> Here is what changed in version zero point five. Licensed images are found automatically. There are chapter cards, timelines, and an original score. And every video ships with YouTube loudness, a thumbnail, and chapter timestamps.

## Images
**8** licensed images, found by the agent
> This T. rex video used eight licensed images. Each one was found on Wikimedia Commons, with its credit added automatically.

## Sync
Big words land *with the voice*.
> Next, big words now land with the voice.

## Captions, decluttered
- Hidden when the screen already says it
- Every line kept in the subtitle file
> Captions are decluttered too. They hide when the screen already says it. And every line stays in the subtitle file.

## Image check
```text
ok "Tyrannosaurus rex skull"   → Tyrannosaurus Rex Skull (cast)
?? "Barnum Brown with fossil"  → Montanoceratops skeleton
ok "Tyrannosaurus rex holotype" → Tyrannosaurus Rex Holotype
```
> Preview now shows which image each search picked. A question mark means it may not match, like the wrong dinosaur it caught in our own video. The fix was the real holotype.

## Start in one line
```bash
npx makevideo init --style documentary
```
> And agents can start from a template, for documentaries, shorts, or explainers.

## Verified
1. Pushed to GitHub
2. Tests green on Linux, macOS and Windows
3. MCP Registry serving 0.5.2
> Everything is verified. It is pushed to GitHub. Tests pass on Linux, macOS and Windows. And the MCP registry serves version zero point five point two.

# makevideo 0.5
Documentaries, in sync, checked
> That is makevideo, version zero point five. Documentaries, in sync, and checked.
