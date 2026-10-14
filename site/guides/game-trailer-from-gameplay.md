---
title: Narrated game trailers and devlogs from gameplay recordings
description: Record gameplay from a window, then turn clips into a narrated trailer or devlog with titles, captions and transitions — all from the command line.
---

# Narrated game trailers and devlogs from gameplay

## 1. Record footage

```bash
npx -y github:random00000000/makevideo record captures/siege.mp4 --seconds 12 --window "My Game"   # one window (Windows)
npx -y github:random00000000/makevideo record captures/menu.mp4 --seconds 8                        # whole screen (Windows/macOS/Linux)
```

## 2. Write the trailer

```md
---
theme: forge
brand: My Game
---

# My Game
Early access, this spring
> This is My Game.

## The siege
![](captures/siege.mp4)
> Build rams. Break gates. Take the keep.

## Every run is different
Procedural maps, *permanent* consequences.
> Every run is different. Procedural maps, permanent consequences.

## Wishlist now
![](captures/menu.mp4)
- Early access this spring
- Wishlist on Steam
> Early access is this spring. Wishlist it now.
```

Clip scenes are cropped to fill the frame and looped if short (`start:` picks the offset). A clip next to bullet points becomes a split scene with the video playing inside a rounded frame.

## 3. Render

```bash
npx -y github:random00000000/makevideo trailer.md
npx -y github:random00000000/makevideo trailer.md --format shorts -o trailer-vertical.mp4
```

## Devlogs and patch notes

The same file format works for weekly devlogs: a title, a few `##` scenes with clips or bullet points, a chart of numbers that changed, and a closing `## Decisions` list for the team.
