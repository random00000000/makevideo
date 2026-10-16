---
title: Make a Steam trailer for a Three.js + Electron game, cut on the beat
description: Write the shot list as a Markdown beat sheet, let your Electron game film every shot (smooth 60 fps even on a slow GPU), and get a trailer cut on the music with text slams, a logo reveal and a Wishlist on Steam card.
---

# A Steam trailer for your Three.js + Electron game

Better FPS won't make a better trailer. What helps is a **good shot list**, **shots that execute it exactly**, and **an edit that sits on the music**, with text, logo and a call to action. makevideo turns each of those into one command.

[Watch the sample trailer](https://github.com/random00000000/makevideo/blob/main/docs/neon-drift-trailer.mp4). It is 36 seconds long, and every shot was filmed by the [sample game](https://github.com/random00000000/makevideo/tree/main/examples/game) from [this beat sheet](https://github.com/random00000000/makevideo/blob/main/examples/game/trailer.md).

## 1. Add two lines to your game

```js
// Electron main process
require('makevideo/electron').attach(win);
```

```js
// renderer, after you create them
window.makevideo = { renderer, scene, camera };
```

Give the objects you want to film a name (`player.name = 'hero'`), and expose whatever your shots need to set up, for example `window.game = { loadLevel, spawnWave, boss }`.

## 2. Write the shot list as a beat sheet

```bash
npx -y github:random00000000/makevideo init --style trailer
```

Each `##` block is one beat of the edit, sized in **music beats**, and placed in a section of the score: `intro`, `build`, `drop`, `breakdown`, `finale`, `outro`.

````md
## Swarm
<!-- section: build, beats: 4 -->
```shot
setup: |
  game.loadLevel('arena'); game.spawnWave(18);
camera: follow hero 0,4,11
```
THEN THEY CAME
````

Camera moves work around any named object or `x,y,z` point:

| move | example |
|---|---|
| orbit | `orbit hero 12 3 0 90` (radius, height, from°, to°) |
| push | `push boss 34 16 3` (from distance, to distance, height) |
| dolly / fly | `fly 30,20,30 -10,4,12 look hero` |
| follow | `follow hero 0,4,11` (offset) |
| hold | `hold 0,5,20 look hero` |

## 3. Storyboard and lint

```bash
npx makevideo preview trailer.md
```

You get a storyboard with one frame per beat, labelled with its section, beat count, time and flash cuts, in about 5 seconds. Trailer lint checks the rules that matter on Steam:
- gameplay within 5 s
- logo after gameplay
- 30–90 s long
- end on Wishlist
- slams of 5 words or fewer
- no three text cards in a row
- clips long enough for their beats

## 4. Shoot

```bash
npx makevideo shoot trailer.md
```

This command:
1. Launches the game with `npm start` (or `game:` in the front matter).
2. For every shot, runs the setup code and moves the camera.
3. Records the canvas at 1920×1080, frame-stepped on virtual time. The footage is smooth at 30 or 60 fps whatever your GPU does, and the HUD never appears in it.

To re-film one shot, run `--only "Swarm"`. For moments you can't script, play the game and press **F8**: the last 15 seconds are saved to `makevideo-clips/`.

## 5. Render

```bash
npx makevideo trailer.md
```

How the edit is built:
- Cuts land on the beat (within half a frame). Cuts on the music's hits flash.
- The generated score follows your sections.
- Each clip's game audio sits under the music, and the whole mix is normalized to −14 LUFS.

**Your own music:** run `npx makevideo beats song.mp3`. Then set `music: song.mp3`, `bpm` and `musicOffset` in the front matter for exact sync.

## Not on Electron?

Record a window with `npx makevideo record clip.mp4 --seconds 12 --window "My Game"`, and put `![](clip.mp4)` in the beat sheet instead of a `shot` block. The edit, music and cards work the same way.
