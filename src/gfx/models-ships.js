// Procedural spacecraft. Convention: models face +Z (nose), +Y up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { panelTexture, windowsTexture, RNG, panelNormal } from '../core/util.js';
import { flameMaterial } from './shaders.js';

// fresnel rim light (same as characters) so hulls separate from the dark of space
function shipRim(mat, color, strength = 0.35, power = 2.6) {
  const c = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = { value: c }; sh.uniforms.uRimPow = { value: power };
    sh.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimPow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uRimColor * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow);');
  };
  mat.customProgramCacheKey = () => 'srim_' + c.getHexString() + power;
  return mat;
}
const matCache = {};
function M(key, make) { if (!matCache[key]) { matCache[key] = make(); matCache[key].userData.shared = true; } return matCache[key]; }

function lathe(points, segs = 24) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.rotateX(Math.PI / 2);
  return g;
}
function extrude(pts, depth, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  g.rotateX(Math.PI / 2); // shape y -> +z, extrusion goes -y
  g.translate(0, depth / 2, 0);
  return g;
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function emissive(color, k = 2.5) {
  return M('em' + color + k, () => { const m = new THREE.MeshBasicMaterial({ color }); m.color.multiplyScalar(k); return m; });
}

// ------------------------------------------------------------------ player ship
export function buildPlayerShip() {
  const g = new THREE.Group();
  g.name = 'NOVA-1';
  const hull = M('p_hull2', () => { const t = panelTexture(3, '#dfe5ec', '#8a96a6', null, 512); return shipRim(new THREE.MeshPhysicalMaterial({ map: t, normalMap: panelNormal(t, 3), normalScale: new THREE.Vector2(0.8, 0.8), metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }), 0x9fe8ff, 0.3); });
  const dark = M('p_dark2', () => { const t = panelTexture(4, '#2a3038', '#14181e'); return shipRim(new THREE.MeshPhysicalMaterial({ map: t, normalMap: panelNormal(t, 3), metalness: 0.85, roughness: 0.32, clearcoat: 0.6 }), 0x4ef2ff, 0.25); });
  const glass = M('p_glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x06283a, emissiveIntensity: 0.6 }));
  const cyan = emissive(0x4ef2ff, 1.6);

  // fuselage
  const fus = mesh(lathe([[0, -5.2], [0.55, -5.0], [0.95, -3.6], [1.12, -1.2], [1.05, 1.0], [0.82, 3.0], [0.45, 5.0], [0.12, 6.4], [0, 6.6]], 28), hull, 0, 0, 0, g);
  fus.scale.set(1.25, 0.72, 1);
  const belly = mesh(lathe([[0, -4.8], [0.8, -4.2], [0.95, -1], [0.7, 2.5], [0.2, 4.5], [0, 4.8]], 20), dark, 0, -0.28, 0, g);
  belly.scale.set(1.1, 0.5, 1);
  // canopy
  const can = mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.42, 1.7, g);
  can.scale.set(0.55, 0.5, 1.7);
  mesh(new THREE.TorusGeometry(0.58, 0.04, 6, 30), cyan, 0, 0.42, 1.7, g).scale.set(1, 2.9, 1);
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  // wings (forward-swept delta)
  const wingShape = [[0.6, -3.2], [6.4, -4.4], [6.8, -3.6], [5.6, -1.6], [1.0, 1.8]];
  for (const s of [-1, 1]) {
    const pts = wingShape.map(([x, y]) => [x * s, y]);
    if (s < 0) pts.reverse();
    const w = mesh(extrude(pts, 0.16, 0.06), hull, 0, -0.1, 0, g);
    w.rotation.z = s * 0.06;
    // leading edge glow strip
    const strip = mesh(new THREE.BoxGeometry(0.08, 0.06, 5.0), cyan, s * 3.5, -0.0, -0.05, g);
    strip.rotation.y = -s * 0.98;
    // wingtip pods
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 10).rotateX(Math.PI / 2), dark, s * 6.5, -0.1, -3.2, g);
    const nav = mesh(new THREE.SphereGeometry(0.14, 8, 6), emissive(s < 0 ? 0xff3040 : 0x30ff70, 4), s * 6.5, -0.1, -1.85, g);
    nav.userData.blink = true;
    // cannons
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8).rotateX(Math.PI / 2), dark, s * 1.7, -0.25, 1.5, g);
    // under-wing rockets
    const rk = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8).rotateX(Math.PI / 2), M('p_rk', () => new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.4, roughness: 0.4 })), s * 3.2, -0.42, -1.6, g);
    mesh(new THREE.ConeGeometry(0.12, 0.35, 8).rotateX(Math.PI / 2), emissive(0xff5a2a, 2), 0, 0, 0.95, rk);
    // fins
    const fin = mesh(extrude([[0, -4.6], [0, -2.2], [1.7, -4.9], [1.9, -5.4]], 0.1, 0.03), hull, s * 1.15, 0.35, 0, g);
    fin.rotation.z = Math.PI / 2 - s * 0.45;
    fin.position.set(s * 1.0, 0.3, 0);
  }
  // engines
  const engines = [];
  for (const s of [-1, 1]) {
    const e = mesh(lathe([[0.42, -6.0], [0.62, -5.6], [0.66, -3.4], [0.5, -1.8], [0.3, -1.4]], 18), dark, s * 1.25, 0, 0, g);
    mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20), cyan, s * 1.25, 0, -5.9, g);
    mesh(new THREE.CircleGeometry(0.46, 20).rotateY(Math.PI), emissive(0x9ff8ff, 1.8), s * 1.25, 0, -5.95, g);
    const flame = mesh(new THREE.ConeGeometry(0.42, 5, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -2.5), flameMaterial(0x4ef2ff), s * 1.25, 0, -5.9, g);
    engines.push(flame);
  }
  // spine & accents
  mesh(new RoundedBoxGeometry(0.5, 0.35, 5, 2, 0.12), dark, 0, 0.55, -1.8, g);
  mesh(new THREE.BoxGeometry(0.06, 0.05, 3.6), cyan, 0, 0.74, -1.8, g);
  const ship = { group: g, engines, muzzles: [new THREE.Vector3(-1.7, -0.25, 2.8), new THREE.Vector3(1.7, -0.25, 2.8)], radius: 6 };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return ship;
}

