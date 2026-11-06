# Star Nova

**Star Nova** is a 3D space-action game made in **Unity 6** and set in **real star systems from NASA open data**, made by team **MarsBase**.
In 2300 the Klin'Tar Empire began conquering every inhabited world of the Milky Way. In 2500 it reached Earth — and humanity answered with a living weapon: **Nova**.

## Play
**Online: https://m1ller750.github.io/star-nova/** — the Unity WebGL build (desktop Chrome or Edge with a dedicated GPU recommended, headphones too; the first visit downloads about 55 MB).

The original Three.js version of the game is still playable at **https://m1ller750.github.io/star-nova/classic.html**.

To play locally, serve this folder with any static web server, e.g. on Windows:

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
```
then open http://localhost:8080 (Unity build) or http://localhost:8080/classic.html. Voice-over in the browser uses the Web Speech API.

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
Unity 6.3 with the Universal Render Pipeline (Forward+, soft shadows, SSAO, HDR bloom, ACES tonemapping). Every surface carries real photo-scanned detail: CC0 PBR sets from Poly Haven and ambientCG on the terrain (three layers per world, recoloured to each planet's palette, triplanar rock on cliffs), on Nova's armour, ship hulls and buildings; boulders are Poly Haven photo scans. The Solar System bodies wear real NASA imagery — Blue Marble with city lights on the night side for Earth, MESSENGER for Mercury, Clementine for the Moon, Viking for Mars, NASA maps of Jupiter, Saturn and Neptune. Exoplanets stay procedural (nobody has photographed them yet). God rays from the stars, gravitational lensing around Cygnus X-1, and volumetric-looking nebulae.

Aim assist is built in for the ship cannons, Nova's rifle and the eye lasers. Enemies carry a single red marker; worlds still held by the Klin'Tar are ringed in gold. The ship's hull and Nova's suit repair themselves when out of fire.

## Tech
- `index.html` + `Build/` — the Unity WebGL build (Brotli-compressed, decompressed in the browser so any static host can serve it).
- `classic.html`, `css/`, `src/` — the original Three.js version: ES modules with no build step, everything generated procedurally in code (`src/core` engine/input/audio/voice/UI · `src/gfx` shaders & models · `src/space` space mode · `src/ground` ground mode & locations · `src/missions` level scripts · `src/cinematics` intro/ending · `src/data` NASA data).
- The Unity project is kept outside this repository for now (its photo-scanned textures and baked audio are large).

## Credits
Data: NASA Exoplanet Archive, NASA Planetary Fact Sheet, NASA Chandra. Planet imagery: NASA (Blue Marble, Earth at Night, MESSENGER, Clementine, NASA 3D Resources). Textures and rock scans: Poly Haven and ambientCG (CC0). Fonts: Orbitron and Rajdhani (SIL Open Font License).
