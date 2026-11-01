// Real star systems. Values come from NASA open data:
//  - Solar System: NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet)
//  - Kepler-90 (KOI-351), TRAPPIST-1, HR 8799: NASA Exoplanet Archive, Planetary Systems Composite (pscomppars)
//  - Cygnus X-1: NASA Chandra X-ray Observatory / NASA Science (21 solar-mass black hole, companion HDE 226868)
// Game positions are compressed (sqrt of orbital distance) so systems are playable; order and relative sizes are kept.
import * as THREE from 'three';
import { hashString } from '../core/util.js';

// planet look types used by the planet shader
export const PT = { ROCKY: 0, CRATER: 1, VENUS: 2, GAS: 3, ICEGIANT: 4, EARTH: 5, LAVA: 6, OCEAN: 7, ICE: 8, JUNGLE: 9, HOTGAS: 10 };

export const SYSTEMS = {
  sol: {
    id: 'sol', level: 1, name: 'SOLAR SYSTEM', distanceText: 'Home system · Orion Arm, Milky Way',
    star: { name: 'SUN', sub: 'G2 V · 5,772 K', teff: 5772, rSun: 1.0, radius: 1500 },
    scale: { inner: 5200, outer: 36000 },
    planets: [
      { name: 'MERCURY', rE: 0.383, a: 0.387, temp: '167 °C', g: 0.38, look: { type: PT.CRATER, c1: 0x8a8580, c2: 0x5e5853, c3: 0xb8b0a5, atmo: null }, biome: 'mercury', captured: true },
      { name: 'VENUS', rE: 0.949, a: 0.723, temp: '464 °C', g: 0.90, look: { type: PT.VENUS, c1: 0xe8c98a, c2: 0xc99a52, c3: 0xfff0c8, atmo: 0xffd9a0, atmoK: 1.2 }, biome: 'venus', captured: true },
      { name: 'EARTH', rE: 1.0, a: 1.0, temp: '15 °C', g: 1.0, look: { type: PT.EARTH, atmo: 0x6fb2ff, atmoK: 1.3 }, noLanding: true, home: true },
      { name: 'MARS', rE: 0.532, a: 1.524, temp: '−65 °C', g: 0.38, look: { type: PT.ROCKY, c1: 0xb5562c, c2: 0x7a3417, c3: 0xd99a6c, atmo: 0xff9a6a, atmoK: 0.45, caps: 1 }, biome: 'mars', captured: true },
      { name: 'JUPITER', rE: 11.21, a: 5.203, temp: '−110 °C', g: 2.53, look: { type: PT.GAS, c1: 0xd9b48a, c2: 0x9c6b48, c3: 0xf2e6d2, atmo: 0xe8d2b0, atmoK: 0.8, storm: 1 }, biome: 'gasgiant' },
      { name: 'SATURN', rE: 9.45, a: 9.537, temp: '−140 °C', g: 1.07, look: { type: PT.GAS, c1: 0xe3cf9c, c2: 0xb59a64, c3: 0xf5ebc8, atmo: 0xf0e0b0, atmoK: 0.7, ring: { inner: 1.25, outer: 2.3, color: 0xd8c49a } }, biome: 'gasgiant' },
      { name: 'URANUS', rE: 4.01, a: 19.19, temp: '−195 °C', g: 0.90, look: { type: PT.ICEGIANT, c1: 0x9fe3e8, c2: 0x7cc8d4, c3: 0xc8f4f4, atmo: 0xa8f0ff, atmoK: 0.9, ring: { inner: 1.6, outer: 1.95, color: 0x8899aa, faint: true } }, biome: 'icegiant' },
      { name: 'NEPTUNE', rE: 3.88, a: 30.07, temp: '−200 °C', g: 1.14, look: { type: PT.ICEGIANT, c1: 0x3f6fe0, c2: 0x2b4fb0, c3: 0x8fb0ff, atmo: 0x5c8cff, atmoK: 1.0, storm: 2 }, biome: 'icegiant' },
    ],
    moons: [{ name: 'MOON', parent: 'EARTH', rE: 0.273, dist: 3.2, g: 0.17, temp: '−20 °C', look: { type: PT.CRATER, c1: 0x9a9a9a, c2: 0x6a6a6a, c3: 0xc8c8c8, atmo: null }, biome: 'moon' }],
    belts: [{ name: 'MAIN ASTEROID BELT', a0: 2.2, a1: 3.2, count: 900 }],
    sky: { band: 0xbfd0ff, core: 0xffd9a8, neb1: 0x2a4cff, neb2: 0xff3d8b, seed: 11 },
    nebulae: [{ near: 'JUPITER', offset: [6000, 1800, -9000], color: 0x5a6cff, color2: 0xff5ab0, size: 9000 }, { near: 'MARS', offset: [-5200, -1400, 6500], color: 0x3ad6c8, color2: 0x2a5cff, size: 6500 }],
    source: 'NASA Planetary Fact Sheet — radii, orbital distances, mean temperatures, surface gravity.',
  },
  kepler90: {
    id: 'kepler90', level: 2, name: 'KEPLER-90 SYSTEM', distanceText: 'KOI-351 · 848 pc (≈2,770 light-years) · Draco',
    star: { name: 'KEPLER-90', sub: 'G-type · 6,080 K · 1.2 R☉', teff: 6080, rSun: 1.2, radius: 1500 },
    scale: { inner: 5200, outer: 26000 },
    planets: [
      { name: 'KEPLER-90 b', rE: 1.31, mE: 2.27, a: 0.074, eqT: 1062, look: { type: PT.LAVA, c1: 0x2a1410, c2: 0xff5a1a, c3: 0x5a2a20, atmo: 0xff7a3a, atmoK: 0.6 }, biome: 'lava' },
      { name: 'KEPLER-90 c', rE: 1.19, mE: 1.81, a: 0.089, eqT: 987, look: { type: PT.LAVA, c1: 0x30201a, c2: 0xffa040, c3: 0x6a4030, atmo: 0xffa060, atmoK: 0.5 }, biome: 'lava' },
      { name: 'KEPLER-90 i', rE: 1.32, mE: 2.30, a: 0.120, eqT: 709, look: { type: PT.ROCKY, c1: 0xc79a5a, c2: 0x8a5a2a, c3: 0xe8c890, atmo: 0xffc080, atmoK: 0.5 }, biome: 'scorched', captured: true },
      { name: 'KEPLER-90 d', rE: 2.87, mE: 8.6, a: 0.32, eqT: 520, look: { type: PT.VENUS, c1: 0xb8a0d8, c2: 0x7a5aa8, c3: 0xe8d8ff, atmo: 0xc0a0ff, atmoK: 1.1 }, biome: 'haze', captured: true },
      { name: 'KEPLER-90 e', rE: 2.66, mE: 7.56, a: 0.42, eqT: 450, look: { type: PT.OCEAN, c1: 0x1a6a7a, c2: 0x3ab0a0, c3: 0xd0f0e0, atmo: 0x60ffe0, atmoK: 1.0 }, biome: 'archipelago', captured: true },
      { name: 'KEPLER-90 f', rE: 2.88, mE: 8.65, a: 0.48, eqT: 407, look: { type: PT.JUNGLE, c1: 0x1f6a4a, c2: 0x4ad08a, c3: 0x2a4a9a, atmo: 0x7affc8, atmoK: 1.2 }, biome: 'homeworld', homeworld: true },
      { name: 'KEPLER-90 g', rE: 7.72, mE: 15, a: 0.717, eqT: 342, look: { type: PT.GAS, c1: 0xc0a080, c2: 0x8a6a50, c3: 0xe8dcc8, atmo: 0xe0c8a8, atmoK: 0.7 }, biome: 'gasgiant' },
      { name: 'KEPLER-90 h', rE: 11.25, mE: 203, a: 0.971, eqT: 294, look: { type: PT.GAS, c1: 0x7aa0c8, c2: 0x3a5a8a, c3: 0xd8e8f0, atmo: 0x9ac8ff, atmoK: 0.9, storm: 1 }, biome: 'gasgiant', colonizer: true },
    ],
    belts: [{ name: 'KEPLER-90 DEBRIS FIELD', a0: 0.55, a1: 0.65, count: 700 }],
    sky: { band: 0xd0c8ff, core: 0xffc8a0, neb1: 0x8a2aff, neb2: 0x2affc8, seed: 23 },
    nebulae: [{ near: 'KEPLER-90 h', offset: [-7000, 2500, 6000], color: 0x9a4aff, color2: 0x2a8cff, size: 10000 }, { near: 'KEPLER-90 e', offset: [4200, -1600, -5200], color: 0x2affb0, color2: 0x2a6aff, size: 6000 }],
    source: 'NASA Exoplanet Archive — KOI-351 / Kepler-90: 8 planets (b, c, i, d, e, f, g, h), radii, semi-major axes and equilibrium temperatures.',
  },
  trappist1: {
    id: 'trappist1', level: 3, name: 'TRAPPIST-1 SYSTEM', distanceText: '12.43 pc (≈40.5 light-years) · Aquarius',
    star: { name: 'TRAPPIST-1', sub: 'M8 V ultracool dwarf · 2,566 K · 0.12 R☉', teff: 2566, rSun: 0.119, radius: 900 },
    scale: { inner: 4200, outer: 15500 },
    planets: [
      { name: 'TRAPPIST-1 b', rE: 1.116, mE: 1.374, a: 0.01154, eqT: 398, look: { type: PT.LAVA, c1: 0x3a2018, c2: 0xff6a2a, c3: 0x7a4a3a, atmo: 0xff8a50, atmoK: 0.4 }, biome: 'lava' },
      { name: 'TRAPPIST-1 c', rE: 1.097, mE: 1.308, a: 0.0158, eqT: 340, look: { type: PT.CRATER, c1: 0x9a7a6a, c2: 0x6a4a3a, c3: 0xc8a890, atmo: 0xffb090, atmoK: 0.3 }, biome: 'barren' },
      { name: 'TRAPPIST-1 d', rE: 0.788, mE: 0.388, a: 0.02227, eqT: 286, look: { type: PT.ROCKY, c1: 0xc0703a, c2: 0x7a3a1a, c3: 0xf0b070, atmo: 0xffa070, atmoK: 0.6 }, biome: 'fortress_sand', captured: true, fortress: 'sand' },
      { name: 'TRAPPIST-1 e', rE: 0.92, mE: 0.692, a: 0.02925, eqT: 250, look: { type: PT.OCEAN, c1: 0x1a4a8a, c2: 0x6a8a3a, c3: 0xe8e0d0, atmo: 0xffa0b0, atmoK: 1.1, land: 1 }, biome: 'city', captured: true, city: true },
      { name: 'TRAPPIST-1 f', rE: 1.045, mE: 1.039, a: 0.03849, eqT: 218, look: { type: PT.ICE, c1: 0xd0e8f0, c2: 0x7ab0d0, c3: 0xffffff, atmo: 0xb0e0ff, atmoK: 0.8 }, biome: 'fortress_ice', captured: true, fortress: 'ice' },
      { name: 'TRAPPIST-1 g', rE: 1.129, mE: 1.321, a: 0.04683, eqT: 197, look: { type: PT.ICE, c1: 0x5a6a8a, c2: 0x2a3050, c3: 0xa0c0e0, atmo: 0x8a9aff, atmoK: 0.7 }, biome: 'fortress_obsidian', captured: true, fortress: 'obsidian' },
      { name: 'TRAPPIST-1 h', rE: 0.755, mE: 0.326, a: 0.06189, eqT: 172, look: { type: PT.ICE, c1: 0xe8f0f8, c2: 0xa8c0d8, c3: 0xffffff, atmo: 0xd0e8ff, atmoK: 0.5 }, biome: 'frozen' },
    ],
    belts: [],
    asteroidClusters: 6,
    sky: { band: 0xffc8b0, core: 0xffb080, neb1: 0xff3a5a, neb2: 0x6a3aff, seed: 37 },
    nebulae: [{ near: 'TRAPPIST-1 h', offset: [5200, 2000, 4000], color: 0xff4a6a, color2: 0xffa040, size: 8000 }, { near: 'TRAPPIST-1 c', offset: [-4000, -1800, -4500], color: 0x6a4aff, color2: 0xff4aa0, size: 6000 }],
    source: 'NASA Exoplanet Archive — TRAPPIST-1: seven Earth-sized planets (b–h), radii, masses, orbits and equilibrium temperatures.',
  },
  cygx1: {
    id: 'cygx1', level: 4, name: 'CYGNUS X-1', distanceText: '≈7,200 light-years · Cygnus · first black hole ever confirmed',
    blackHole: { name: 'CYGNUS X-1', sub: 'Stellar black hole · 21 M☉', horizon: 260, disk: [520, 2600] },
    companion: { name: 'HDE 226868', sub: 'O9.7 Iab blue supergiant · ≈41 M☉ · 31,000 K', teff: 31000, radius: 2400, dist: 15000 },
    planets: [],
    belts: [],
    sky: { band: 0xa0b8ff, core: 0xb0c8ff, neb1: 0x2a3aff, neb2: 0xff2a8a, seed: 51 },
    nebulae: [{ offset: [9000, 3000, -12000], color: 0x3a5aff, color2: 0x9a2aff, size: 14000 }, { offset: [-14000, -4000, 6000], color: 0xff3a8a, color2: 0x3a2aff, size: 12000 }],
    source: 'NASA Chandra X-ray Observatory / NASA Science — Cygnus X-1: 21-solar-mass black hole orbiting the blue supergiant HDE 226868 every 5.6 days, ≈7,200 light-years away.',
  },
  hr8799: {
    id: 'hr8799', level: 5, name: 'HR 8799 SYSTEM', distanceText: '41.24 pc (≈134.5 light-years) · Pegasus · four directly imaged super-Jupiters',
    star: { name: 'HR 8799', sub: 'A5 V · 7,400 K · 1.49 R☉', teff: 7400, rSun: 1.49, radius: 2200 },
    scale: { inner: 9000, outer: 42000 },
    sizeBoost: 1.35,
    planets: [
      { name: 'HR 8799 e', rE: 13.11, mE: 3178, a: 16.4, eqT: 1150, look: { type: PT.HOTGAS, c1: 0x8a3a2a, c2: 0x3a1410, c3: 0xff9a5a, atmo: 0xff7a4a, atmoK: 0.8 }, biome: 'gasgiant' },
      { name: 'HR 8799 d', rE: 13.0, mE: 3000, a: 24.0, eqT: 1300, look: { type: PT.HOTGAS, c1: 0x9a4a2a, c2: 0x4a1a10, c3: 0xffb06a, atmo: 0xff8a5a, atmoK: 0.8 }, biome: 'gasgiant' },
      { name: 'HR 8799 c', rE: 13.0, mE: 3000, a: 38.0, eqT: 1200, look: { type: PT.HOTGAS, c1: 0x6a2a3a, c2: 0x2a0a14, c3: 0xff6a7a, atmo: 0xff4a6a, atmoK: 1.0, storm: 1 }, biome: 'throne', throne: true },
      { name: 'HR 8799 b', rE: 13.0, mE: 2000, a: 68.0, eqT: 1200, look: { type: PT.HOTGAS, c1: 0x7a4a3a, c2: 0x3a1a14, c3: 0xffa080, atmo: 0xff9a6a, atmoK: 0.8 }, biome: 'gasgiant' },
    ],
    belts: [{ name: 'HR 8799 WARM DEBRIS DISK', a0: 8, a1: 11, count: 900 }, { name: 'HR 8799 COLD DEBRIS BELT', a0: 90, a1: 110, count: 1200 }],
    sky: { band: 0xffb0c0, core: 0xff9070, neb1: 0xff2a4a, neb2: 0x7a2aff, seed: 67 },
    nebulae: [{ near: 'HR 8799 c', offset: [9000, 3000, 9000], color: 0xff2a5a, color2: 0x7a2aff, size: 14000 }, { near: 'HR 8799 e', offset: [-9000, -2500, -7000], color: 0xff8a2a, color2: 0xff2a8a, size: 11000 }],
    source: 'NASA Exoplanet Archive — HR 8799 b, c, d, e: 7–10 Jupiter masses, ≈1.2 Jupiter radii, orbits 16–68 AU; warm and cold debris disks (NASA Spitzer).',
  },
};