// landing gear (shown when the ship sits on the ground)
export function addLandingGear(ship) {
  const dark = M('p_dark2', () => new THREE.MeshStandardMaterial({ color: 0x30353d, metalness: 0.8, roughness: 0.4 }));
  const gear = new THREE.Group();
  for (const [x, z] of [[-2.2, -2.5], [2.2, -2.5], [0, 3.5]]) {
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), dark, x, -1.1, z, gear);
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12), dark, x, -1.9, z, gear);
  }
  ship.group.add(gear);
  return gear;
}

// ------------------------------------------------------------------ enemy styles per level
export const ENEMY_STYLES = {
  1: { hull: '#5a6a4a', trim: '#b08a4a', glow: 0xff3a2a, name: 'VANGUARD', shape: 'crescent' },
  2: { hull: '#3a2a52', trim: '#8a5ac8', glow: 0xff2ad8, name: 'LEGION', shape: 'manta' },
  3: { hull: '#16161c', trim: '#d4a83a', glow: 0xffc02a, name: 'INQUISITOR', shape: 'trident' },
  4: { hull: '#3a1418', trim: '#c83a3a', glow: 0xff3a3a, name: 'REAVER', shape: 'spike' },
  5: { hull: '#0e0c12', trim: '#5a1a2a', glow: 0xff1a3a, name: 'SHADOW', shape: 'shard' },
};

