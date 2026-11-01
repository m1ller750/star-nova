// Location builders: planet surfaces per biome, Klin'Tar bases, colonizer interior, fortresses, the TRAPPIST-1e city, homeworld village, throne arena.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { game } from '../core/game.js';
import { Simplex, RNG, hashString, detailTexture, panelTexture, windowsTexture, kelvinToColor, clamp, lerp, smoothstep, normalTexture, panelNormal } from '../core/util.js';
import { groundSkyMaterial, planetMaterial, lavaMaterial, beamMaterial, NOISE } from '../gfx/shaders.js';
import { buildPlayerShip, addLandingGear, buildEnemyFighter, emissive, cachedMaterial as MC } from '../gfx/models-ships.js';
import { SYSTEMS, LEVEL_SYSTEM, PT } from '../data/systems.js';
import { earthLandTexture } from '../data/earth-map.js';

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ biome table
export const BIOMES = {
  mercury: { name: 'Cratered plains', colors: [0x3e3b38, 0x6a655e, 0x8e877d, 0x504b45], terrain: 'craters', amp: 22, sky: { top: 0x000000, horizon: 0x1c1a19, stars: 1 }, fog: [0x141312, 0.0018], sunSize: 0.11, sunI: 3.6, hemi: [0x2a2a2a, 0x1a1816, 0.25], props: ['rocks', 'boulders'], surface: 'rock', ambience: 'wind' },
  venus: { name: 'Sulfuric volcanic plains', colors: [0x5a3a1a, 0x8a5a2a, 0xb07a3a, 0x6a4020], terrain: 'volcanic', amp: 34, sky: { top: 0x8a4a14, horizon: 0xe0904a, clouds: 0.8, cloudColor: 0xffc070 }, fog: [0xc07a3a, 0.0085], sunSize: 0.0, sunI: 1.6, hemi: [0xffa050, 0x402010, 0.9], props: ['rocks', 'vents'], surface: 'rock', lightning: true, particles: 'ash', ambience: 'wind' },
  mars: { name: 'Valles canyons', colors: [0x6a2a14, 0xa04a24, 0xc8783e, 0x7a3a20], terrain: 'canyon', amp: 40, sky: { top: 0x5a3a2a, horizon: 0xd8a070, clouds: 0.15, cloudColor: 0xe8c0a0 }, fog: [0xc08060, 0.0021], sunSize: 0.028, sunI: 2.6, hemi: [0xe0a080, 0x4a2010, 0.6], props: ['rocks', 'boulders'], surface: 'sand', particles: 'dust', ambience: 'wind' },
  moon: { name: 'Lunar highlands', colors: [0x4a4a4a, 0x7a7a7a, 0xa0a0a0, 0x5a5a5a], terrain: 'craters', amp: 18, sky: { top: 0x000000, horizon: 0x101010, stars: 1.2 }, fog: [0x050505, 0.0012], sunSize: 0.03, sunI: 3.4, hemi: [0x30343a, 0x101010, 0.25], props: ['rocks'], surface: 'sand', skyBodies: [{ look: { type: PT.EARTH, atmo: 0x6fb2ff, atmoK: 1.3 }, dir: [0.3, 0.45, 0.85], size: 700, earth: true }] },
  gasgiant: { name: 'Floating islands above the cloud deck', colors: [0x3a3028, 0x6a5a48, 0x8a7a60, 0x4a3a30], terrain: 'islands', amp: 10, sky: { top: 0x2a3a5a, horizon: 0xe8c890, clouds: 0.6, cloudColor: 0xfff0d0 }, fog: [0xd8b890, 0.0022], sunSize: 0.012, sunI: 2.2, hemi: [0xffe0b0, 0x806040, 0.8], props: ['rocks', 'crystals'], surface: 'rock', seaColor: [0xc8a070, 0xf0e0c0], ambience: 'wind' },
  icegiant: { name: 'Ice islands over methane clouds', colors: [0x6a8aa0, 0x9ac0d0, 0xd8f0f8, 0x5a7a90], terrain: 'islands', amp: 10, sky: { top: 0x0a2a5a, horizon: 0x7ad0e8, clouds: 0.5, cloudColor: 0xd0f8ff }, fog: [0x6ab0d0, 0.0024], sunSize: 0.006, sunI: 1.7, hemi: [0xa0e0ff, 0x204060, 0.8], props: ['icespikes', 'crystals'], surface: 'snow', seaColor: [0x3a8ab0, 0x9ae0f0], ambience: 'wind' },
  lava: { name: 'Molten basalt fields', colors: [0x141010, 0x2a2020, 0x3a2a26, 0x1a1414], terrain: 'volcanic', amp: 30, sky: { top: 0x1a0606, horizon: 0x8a2a10, clouds: 0.5, cloudColor: 0x3a1a14 }, fog: [0x4a1a0a, 0.006], sunSize: 0.05, sunI: 1.8, hemi: [0xff6a3a, 0x200a05, 0.7], props: ['rocks', 'vents'], surface: 'rock', lava: -2, particles: 'embers', ambience: 'rumble' },
  scorched: { name: 'Scorched salt flats', colors: [0xb8a080, 0xd8c8a8, 0xf0e8d0, 0x9a8060], terrain: 'flats', amp: 12, sky: { top: 0xb0a8a0, horizon: 0xfff4e0 }, fog: [0xe8d4b8, 0.0034], sunSize: 0.06, sunI: 2.3, hemi: [0xfff0d0, 0x6a5038, 0.55], props: ['rocks', 'boulders'], surface: 'sand', heat: 0.25, ambience: 'wind' },
  haze: { name: 'Violet haze crystal fields', colors: [0x2a1a3a, 0x4a2a5a, 0x7a5a8a, 0x3a2048], terrain: 'hills', amp: 28, sky: { top: 0x2a1048, horizon: 0xb08ad8, clouds: 0.6, cloudColor: 0xd8b0ff }, fog: [0x8a6ab0, 0.007], sunSize: 0.02, sunI: 1.6, hemi: [0xc0a0ff, 0x201030, 0.8], props: ['crystals', 'rocks'], crystalColor: 0xd06aff, surface: 'rock', particles: 'spores', ambience: 'wind' },
  archipelago: { name: 'Teal archipelago', colors: [0xc8b080, 0x5a8a4a, 0x3a6a3a, 0x7a6a50], terrain: 'archipelago', amp: 26, sky: { top: 0x2a6a9a, horizon: 0xb8f0e8, clouds: 0.45 }, fog: [0x9ad8d0, 0.0035], sunSize: 0.02, sunI: 2.6, hemi: [0xc8fff0, 0x204a40, 0.8], props: ['palms', 'rocks'], surface: 'sand', water: 0, waterColor: 0x1a8a8a, ambience: 'wind' },
  homeworld: { name: 'Keplerian bioluminescent jungle', colors: [0x1a3a2a, 0x2a6a4a, 0x4a8a5a, 0x3a5040], terrain: 'hills', amp: 22, sky: { top: 0x1a4a7a, horizon: 0x9ae8d8, clouds: 0.5 }, fog: [0x7ac8b8, 0.004], sunSize: 0.022, sunI: 2.1, hemi: [0x9ae8d8, 0x1a3a2a, 0.55], props: ['jungle', 'glowplants', 'rocks'], surface: 'sand', water: -3, waterColor: 0x1a6a7a, particles: 'spores', ambience: 'wind' },
  barren: { name: 'Rust-red barren plains', colors: [0x3a2018, 0x6a3a28, 0x8a5a40, 0x4a2a20], terrain: 'craters', amp: 20, sky: { top: 0x0a0204, horizon: 0x5a2014, stars: 0.6 }, fog: [0x3a1a10, 0.003], sunSize: 0.09, sunI: 2.0, hemi: [0xff9070, 0x1a0a05, 0.5], props: ['rocks', 'boulders'], surface: 'rock', ambience: 'wind' },
  frozen: { name: 'Frozen ice sheets', colors: [0x8aa8c0, 0xc8e0f0, 0xf4fbff, 0x6a88a0], terrain: 'ice', amp: 16, sky: { top: 0x0a1020, horizon: 0x6a80a8, stars: 0.5, aurora: 0.6 }, fog: [0x8aa0c0, 0.003], sunSize: 0.07, sunI: 1.4, hemi: [0xb0c8ff, 0x203040, 0.7], props: ['icespikes', 'rocks'], surface: 'snow', particles: 'snow', ambience: 'wind' },
  fortress_sand: { name: 'Sandstone citadel', colors: [0x7a3a1a, 0xb0602a, 0xd89a5a, 0x8a4a28], terrain: 'dunes', amp: 18, sky: { top: 0x3a1a2a, horizon: 0xff9a7a, clouds: 0.25, cloudColor: 0xffb0a0 }, fog: [0xd08a70, 0.0035], sunSize: 0.09, sunI: 2.2, hemi: [0xffa080, 0x401a10, 0.7], props: ['rocks', 'boulders'], surface: 'sand', particles: 'dust', ambience: 'wind' },
  fortress_ice: { name: 'Crystal ice fortress', colors: [0x7a98b8, 0xb8d8f0, 0xf0f8ff, 0x5a7898], terrain: 'ice', amp: 22, sky: { top: 0x101a3a, horizon: 0xffa0b0, clouds: 0.3, cloudColor: 0xffd0e0 }, fog: [0xc0c8e8, 0.0035], sunSize: 0.09, sunI: 1.7, hemi: [0xd0e0ff, 0x203050, 0.8], props: ['icespikes', 'crystals'], crystalColor: 0x7ad8ff, surface: 'snow', particles: 'snow', ambience: 'wind' },
  fortress_obsidian: { name: 'Obsidian stronghold', colors: [0x16161e, 0x2a2a3a, 0x8a9ab8, 0x1a1a24], terrain: 'volcanic', amp: 30, sky: { top: 0x04040c, horizon: 0x3a2a5a, stars: 0.8, aurora: 1.0 }, fog: [0x1a1a2e, 0.004], sunSize: 0.08, sunI: 1.3, hemi: [0x8a8aff, 0x0a0a14, 0.6], props: ['icespikes', 'rocks'], surface: 'snow', lava: -4, particles: 'snow', ambience: 'wind' },
  city: { name: 'Coastal city · Grand Bazaar', colors: [0xb8a888, 0x8a9a6a, 0x6a7a4a, 0x9a8a70], terrain: 'flats', amp: 6, sky: { top: 0x2a3a6a, horizon: 0xffb0a0, clouds: 0.35, cloudColor: 0xffd0c8 }, fog: [0xd8a8a8, 0.0022], sunSize: 0.1, sunI: 2.4, hemi: [0xffd0c0, 0x3a3020, 0.9], props: [], surface: 'rock', water: -1.5, waterColor: 0x2a6a8a, ambience: 'wind' },
  throne: { name: 'Throne of the Klin\'Tar', colors: [0x0a0a0e, 0x1a1418, 0x3a2028, 0x100c10], terrain: 'arena', amp: 0, sky: { top: 0x050002, horizon: 0x5a0a14, clouds: 0.8, cloudColor: 0x3a0a10, stars: 0.3 }, fog: [0x2a0508, 0.0035], sunSize: 0.03, sunI: 1.4, hemi: [0xff3a4a, 0x0a0204, 0.6], props: [], surface: 'metal', lightning: true, seaColor: [0x3a0a10, 0x8a1a2a], ambience: 'rumble' },
  colonizer: { name: 'Klin\'Tar colonizer ring', colors: [0x22202a, 0x2a2834, 0x3a3848, 0x1a1820], terrain: 'flat', amp: 0, sky: { top: 0x000000, horizon: 0x0a0414, stars: 1.2 }, fog: [0x0a0614, 0.0015], sunSize: 0.02, sunI: 2.4, hemi: [0xb8a0e8, 0x3a3048, 1.25], props: [], surface: 'metal', ambience: 'rumble' },
};

