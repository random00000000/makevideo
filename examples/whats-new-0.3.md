---
title: makevideo 0.3
output: out/whats-new-0.3.mp4
brand: makevideo
---

# makevideo 0.3
Built for speed
> Here is what changed in makevideo, version zero point three. This release is all about speed.

## The goal
Videos so fast you *stop thinking about them*.
> The goal: videos so fast that you stop thinking about them.

## First render, same 74-second video
<!-- highlight: v0.3 fast voice -->
- v0.2: 120 s
- v0.3: 81 s
- v0.3 fast voice: 36 s
> Here is the same seventy four second video, rendered from scratch. Version zero point two took 120 s. Version zero point three takes 81 s. And with the new fast voice, 36 s.

## Re-render, voice cached
<!-- highlight: v0.3 -->
- v0.2: 41 s
- v0.3: 28 s
> Re-renders got faster too. 41 s before. 28 s now.

## What profiling found
- Drawing was stuck on one thread
- Voice processes fought over the CPU
- Animation windows were twice too long
> Profiling found three problems. Drawing was stuck on a single thread. Voice processes fought each other for the CPU. And animation windows were twice as long as the animations.

## What changed
1. Scenes render in a pool of processes
2. Voice threads are pinned per core
3. Each scene type knows its own timing
> So here is what changed. Scenes now render in a pool of processes. Voice threads are pinned to cores. And each scene type knows exactly how long its animations run.

## The fast lane
```bash
npx makevideo setup
npx makevideo video.md --fast
```
> For maximum speed, run setup once, so no render ever waits on a download. Then add dash dash fast. It switches to a Piper voice that speaks ten times faster than real time.

## Speech speed
**10x** real time, on 2 CPU threads, no GPU
> That is ten times real time speech, on two CPU threads, with no GPU.

# Same command. Faster.
npm i github:random00000000/makevideo
> makevideo, version zero point three. Same command, faster.