function styleMats(style) {
  const st = ENEMY_STYLES[style];
  return {
    hull: M('e_hull2' + style, () => { const t = panelTexture(10 + style, st.hull, '#101014'); return shipRim(new THREE.MeshPhysicalMaterial({ map: t, normalMap: panelNormal(t, 3), metalness: 0.72, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }), st.glow, 0.3); }),
    trim: M('e_trim2' + style, () => shipRim(new THREE.MeshPhysicalMaterial({ color: st.trim, metalness: 0.92, roughness: 0.22, clearcoat: 0.8 }), st.glow, 0.25)),
    glow: emissive(st.glow, 3.2),
    dark: M('e_dark' + style, () => new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.8, roughness: 0.5 })),
    st,
  };
}

export function buildEnemyFighter(style = 1) {
  const g = new THREE.Group();
  const m = styleMats(style);
  const shape = m.st.shape;
  const engines = [];
  if (shape === 'crescent') {
    const body = mesh(new THREE.SphereGeometry(1.6, 20, 14), m.hull, 0, 0, 0, g); body.scale.set(1, 0.7, 1.8);
    for (const s of [-1, 1]) {
      const w = mesh(extrude([[0, -1.2], [3.5, -2.8], [6.2, 0.4], [5.2, 3.6], [4.6, 0.8], [1.4, 0.6]].map(([x, y]) => [x * s, y]), 0.22, 0.08), m.trim, 0, 0, 0, g);
      if (s < 0) w.geometry.scale(1, 1, 1);
      mesh(new THREE.SphereGeometry(0.25, 8, 6), m.glow, s * 5.2, 0, 3.4, g);
    }
    mesh(new THREE.SphereGeometry(0.5, 12, 8), m.glow, 0, 0.2, 2.6, g).scale.set(1.4, 0.6, 0.6);
  } else if (shape === 'manta') {
    const body = mesh(extrude([[0, 4.5], [5.5, -1.5], [4.2, -3.2], [0, -2.4], [-4.2, -3.2], [-5.5, -1.5]], 0.5, 0.2), m.hull, 0, 0, 0, g);
    body.scale.y = 1;
    mesh(new THREE.SphereGeometry(1.2, 16, 10), m.trim, 0, 0.35, 0.6, g).scale.set(1, 0.5, 1.8);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, 0.08, 5), m.glow, s * 2.6, 0.3, 0.2, g).rotation.y = s * 0.85;
    mesh(new THREE.SphereGeometry(0.35, 10, 8), m.glow, 0, 0.5, 2.0, g);
  } else if (shape === 'trident') {
    mesh(lathe([[0, -3.5], [1.1, -2.8], [1.3, 0], [0.8, 2.4], [0, 3.2]], 16), m.hull, 0, 0, 0, g);
    for (const s of [-1, 0, 1]) {
      const p = mesh(new THREE.ConeGeometry(0.35, 4.5, 8).rotateX(Math.PI / 2), s === 0 ? m.trim : m.hull, s * 2.4, 0, 3.6 - Math.abs(s) * 0.8, g);
      if (s !== 0) mesh(new THREE.BoxGeometry(2.4, 0.3, 0.8), m.trim, s * 1.2, 0, 1.2, g);
      mesh(new THREE.SphereGeometry(0.22, 8, 6), m.glow, s * 2.4, 0, 5.6 - Math.abs(s) * 0.8, g);
      p.castShadow = true;
    }
    mesh(new THREE.TorusGeometry(1.35, 0.12, 8, 24), m.trim, 0, 0, -0.5, g);
  } else { // spike / shard
    const n = shape === 'shard' ? 7 : 5;
    mesh(new THREE.OctahedronGeometry(1.8, 0), m.hull, 0, 0, 0, g).scale.set(1, 0.6, 2.2);
    const r = new RNG(style * 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = mesh(new THREE.ConeGeometry(0.35, r.range(3, 5), 5), i % 2 ? m.trim : m.hull, Math.cos(a) * 1.4, Math.sin(a) * 0.8, -0.5, g);
      sp.rotation.set(Math.PI / 2 - 0.5, 0, 0); sp.lookAt(Math.cos(a) * 6, Math.sin(a) * 3, -3);
      sp.rotateX(Math.PI / 2);
    }
    mesh(new THREE.SphereGeometry(0.45, 10, 8), m.glow, 0, 0, 3.6, g);
    mesh(new THREE.TorusGeometry(1.4, 0.08, 6, 24), m.glow, 0, 0, -1.4, g);
  }
  // engine glow
  const fl = mesh(new THREE.ConeGeometry(0.6, 3.5, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.75), flameMaterial(m.st.glow), 0, 0, -3.2, g);
  engines.push(fl);
  mesh(new THREE.CircleGeometry(0.6, 16).rotateY(Math.PI), m.glow, 0, 0, -3.2, g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, engines, radius: 6, muzzle: new THREE.Vector3(0, 0, 4) };
}

