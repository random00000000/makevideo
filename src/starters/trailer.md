---
style: trailer
title: My Game
bpm: 110
game: npm start
output: out/trailer.mp4
---

## Cold open
<!-- section: intro, beats: 8 -->
```shot
setup: |
  // any code your game understands: load a level, spawn enemies, set the time of day
camera: orbit player 12 3 0 70
```

## Hook
<!-- section: intro, beats: 4 -->
YOU ARE NOT ALONE

## First fight
<!-- section: build, beats: 4 -->
```shot
camera: push player 30 10 6
```

## Escalate
<!-- section: build, beats: 4 -->
```shot
camera: follow player 0,4,11
```
IT GETS WORSE

## Best moment
<!-- section: drop, beats: 4 -->
```shot
camera: orbit player 9 2 -40 40
```

## Second best moment
<!-- section: drop, beats: 4 -->
```shot
camera: fly 30,20,30 -10,4,12 look player
```

## Breather
<!-- section: breakdown, beats: 8, speed: 0.5 -->
```shot
camera: orbit player 7 1.5 200 260
```
ONE LAST CHANCE

## Climax
<!-- section: finale, beats: 8 -->
```shot
camera: push boss 34 16 3
```

# MY GAME
<!-- beats: 8 -->
A one-line pitch

## Wishlist on Steam
<!-- beats: 8 -->
Coming 2027