// ------------------------------------------------------------------ helpers
function addMesh(gm, geo, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  m.castShadow = opts.cast !== false; m.receiveShadow = true;
  (opts.parent || gm.scene).add(m);
  if (opts.collide !== false && !opts.parent) gm.world.addMeshBox(m, { solid: opts.solid !== false, walk: opts.walk !== false, tag: opts.tag });
  return m;
}
const box = (gm, w, h, d, mat, x, y, z, opts = {}) => addMesh(gm, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, opts);
const rbox = (gm, w, h, d, mat, x, y, z, r = 0.3, opts = {}) => addMesh(gm, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)), mat, x, y + h / 2, z, opts);
const cyl = (gm, r1, r2, h, mat, x, y, z, seg = 16, opts = {}) => addMesh(gm, new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y + h / 2, z, opts);

function std(color, rough = 0.6, metal = 0.2, extra = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra)); }

// ------------------------------------------------------------------ terrain
function makeHeightField(kind, seed, amp, S) {
  const n = new Simplex(seed);
  const r = new RNG(seed + 1);
  const craters = [];
  if (kind === 'craters') for (let i = 0; i < 46; i++) craters.push({ x: r.range(-S / 2, S / 2), z: r.range(-S / 2, S / 2), r: r.range(6, i < 6 ? 60 : 24), d: r.range(0.3, 0.6) });
  const islands = [];
  if (kind === 'islands') {
    islands.push({ x: 0, z: 0, r: 95, top: 0 });
    for (let i = 0; i < 9; i++) { const a = r.range(0, Math.PI * 2), d = r.range(110, 210); islands.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r.range(30, 60), top: r.range(-6, 14) }); }
  }
  const fn = (x, z) => {
    let h = 0;
    if (kind === 'flat' || kind === 'arena') return 0;
    if (kind === 'craters') {
      h = n.fbm2(x * 0.006, z * 0.006, 5) * amp * 0.6 + n.fbm2(x * 0.03, z * 0.03, 3) * 1.5;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.r;
        if (d < 1.6) { if (d < 1) h -= (1 - d * d) * c.r * c.d * 0.5; h += Math.exp(-Math.pow((d - 1) / 0.18, 2)) * c.r * 0.12; }
      }
    } else if (kind === 'canyon') {
      const base = n.fbm2(x * 0.004, z * 0.004, 5);
      const rid = 1 - Math.abs(n.noise2(x * 0.0045 + 7, z * 0.0045));
      h = base * amp * 0.5 - Math.pow(rid, 6) * amp * 1.1;
      const t = h / (amp * 0.25); h = (Math.floor(t) + smoothstep(0.75, 1, t - Math.floor(t))) * amp * 0.25;
      h += n.fbm2(x * 0.05, z * 0.05, 3) * 1.2;
    } else if (kind === 'volcanic') {
      h = n.fbm2(x * 0.005, z * 0.005, 5) * amp * 0.8 + Math.pow(n.ridged2(x * 0.008, z * 0.008, 4), 2) * amp * 0.9 - amp * 0.3;
      h += n.fbm2(x * 0.06, z * 0.06, 2) * 0.8;
    } else if (kind === 'dunes') {
      const w = n.fbm2(x * 0.003, z * 0.003, 3);
      h = Math.sin(x * 0.045 + w * 6 + z * 0.012) * amp * 0.35 + n.fbm2(x * 0.006, z * 0.006, 4) * amp * 0.6;
    } else if (kind === 'flats') {
      h = n.fbm2(x * 0.004, z * 0.004, 4) * amp * 0.5 + n.fbm2(x * 0.04, z * 0.04, 2) * 0.4;
    } else if (kind === 'hills') {
      h = n.fbm2(x * 0.005, z * 0.005, 5) * amp + n.fbm2(x * 0.03, z * 0.03, 3) * 1.6;
    } else if (kind === 'ice') {
      h = n.fbm2(x * 0.004, z * 0.004, 5) * amp * 0.7;
      const cr = 1 - Math.abs(n.noise2(x * 0.02, z * 0.02)); h -= Math.pow(cr, 12) * 2.5;
    } else if (kind === 'archipelago') {
      h = n.fbm2(x * 0.005, z * 0.005, 5) * amp * 1.4 + 3;
    } else if (kind === 'islands') {
      let best = -400;
      for (const is of islands) {
        const d = Math.hypot(x - is.x, z - is.z) / is.r;
        if (d < 1.15) { const edge = smoothstep(1.15, 0.85, d); const top = is.top + n.fbm2(x * 0.02, z * 0.02, 4) * 3 * edge; const v = lerp(-120, top, edge); if (v > best) best = v; }
      }
      // rock bridges between the main island and others
      for (let i = 1; i < islands.length; i++) {
        const a = islands[0], b = islands[i];
        const abx = b.x - a.x, abz = b.z - a.z; const L2 = abx * abx + abz * abz;
        const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / L2, 0, 1);
        const px = a.x + abx * t, pz = a.z + abz * t;
        const dd = Math.hypot(x - px, z - pz);
        if (dd < 4.5 && i % 2 === 1) { const v = lerp(a.top, b.top, t) - 0.3 + Math.sin(t * Math.PI) * 4 - (dd / 4.5) * 1.5; if (v > best) best = v; }
      }
      return best;
    }
    return h;
  };
  return { fn, islands };
}

function buildTerrain(gm, B, seed, S = 640, segs = 180, flatten = []) {
  const hf = makeHeightField(B.terrain, seed, B.amp, S);
  const raw = hf.fn;
  const fn = (x, z) => {
    let h = raw(x, z);
    for (const f of flatten) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r + f.blend) { const k = smoothstep(f.r + f.blend, f.r, d); h = lerp(h, f.h ?? raw(f.x, f.z), k); } }
    return h;
  };
  // sample into a grid
  const N = segs + 1;
  const heights = new Float32Array(N * N);
  const cell = S / segs;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = fn(-S / 2 + i * cell, -S / 2 + j * cell);
  const heightAt = (x, z) => {
    const fx = (x + S / 2) / cell, fz = (z + S / 2) / cell;
    if (fx < 0 || fz < 0 || fx >= segs || fz >= segs) return B.terrain === 'islands' ? -400 : heights[0];
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  const geo = new THREE.PlaneGeometry(S, S, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const n2 = new Simplex(seed + 9);
  const C = B.colors.map((c) => new THREE.Color(c));
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const i = Math.round((x + S / 2) / cell), j = Math.round((z + S / 2) / cell);
    const h = heights[j * N + i];
    pos.setY(k, h);
    const hx = heights[j * N + Math.min(segs, i + 1)] - heights[j * N + Math.max(0, i - 1)];
    const hz = heights[Math.min(segs, j + 1) * N + i] - heights[Math.max(0, j - 1) * N + i];
    const slope = Math.hypot(hx, hz) / (2 * cell);
    const nv = n2.fbm2(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
    const ht = clamp((h + B.amp * 0.5) / (B.amp * 1.2 + 1), 0, 1);
    c.copy(C[0]).lerp(C[1], smoothstep(0.1, 0.55, ht + (nv - 0.5) * 0.3));
    c.lerp(C[2], smoothstep(0.6, 0.95, ht + (nv - 0.5) * 0.2) * 0.8);
    c.lerp(C[3], smoothstep(0.45, 1.1, slope) * 0.85);
    if (B.terrain === 'islands' && h < -20) c.multiplyScalar(0.5);
    c.multiplyScalar(0.85 + nv * 0.3);
    cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const tex = detailTexture(seed % 7 + 3, 22, 0.42); tex.repeat.set(S / 9, S / 9);
  const nrm = normalTexture(seed % 5 + 11, 14, B.surface === 'sand' ? 1.6 : 2.6, B.surface === 'rock'); nrm.repeat.set(S / 7, S / 7);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, normalMap: nrm, normalScale: new THREE.Vector2(B.surface === 'sand' ? 0.7 : 1.25, B.surface === 'sand' ? 0.7 : 1.25), roughness: B.surface === 'snow' ? 0.5 : 0.9, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  gm.scene.add(mesh);
  gm.world.heightFn = heightAt;
  gm.terrainSize = S;
  return { mesh, heightAt, islands: hf.islands };
}

// ------------------------------------------------------------------ sky / light / atmosphere
function setupAtmosphere(gm, B, starTeff, seed, opts = {}) {
  const sc = gm.scene;
  const starCol = kelvinToColor(starTeff);
  const sunDir = (opts.sunDir || new THREE.Vector3(0.45, 0.62, -0.65)).clone().normalize();
  gm.sunDir = sunDir;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 24), groundSkyMaterial({
    top: B.sky.top, horizon: B.sky.horizon, bottom: B.sky.bottom || B.fog[0], sunDir, sunColor: starCol, sunSize: B.sunSize, stars: B.sky.stars || 0, clouds: B.sky.clouds || 0, cloudColor: B.sky.cloudColor || 0xffffff, aurora: B.sky.aurora || 0,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  sc.add(sky); gm.sky = sky;
  sc.fog = new THREE.FogExp2(B.fog[0], B.fog[1]);
  sc.background = new THREE.Color(B.fog[0]);
  const hemi = new THREE.HemisphereLight(B.hemi[0], B.hemi[1], B.hemi[2] * 1.4);
  sc.add(hemi); gm.hemi = hemi;
  const sun = new THREE.DirectionalLight(starCol, B.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sh = sun.shadow.camera; sh.left = -55; sh.right = 55; sh.top = 55; sh.bottom = -55; sh.near = 1; sh.far = 320;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  sc.add(sun); sc.add(sun.target);
  gm.sun = sun;
  // environment map for PBR reflections
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(B.sky.horizon).multiplyScalar(0.6), side: THREE.BackSide })));
  const top = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(B.sky.top).multiplyScalar(1.2), side: THREE.BackSide }));
  envScene.add(top);
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: starCol.clone().multiplyScalar(8) }));
  sunM.position.copy(sunDir).multiplyScalar(40); envScene.add(sunM);
  const pm = new THREE.PMREMGenerator(game.engine.renderer);
  gm.envTex = pm.fromScene(envScene, 0.03).texture; pm.dispose();
  sc.environment = gm.envTex;
  gm.uniforms = gm.uniforms || [];
  game.engine.setBloom(0.7, 0.5, 0.86);
  if (B.heat) game.engine.u.uHeat.value = B.heat;
  gm.ambienceKind = B.ambience || null;
  // weather particles
  if (B.particles) {
    const col = { dust: 0xd8a070, ash: 0x6a5a4a, embers: 0xff6a2a, spores: 0x9affd8, snow: 0xffffff }[B.particles];
    const add = B.particles === 'embers' || B.particles === 'spores';
    gm.locUpdates = gm.locUpdates || [];
    gm.locUpdates.push((dt) => {
      const h = gm.hero.pos;
      for (let i = 0; i < (B.particles === 'snow' ? 4 : 3); i++) {
        const p = _v.set(h.x + (Math.random() - 0.5) * 60, h.y + Math.random() * 20, h.z + (Math.random() - 0.5) * 60);
        if (add) gm.fx.trail(p, col, B.particles === 'embers' ? 0.12 : 0.1, 4, new THREE.Vector3((Math.random() - 0.5) * 2, B.particles === 'embers' ? 2 : 0.4, (Math.random() - 0.5) * 2), 1.5);
        else gm.fx.smokePuff(p, B.particles === 'snow' ? 0.08 : 0.5, 5, col, new THREE.Vector3(B.particles === 'snow' ? 0.5 : 3, B.particles === 'snow' ? -2 : 0.2, 1), B.particles === 'snow' ? 0.9 : 0.25);
      }
    });
  }
  if (B.lightning) {
    gm.locUpdates = gm.locUpdates || [];
    let t = 3;
    gm.locUpdates.push((dt) => {
      t -= dt;
      if (t <= 0) { t = 4 + Math.random() * 7; hemi.intensity = B.hemi[2] * 6; game.audio.thunder(); setTimeout(() => (hemi.intensity = B.hemi[2] * 1.4), 120); setTimeout(() => (hemi.intensity = B.hemi[2] * 4), 200); setTimeout(() => (hemi.intensity = B.hemi[2] * 1.4), 320); }
    });
  }
  return { sunDir, starCol };
}