export function buildEnemyCruiser(style = 1) {
  const g = new THREE.Group();
  const m = styleMats(style);
  const win = M('e_win' + style, () => new THREE.MeshStandardMaterial({ map: panelTexture(20 + style, m.st.hull, '#0a0a0e'), emissiveMap: windowsTexture(style, '#' + new THREE.Color(m.st.glow).getHexString(), 0.25), emissive: 0xffffff, emissiveIntensity: 1.6, metalness: 0.7, roughness: 0.4 }));
  // spine
  const spine = mesh(new RoundedBoxGeometry(9, 6, 70, 3, 1.5), win, 0, 0, 0, g);
  spine.material.map.repeat.set(2, 6);
  mesh(lathe([[0, -8], [6, -4], [7.5, 6], [5, 14], [0, 18]], 8), m.hull, 0, 0, 33, g).scale.set(1, 0.6, 1);
  // stacked hull plates
  for (let i = 0; i < 6; i++) {
    const z = -28 + i * 10;
    const p = mesh(new RoundedBoxGeometry(18 - i * 1.2, 2.4, 7, 2, 0.6), m.hull, 0, 3.4, z, g);
    mesh(new THREE.BoxGeometry(17 - i * 1.2, 0.25, 0.4), m.glow, 0, 4.7, z + 3, g);
    p.castShadow = true;
    const side = mesh(new RoundedBoxGeometry(3, 8, 6, 2, 0.6), m.trim, 0, -1, z, g);
    side.scale.x = 4.2 - i * 0.3;
  }
  // bridge tower
  mesh(new RoundedBoxGeometry(5, 7, 9, 2, 1), win, 0, 8, -18, g);
  mesh(new THREE.BoxGeometry(5.2, 0.6, 1.5), m.glow, 0, 10, -13.5, g);
  // engines
  const engines = [];
  for (const [x, y] of [[-5, -1], [5, -1], [0, 3]]) {
    mesh(new THREE.CylinderGeometry(2.4, 2.8, 8, 16).rotateX(Math.PI / 2), m.dark, x, y, -38, g);
    mesh(new THREE.CircleGeometry(2.2, 16).rotateY(Math.PI), m.glow, x, y, -42.1, g);
    engines.push(mesh(new THREE.ConeGeometry(2.0, 14, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -7), flameMaterial(m.st.glow), x, y, -42, g));
  }
  // turrets
  const turrets = [];
  for (const [x, y, z] of [[0, 5, 10], [0, 5, -6], [-7, 1, 18], [7, 1, 18], [0, -4.5, 4]]) {
    const t = new THREE.Group(); t.position.set(x, y, z); g.add(t);
    mesh(new THREE.SphereGeometry(1.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 0, 0, t);
    const barrel = new THREE.Group(); barrel.position.y = 0.8; t.add(barrel);
    for (const s of [-0.5, 0.5]) mesh(new THREE.CylinderGeometry(0.22, 0.22, 4, 8).rotateX(Math.PI / 2), m.dark, s, 0, 2, barrel);
    mesh(new THREE.SphereGeometry(0.3, 8, 6), m.glow, 0, 0.3, 0.8, barrel);
    if (y < 0) t.rotation.z = Math.PI;
    turrets.push({ base: t, barrel, cd: Math.random() * 2 });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, engines, turrets, radius: 40 };
}

// ------------------------------------------------------------------ colonizer ring ship (level 2)
export function buildColonizer(R = 2600, tube = 150) {
  const g = new THREE.Group();
  g.name = 'COLONIZER';
  const hullMat = M('col_hull', () => {
    const map = panelTexture(77, '#4a4258', '#1a1622', null, 1024); map.repeat.set(90, 3);
    const em = windowsTexture(78, '#ff6ae0', 0.18); em.repeat.set(120, 4);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 0.75, roughness: 0.42 });
  });
  const trim = M('col_trim', () => new THREE.MeshStandardMaterial({ color: 0x8a6ab8, metalness: 0.9, roughness: 0.25 }));
  const glow = emissive(0xff3ad8, 3.5);
  const glow2 = emissive(0x8a5aff, 3);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 28, 320), hullMat);
  g.add(ring);
  // light bands along both edges of the ring
  for (const y of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + tube * 0.15, 6, 6, 320), glow);
    band.position.z = y * tube * 0.96; g.add(band);
  }
  const outerBand = new THREE.Mesh(new THREE.TorusGeometry(R + tube * 0.98, 5, 6, 320), glow2); g.add(outerBand);
  // structures on the ring (instanced)
  const r = new RNG(99);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const N = 520;
  const inst = new THREE.InstancedMesh(boxGeo, trim, N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = r.range(0, Math.PI * 2);
    const side = r.pick([-1, 1]);
    const tilt = r.range(-0.9, 0.9);
    const rr = R + Math.cos(tilt) * tube;
    dummy.position.set(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(tilt) * tube * side);
    dummy.lookAt(Math.cos(a) * (R + 9999), Math.sin(a) * (R + 9999), dummy.position.z);
    dummy.scale.set(r.range(20, 70), r.range(20, 60), r.range(30, 140));
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  g.add(inst);
  // spokes & hub
  const hub = new THREE.Mesh(new THREE.SphereGeometry(tube * 1.8, 32, 20), hullMat); g.add(hub);
  const core = new THREE.Mesh(new THREE.SphereGeometry(tube * 0.9, 24, 16), emissive(0xff7af0, 5)); g.add(core);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(tube * 2.4, 8, 8, 64), glow); g.add(coreRing);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(tube * 0.22, tube * 0.3, R - tube, 12), hullMat);
    sp.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
    sp.rotation.z = a - Math.PI / 2;
    g.add(sp);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, R - tube * 2, 6), glow2);
    l.position.copy(sp.position); l.rotation.copy(sp.rotation); l.position.z = tube * 0.3; g.add(l);
  }
  // docking towers / antennas
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(10, 30, 420, 8), trim);
    t.position.set(Math.cos(a) * (R + tube + 180), Math.sin(a) * (R + tube + 180), 0);
    t.rotation.z = a - Math.PI / 2;
    g.add(t);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(16, 8, 6), glow); tip.position.set(Math.cos(a) * (R + tube + 400), Math.sin(a) * (R + tube + 400), 0); g.add(tip);
  }
  return { group: g, R, tube, core };
}

