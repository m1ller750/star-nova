# NOVA — The Klin'Tar Invasion

A 3D browser space-action game (Three.js, WebGL) set in **real star systems from NASA open data**.
In 2300 the Klin'Tar Empire began conquering every inhabited world of the Milky Way. In 2500 it reached Earth — and humanity answered with a living weapon: **Nova**.

## Play
**Online: https://m1ller750.github.io/nova-klintar-invasion/** (Chrome or Edge, headphones recommended)

Or open `index.html` through any static web server, e.g. locally on Windows:

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
```
then open http://localhost:8080. Chrome or Edge recommended (voice-over uses the Web Speech API).

## Levels (all bodies are real — NASA Exoplanet Archive / NASA Planetary Fact Sheet / NASA Chandra)
1. **Solar System** — dog-fights over Earth, liberate Mercury, Venus and Mars; the Sun overheats your hull.
2. **Kepler-90 (KOI-351)** — energy shield, the colonizer ring ship around Kepler-90 h, hostages, a 5:00 fusion charge, the Keplerian homeworld Kepler-90 f.
3. **TRAPPIST-1** — ship laser, EVA flight, back missiles, three different fortresses, the public execution on TRAPPIST-1 e (arms dealer, sniper rifle, smoke grenade).
4. **Cygnus X-1** — the black-hole trap, eject before the missile hits, eye lasers, void creatures, the portal.
5. **HR 8799** — infinite flight, titan punch, leaping onto comets and ships, hurling comets into dreadnoughts, the Shadow Guard, gorilla-beasts and the final boss.

Comets are the only fictional bodies. Every level is open from the start: **SELECT LEVEL** on the title screen or in the pause menu jumps straight to any of the five systems. Checkpoints are saved after every level.

## Controls
Ship: mouse aim · W/S throttle · A/D roll · Shift boost · LMB cannons · RMB rockets · Q shield · F laser · X eject · E land · J jump.
On foot / flying: WASD · Space jump (again in the air = fly) · C crouch · Shift sprint/boost · 1–5 weapons · LMB/RMB attack/aim · Z sight · F melee/takedown · R missiles · Q eye lasers · G smoke · X leap · E interact · V 1st/3rd person · Esc/P pause.

## Graphics
Physically based materials with clear-coat armor and fresnel rim lighting, procedural planets with relief shading and atmospheres, screen-space god rays from the stars, HDR bloom, gravitational lensing around Cygnus X-1, normal-mapped terrain and hulls, animated water and wind-swept grass, space dust that streaks with your speed.

Aim assist is built in for the ship cannons, Nova's rifle and the eye lasers. Enemies carry a single red marker; worlds still held by the Klin'Tar are ringed in gold. The ship's hull and Nova's suit repair themselves when out of fire.

## Tech
No build step: ES modules + Three.js r160 from jsDelivr. Everything (planets, ships, characters, music, sound effects, 2D story art) is generated procedurally in code.
`src/core` engine/input/audio/voice/UI · `src/gfx` shaders & models · `src/space` space mode · `src/ground` ground mode & locations · `src/missions` level scripts · `src/cinematics` intro/ending · `src/data` NASA data.