function skyPlanet(gm, look, dir, size, dist = 3400) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 64, 40), planetMaterial(look, hashString(JSON.stringify(look)), look.type === PT.EARTH ? earthTex() : null));
  m.position.copy(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
  m.material.uniforms.uSunPos.value.copy(gm.sunDir).multiplyScalar(1e6);
  m.material.uniforms.uRadius.value = size;
  m.material.fog = false;
  m.renderOrder = -9;
  const holder = new THREE.Group(); holder.add(m); gm.scene.add(holder);
  gm.locUpdates = gm.locUpdates || [];
  gm.locUpdates.push(() => { holder.position.copy(gm.camera.position); m.material.uniforms.uTime.value = gm.time; m.rotation.y = gm.time * 0.01; });
  return m;
}
function earthTex() { return earthLandTexture(); }

function cloudSea(gm, B, y = -70) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(B.seaColor[0]) }, uB: { value: new THREE.Color(B.seaColor[1]) } },
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <common>\n#include <logdepthbuf_pars_fragment>\n' + NOISE + 'uniform float uTime; uniform vec3 uA, uB; varying vec3 vW; void main(){\n#include <logdepthbuf_fragment>\n vec3 p = vec3(vW.xz * 0.006, uTime * 0.03); float n = fbm4(p + fbm3(p * 1.5 + uTime * 0.02)); vec3 c = mix(uA, uB, smoothstep(-0.4, 0.6, n)); float d = length(vW.xz); c = mix(c, uB, smoothstep(800.0, 3000.0, d)); gl_FragColor = vec4(c * 1.15, 1.0); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), mat);
  m.position.y = y; gm.scene.add(m);
  gm.uniforms.push(mat.uniforms);
  return m;
}

function waterPlane(gm, y, color) {
  const nm = normalTexture(77, 8, 1.4); const nm2 = nm.clone(); nm.repeat.set(160, 160);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9, envMapIntensity: 1.6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mat);
  m.position.y = y; m.receiveShadow = true; gm.scene.add(m);
  gm.world.waterY = y;
  gm.locUpdates.push((dt) => { nm.offset.x += dt * 0.004; nm.offset.y += dt * 0.0025; });
  void nm2;
  return m;
}

// wind-swept grass clumps (instanced, vertex sway)
function grass(gm, colA, colB, heightAt, seed, S, avoid, count = 9000) {
  const r = new RNG(seed + 91);
  const blade = new THREE.BufferGeometry();
  const pos = [], cols = [];
  const ca = new THREE.Color(colA), cb = new THREE.Color(colB);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI + r.range(-0.2, 0.2), h = r.range(0.45, 0.9), w = 0.06;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w, lean = r.range(-0.12, 0.12);
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, h, lean * 0.5);
    cols.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const U = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\n  float sway = sin(uTime * 1.7 + wpos.x * 0.15 + wpos.z * 0.11) * 0.12 + sin(uTime * 3.1 + wpos.z * 0.3) * 0.04;\n  transformed.x += sway * position.y; transformed.z += sway * 0.6 * position.y;');
  };
  mat.customProgramCacheKey = () => 'grass';
  gm.uniforms.push(U);
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const d = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < count * 2 && n < count; i++) {
    const ang = r.range(0, 6.2832), rad = Math.sqrt(r.next()) * 160, x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    let ok = true; for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r) { ok = false; break; }
    if (!ok) continue;
    const y = heightAt(x, z);
    if (gm.world.waterY > -1e8 && y < gm.world.waterY + 0.3) continue;
    d.position.set(x, y - 0.03, z); d.rotation.set(0, r.range(0, 6.28), 0); d.scale.setScalar(r.range(1.3, 2.8)); d.updateMatrix();
    inst.setMatrixAt(n++, d.matrix);
  }
  inst.count = n; inst.receiveShadow = true;
  gm.scene.add(inst);
}
function lavaPlane(gm, y) {
  const mat = lavaMaterial(0xff5a1a);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mat);
  m.position.y = y; gm.scene.add(m);
  gm.uniforms.push(mat.uniforms);
  gm.lavaY = y;
  const light = new THREE.HemisphereLight(0x000000, 0xff5a1a, 0.6); gm.scene.add(light);
  return m;
}

// ------------------------------------------------------------------ props
function rockGeo(seed, detail = 1) {
  const n = new Simplex(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const d = 1 + n.noise3(_v.x * 1.4, _v.y * 1.4, _v.z * 1.4) * 0.32;
    _v.multiplyScalar(d); _v.y *= 0.75;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  return g;
}

function scatter(gm, B, heightAt, seed, S, avoid = []) {
  const r = new RNG(seed + 33);
  const okAt = (x, z, pad = 0) => { for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r + pad) return false; return true; };
  const dummy = new THREE.Object3D();
  const C = B.colors.map((c) => new THREE.Color(c));
  for (const kind of B.props) {
    if (kind === 'rocks' || kind === 'boulders') {
      const big = kind === 'boulders';
      const n = big ? 40 : 220;
      const rn = normalTexture(21, 6, 3, true); rn.repeat.set(2, 2);
      const mat = new THREE.MeshStandardMaterial({ color: C[3].clone().lerp(C[1], 0.3), roughness: 0.92, map: detailTexture(5, 8, 0.5), normalMap: rn, normalScale: new THREE.Vector2(1.6, 1.6) });
      const inst = new THREE.InstancedMesh(rockGeo(seed + (big ? 2 : 1), big ? 2 : 1), mat, n);
      let k = 0;
      for (let i = 0; i < n * 3 && k < n; i++) {
        const x = r.range(-S / 2.2, S / 2.2), z = r.range(-S / 2.2, S / 2.2);
        if (!okAt(x, z, 4)) continue;
        const y = heightAt(x, z); if (y < -30) continue;
        const s = big ? r.range(2.5, 7) : r.range(0.3, 1.6);
        dummy.position.set(x, y + s * 0.2, z); dummy.rotation.set(r.range(0, 1), r.range(0, 6), r.range(0, 1)); dummy.scale.set(s * r.range(0.8, 1.4), s, s * r.range(0.8, 1.3)); dummy.updateMatrix();
        inst.setMatrixAt(k++, dummy.matrix);
        if (big) gm.world.addBox(new THREE.Vector3(x - s * 0.8, y - 2, z - s * 0.8), new THREE.Vector3(x + s * 0.8, y + s * 0.9, z + s * 0.8));
      }
      inst.count = k; inst.castShadow = true; inst.receiveShadow = true; gm.scene.add(inst);
    } else if (kind === 'crystals') {
      const col = new THREE.Color(B.crystalColor || 0xa0e0ff);
      const mat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.6), emissive: col, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 });
      const inst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).scale(0.4, 1.6, 0.4), mat, 90);
      let k = 0;
      for (let c = 0; c < 18; c++) {
        const cx = r.range(-S / 2.4, S / 2.4), cz = r.range(-S / 2.4, S / 2.4);
        if (!okAt(cx, cz, 6)) continue;
        const y0 = heightAt(cx, cz); if (y0 < -30) continue;
        for (let i = 0; i < 5 && k < 90; i++) {
          const s = r.range(0.8, 3.2);
          dummy.position.set(cx + r.range(-2.5, 2.5), y0 + s * 0.9, cz + r.range(-2.5, 2.5)); dummy.rotation.set(r.range(-0.5, 0.5), r.range(0, 6), r.range(-0.5, 0.5)); dummy.scale.setScalar(s); dummy.updateMatrix();
          inst.setMatrixAt(k++, dummy.matrix);
        }
        const pl = new THREE.PointLight(col, 30, 16, 2); pl.position.set(cx, y0 + 2, cz); if (c < 2) gm.scene.add(pl);
        gm.world.addBox(new THREE.Vector3(cx - 2, y0 - 1, cz - 2), new THREE.Vector3(cx + 2, y0 + 3, cz + 2));
      }
      inst.count = k; inst.castShadow = true; gm.scene.add(inst);
    } else if (kind === 'icespikes') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8f0ff, roughness: 0.15, metalness: 0.1, emissive: 0x204060, emissiveIntensity: 0.4 });
      const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), mat, 120);
      let k = 0;
      for (let i = 0; i < 400 && k < 120; i++) {
        const x = r.range(-S / 2.2, S / 2.2), z = r.range(-S / 2.2, S / 2.2);
        if (!okAt(x, z, 4)) continue;
        const y = heightAt(x, z); if (y < -30) continue;
        const h = r.range(2, 11), w = h * r.range(0.12, 0.25);
        dummy.position.set(x, y + h / 2 - 0.3, z); dummy.rotation.set(r.range(-0.2, 0.2), r.range(0, 6), r.range(-0.2, 0.2)); dummy.scale.set(w, h, w); dummy.updateMatrix();
        inst.setMatrixAt(k++, dummy.matrix);
        if (h > 5) gm.world.addBox(new THREE.Vector3(x - w * 0.6, y - 1, z - w * 0.6), new THREE.Vector3(x + w * 0.6, y + h * 0.7, z + w * 0.6));
      }
      inst.count = k; inst.castShadow = true; gm.scene.add(inst);
    } else if (kind === 'vents') {
      for (let i = 0; i < 14; i++) {
        const x = r.range(-S / 2.4, S / 2.4), z = r.range(-S / 2.4, S / 2.4);
        if (!okAt(x, z, 5)) continue;
        const y = heightAt(x, z);
        addMesh(gm, new THREE.ConeGeometry(2.4, 2.4, 9, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1, side: THREE.DoubleSide }), x, y + 1, z, { collide: false });
        const p = new THREE.Vector3(x, y + 2, z);
        gm.locUpdates = gm.locUpdates || [];
        gm.locUpdates.push(() => { if (Math.random() < 0.25 && gm.hero.pos.distanceTo(p) < 120) { gm.fx.smokePuff(p, 1.2, 4, 0x8a7a6a, new THREE.Vector3(0.4, 2.5, 0.2), 0.45); gm.fx.trail(p, 0xff7a2a, 0.5, 0.8, new THREE.Vector3(0, 2, 0)); } });
      }
    } else if (kind === 'palms' || kind === 'jungle') {
      const trunkM = new THREE.MeshStandardMaterial({ color: kind === 'palms' ? 0x6a5040 : 0x2a3a3a, roughness: 0.9 });
      const leafM = new THREE.MeshStandardMaterial({ color: kind === 'palms' ? 0x2a8a5a : 0x1a6a6a, roughness: 0.7, side: THREE.DoubleSide, emissive: kind === 'jungle' ? 0x0a3a3a : 0x000000 });
      const n = kind === 'palms' ? 80 : 140;
      for (let i = 0; i < n; i++) {
        const x = r.range(-S / 2.3, S / 2.3), z = r.range(-S / 2.3, S / 2.3);
        if (!okAt(x, z, 5)) continue;
        const y = heightAt(x, z);
        if (gm.world.waterY > -1e8 && y < gm.world.waterY + 0.5) continue;
        const h = r.range(5, kind === 'jungle' ? 14 : 9);
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r.range(0, 6);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, h, 7), trunkM); t.position.y = h / 2; t.rotation.z = r.range(-0.15, 0.15); t.castShadow = true; g.add(t);
        for (let l = 0; l < 6; l++) {
          const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2), leafM);
          leaf.position.set(0, h, 0); leaf.rotation.set(-1.0, (l / 6) * Math.PI * 2, 0); leaf.translateY(1.8); leaf.castShadow = true; g.add(leaf);
        }
        if (kind === 'jungle' && r.next() < 0.5) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), emissive(0x6affd0, 3)); bulb.position.set(0.4, h * 0.6, 0); g.add(bulb); }
        gm.scene.add(g);
        gm.world.addBox(new THREE.Vector3(x - 0.4, y - 1, z - 0.4), new THREE.Vector3(x + 0.4, y + h, z + 0.4), { walk: false });
      }
    } else if (kind === 'glowplants') {
      for (let i = 0; i < 60; i++) {
        const x = r.range(-S / 2.3, S / 2.3), z = r.range(-S / 2.3, S / 2.3);
        if (!okAt(x, z, 3)) continue;
        const y = heightAt(x, z);
        const g = new THREE.Group(); g.position.set(x, y, z);
        const col = r.pick([0x6affd0, 0xb06aff, 0x6ad0ff]);
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.4, 5), trunkMat());
          s.position.set(r.range(-0.5, 0.5), 0.7, r.range(-0.5, 0.5)); s.rotation.z = r.range(-0.3, 0.3); g.add(s);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), emissive(col, 4)); b.position.copy(s.position).add(new THREE.Vector3(0, 0.75, 0)); g.add(b);
        }
        gm.scene.add(g);
      }
    }
  }
}
function trunkMat() { return MC('trunk', () => new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.8 })); }