export const LEVEL_SYSTEM = { 1: 'sol', 2: 'kepler90', 3: 'trappist1', 4: 'cygx1', 5: 'hr8799' };

export function planetGameRadius(rE, boost = 1) {
  return 360 * Math.pow(rE, 0.62) * boost;
}

// Assigns game-space positions/radii to every body of a system (deterministic).
export function layoutSystem(sys) {
  if (sys._laid) return sys;
  const boost = sys.sizeBoost || 1;
  const ps = sys.planets;
  if (ps.length) {
    const sa = ps.map((p) => Math.sqrt(p.a));
    const s0 = sa[0], s1 = sa[sa.length - 1];
    const { inner, outer } = sys.scale;
    let lastD = 0, lastR = 0;
    const seed = hashString(sys.id);
    ps.forEach((p, i) => {
      p.radius = planetGameRadius(p.rE, boost);
      let d = inner + (outer - inner) * ((sa[i] - s0) / Math.max(1e-6, s1 - s0));
      if (i > 0) d = Math.max(d, lastD + lastR + p.radius + 2200);
      lastD = d; lastR = p.radius;
      const ang = ((seed % 360) * Math.PI) / 180 + i * 2.39996; // golden angle spread
      const y = Math.sin(i * 1.7 + seed) * 0.03 * d;
      p.dist = d;
      p.pos = new THREE.Vector3(Math.cos(ang) * d, y, Math.sin(ang) * d);
      p.gravity = p.g !== undefined ? p.g : p.mE ? p.mE / (p.rE * p.rE) : 1;
      p.sub = [p.rE ? `${p.rE.toFixed(2)} R⊕` : '', p.a ? `${p.a} AU` : '', p.eqT ? `${p.eqT} K` : p.temp || ''].filter(Boolean).join(' · ');
    });
    // scale lookup for belts (map AU -> game distance by interpolating the planet table)
    sys.auToGame = (au) => {
      const s = Math.sqrt(au);
      if (s <= s0) return inner * (s / s0);
      for (let i = 1; i < ps.length; i++) {
        const sp = Math.sqrt(ps[i].a);
        if (s <= sp) { const s_ = Math.sqrt(ps[i - 1].a); return ps[i - 1].dist + (ps[i].dist - ps[i - 1].dist) * ((s - s_) / (sp - s_)); }
      }
      return ps[ps.length - 1].dist * (s / s1);
    };
  }
  if (sys.moons) for (const m of sys.moons) {
    const parent = ps.find((p) => p.name === m.parent);
    m.radius = planetGameRadius(m.rE, boost);
    m.pos = parent.pos.clone().add(new THREE.Vector3(parent.radius * m.dist, parent.radius * 0.35, parent.radius * m.dist * 0.6));
    m.gravity = m.g; m.sub = `${m.rE} R⊕ · ${m.temp}`;
  }
  sys._laid = true;
  return sys;
}

export function allSystemsList() {
  return Object.values(SYSTEMS).map((s) => ({ name: s.name, sourceText: s.source }));
}
