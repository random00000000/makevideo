---
style: trailer
title: Neon Drift
bpm: 110
game: npm start
output: out/neon-drift-trailer.mp4
---

## Calm open
<!-- section: intro, beats: 8 -->
```shot
setup: |
  game.reset(); game.calm();
camera: orbit hero 12 3 20 80
```

## Silence
<!-- section: intro, beats: 4 -->
THE GRID WAS QUIET

## They came
<!-- section: build, beats: 4 -->
```shot
setup: |
  game.reset(); game.calm(); game.wave(16);
camera: push hero 34 14 9 60
```

## Until
<!-- section: build, beats: 2 -->
THEN THEY CAME

## Swarm
<!-- section: build, beats: 4 -->
```shot
setup: |
  game.reset(); game.wave(18);
camera: follow hero 0,4,11
```

## Dogfight
<!-- section: drop, beats: 4 -->
```shot
setup: |
  game.reset(); game.wave(20);
camera: orbit hero 9 2 -40 40
```
FLY FAST

## Chain
<!-- section: drop, beats: 4 -->
```shot
setup: |
  game.reset(); game.wave(24);
camera: fly 30,20,30 -10,4,12 look hero
```
SHOOT FIRST

## Breathe
<!-- section: breakdown, beats: 8 -->
```shot
setup: |
  game.reset(); game.wave(14); game.slowmo(0.25);
camera: orbit hero 7 1.5 200 260
```
ONE PILOT

## Titan
<!-- section: finale, beats: 8 -->
```shot
setup: |
  game.reset(); game.calm(); game.boss();
camera: push titan 34 16 3 100
```
FACE THE TITAN

## Final strike
<!-- section: finale, beats: 4 -->
```shot
setup: |
  game.reset(); game.calm(); game.boss(); setTimeout(() => game.explode(0, 7, -18), 900);
camera: orbit titan 22 6 60 110
wait: 0.2
```

# NEON DRIFT
<!-- beats: 8 -->
A neon arena shooter

## Wishlist on Steam
<!-- beats: 8 -->
Coming 2027