// ------------------------------------------------------------------ Klin'Tar architecture
export function klinMats(level) {
  const s = { 1: ['#5a5a48', '#2a2a22', 0xb08a4a, 0xff3a2a], 2: ['#3a2e52', '#1a1424', 0x8a5ac8, 0xff2ad8], 3: ['#1c1c24', '#0a0a0e', 0xd4a83a, 0xffc02a], 4: ['#3a1418', '#1a0808', 0xc83a3a, 0xff3a3a], 5: ['#141018', '#060408', 0x5a1a2a, 0xff1a3a] }[level] || ['#5a5a48', '#2a2a22', 0xb08a4a, 0xff3a2a];
  return {
    hull: MC('k_hull' + level, () => { const t = panelTexture(80 + level, s[0], s[1], null, 512); return new THREE.MeshStandardMaterial({ map: t, normalMap: panelNormal(t, 2.5), metalness: 0.7, roughness: 0.42 }); }),
    win: MC('k_win' + level, () => { const m = new THREE.MeshStandardMaterial({ map: panelTexture(90 + level, s[0], s[1]), emissiveMap: windowsTexture(91 + level, '#' + new THREE.Color(s[3]).getHexString(), 0.3), emissive: 0xffffff, emissiveIntensity: 1.5, metalness: 0.7, roughness: 0.4 }); return m; }),
    trim: MC('k_trim' + level, () => new THREE.MeshStandardMaterial({ color: s[2], metalness: 0.9, roughness: 0.28 })),
    glow: emissive(s[3], 3.5),
    glowColor: s[3],
    dark: MC('k_dark' + level, () => new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.8, roughness: 0.5 })),
  };
}

export function buildBase(gm, cx, cz, level, rng, size = 1) {
  const m = klinMats(level);
  const y0 = gm.world.heightFn(cx, cz);
  const spawns = [];
  // command tower
  const tw = rbox(gm, 7, 16 * size, 7, m.win, cx, y0, cz, 0.6);
  tw.material.map.repeat.set(1, 3);
  box(gm, 8, 1, 8, m.trim, cx, y0 + 16 * size, cz);
  cyl(gm, 0.15, 0.15, 8, m.trim, cx + 2, y0 + 17 * size, cz + 2, 6, { collide: false });
  addMesh(gm, new THREE.SphereGeometry(0.6, 10, 8), m.glow, cx + 2, y0 + 25 * size, cz + 2, { collide: false });
  box(gm, 7.2, 0.4, 7.2, m.glow, cx, y0 + 8 * size, cz, { collide: false });
  const tl = new THREE.PointLight(m.glowColor, 90, 36, 2); tl.position.set(cx, y0 + 18 * size, cz); gm.scene.add(tl);
  // bunkers & barricades
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(12, 20);
    const bx = cx + Math.cos(a) * d, bz = cz + Math.sin(a) * d;
    const by = gm.world.heightFn(bx, bz);
    rbox(gm, rng.range(8, 12), 4, rng.range(6, 9), m.hull, bx, by - 0.5, bz, 1.2, { rot: [0, a, 0] });
    box(gm, 4, 0.3, 0.3, m.glow, bx, by + 2.8, bz + 0.1, { collide: false, rot: [0, a, 0] });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3), d = rng.range(22, 30);
    const bx = cx + Math.cos(a) * d, bz = cz + Math.sin(a) * d; const by = gm.world.heightFn(bx, bz);
    box(gm, 5, 1.6, 0.8, m.trim, bx, by - 0.2, bz, { rot: [0, -a + Math.PI / 2, 0] });
    spawns.push(new THREE.Vector3(bx + Math.cos(a) * 3, by, bz + Math.sin(a) * 3));
  }
  // crates
  for (let i = 0; i < 8; i++) { const x = cx + rng.range(-16, 16), z = cz + rng.range(-16, 16); if (Math.hypot(x - cx, z - cz) < 6) continue; const s = rng.range(1.2, 2); box(gm, s, s, s, m.dark, x, gm.world.heightFn(x, z) - 0.1, z); }
  // pylons
  for (let i = 0; i < 2; i++) { const a = rng.range(0, 6.28); const x = cx + Math.cos(a) * 10, z = cz + Math.sin(a) * 10; const y = gm.world.heightFn(x, z); cyl(gm, 0.5, 0.8, 6, m.trim, x, y, z, 8); addMesh(gm, new THREE.OctahedronGeometry(0.9, 0), m.glow, x, y + 7, z, { collide: false }); }
  // parked dropship
  const ds = buildEnemyFighter(level); ds.group.scale.setScalar(0.7);
  const da = rng.range(0, 6.28); const dx = cx + Math.cos(da) * 26, dz = cz + Math.sin(da) * 26;
  ds.group.position.set(dx, gm.world.heightFn(dx, dz) + 1.6, dz); ds.group.rotation.y = rng.range(0, 6);
  gm.scene.add(ds.group); gm.world.addBox(new THREE.Vector3(dx - 4, ds.group.position.y - 2, dz - 4), new THREE.Vector3(dx + 4, ds.group.position.y + 1.5, dz + 4));
  for (let i = 0; i < 4; i++) spawns.push(new THREE.Vector3(cx + rng.range(-10, 10), y0, cz + rng.range(-10, 10)));
  return { center: new THREE.Vector3(cx, y0, cz), spawns, tower: tw };
}

// player's ship parked at the landing zone
export function parkShip(gm, pos, yaw = 0) {
  const ship = buildPlayerShip(); addLandingGear(ship);
  ship.group.position.set(pos.x, pos.y + 2.0, pos.z); ship.group.rotation.y = yaw;
  ship.engines.forEach((f) => { f.scale.z = 0.12; });
  gm.scene.add(ship.group);
  gm.world.addBox(new THREE.Vector3(pos.x - 3, pos.y, pos.z - 3), new THREE.Vector3(pos.x + 3, pos.y + 2.2, pos.z + 3));
  gm.shipModel = ship;
  return ship;
}