// ------------------------------------------------------------------ dreadnought (level 5 stationary ships)
export function buildDreadnought(scale = 1) {
  const g = new THREE.Group();
  const m = styleMats(5);
  const win = M('dn_win', () => new THREE.MeshStandardMaterial({ map: panelTexture(55, '#16131c', '#050407'), emissiveMap: windowsTexture(56, '#ff2a4a', 0.3), emissive: 0xffffff, emissiveIntensity: 2, metalness: 0.75, roughness: 0.35 }));
  win.map.repeat.set(4, 10); win.emissiveMap.repeat.set(6, 14);
  mesh(extrude([[0, 160], [70, -40], [55, -140], [0, -120], [-55, -140], [-70, -40]], 30, 6), win, 0, 0, 0, g);
  mesh(extrude([[0, 120], [44, -30], [30, -110], [-30, -110], [-44, -30]], 22, 4), m.hull, 0, 24, 0, g);
  mesh(new RoundedBoxGeometry(30, 34, 60, 3, 6), win, 0, 46, -60, g);
  for (let i = 0; i < 8; i++) mesh(new THREE.BoxGeometry(80 - i * 6, 1.5, 2), m.glow, 0, 14, 80 - i * 22, g);
  const engines = [];
  for (const x of [-36, 0, 36]) {
    mesh(new THREE.CylinderGeometry(12, 15, 30, 16).rotateX(Math.PI / 2), m.dark, x, 0, -140, g);
    mesh(new THREE.CircleGeometry(11, 16).rotateY(Math.PI), m.glow, x, 0, -155.5, g);
    engines.push(mesh(new THREE.ConeGeometry(10, 60, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -30), flameMaterial(0xff2a4a), x, 0, -155, g));
  }
  const core = mesh(new THREE.SphereGeometry(14, 16, 12), emissive(0xff2040, 5), 0, -8, 30, g);
  g.scale.setScalar(scale);
  return { group: g, engines, radius: 160 * scale, core };
}

