# Neon Drift: sample game for makevideo trailers

A tiny Electron + Three.js arena shooter. It exists to show `makevideo shoot`: it plays itself, so every shot has action. [trailer.md](trailer.md) is its beat sheet.

```bash
cd examples/game
npm install
npm start                                   # play it (WASD; F8 saves the last 15 s)
node ../../bin/makevideo.js preview trailer.md
node ../../bin/makevideo.js shoot trailer.md   # films shots/*.mp4 from the game
node ../../bin/makevideo.js trailer.md         # out/neon-drift-trailer.mp4
```

The makevideo parts of the game are one line in [main.cjs](main.cjs), `attach(win)`, and one in [game.js](game.js), `window.makevideo = { renderer, scene, camera }`. Shot setup code calls `window.game`.