// ------------------------------------------------------------------ main entry
export function buildLocation(gm, cfg) {
  const body = cfg.body || {};
  const def = body.def || body;
  const biomeKey = cfg.biome || def.biome || 'barren';
  const B = BIOMES[biomeKey] || BIOMES.barren;
  const seed = hashString((def.name || biomeKey) + cfg.level);
  const sys = SYSTEMS[LEVEL_SYSTEM[cfg.level]];
  const teff = (sys.star && sys.star.teff) || 6000;
  gm.biome = B; gm.surface = B.surface;
  gm.locationName = def.name || B.name;
  gm.locationSub = `${B.name}${def.gravity ? ` · gravity ${def.gravity.toFixed(2)} g` : ''}${def.eqT ? ` · ${def.eqT} K` : def.temp ? ` · ${def.temp}` : ''}`;
  gm.gravity = 20 * clamp(def.gravity || 1, 0.4, 1.4);
  gm.uniforms = []; gm.locUpdates = [];
  gm.locUpdate = (dt) => { for (const f of gm.locUpdates) f(dt); };
  const kind = cfg.kind || 'planet';
  if (kind === 'colonizer') return buildColonizerInterior(gm, B, cfg, teff, seed);
  if (kind === 'city') return buildCity(gm, B, cfg, teff, seed);
  if (kind === 'throne') return buildThrone(gm, B, cfg, teff, seed);
  // generic planet (+ optional bases / fortress / village)
  const flatten = [{ x: 0, z: 0, r: 22, blend: 18, h: undefined }];
  const rng = new RNG(seed);
  const baseSpots = [];
  if (cfg.captured && !cfg.fortress) {
    const n = 3;
    for (let i = 0; i < n; i++) { const a = rng.range(0, 0.6) + (i / n) * Math.PI * 2 + 0.5, d = rng.range(105, 160); baseSpots.push({ x: Math.cos(a) * d, z: Math.sin(a) * d }); }
  }
  for (const b of baseSpots) flatten.push({ x: b.x, z: b.z, r: 30, blend: 25 });
  if (cfg.fortress) flatten.push({ x: 0, z: 130, r: 70, blend: 40 });
  if (cfg.village) flatten.push({ x: 0, z: 50, r: 45, blend: 30 });
  const terr = buildTerrain(gm, B, seed, B.terrain === 'islands' ? 520 : 640, B.terrain === 'islands' ? 230 : 230, flatten);
  // fix flatten heights
  setupAtmosphere(gm, B, teff, seed, { sunDir: cfg.sunDir });
  if (B.terrain === 'islands') { cloudSea(gm, B, -70); gm.fallY = -45; }
  if (B.water !== undefined) waterPlane(gm, B.water, B.waterColor);
  if (B.lava !== undefined) lavaPlane(gm, B.lava + (B.terrain === 'volcanic' ? -B.amp * 0.18 : 0));
  if (B.skyBodies) for (const sb of B.skyBodies) skyPlanet(gm, sb.look, sb.dir, sb.size);
  if (cfg.skyBodies) for (const sb of cfg.skyBodies) skyPlanet(gm, sb.look, sb.dir, sb.size, sb.dist);
  const avoid = [{ x: 0, z: 0, r: 26 }, ...baseSpots.map((b) => ({ x: b.x, z: b.z, r: 36 }))];
  if (cfg.fortress) avoid.push({ x: 0, z: 130, r: 75 });
  if (cfg.village) avoid.push({ x: 0, z: 50, r: 48 });
  scatter(gm, B, terr.heightAt, seed, B.terrain === 'islands' ? 440 : 600, avoid);
  const GRASS = { homeworld: [0x0e3a2a, 0x5ad8a0], archipelago: [0x2a5a1a, 0x9ad060], haze: [0x2a1240, 0xb070e0], fortress_sand: [0x5a3a1a, 0xc89a50] };
  if (GRASS[biomeKey]) grass(gm, GRASS[biomeKey][0], GRASS[biomeKey][1], terr.heightAt, seed, 520, avoid, biomeKey === 'fortress_sand' ? 3000 : 14000);
  gm.bounds = B.terrain === 'islands' ? 245 : 290;
  const lz = new THREE.Vector3(0, terr.heightAt(0, 0), 0);
  gm.lz = lz;
  if (cfg.arrival !== 'drop' && cfg.arrival !== 'beam') parkShip(gm, lz.clone().add(new THREE.Vector3(-8, 0, -4)), 0.6);
  gm.spawn = { pos: lz.clone().add(new THREE.Vector3(2, 0, 4)), yaw: cfg.fortress ? 0 : baseSpots.length ? Math.atan2(baseSpots[0].x, baseSpots[0].z) : 0 };
  gm.bases = baseSpots.map((b) => buildBase(gm, b.x, b.z, cfg.level, rng));
  if (cfg.fortress) gm.fortress = buildFortress(gm, cfg.fortress, cfg.level, new THREE.Vector3(0, terr.heightAt(0, 130), 130), rng);
  if (cfg.village) gm.village = buildVillage(gm, new THREE.Vector3(0, terr.heightAt(0, 50), 50), rng);
  if (B.terrain === 'islands') {
    gm.locUpdates.push(() => {
      if (gm.hero.pos.y < gm.fallY) { gm.hero.pos.copy(gm.spawn.pos); gm.hero.vel.set(0, 0, 0); gm.hero.damage(20); game.ui.hint('You fell into the cloud deck — Nova\'s suit pulled you back', 3); }
    });
  }
  return gm;
}