// ------------------------------------------------------------------ station / base (level 5)
export function buildStation(seed = 1, scale = 1) {
  const g = new THREE.Group();
  const m = styleMats(5);
  const r = new RNG(seed);
  const ringMat = M('st_ring', () => new THREE.MeshStandardMaterial({ map: panelTexture(60, '#221c28', '#08060a'), emissiveMap: windowsTexture(61, '#ff4a6a', 0.22), emissive: 0xffffff, emissiveIntensity: 1.6, metalness: 0.7, roughness: 0.4 }));
  const ring = mesh(new THREE.TorusGeometry(120, 16, 14, 64), ringMat, 0, 0, 0, g);
  ring.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(20, 30, 260, 12), m.hull, 0, 0, 0, g);
  mesh(new THREE.SphereGeometry(40, 20, 14), ringMat, 0, 0, 0, g);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sp = mesh(new THREE.CylinderGeometry(5, 5, 120, 6), m.trim, Math.cos(a) * 60, 0, Math.sin(a) * 60, g);
    sp.rotation.z = Math.PI / 2; sp.rotation.y = -a;
  }
  for (let i = 0; i < 10; i++) {
    const a = r.range(0, Math.PI * 2);
    const sp = mesh(new THREE.ConeGeometry(6, r.range(40, 90), 6), m.hull, Math.cos(a) * 120, r.range(-10, 10), Math.sin(a) * 120, g);
    sp.lookAt(Math.cos(a) * 400, sp.position.y + r.range(-100, 100), Math.sin(a) * 400); sp.rotateX(Math.PI / 2);
  }
  mesh(new THREE.TorusGeometry(140, 2.5, 6, 64), m.glow, 0, 0, 0, g).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(10, 10, 8), m.glow, 0, 135, 0, g);
  mesh(new THREE.SphereGeometry(10, 10, 8), m.glow, 0, -135, 0, g);
  g.scale.setScalar(scale);
  return { group: g, radius: 150 * scale };
}

// homing rocket model
export function buildRocket(color = 0xff7a2a) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8).rotateX(Math.PI / 2), M('rk_body', () => new THREE.MeshStandardMaterial({ color: 0xdadfe6, metalness: 0.5, roughness: 0.3 })), 0, 0, 0, g);
  mesh(new THREE.ConeGeometry(0.18, 0.5, 8).rotateX(Math.PI / 2), emissive(color, 2.5), 0, 0, 1.05, g);
  mesh(new THREE.SphereGeometry(0.3, 8, 6), emissive(0xffd0a0, 5), 0, 0, -0.9, g);
  return g;
}

// enemy plasma bolt
export function buildBolt(color = 0xff3a2a, len = 3, width = 0.25) {
  const g = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(width, len, 4, 8).rotateX(Math.PI / 2);
  const m1 = new THREE.Mesh(geo, emissive(color, 4)); g.add(m1);
  const m2 = new THREE.Mesh(new THREE.CapsuleGeometry(width * 0.45, len * 0.9, 4, 6).rotateX(Math.PI / 2), emissive(0xffffff, 4)); g.add(m2);
  return g;
}

export { emissive, M as cachedMaterial, lathe, extrude };
