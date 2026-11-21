# Solara Nights — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)

**Solara Nights** is a complete open-world crime game in the spirit of GTA 6, built
for make.fun's "Make GTA 6" bounty ($1,666). It runs offline in a desktop browser
from static files — no network requests, no accounts, no Rockstar assets. Everything
in it is original: the city of Solara, the story of Rico Vega, the art, the sound.

## Play it

```sh
node serve.ts        # then open http://localhost:8080
```

Keyboard and mouse: **WASD** move / drive, **Shift** run, **Space** jump, **E** enter or
exit a car, **click** shoot, **mouse drag** look around, **P** pause, **M** mute.
Progress (cash, missions) is saved in localStorage; the title screen offers Continue.

## The city

Solara City is a sun-soaked procedural city: a 7×7 grid of blocks with roads,
sidewalks, downtown towers, a beach and ocean to the south, palm trees, streetlights
and clouds. Traffic cars drive the roads, pedestrians walk the sidewalks, and the
whole city is one continuous open world — no loading screens.

## The systems

- **On foot and by car** — third-person character (walk, run, jump) and arcade car
  driving with a chase camera, speed and handling per car.
- **Traffic and pedestrians** — cars follow the road grid and brake for traffic;
  pedestrians wander the sidewalks and flee from crime.
- **Stealing cars** — walk up to any parked or traffic car and press E; the driver
  gets out and runs. Every stolen car raises your wanted level.
- **Wanted system and police** — crimes raise 1–5 wanted stars. Police cars chase
  and ram you; officers on foot chase and bust you. Evade them and the heat decays;
  get busted and you wake up at Rosa's Garage minus $100 bail.
- **Missions and story** — five missions for fixer Mama Rosa: steal a car for the
  garage, deliver a package on foot, lose a 2-star wanted level, survive a shootout
  with the Viper gang, and a final 3-star getaway with a yellow sports car. Each has
  objectives, a map marker, dialogue and a cash reward.
- **Combat** — hitscan pistol with ammo, crosshair and tracers; enemies return fire
  and have health. Drive-by shooting from a car.
- **HUD with minimap** — a live top-down minimap (roads, beach, landmarks, player,
  cars, police, enemies, mission marker), wanted stars, cash, health, speed and a
  mission tracker.
- **Start and save** — title screen with story intro and controls, pause menu,
  busted and story-complete screens, autosave and Continue.
- **Sound** — synthesized WebAudio effects (engine, sirens, gunshots, pickups) and
  a bassline, with mute.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json`
with the vendored make.fun library. Node 22 or later, standard library only.

## What is in this repo

- `main.ts` — the entry program: hands in the game and screenshots, writes the dossier.
- `serve.ts` — a tiny static server for local play (`node serve.ts`).
- `game/` — the playable game as static files: `index.html`, `src/` (city, game
  logic, HUD, audio, boot) and `vendor/three.module.js` (Three.js, vendored).
- `screenshots/` — four screenshots of the game itself: title, driving, a police
  chase, and the warehouse shootout.
- `shots.json` — the scenes behind the screenshots (`?shot=start|drive|chase|mission`).

## Verification

Re-run the build, then check the outputs are unchanged (`git status` clean and the
SHA-256 of `out/game` identical). In a browser, load the game, start a new story,
steal a car with E, drive to the marker, and confirm the wanted stars and police
respond; screenshots are taken from the real game with `?shot=…&seed=1`.