// ------------------------------------------------------------------ colonizer ring ship (level 2)
function buildColonizerInterior(gm, B, cfg, teff, seed) {
  setupAtmosphere(gm, B, teff, seed, { sunDir: new THREE.Vector3(-0.6, 0.5, 0.4) });
  gm.world.heightFn = () => 0;
  gm.gravity = 20;
  gm.bounds = 400;
  const m = klinMats(2);
  const floorM = MC('col_floor', () => { const t = panelTexture(301, '#5a5868', '#2a2834', '#ff3ad8', 512); t.repeat.set(24, 24); return new THREE.MeshStandardMaterial({ map: t, metalness: 0.45, roughness: 0.42 }); });
  const wallM = MC('col_wall', () => { const t = panelTexture(302, '#6a6480', '#2a2434', '#8a5aff', 512); t.repeat.set(4, 2); return new THREE.MeshStandardMaterial({ map: t, metalness: 0.4, roughness: 0.45 }); });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0a0a20, metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.18 });
  const glowP = emissive(0xff3ad8, 3), glowV = emissive(0x8a5aff, 3);
  // exterior hull deck
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), floorM);
  deck.receiveShadow = true; gm.scene.add(deck);
  // the ring arching into the sky + Kepler-90 h
  const kh = SYSTEMS.kepler90.planets.find((p) => p.name === 'KEPLER-90 h');
  skyPlanet(gm, kh.look, [0.2, 0.55, 1], 1500, 3600);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(2600, 70, 16, 200, Math.PI * 0.9), MC('col_arc', () => new THREE.MeshStandardMaterial({ map: panelTexture(303, '#4a4258', '#1a1622'), emissiveMap: windowsTexture(304, '#ff6ae0', 0.25), emissive: 0xffffff, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.4 })));
  arc.position.set(0, -2600 + 40, -200); arc.rotation.set(0, Math.PI / 2, Math.PI * 0.05);
  arc.material.map.repeat.set(60, 2); arc.material.emissiveMap.repeat.set(80, 3);
  gm.scene.add(arc);
  // big exterior structures (greebles) on the deck
  const rng = new RNG(seed);
  for (let i = 0; i < 60; i++) {
    const x = rng.range(-300, 300), z = rng.range(-300, -40);
    if (Math.abs(x) < 30 && z > -90) continue;
    const h = rng.range(4, 40);
    const b = box(gm, rng.range(6, 24), h, rng.range(6, 24), rng.next() < 0.5 ? m.hull : m.win, x, 0, z);
    if (rng.next() < 0.4) box(gm, 0.5, 0.5, 20, glowP, x, h + 0.2, z, { collide: false });
  }
  for (let i = 0; i < 8; i++) cyl(gm, 2, 2, 60, m.trim, rng.range(-250, 250), 0, rng.range(-300, -120), 10);
  // ---------- interior complex (walls & ceilings)
  const W = (x0, z0, x1, z1, h = 7, mat = wallM) => { const w = Math.abs(x1 - x0) || 1, d = Math.abs(z1 - z0) || 1; return box(gm, w, h, d, mat, (x0 + x1) / 2, 0, (z0 + z1) / 2); };
  const CEIL = (x0, z0, x1, z1, y = 7) => { const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0); const c = box(gm, w, 0.6, d, wallM, (x0 + x1) / 2, y, (z0 + z1) / 2, { cast: false }); return c; };
  const STRIP = (x, z, w, d, y = 6.6, mat = glowP) => box(gm, w, 0.12, d, mat, x, y, z, { collide: false, cast: false });
  // airlock entry building on the hull (z -20..0)
  W(-8, -20, -7, 0); W(7, -20, 8, 0); CEIL(-8, -20, 8, 0);
  box(gm, 16, 7, 1, wallM, 0, 0, -20.5, { collide: false }); // facade (no collider, the door is an opening)
  box(gm, 5, 7, 1, wallM, -5.5, 0, -20.5); box(gm, 5, 7, 1, wallM, 5.5, 0, -20.5);
  box(gm, 6, 0.3, 0.3, glowP, 0, 6.2, -21.1, { collide: false });
  // corridor 1: z 0..60, x -4..4 with windows
  W(-5, 0, -4, 60); W(4, 0, 5, 60); CEIL(-5, 0, 5, 60);
  for (let z = 4; z < 60; z += 8) { STRIP(0, z, 6, 0.4); box(gm, 0.4, 4, 3, glassM, -4.3, 1.5, z, { collide: false, cast: false }); box(gm, 0.3, 0.3, 3, glowV, 3.7, 0.2, z, { collide: false }); }
  for (let z = 6; z < 58; z += 12) { box(gm, 1.4, 1.4, 1.4, m.dark, 3, 0, z); box(gm, 1, 2.2, 1, m.trim, -3.2, 0, z + 5); }
  // side room with crates (cover / stealth)
  W(5, 22, 20, 23); W(5, 38, 20, 39); W(19, 23, 20, 38); CEIL(5, 22, 20, 39);
  box(gm, 0.4, 7, 6, wallM, 4.5, 0, 25.5); box(gm, 0.4, 7, 6, wallM, 4.5, 0, 35.5);
  for (let i = 0; i < 5; i++) box(gm, 2, 2, 2, m.hull, 8 + (i % 3) * 4, 0, 26 + Math.floor(i / 3) * 6);
  STRIP(12, 30.5, 10, 0.4);
  // hangar (hostage hold): x -30..30, z 60..110, ceiling 18 with roof opening
  W(-31, 60, -30, 110, 18); W(30, 60, 31, 75, 18); W(30, 92, 31, 110, 18); W(-31, 110, 31, 111, 18);
  W(-31, 59, -4, 60, 18); W(4, 59, 31, 60, 18);
  box(gm, 62, 0.8, 22, wallM, 0, 18, 70, { cast: false }); box(gm, 62, 0.8, 18, wallM, 0, 18, 101, { cast: false });
  box(gm, 20, 0.8, 10, wallM, -21, 18, 86, { cast: false }); box(gm, 20, 0.8, 10, wallM, 21, 18, 86, { cast: false });
  // force-field in the roof opening
  const ff = new THREE.Mesh(new THREE.PlaneGeometry(22, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a5aff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  ff.position.set(0, 18.2, 86); gm.scene.add(ff);
  for (let x = -26; x <= 26; x += 13) { box(gm, 0.4, 16, 0.4, glowV, x, 0, 61, { collide: false }); box(gm, 0.4, 16, 0.4, glowV, x, 0, 109, { collide: false }); }
  for (let z = 64; z < 108; z += 8) { STRIP(-29.6, z, 0.3, 4, 15); STRIP(29.6, z, 0.3, 4, 15); }
  // hangar contents: dropship, crates, cages
  const ds = buildEnemyFighter(2); ds.group.position.set(-18, 2.4, 98); ds.group.rotation.y = 0.8; gm.scene.add(ds.group); gm.world.addBox(new THREE.Vector3(-23, 0, 93), new THREE.Vector3(-13, 3.5, 103));
  for (let i = 0; i < 7; i++) box(gm, 2.4, 2.4, 2.4, m.dark, 15 + (i % 3) * 3, 0, 96 + Math.floor(i / 3) * 3.2);
  for (const [x, z] of [[-18, 70], [18, 70], [-22, 84], [22, 84]]) { box(gm, 3.5, 1.5, 3.5, m.hull, x, 0, z); }
  for (let i = 0; i < 4; i++) { cyl(gm, 0.6, 0.6, 9, m.trim, -26 + i * 4, 0, 106, 8); }
  const hl = new THREE.PointLight(0xffc8f0, 700, 70, 2); hl.position.set(0, 14, 85); gm.scene.add(hl);
  // corridor 2: hangar east door (z 75..92) -> x 31..90
  W(31, 74, 90, 75); W(31, 92, 90, 93); CEIL(31, 74, 90, 93);
  for (let x = 36; x < 90; x += 9) { STRIP(x, 83.5, 0.4, 14); box(gm, 1.2, 1.2, 1.2, m.dark, x + 3, 0, 76.5); }
  box(gm, 0.4, 4, 3, glassM, 60, 1.5, 92.7, { collide: false });
  // core chamber: circle around (120, 84), radius 28
  const C = new THREE.Vector3(120, 0, 84);
  const segs = 22;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (Math.abs(Math.cos(am) + 1) < 0.12) continue; // west door to corridor
    const x = C.x + Math.cos(am) * 29, z = C.z + Math.sin(am) * 29;
    box(gm, 8.5, 26, 1.2, wallM, x, 0, z, { rot: [0, -am + Math.PI / 2, 0], collide: false });
    gm.world.addBox(new THREE.Vector3(x - 2.5, 0, z - 2.5), new THREE.Vector3(x + 2.5, 26, z + 2.5));
    box(gm, 0.5, 20, 0.5, i % 2 ? glowP : glowV, C.x + Math.cos(am) * 28.2, 1, C.z + Math.sin(am) * 28.2, { collide: false });
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), wallM.clone());
  dome.material.side = THREE.BackSide; dome.position.set(C.x, 24, C.z); dome.scale.y = 0.4; gm.scene.add(dome);
  // reactor
  const coreMat = emissive(0xff7af0, 2.2);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 34, 24), coreMat); core.position.set(C.x, 17, C.z); gm.scene.add(core);
  const coreGlass = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4ae0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  coreGlass.position.copy(core.position); gm.scene.add(coreGlass);
  gm.world.addBox(new THREE.Vector3(C.x - 5.5, 0, C.z - 5.5), new THREE.Vector3(C.x + 5.5, 30, C.z + 5.5));
  const rings = [];
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 1.6, 0.35, 8, 48), i % 2 ? glowP : m.trim); r.position.set(C.x, 5 + i * 6, C.z); r.rotation.x = Math.PI / 2; gm.scene.add(r); rings.push(r); }
  cyl(gm, 9, 10, 2, m.hull, C.x, 0, C.z, 24);
  // catwalk ring
  const cw = new THREE.Mesh(new THREE.TorusGeometry(17, 1.2, 6, 60), m.trim); cw.rotation.x = Math.PI / 2; cw.position.set(C.x, 9, C.z); gm.scene.add(cw);
  const cl = new THREE.PointLight(0xff9af0, 380, 80, 2); cl.position.set(C.x, 12, C.z); gm.scene.add(cl);
  // bomb console
  const consolePos = new THREE.Vector3(C.x - 11, 0, C.z);
  rbox(gm, 2.4, 1.3, 1.6, m.trim, consolePos.x, 0, consolePos.z, 0.2);
  box(gm, 2, 0.1, 1.2, glowV, consolePos.x, 1.3, consolePos.z, { collide: false });
  gm.locUpdates.push((dt) => {
    for (let i = 0; i < rings.length; i++) rings[i].rotation.z += dt * (0.4 + i * 0.25) * (i % 2 ? 1 : -1);
    core.scale.x = core.scale.z = 1 + Math.sin(gm.time * 6) * 0.05;
    if (Math.random() < 0.15) { const a = Math.random() * 6.28; gm.fx.tracer(new THREE.Vector3(C.x, 5 + Math.random() * 25, C.z), new THREE.Vector3(C.x + Math.cos(a) * 14, 3 + Math.random() * 20, C.z + Math.sin(a) * 14), 0xff8af8, 0.06, 0.08); }
  });
  gm.surface = 'metal';
  gm.spawn = { pos: new THREE.Vector3(0, 0, -45), yaw: 0 };
  gm.boundsFn = (p) => { p.x = clamp(p.x, -320, 320); p.z = clamp(p.z, -320, 160); };
  gm.loc = {
    entry: new THREE.Vector3(0, 0, -21), hangar: new THREE.Vector3(0, 0, 85), beam: new THREE.Vector3(0, 0, 86), core: C.clone(), console: consolePos,
    hostageSpots: [[-6, 82], [-3, 84], [0, 82], [3, 84], [6, 82], [-4.5, 88], [0, 89], [4.5, 88]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    guards: [{ pos: new THREE.Vector3(-9, 0, 79), kind: 'soldier', weapon: 'plasma' }, { pos: new THREE.Vector3(9, 0, 79), kind: 'soldier', weapon: 'scatter' }, { pos: new THREE.Vector3(0, 0, 93), kind: 'brute', weapon: 'heavy' }, { pos: new THREE.Vector3(-12, 0, 90), kind: 'soldier', weapon: 'plasma' }],
    patrols: [
      { pos: new THREE.Vector3(0, 0, 12), path: [new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, 50)] },
      { pos: new THREE.Vector3(12, 0, 30), path: [new THREE.Vector3(9, 0, 28), new THREE.Vector3(15, 0, 34)] },
      { pos: new THREE.Vector3(-20, 0, -35), path: [new THREE.Vector3(-25, 0, -60), new THREE.Vector3(-14, 0, -28)] },
      { pos: new THREE.Vector3(18, 0, -30), path: [new THREE.Vector3(22, 0, -55), new THREE.Vector3(14, 0, -26)] },
    ],
    waves: [new THREE.Vector3(40, 0, 83), new THREE.Vector3(70, 0, 83), new THREE.Vector3(0, 0, 55), new THREE.Vector3(0, 0, 30), new THREE.Vector3(120, 0, 105), new THREE.Vector3(120, 0, 62)],
  };
  gm.locationName = 'KLIN\'TAR COLONIZER';
  gm.locationSub = 'Ring ship in orbit of KEPLER-90 h · artificial gravity 1.0 g';
  return gm;
}

// ------------------------------------------------------------------ fortress (level 3)
function buildFortress(gm, theme, level, c, rng) {
  const T = {
    sand: { wall: ['#c08050', '#7a4a2a'], trim: 0xe8c080, glow: 0xffc02a, tower: 'dome' },
    ice: { wall: ['#a8c8e8', '#5a7898'], trim: 0xe8f8ff, glow: 0x6ad8ff, tower: 'spire' },
    obsidian: { wall: ['#1a1a24', '#08080c'], trim: 0x5a4a8a, glow: 0xb04aff, tower: 'spike' },
  }[theme];
  const wallM = new THREE.MeshStandardMaterial({ map: panelTexture(500 + theme.length, T.wall[0], T.wall[1], null, 512), roughness: theme === 'ice' ? 0.2 : 0.8, metalness: theme === 'obsidian' ? 0.6 : 0.1, transparent: theme === 'ice', opacity: theme === 'ice' ? 0.95 : 1 });
  wallM.map.repeat.set(6, 2);
  const trimM = new THREE.MeshStandardMaterial({ color: T.trim, roughness: 0.3, metalness: 0.6 });
  const glow = emissive(T.glow, 3.5);
  const km = klinMats(level);
  const S = 46, H = 12, TH = 2.6;
  const y = c.y;
  // outer walls with a gate in the south (towards the landing zone)
  box(gm, S * 2 + TH, H, TH, wallM, c.x, y, c.z + S);
  box(gm, TH, H, S * 2, wallM, c.x - S, y, c.z);
  box(gm, TH, H, S * 2, wallM, c.x + S, y, c.z);
  box(gm, S - 6, H, TH, wallM, c.x - S / 2 - 3, y, c.z - S);
  box(gm, S - 6, H, TH, wallM, c.x + S / 2 + 3, y, c.z - S);
  box(gm, 12, 3, TH, wallM, c.x, y + H - 3, c.z - S, { walk: true });
  // crenellations
  for (let i = -S; i <= S; i += 4) for (const [x, z] of [[c.x + i, c.z + S], [c.x + i, c.z - S], [c.x - S, c.z + i], [c.x + S, c.z + i]]) box(gm, 1.6, 1.4, 1.6, wallM, x, y + H, z, { collide: false });
  // corner towers
  const towers = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = c.x + sx * S, tz = c.z + sz * S;
    cyl(gm, 5, 6, H + 10, wallM, tx, y, tz, 16);
    box(gm, 11, 0.6, 11, trimM, tx, y + H + 10, tz, { collide: true });
    if (T.tower === 'dome') addMesh(gm, new THREE.SphereGeometry(4.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), trimM, tx, y + H + 13, tz, { collide: false });
    else if (T.tower === 'spire') addMesh(gm, new THREE.ConeGeometry(4, 16, 6), new THREE.MeshStandardMaterial({ color: 0xc8f0ff, emissive: 0x2a6a8a, roughness: 0.1, transparent: true, opacity: 0.85 }), tx, y + H + 19, tz, { collide: false });
    else addMesh(gm, new THREE.ConeGeometry(3, 12, 4), km.dark, tx, y + H + 16, tz, { collide: false });
    addMesh(gm, new THREE.SphereGeometry(0.8, 10, 8), glow, tx, y + H + (T.tower === 'spire' ? 28 : 24), tz, { collide: false });
    if (sx === sz) { const pl = new THREE.PointLight(T.glow, 140, 45, 2); pl.position.set(tx, y + H + 12, tz); gm.scene.add(pl); }
    towers.push(new THREE.Vector3(tx, y + H + 10.3, tz));
  }
  // walkways on top of the walls (stand-able)
  box(gm, S * 2, 0.5, 4, wallM, c.x, y + H - 0.5, c.z + S - 2.5, { collide: true });
  // keep
  const kx = c.x, kz = c.z + 14, KS = 13, KH = 16;
  box(gm, KS * 2, KH, 1.6, wallM, kx, y, kz + KS);
  box(gm, 1.6, KH, KS * 2, wallM, kx - KS, y, kz);
  box(gm, 1.6, KH, KS * 2, wallM, kx + KS, y, kz);
  box(gm, KS - 3, KH, 1.6, wallM, kx - KS / 2 - 1.5, y, kz - KS);
  box(gm, KS - 3, KH, 1.6, wallM, kx + KS / 2 + 1.5, y, kz - KS);
  box(gm, 6, KH - 6, 1.6, wallM, kx, y + 6, kz - KS);
  box(gm, KS * 2 + 2, 1, KS * 2 + 2, wallM, kx, y + KH, kz);
  box(gm, 6.2, 0.4, 0.4, glow, kx, y + 5.8, kz - KS - 0.9, { collide: false });
  if (T.tower === 'dome') addMesh(gm, new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), trimM, kx, y + KH + 1, kz, { collide: false });
  else if (T.tower === 'spire') addMesh(gm, new THREE.ConeGeometry(9, 30, 6), new THREE.MeshStandardMaterial({ color: 0xd8f8ff, emissive: 0x3a8aaa, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.8 }), kx, y + KH + 16, kz, { collide: false });
  else { for (let i = 0; i < 6; i++) addMesh(gm, new THREE.ConeGeometry(1.6, 14, 4), km.dark, kx + Math.cos(i) * 8, y + KH + 7, kz + Math.sin(i) * 8, { collide: false, rot: [Math.cos(i) * 0.3, 0, Math.sin(i) * 0.3] }); }
  const kl = new THREE.PointLight(T.glow, 220, 34, 2); kl.position.set(kx, y + 8, kz); gm.scene.add(kl);
  // cells inside the keep
  const cells = [];
  for (let i = 0; i < 4; i++) {
    const cx = kx - 9 + i * 6, cz = kz + 8;
    for (let b = 0; b < 5; b++) cyl(gm, 0.08, 0.08, 4, km.trim, cx - 2 + b, y, cz - 2.2, 6, { collide: false });
    box(gm, 5, 0.3, 5, km.trim, cx, y + 4, cz, { collide: false });
    box(gm, 0.3, 4, 4.4, wallM, cx + 2.6, y, cz);
    const bars = box(gm, 5, 4, 0.2, new THREE.MeshBasicMaterial({ color: T.glow, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), cx, y, cz - 2.3);
    cells.push({ pos: new THREE.Vector3(cx, y, cz), door: bars, box: gm.world.boxes[gm.world.boxes.length - 1] });
  }
  // courtyard props
  for (let i = 0; i < 10; i++) { const x = c.x + rng.range(-38, 38), z = c.z + rng.range(-38, -8); box(gm, 2, 1.6, 2, km.dark, x, gm.world.heightFn(x, z), z); }
  for (let i = 0; i < 6; i++) { const x = c.x + rng.range(-35, 35), z = c.z + rng.range(-34, 30); if (Math.abs(x - kx) < 16 && z > kz - 16) continue; box(gm, 5, 1.6, 0.8, trimM, x, gm.world.heightFn(x, z), z); }
  if (theme === 'obsidian') { const moat = new THREE.Mesh(new THREE.RingGeometry(S + 4, S + 12, 4, 1).rotateX(-Math.PI / 2), lavaMaterial(0xff4a1a)); moat.rotation.y = Math.PI / 4; moat.position.set(c.x, y + 0.05, c.z); gm.scene.add(moat); gm.uniforms.push(moat.material.uniforms); }
  return {
    center: c, gate: new THREE.Vector3(c.x, y, c.z - S - 4), keep: new THREE.Vector3(kx, y, kz), cells, towers,
    courtyard: [new THREE.Vector3(c.x - 20, y, c.z - 25), new THREE.Vector3(c.x + 20, y, c.z - 25), new THREE.Vector3(c.x - 30, y, c.z + 10), new THREE.Vector3(c.x + 30, y, c.z + 10), new THREE.Vector3(c.x, y, c.z - 10), new THREE.Vector3(c.x - 10, y, c.z + 30), new THREE.Vector3(c.x + 10, y, c.z + 30)],
    keepGuards: [new THREE.Vector3(kx - 6, y, kz + 2), new THREE.Vector3(kx + 6, y, kz + 2), new THREE.Vector3(kx, y, kz - 4)],
    walls: [new THREE.Vector3(c.x - 15, y + H, c.z - S), new THREE.Vector3(c.x + 15, y + H, c.z - S)],
  };
}

// ------------------------------------------------------------------ Keplerian village (level 2 homeworld)
function buildVillage(gm, c, rng) {
  const domeM = new THREE.MeshPhysicalMaterial({ color: 0x9fbcc4, roughness: 0.32, metalness: 0.35, clearcoat: 0.8, emissive: 0x031414 });
  const glowM = emissive(0x6affd0, 3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, d = rng.range(22, 34);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = gm.world.heightFn(x, z);
    const r = rng.range(4, 7);
    addMesh(gm, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM, x, y - 0.3, z, { collide: false });
    gm.world.addBox(new THREE.Vector3(x - r * 0.7, y - 1, z - r * 0.7), new THREE.Vector3(x + r * 0.7, y + r * 0.8, z + r * 0.7));
    addMesh(gm, new THREE.TorusGeometry(r * 0.98, 0.12, 6, 32), glowM, x, y + 0.6, z, { collide: false, rot: [Math.PI / 2, 0, 0] });
    const pl = new THREE.PointLight(0x6affd0, 50, 18, 2); pl.position.set(x, y + 3, z); if (i % 3 === 0) gm.scene.add(pl);
  }
  // central plaza with a totem
  cyl(gm, 9, 9.5, 0.5, new THREE.MeshStandardMaterial({ color: 0x8aa8a8, roughness: 0.5 }), c.x, c.y - 0.3, c.z, 32);
  cyl(gm, 0.8, 1.2, 9, domeM, c.x, c.y, c.z + 6, 8);
  addMesh(gm, new THREE.OctahedronGeometry(1.4, 0), glowM, c.x, c.y + 10.5, c.z + 6, { collide: false });
  return { center: c };
}

// ------------------------------------------------------------------ TRAPPIST-1e city with bazaar & execution plaza (level 3)
function buildCity(gm, B, cfg, teff, seed) {
  const rng = new RNG(seed);
  const flatten = [{ x: 0, z: 0, r: 230, blend: 40, h: 1 }];
  const terr = buildTerrain(gm, B, seed, 900, 150, flatten);
  setupAtmosphere(gm, B, teff, seed, { sunDir: new THREE.Vector3(-0.5, 0.42, 0.7) });
  waterPlane(gm, B.water, B.waterColor);
  // other TRAPPIST-1 planets hang huge in the sky
  const ps = SYSTEMS.trappist1.planets;
  skyPlanet(gm, ps.find((p) => p.name === 'TRAPPIST-1 f').look, [0.6, 0.35, -0.7], 520, 3600);
  skyPlanet(gm, ps.find((p) => p.name === 'TRAPPIST-1 d').look, [-0.8, 0.5, -0.3], 260, 3600);
  skyPlanet(gm, ps.find((p) => p.name === 'TRAPPIST-1 g').look, [0.1, 0.62, -0.9], 200, 3600);
  const km = klinMats(3);
  const stoneM = new THREE.MeshStandardMaterial({ map: panelTexture(700, '#b8a890', '#6a5a48', null, 512), roughness: 0.75 });
  stoneM.map.repeat.set(2, 3);
  const roadM = new THREE.MeshStandardMaterial({ map: panelTexture(701, '#5a5650', '#3a3632'), roughness: 0.9 });
  roadM.map.repeat.set(30, 30);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2), roadM); road.position.y = 1.02; road.receiveShadow = true; gm.scene.add(road);
  const winM = (seedN, col) => { const m = new THREE.MeshStandardMaterial({ map: panelTexture(seedN, '#c8b8a0', '#7a6a58'), emissiveMap: windowsTexture(seedN + 1, col, 0.4), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.6, metalness: 0.2 }); m.map.repeat.set(1, 3); m.emissiveMap.repeat.set(1, 3); return m; };
  const wins = [winM(710, '#ffd27a'), winM(712, '#ff9ad8'), winM(714, '#9ae8ff')];
  const y0 = 1;
  // building blocks around a grid; keep the plaza (0,0 r 30) and bazaar (-60..-20, -10..30) open
  const blocks = [];
  for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
    const x = gx * 42, z = gz * 42;
    if (Math.hypot(x, z) < 50) continue;
    if (x > -110 && x < -30 && z > -30 && z < 50) continue; // bazaar area
    if (Math.hypot(x - 140, z - 20) < 30) continue; // sniper tower site
    if (x > 15 && x < 135 && Math.abs(z - x * 0.14) < 28) continue; // keep the sniper's line of sight to the plaza clear
    if (Math.hypot(x, z) > 200) continue;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const w = rng.range(10, 18), d = rng.range(10, 18), h = rng.range(10, 46);
      const bx = x + rng.range(-8, 8), bz = z + rng.range(-8, 8);
      const kind = rng.next();
      if (kind < 0.18) { cyl(gm, w * 0.5, w * 0.55, h * 0.6, wins[i % 3], bx, y0, bz, 16); addMesh(gm, new THREE.SphereGeometry(w * 0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), stoneM, bx, y0 + h * 0.6, bz, { collide: false }); }
      else { const b = box(gm, w, h, d, wins[i % 3], bx, y0, bz); b.material.map.repeat.set(1, h / 14); if (rng.next() < 0.5) box(gm, w + 1, 0.8, d + 1, stoneM, bx, y0 + h, bz, { collide: false }); }
      blocks.push({ x: bx, z: bz });
    }
  }
  // sniper tower (the high-rise), ~140 m east of the plaza
  const TW = new THREE.Vector3(140, y0, 20);
  const towerH = 62;
  box(gm, 14, towerH, 14, wins[2], TW.x, y0, TW.z);
  box(gm, 18, 1, 18, stoneM, TW.x, y0 + towerH, TW.z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(gm, 0.6, 1.2, 0.6, km.trim, TW.x + sx * 8.5, y0 + towerH + 1, TW.z + sz * 8.5, { collide: false });
  box(gm, 18, 1.0, 0.4, stoneM, TW.x, y0 + towerH + 1, TW.z - 8.8);
  const beacon = new THREE.PointLight(0xff4a6a, 80, 34, 2); beacon.position.set(TW.x, y0 + towerH + 6, TW.z); gm.scene.add(beacon);
  addMesh(gm, new THREE.SphereGeometry(0.6, 10, 8), emissive(0xff4a6a, 4), TW.x, y0 + towerH + 5, TW.z, { collide: false });
  // execution plaza (center)
  const P = new THREE.Vector3(0, y0, 0);
  cyl(gm, 32, 32, 0.1, stoneM, 0, y0, 0, 48, { collide: false });
  const stage = box(gm, 12, 2.6, 9, stoneM, 0, y0, 0);
  for (let k = 1; k <= 4; k++) box(gm, 4, k * 0.65, 1.1, stoneM, 0, y0, -4.5 - (4 - k + 0.5) * 1.1);
  box(gm, 1.2, 0.9, 1.2, km.dark, 0, y0 + 2.6, 1.0, { collide: false });
  for (const sx of [-1, 1]) { cyl(gm, 0.25, 0.25, 7, km.trim, sx * 5.5, y0 + 2.6, 3.8, 8, { collide: false }); addMesh(gm, new THREE.BoxGeometry(5, 3, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffc02a, emissiveIntensity: 0.25 }), sx * 3, y0 + 7, 3.8, { collide: false }); }
  const sl = new THREE.SpotLight(0xffd0a0, 900, 60, 0.5, 0.6, 2); sl.position.set(0, y0 + 25, -10); sl.target.position.set(0, y0 + 2.6, 1); gm.scene.add(sl); gm.scene.add(sl.target);
  // bazaar stalls
  const clothCols = [0xc83a3a, 0x3a8ac8, 0xd8a83a, 0x8a3ac8, 0x3ac88a, 0xe86a2a];
  const stalls = [];
  for (let i = 0; i < 14; i++) {
    const row = Math.floor(i / 7), col = i % 7;
    const x = -100 + col * 11, z = -8 + row * 26;
    const g = new THREE.Group(); g.position.set(x, y0, z);
    const wood = MC('stall_wood', () => new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
    for (const [px, pz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), wood); p.position.set(px, 1.6, pz); p.castShadow = true; g.add(p); }
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.4, 4, 1, true), new THREE.MeshStandardMaterial({ color: clothCols[i % clothCols.length], roughness: 0.8, side: THREE.DoubleSide }));
    cloth.position.y = 3.7; cloth.rotation.y = Math.PI / 4; cloth.castShadow = true; g.add(cloth);
    const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.6), wood); table.position.set(0, 0.45, row ? -1 : 1); table.castShadow = true; g.add(table);
    for (let k = 0; k < 6; k++) { const item = new THREE.Mesh(k % 2 ? new THREE.SphereGeometry(0.22, 8, 6) : new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: clothCols[(i + k) % 6], roughness: 0.5 })); item.position.set(-2 + k * 0.8, 1.05, row ? -1 : 1); g.add(item); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), emissive(0xffb04a, 4)); lamp.position.set(2.6, 2.8, 0); g.add(lamp);
    gm.scene.add(g);
    gm.world.addBox(new THREE.Vector3(x - 2.6, y0, z + (row ? -1.9 : 0.1)), new THREE.Vector3(x + 2.6, y0 + 0.9, z + (row ? -0.1 : 1.9)));
    stalls.push(new THREE.Vector3(x, y0, z));
  }
  // weapons dealer stall (distinct, at the bazaar edge)
  const dealerPos = new THREE.Vector3(-30, y0, 30);
  rbox(gm, 7, 3.5, 4, km.hull, dealerPos.x - 1, y0, dealerPos.z + 3.2, 0.3);
  box(gm, 7, 0.3, 4, km.glow, dealerPos.x - 1, y0 + 3.5, dealerPos.z + 3.2, { collide: false });
  box(gm, 5, 1, 1.4, MC('stall_wood', () => new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 })), dealerPos.x - 1, y0, dealerPos.z + 0.6);
  for (let k = 0; k < 4; k++) { const r = buildRifleProp(); r.position.set(dealerPos.x - 3 + k * 1.3, y0 + 1.1, dealerPos.z + 0.6); r.rotation.y = 0.3; gm.scene.add(r); }
  const dl = new THREE.PointLight(0xffc02a, 90, 16, 2); dl.position.set(dealerPos.x, y0 + 3, dealerPos.z + 1); gm.scene.add(dl);
  // hover traffic loops
  const cars = [];
  const carM = [0xd8d0c8, 0x3a8ac8, 0xc83a5a, 0x2a2a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.3 }));
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.1, 4.4, 2, 0.4), carM[i % 4]); b.castShadow = true; g.add(b);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.7, 2, 2, 0.3), MC('car_glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.05 }))); cab.position.set(0, 0.7, -0.2); g.add(cab);
    const hov = new THREE.Mesh(new THREE.PlaneGeometry(2, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); hov.position.y = -0.6; g.add(hov);
    gm.scene.add(g);
    const lane = i % 4; const R = 60 + lane * 28; const h = 4 + (i % 3) * 6;
    cars.push({ g, R, h, a: rng.range(0, 6.28), sp: rng.range(0.08, 0.16) * (lane % 2 ? 1 : -1) });
  }
  gm.locUpdates.push((dt) => {
    for (const c of cars) {
      c.a += c.sp * dt;
      const x = Math.cos(c.a) * c.R, z = Math.sin(c.a) * c.R * 0.8;
      const nx = Math.cos(c.a + c.sp * 0.1) * c.R, nz = Math.sin(c.a + c.sp * 0.1) * c.R * 0.8;
      c.g.position.set(x, y0 + c.h + Math.sin(gm.time * 2 + c.R) * 0.2, z);
      c.g.lookAt(nx, c.g.position.y, nz);
    }
  });
  // landing pad near the bazaar
  const pad = new THREE.Vector3(-70, y0, -55);
  cyl(gm, 9, 9, 0.2, km.trim, pad.x, y0, pad.z, 24, { collide: false });
  addMesh(gm, new THREE.TorusGeometry(8.5, 0.2, 6, 32), km.glow, pad.x, y0 + 0.25, pad.z, { collide: false, rot: [Math.PI / 2, 0, 0] });
  gm.bounds = 220;
  gm.lz = pad.clone();
  if (cfg.arrival !== 'drop') parkShip(gm, pad.clone(), 0.8);
  gm.spawn = cfg.arrival === 'drop' ? { pos: new THREE.Vector3(-70, y0, 10), yaw: Math.PI / 2 } : { pos: pad.clone().add(new THREE.Vector3(6, 0, 8)), yaw: Math.PI * 0.3 };
  gm.loc = { plaza: P, stage: new THREE.Vector3(0, y0 + 2.6, 1), tower: TW, towerTop: new THREE.Vector3(TW.x, y0 + towerH + 0.5, TW.z), dealer: dealerPos, stalls, pad, bazaar: new THREE.Vector3(-70, y0, 10) };
  gm.surface = 'rock';
  gm.locationName = 'TRAPPIST-1 e';
  gm.locationSub = 'Coastal city of the Trappeni · gravity 0.82 g · 250 K (NASA eq. temp.)';
  gm.gravity = 20 * 0.82;
  return gm;
}
function buildRifleProp() {
  const g = new THREE.Group();
  const m = MC('prop_gun', () => new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.8, roughness: 0.35 }));
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.1), m); g.add(b);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8).rotateX(Math.PI / 2), m); s.position.set(0, 0.1, 0.1); g.add(s);
  return g;
}

// ------------------------------------------------------------------ HR 8799 c throne arena (level 5)
function buildThrone(gm, B, cfg, teff, seed) {
  setupAtmosphere(gm, B, teff, seed, { sunDir: new THREE.Vector3(0.2, 0.25, 1) });
  cloudSea(gm, B, -90);
  const others = SYSTEMS.hr8799.planets.filter((p) => p.name !== 'HR 8799 c');
  skyPlanet(gm, others[0].look, [0.7, 0.3, 0.6], 700, 3600);
  skyPlanet(gm, others[1].look, [-0.6, 0.45, 0.5], 420, 3600);
  skyPlanet(gm, others[2].look, [-0.2, 0.2, -0.95], 300, 3600);
  const R = 85;
  gm.world.heightFn = (x, z) => (Math.hypot(x, z) < R ? 0 : -400);
  const floorM = new THREE.MeshStandardMaterial({ map: panelTexture(900, '#16121a', '#060408', '#ff1a3a', 1024), metalness: 0.7, roughness: 0.3 });
  floorM.map.repeat.set(10, 10);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.6, 30, 64), floorM); plat.position.y = -15; plat.receiveShadow = true; gm.scene.add(plat);
  const km = klinMats(5);
  addMesh(gm, new THREE.TorusGeometry(R, 0.6, 8, 96), km.glow, 0, 0.1, 0, { collide: false, rot: [Math.PI / 2, 0, 0] });
  addMesh(gm, new THREE.TorusGeometry(30, 0.3, 8, 96), km.glow, 0, 0.05, 0, { collide: false, rot: [Math.PI / 2, 0, 0] });
  // spires around the arena
  const rng = new RNG(seed);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2; const r = R - 4;
    const h = rng.range(25, 60);
    const s = addMesh(gm, new THREE.ConeGeometry(3.2, h, 5), km.hull, Math.cos(a) * r, h / 2, Math.sin(a) * r, { rot: [rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)] });
    addMesh(gm, new THREE.OctahedronGeometry(0.9, 0), km.glow, Math.cos(a) * r, h * 0.8, Math.sin(a) * r, { collide: false });
  }
  // the throne
  rbox(gm, 14, 4, 10, km.hull, 0, 0, 62, 1);
  rbox(gm, 6, 18, 2, km.dark, 0, 4, 66, 0.5);
  for (const s of [-1, 1]) { rbox(gm, 1.6, 6, 6, km.hull, s * 3.6, 4, 63.5, 0.4); addMesh(gm, new THREE.ConeGeometry(0.8, 8, 4), km.trim, s * 3, 24, 66, { collide: false }); }
  addMesh(gm, new THREE.OctahedronGeometry(1.6, 0), km.glow, 0, 23, 66, { collide: false });
  const tl = new THREE.PointLight(0xff1a3a, 500, 70, 2); tl.position.set(0, 12, 60); gm.scene.add(tl);
  // red lightning across the sky
  gm.locUpdates.push(() => {
    if (Math.random() < 0.02) {
      const a = Math.random() * 6.28, d = 300 + Math.random() * 900;
      const top = new THREE.Vector3(Math.cos(a) * d, 200 + Math.random() * 200, Math.sin(a) * d);
      let p = top.clone();
      for (let i = 0; i < 6; i++) { const n = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, -60 - Math.random() * 40, (Math.random() - 0.5) * 60)); gm.fx.tracer(p, n, 0xff3a5a, 2.5, 0.2); p = n; }
    }
  });
  gm.surface = 'metal';
  gm.bounds = R - 2;
  gm.spawn = { pos: new THREE.Vector3(0, 0, -60), yaw: 0 };
  gm.fallY = -40;
  gm.locUpdates.push(() => { if (gm.hero.pos.y < gm.fallY) { gm.hero.pos.set(0, 2, -60); gm.hero.vel.set(0, 0, 0); gm.hero.damage(25); } });
  gm.loc = { center: new THREE.Vector3(0, 0, 0), throne: new THREE.Vector3(0, 4, 62), R };
  gm.locationName = 'HR 8799 c';
  gm.locationSub = 'Throne platform above a 1,200 K super-Jupiter · surface gravity 17.8 g (suit-compensated)';
  gm.gravity = 24;
  return gm;
}

export { beamMaterial };
