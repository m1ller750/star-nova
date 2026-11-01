// Procedural characters with a joint rig and code-driven animation. Characters face +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { detailTexture, damp, clamp, RNG, Simplex, canvasTexture } from '../core/util.js';
import { emissive, cachedMaterial as MC } from './models-ships.js';

const geoCache = {};
function G(key, make) { if (!geoCache[key]) { geoCache[key] = make(); geoCache[key].userData.shared = true; } return geoCache[key]; }
const RB = (w, h, d, r = 0.04, s = 2) => G(`rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, s, r));
const CAP = (r, l) => G(`cap${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12));
const SPH = (r, w = 16, h = 12) => G(`sph${r}_${w}`, () => new THREE.SphereGeometry(r, w, h));
const CYL = (a, b, h, s = 12) => G(`cyl${a}_${b}_${h}_${s}`, () => new THREE.CylinderGeometry(a, b, h, s));

function part(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = false;
  parent.add(m);
  return m;
}
function J(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// ------------------------------------------------------------------ rig
export class Rig {
  constructor(p = {}) {
    const P = this.p = Object.assign({ thigh: 0.45, shin: 0.44, foot: 0.08, ua: 0.3, fa: 0.28, sw: 0.24, hw: 0.11, spine: 0.1, chest: 0.24, neck: 0.27, scale: 1 }, p);
    this.root = new THREE.Group();
    this.body = J(this.root);
    const legLen = P.thigh + P.shin + P.foot;
    this.hipY = legLen;
    const j = this.j = {};
    j.hips = J(this.body, 0, legLen, 0);
    j.spine = J(j.hips, 0, P.spine, 0);
    j.chest = J(j.spine, 0, P.chest, 0);
    j.neck = J(j.chest, 0, P.neck, 0);
    j.head = J(j.neck, 0, 0.08, 0);
    for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
      j['sh' + n] = J(j.chest, s * P.sw, 0.2, 0);
      j['ua' + n] = J(j['sh' + n]);
      j['el' + n] = J(j['ua' + n], 0, -P.ua, 0);
      j['ha' + n] = J(j['el' + n], 0, -P.fa, 0);
      j['th' + n] = J(j.hips, s * P.hw, -0.04, 0);
      j['kn' + n] = J(j['th' + n], 0, -P.thigh, 0);
      j['ft' + n] = J(j['kn' + n], 0, -P.shin, 0);
    }
    this.root.scale.setScalar(P.scale);
    this.st = { phase: 0, t: 0 };
    this.cur = {};
    this.attach = {};
  }
  headWorld(v) { return this.j.head.getWorldPosition(v); }
  chestWorld(v) { return this.j.chest.getWorldPosition(v); }
}

// target pose helper
function T(o, name, x = 0, y = 0, z = 0) { o[name] = [x, y, z]; }

const ATTACKS = {
  jab: (t, o) => { const k = Math.sin(Math.min(1, t * 1.4) * Math.PI); T(o, 'uaL', -0.5 - 1.1 * k, 0, 0.25 - 0.2 * k); T(o, 'elL', -1.9 + 1.7 * k); T(o, 'chest', 0, -0.35 * k, 0); },
  cross: (t, o) => { const k = Math.sin(Math.min(1, t * 1.3) * Math.PI); T(o, 'uaR', -0.5 - 1.1 * k, 0, -0.25 + 0.2 * k); T(o, 'elR', -1.9 + 1.7 * k); T(o, 'chest', 0, 0.55 * k, 0); T(o, 'spine', 0.1 * k, 0.2 * k, 0); },
  hook: (t, o) => { const k = Math.sin(Math.min(1, t * 1.3) * Math.PI); T(o, 'uaL', -1.2 * k - 0.4, 0, 0.3 + 1.0 * k); T(o, 'elL', -1.6); T(o, 'chest', 0, -0.9 * k + 0.3, 0); },
  upper: (t, o) => { const k = Math.sin(Math.min(1, t * 1.25) * Math.PI); T(o, 'uaR', 0.4 - 2.4 * k, 0, -0.2); T(o, 'elR', -1.8 + 0.6 * k); T(o, 'spine', 0.25 - 0.45 * k, 0.3 * k, 0); T(o, 'hips', 0, 0, 0); o._dip = 0.12 * (1 - k); },
  kick: (t, o) => { const k = Math.sin(Math.min(1, t * 1.2) * Math.PI); T(o, 'thR', -1.7 * k, 0, 0); T(o, 'knR', 1.6 - 1.5 * k); T(o, 'spine', 0.3 * k, 0, 0); T(o, 'uaL', -0.5, 0, 0.3); T(o, 'elL', -2.0); T(o, 'uaR', -0.3, 0, -0.4); T(o, 'elR', -1.8); },
  round: (t, o) => { const k = Math.sin(Math.min(1, t * 1.15) * Math.PI); T(o, 'thL', -0.6 * k, 0, 1.4 * k); T(o, 'knL', 0.4); T(o, 'body', 0, -2.4 * t, -0.2 * k); T(o, 'uaR', -0.4, 0, -0.9); T(o, 'uaL', -0.4, 0, 0.6); },
  slash: (t, o) => { const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7; const sw = t < 0.3 ? -1 : -1 + 2.4 * Math.min(1, (t - 0.3) / 0.3); T(o, 'uaR', -1.3, 0, -1.0 * k - 0.2); T(o, 'elR', -0.4); T(o, 'chest', 0, sw * 0.9, 0); T(o, 'spine', 0.15, sw * 0.3, 0); T(o, 'uaL', -0.4, 0, 0.5); T(o, 'elL', -1.2); },
  slash2: (t, o) => { const sw = t < 0.3 ? 1 : 1 - 2.4 * Math.min(1, (t - 0.3) / 0.3); T(o, 'uaR', -1.4, 0, -0.5); T(o, 'elR', -0.3); T(o, 'chest', 0, sw * 0.9, 0); T(o, 'spine', 0.1, sw * 0.3, 0); },
  overhead: (t, o) => { const a = t < 0.35 ? -2.9 * (t / 0.35) : -2.9 + 2.4 * Math.min(1, (t - 0.35) / 0.25); T(o, 'uaR', a, 0, -0.2); T(o, 'elR', -0.3); T(o, 'uaL', a * 0.9, 0, 0.35); T(o, 'elL', -0.4); T(o, 'spine', t < 0.35 ? -0.15 : 0.35, 0, 0); },
  stab: (t, o) => { const k = Math.sin(Math.min(1, t * 1.5) * Math.PI); T(o, 'uaR', -0.4 - 1.0 * k, 0, -0.1); T(o, 'elR', -1.2 + 1.0 * k); T(o, 'chest', 0, 0.3 * k, 0); },
  takedown: (t, o) => { const k = Math.min(1, t * 2); T(o, 'uaR', -1.2 - 0.6 * k, 0, -0.2); T(o, 'elR', -1.5 + 1.2 * k); T(o, 'uaL', -1.3, 0, 0.6); T(o, 'elL', -1.4); T(o, 'spine', 0.35, 0, 0); },
  slam: (t, o) => { const a = t < 0.4 ? -2.9 * (t / 0.4) : -2.9 + 3.2 * Math.min(1, (t - 0.4) / 0.2); T(o, 'uaR', a, 0, -0.3); T(o, 'uaL', a, 0, 0.3); T(o, 'elR', -0.2); T(o, 'elL', -0.2); T(o, 'spine', t < 0.4 ? -0.2 : 0.6, 0, 0); o._dip = t > 0.5 ? 0.25 : 0; },
  axe: (t, o) => { const a = t < 0.6 ? -3.0 * Math.min(1, t / 0.4) : -3.0 + 2.6 * Math.min(1, (t - 0.6) / 0.12); T(o, 'uaR', a, 0, -0.15); T(o, 'uaL', a, 0, 0.15); T(o, 'elR', -0.25); T(o, 'elL', -0.25); T(o, 'spine', t < 0.6 ? -0.2 : 0.5, 0, 0); },
  throw: (t, o) => { const a = t < 0.4 ? -2.6 * (t / 0.4) : -2.6 + 2.2 * Math.min(1, (t - 0.4) / 0.2); T(o, 'uaR', a, 0, -0.3); T(o, 'elR', -0.5); },
  give: (t, o) => { const k = Math.min(1, t * 2); T(o, 'uaR', -1.0 * k, 0, -0.1); T(o, 'elR', -0.5); T(o, 'uaL', -1.0 * k, 0, 0.1); T(o, 'elL', -0.5); },
};

// main animation driver. s = state object (see GroundMode / NPC code)
export function animateRig(rig, s, dt) {
  const o = {};
  const st = rig.st; st.t += dt;
  const legs = ['thL', 'thR', 'knL', 'knR'];
  const P = rig.p;
  let hipY = rig.hipY; let bodyX = 0, bodyY = 0, bodyZ = 0, bodyH = 0;
  // defaults
  T(o, 'uaL', 0.05, 0, 0.12); T(o, 'uaR', 0.05, 0, -0.12); T(o, 'elL', -0.18); T(o, 'elR', -0.18);
  T(o, 'spine'); T(o, 'chest'); T(o, 'neck'); T(o, 'head'); T(o, 'hips');
  for (const l of legs) T(o, l);
  T(o, 'ftL'); T(o, 'ftR');
  const breathe = Math.sin(st.t * 1.8) * 0.02;
  o.chest[0] = -breathe;

  const mv = s.move || 0;
  if (s.dead > 0) {
    const k = clamp(s.dead, 0, 1); const e = 1 - Math.pow(1 - k, 3);
    bodyX = (s.deadDir || -1) * 1.5 * e; bodyH = -hipY * 0.72 * e;
    T(o, 'uaL', -0.6 * e, 0, 0.9 * e); T(o, 'uaR', -0.4 * e, 0, -1.1 * e); T(o, 'thL', 0.25 * e); T(o, 'knL', 0.5 * e); T(o, 'thR', -0.3 * e); T(o, 'knR', 0.2 * e); T(o, 'neck', 0.3 * e);
  } else if (s.kneel > 0) {
    const k = s.kneel;
    hipY -= (P.shin + P.foot - 0.06) * k;
    T(o, 'thL', 0.05 * k); T(o, 'thR', 0.05 * k); T(o, 'knL', 1.55 * k); T(o, 'knR', 1.55 * k); T(o, 'ftL', 0.5 * k); T(o, 'ftR', 0.5 * k);
    T(o, 'uaL', 0.55 * k, 0, 0.18); T(o, 'uaR', 0.55 * k, 0, -0.18); T(o, 'elL', -1.25 * k); T(o, 'elR', -1.25 * k);
    T(o, 'neck', 0.35 * k + Math.sin(st.t * 1.3) * 0.04); T(o, 'spine', 0.15 * k);
  } else if (s.fly > 0 && !s.grounded) {
    const b = s.boost || 0; const f = s.fly;
    const fwd = clamp(s.flyFwd ?? mv, 0, 1);
    bodyX = f * (0.25 + fwd * 0.75) * (1.0 + b * 0.35);
    T(o, 'uaR', -0.3 - 2.6 * b * fwd, 0, -0.2); T(o, 'elR', -0.15);
    T(o, 'uaL', 0.25 - 0.2 * b, 0, 0.18); T(o, 'elL', -0.25);
    const sway = Math.sin(st.t * 3) * 0.05;
    T(o, 'thL', 0.1 + sway); T(o, 'thR', 0.05 - sway); T(o, 'knL', 0.25 - b * 0.15); T(o, 'knR', 0.45 - b * 0.3);
    T(o, 'neck', -bodyX * 0.6); T(o, 'head', -0.1);
  } else if (!s.grounded && !s.beam) {
    T(o, 'thL', -0.7); T(o, 'thR', -0.2); T(o, 'knL', 1.0); T(o, 'knR', 0.6); T(o, 'uaL', -0.4, 0, 0.6); T(o, 'uaR', -0.3, 0, -0.6);
  } else if (mv > 0.05) {
    const run = s.run ? 1 : 0;
    const dir = s.back ? -1 : 1;
    st.phase += dt * (6.5 + run * 4.5) * Math.min(1.3, mv * 1.2) * dir * (s.animSpeed || 1);
    const p = st.phase; const A = (0.45 + run * 0.42) * Math.min(1, mv * 1.3);
    T(o, 'thL', -Math.sin(p) * A); T(o, 'thR', Math.sin(p) * A);
    T(o, 'knL', (0.65 + run * 0.8) * Math.max(0, Math.cos(p)) * Math.min(1, mv * 1.5) + 0.08); T(o, 'knR', (0.65 + run * 0.8) * Math.max(0, -Math.cos(p)) * Math.min(1, mv * 1.5) + 0.08);
    T(o, 'uaL', Math.sin(p) * A * 0.85, 0, 0.12); T(o, 'uaR', -Math.sin(p) * A * 0.85, 0, -0.12);
    T(o, 'elL', -0.3 - run * 0.9); T(o, 'elR', -0.3 - run * 0.9);
    hipY += Math.abs(Math.sin(p)) * (0.03 + run * 0.04) - run * 0.04;
    o.spine[0] = 0.06 + run * 0.18; o.spine[1] = Math.sin(p) * 0.08;
    o.hips[1] = -Math.sin(p) * 0.1;
    if (s.panic) { T(o, 'uaL', -2.4 + Math.sin(p * 2) * 0.4, 0, 0.5); T(o, 'uaR', -2.4 - Math.sin(p * 2) * 0.4, 0, -0.5); T(o, 'elL', -0.8); T(o, 'elR', -0.8); }
  }
  if (s.crouch && s.grounded && !(s.dead > 0)) {
    hipY -= 0.28;
    o.thL[0] -= 0.75; o.thR[0] -= 0.75; o.knL[0] += 1.35; o.knR[0] += 1.35; o.spine[0] += 0.35;
  }
  // upper body by weapon/stance
  if (!(s.dead > 0) && !(s.kneel > 0)) {
    const w = s.weapon;
    const aim = s.aim || 0;
    if (w === 'rifle' || w === 'sniper' || w === 'plasma' || w === 'scatter') {
      const ap = s.aimPitch || 0;
      const ux = -0.55 - 0.85 * aim - ap * aim * 0.9;
      T(o, 'uaR', ux, 0, -0.18 + 0.05 * aim); T(o, 'elR', -0.95 + 0.6 * aim);
      T(o, 'uaL', ux + 0.05, 0, 0.62); T(o, 'elL', -1.05 + 0.45 * aim);
      if (s.fly > 0 && !s.grounded) { o.uaR[0] -= 0.4; o.uaL[0] -= 0.4; }
      o.chest[1] = 0.25 * aim; o.neck[1] = -0.2 * aim;
      if (s.recoil) { o.uaR[0] -= s.recoil * 0.25; o.uaL[0] -= s.recoil * 0.25; }
    } else if (w === 'heavy') {
      T(o, 'uaR', -0.9, 0, -0.35); T(o, 'elR', -0.6); T(o, 'uaL', -0.95, 0, 0.5); T(o, 'elL', -1.0);
    } else if (w === 'fists' && s.guard) {
      T(o, 'uaL', -0.55, 0, 0.3); T(o, 'uaR', -0.5, 0, -0.3); T(o, 'elL', -2.0); T(o, 'elR', -2.05);
    } else if (w === 'sword' && s.guard) {
      T(o, 'uaR', -0.6, 0, -0.25); T(o, 'elR', -0.8);
    } else if (w === 'axe') {
      T(o, 'uaR', -0.35, 0, -0.2); T(o, 'elR', -0.5); T(o, 'uaL', -0.35, 0, 0.2); T(o, 'elL', -0.6);
    } else if (w === 'blade' && s.guard) {
      T(o, 'uaR', -0.7, 0, -0.4); T(o, 'elR', -0.9); T(o, 'uaL', -0.7, 0, 0.4); T(o, 'elL', -0.9);
    }
    if (s.handsUp > 0) { const k = s.handsUp; T(o, 'uaL', -2.7 * k, 0, 0.3); T(o, 'uaR', -2.7 * k, 0, -0.3); T(o, 'elL', -0.5 * k); T(o, 'elR', -0.5 * k); }
    if (s.cheer > 0) { const w2 = Math.sin(st.t * 9); T(o, 'uaL', -2.8 + w2 * 0.25, 0, 0.35 + w2 * 0.15); T(o, 'uaR', -2.8 - w2 * 0.25, 0, -0.35 + w2 * 0.15); T(o, 'elL', -0.4); T(o, 'elR', -0.4); hipY += Math.max(0, Math.sin(st.t * 6)) * 0.06; }
    if (s.talk > 0) { T(o, 'uaR', -0.35 + Math.sin(st.t * 3.1) * 0.25, 0, -0.25); T(o, 'elR', -1.0 + Math.sin(st.t * 2.3) * 0.3); T(o, 'uaL', -0.2 + Math.sin(st.t * 2.2 + 1) * 0.15, 0, 0.25); T(o, 'elL', -0.8); o.neck[1] = Math.sin(st.t * 0.9) * 0.15; }
    if (s.wave > 0) { T(o, 'uaR', -2.6, 0, -0.5 + Math.sin(st.t * 10) * 0.3); T(o, 'elR', -0.4); }
    if (s.beam) { T(o, 'uaL', -0.3, 0, 0.7); T(o, 'uaR', -0.3, 0, -0.7); T(o, 'thL', 0.1); T(o, 'thR', -0.05); T(o, 'knL', 0.3); T(o, 'knR', 0.4); }
    if (s.attack && ATTACKS[s.attack.kind]) {
      ATTACKS[s.attack.kind](clamp(s.attack.t, 0, 1), o);
      if (o._dip) hipY -= o._dip;
      if (o.body) { bodyY = o.body[1]; bodyZ = o.body[2]; }
    }
    if (s.landPose > 0) { const k = s.landPose; hipY -= 0.5 * k; o.thL[0] = -1.5 * k; o.knL[0] = 1.9 * k; o.thR[0] = 0.4 * k; o.knR[0] = 2.2 * k; o.uaR[0] = 0.3 * k; o.uaR[2] = -0.35; o.elR[0] = -0.1; o.spine[0] = 0.55 * k; o.uaL[0] = -0.6 * k; o.uaL[2] = 0.9 * k; }
    if (s.hurt > 0) { o.spine[0] -= 0.3 * s.hurt; o.neck[0] -= 0.2 * s.hurt; }
    if (s.lookPitch) { o.neck[0] += -s.lookPitch * 0.5; o.head[0] += -s.lookPitch * 0.3; }
    if (s.lookYaw) { o.neck[1] += s.lookYaw * 0.5; }
  }
  // apply with smoothing
  const k = 1 - Math.exp(-dt * (s.snap || 16));
  const j = rig.j;
  for (const name in o) {
    if (name[0] === '_' || name === 'body') continue;
    const jt = j[name]; if (!jt) continue;
    const v = o[name];
    jt.rotation.x += (v[0] - jt.rotation.x) * k;
    jt.rotation.y += (v[1] - jt.rotation.y) * k;
    jt.rotation.z += (v[2] - jt.rotation.z) * k;
  }
  j.hips.position.y = damp(j.hips.position.y, hipY, 18, dt);
  rig.body.rotation.x = damp(rig.body.rotation.x, bodyX, s.dead > 0 ? 6 : 8, dt);
  rig.body.rotation.y = damp(rig.body.rotation.y, bodyY, 14, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, bodyZ, 10, dt);
  rig.body.position.y = damp(rig.body.position.y, bodyH, 8, dt);
}

// ------------------------------------------------------------------ materials
function mats(key, make) { return MC('ch_' + key, make); }

// fresnel rim light: characters read clearly against any background
export function rim(mat, color = 0x9fdcff, strength = 0.5, power = 2.4) {
  const c = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = { value: c };
    sh.uniforms.uRimPow = { value: power };
    sh.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimPow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uRimColor * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow);');
  };
  mat.customProgramCacheKey = () => 'rim_' + c.getHexString() + '_' + power;
  return mat;
}

const texC = {};
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
function weave() {
  if (texC.weave) return texC.weave;
  const t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#80868e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      const o = ((x + y) / 8) % 2;
      g.fillStyle = o ? '#949aa2' : '#6c7178'; g.fillRect(x, y, 8, 4);
      g.fillStyle = o ? '#666b72' : '#8e949c'; g.fillRect(x, y + 4, 8, 4);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.anisotropy = 4;
  return (texC.weave = t);
}
function skinTex(key, base, spot, vein) {
  if (texC[key]) return texC[key];
  const n = new Simplex(key.length * 977 + base);
  const a = rgb(base), b = rgb(spot);
  const t = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x / w) * 6.2832, v = (y / h) * 6.2832;
      const k1 = n.noise3(Math.cos(u) * 1.4, Math.sin(u) * 1.4, Math.sin(v) * 1.4 + Math.cos(v) * 0.6) * 0.5 + 0.5;
      const k2 = n.noise3(Math.cos(u) * 5, Math.sin(u) * 5, v * 0.8) * 0.5 + 0.5;
      const k = clamp(k1 * 0.75 + k2 * 0.35 - 0.05, 0, 1);
      const i = (y * w + x) * 4;
      img.data[i] = a[0] + (b[0] - a[0]) * k; img.data[i + 1] = a[1] + (b[1] - a[1]) * k; img.data[i + 2] = a[2] + (b[2] - a[2]) * k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (vein) {
      const r = new RNG(base & 255);
      g.strokeStyle = vein; g.globalAlpha = 0.4; g.lineWidth = 1.3;
      for (let i = 0; i < 30; i++) { g.beginPath(); let x = r.next() * w, y = r.next() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += r.range(-12, 12); y += r.range(5, 16); g.lineTo(x, y); } g.stroke(); }
      g.globalAlpha = 1;
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return (texC[key] = t);
}
function clothTex(key, c1, c2, trimC) {
  if (texC[key]) return texC[key];
  const t = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.fillStyle = c2; for (let x = 0; x < w; x += 16) g.fillRect(x + 6, 0, 4, h);
    g.fillStyle = trimC; g.fillRect(0, h - 26, w, 10); g.fillRect(0, 30, w, 6);
    g.globalAlpha = 0.12; g.fillStyle = '#000'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return (texC[key] = t);
}

// ------------------------------------------------------------------ smooth geometry helpers
const LATHE = (key, pts, segs = 24) => G('L_' + key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0006, r), y)), segs));
function LIMB(r0, r1, len, bulge = 0.25, segs = 16) {
  return G(`limb${r0}_${r1}_${len}_${bulge}`, () => {
    const pts = [new THREE.Vector2(0.0006, -len - r1 * 0.55)];
    for (let i = 10; i >= 0; i--) {
      const t = i / 10;
      let r = r0 + (r1 - r0) * t + Math.sin(Math.pow(t, 0.75) * Math.PI) * bulge * (r0 + r1) * 0.5;
      if (i === 10) r *= 0.86; if (i === 0) r *= 0.92;
      pts.push(new THREE.Vector2(r, -t * len));
    }
    pts.push(new THREE.Vector2(0.0006, r0 * 0.55));
    return new THREE.LatheGeometry(pts, segs);
  });
}
// partial sphere (armor shells). phi centre: front = PI/2, back = 3PI/2, left(+X) = PI, right(-X) = 0
const SHELL = (r, phiC, phiLen, th0, thLen) => G(`sh${r}_${phiC.toFixed(3)}_${phiLen.toFixed(3)}_${th0}_${thLen}`, () => new THREE.SphereGeometry(r, 30, 18, phiC - phiLen / 2, phiLen, th0, thLen));
// partial open cylinder (wrap-around plates). theta centre: front = 0, left(+X) = PI/2, back = PI
const ARC = (r0, r1, h, thC, thLen) => G(`arc${r0}_${r1}_${h}_${thC.toFixed(3)}_${thLen}`, () => new THREE.CylinderGeometry(r0, r1, h, 26, 1, true, thC - thLen / 2, thLen));
const TOR = (r, t, arc = Math.PI * 2) => G(`tor${r}_${t}_${arc.toFixed(3)}`, () => new THREE.TorusGeometry(r, t, 8, 32, arc));
const PI = Math.PI;

// ------------------------------------------------------------------ NOVA (hero) — and the dark Nova boss
export function buildHero(opts = {}) {
  const dark = !!opts.dark;
  const scale = opts.scale || 1;
  const rig = new Rig({ scale, sw: dark ? 0.27 : 0.235 });
  const j = rig.j;
  const K = dark ? 'b2_' : 'h2_';
  const glowC = dark ? 0xff1a3a : 0x4ef2ff;
  const plate = mats(K + 'plate', () => rim(new THREE.MeshPhysicalMaterial({ color: dark ? 0x1b1520 : 0xd9dfe7, metalness: dark ? 0.85 : 0.32, roughness: dark ? 0.26 : 0.18, clearcoat: 1, clearcoatRoughness: dark ? 0.18 : 0.05, side: THREE.DoubleSide }), dark ? 0xff3050 : 0xa8eaff, dark ? 0.3 : 0.12, 3.2));
  const trim = mats(K + 'trim', () => rim(new THREE.MeshPhysicalMaterial({ color: dark ? 0x320a12 : 0x1c232c, metalness: 0.92, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }), glowC, 0.16, 3.2));
  const suit = mats(K + 'suit', () => rim(new THREE.MeshStandardMaterial({ color: dark ? 0x0b090d : 0x2a3038, map: weave(), roughness: 0.62, metalness: 0.35 }), glowC, 0.1, 2.8));
  const gold = mats(K + 'gold', () => new THREE.MeshStandardMaterial({ color: dark ? 0x6a0c18 : 0xd9b56c, metalness: 1, roughness: 0.22 }));
  const glass = mats('h2_glass', () => new THREE.MeshPhysicalMaterial({ color: 0x03060a, metalness: 0.3, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, side: THREE.DoubleSide }));
  const glow = emissive(glowC, 3.4);
  const B = dark ? 1.22 : 1; // muscle bulk
  // pelvis & belt
  part(LATHE('pelvis', [[0.1, -0.13], [0.14, -0.07], [0.152, 0.0], [0.135, 0.08]]), suit, j.hips, 0, 0, 0, 0, 0, 0, 1.18 * B, 1, 0.84 * B);
  part(TOR(0.15, 0.024), trim, j.hips, 0, 0.06, 0, PI / 2, 0, 0, 1.18 * B, 0.84 * B, 1);
  part(RB(0.07, 0.05, 0.03, 0.01), gold, j.hips, 0, 0.06, 0.125 * B);
  part(CYL(0.018, 0.018, 0.02, 12), glow, j.hips, 0, 0.06, 0.142 * B, PI / 2);
  part(SHELL(0.1, PI / 2, 1.4, 1.2, 1.1), trim, j.hips, 0, 0.0, 0.035, 0, 0, 0, 1, 1.2, 1.1);
  // abdomen with armored segments
  part(LATHE('abd', [[0.122, -0.03], [0.118, 0.06], [0.13, 0.16], [0.152, 0.27]]), suit, j.spine, 0, 0, 0, 0, 0, 0, 1.2 * B, 1, 0.8 * B);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) part(RB(0.082, 0.052, 0.036, 0.014), trim, j.spine, s * 0.046 * B, 0.04 + i * 0.066, 0.106 * B, -0.08);
  for (const s of [-1, 1]) part(ARC(0.15, 0.142, 0.16, s * 1.25, 0.9), plate, j.spine, 0, 0.12, 0, 0, 0, 0, 1.22 * B, 1, 0.84 * B);
  // chest: sculpted torso + curved plates
  part(LATHE('chest', [[0.15, -0.06], [0.186, 0.04], [0.206, 0.14], [0.2, 0.22], [0.165, 0.28], [0.075, 0.31]]), suit, j.chest, 0, 0, 0, 0, 0, 0, 1.26 * B, 1, 0.75 * B);
  part(SHELL(0.216, PI / 2, 2.3, 0.6, 1.05), plate, j.chest, 0, 0.1, 0, 0, 0, 0, 1.28 * B, 1.12, 0.82 * B);
  part(SHELL(0.216, 1.5 * PI, 2.2, 0.55, 1.15), plate, j.chest, 0, 0.1, 0, 0, 0, 0, 1.28 * B, 1.12, 0.82 * B);
  part(RB(0.022, 0.2, 0.03, 0.008), trim, j.chest, 0, 0.16, 0.178 * B);
  part(CYL(0.052, 0.052, 0.03, 20), trim, j.chest, 0, 0.12, 0.172 * B, PI / 2);
  const core = part(CYL(0.036, 0.036, 0.034, 20), glow, j.chest, 0, 0.12, 0.178 * B, PI / 2);
  core.userData.core = true;
  for (const s of [-1, 1]) {
    part(G('chglow', () => new THREE.BoxGeometry(0.15, 0.008, 0.008)), glow, j.chest, s * 0.1 * B, 0.235, 0.15 * B, 0, s * -0.55, s * -0.35);
    part(G('chglow2', () => new THREE.BoxGeometry(0.008, 0.11, 0.008)), glow, j.chest, s * 0.215 * B, 0.12, 0.07 * B);
  }
  part(TOR(0.088, 0.026), trim, j.chest, 0, 0.29, 0, PI / 2 - 0.15, 0, 0, 1.1, 0.9, 1);
  // jet pack
  part(RB(0.27 * B, 0.3, 0.1, 0.03), trim, j.chest, 0, 0.12, -0.205 * B);
  for (const s of [-1, 1]) {
    part(LATHE('nozzle', [[0.048, -0.19], [0.066, -0.15], [0.062, 0.0], [0.046, 0.09]], 18), plate, j.chest, s * 0.095, 0.1, -0.265 * B);
    part(TOR(0.05, 0.008), glow, j.chest, s * 0.095, -0.085, -0.265 * B, PI / 2);
    const n = part(CYL(0.044, 0.044, 0.012, 16), glow, j.chest, s * 0.095, -0.095, -0.265 * B);
    n.userData.thruster = true;
  }
  const pods = new THREE.Group(); j.chest.add(pods); pods.position.set(0, 0.29, -0.21 * B);
  for (const s of [-1, 1]) { part(RB(0.1, 0.12, 0.2, 0.025), trim, pods, s * 0.17, 0, 0); for (let i = 0; i < 2; i++) part(SPH(0.02, 8, 6), emissive(0xff6a2a, 3), pods, s * 0.17 + (i - 0.5) * 0.045, 0.0, 0.1); }
  pods.visible = !!opts.pods;
  rig.attach.pods = pods;
  // neck & head
  part(CYL(0.062, 0.072, 0.11, 14), suit, j.neck, 0, 0.0, 0);
  if (!dark) {
    part(LATHE('helm', [[0.0006, -0.02], [0.078, 0.0], [0.12, 0.05], [0.132, 0.12], [0.124, 0.19], [0.09, 0.24], [0.04, 0.266], [0.0006, 0.272]], 28), plate, j.head, 0, 0, 0, 0, 0, 0, 1, 1, 1.13);
    part(SHELL(0.138, PI / 2, 2.1, 1.12, 1.02), glass, j.head, 0, 0.12, 0.008, 0, 0, 0, 1, 1, 1.13);
    for (const s of [-1, 1]) part(G('visorV', () => new THREE.BoxGeometry(0.09, 0.014, 0.012)), glow, j.head, s * 0.04, 0.128, 0.152, 0, -s * 0.42, s * 0.3);
    part(G('chinplate', () => new THREE.BoxGeometry(0.07, 0.012, 0.012)), glow, j.head, 0, 0.035, 0.15);
    part(RB(0.022, 0.05, 0.22, 0.008), trim, j.head, 0, 0.262, -0.02);
    part(G('crest', () => new THREE.BoxGeometry(0.01, 0.012, 0.2)), glow, j.head, 0, 0.29, -0.02);
    for (const s of [-1, 1]) { part(CYL(0.046, 0.046, 0.045, 16), trim, j.head, s * 0.134, 0.12, -0.005, 0, 0, PI / 2); part(TOR(0.03, 0.006), glow, j.head, s * 0.158, 0.12, -0.005, 0, PI / 2, 0); part(G('fin', () => new THREE.BoxGeometry(0.012, 0.03, 0.11)), plate, j.head, s * 0.14, 0.17, -0.06, 0.4, 0, 0); }
  } else {
    const skin = mats('b2_skin', () => rim(new THREE.MeshPhysicalMaterial({ color: 0x8c8a94, map: skinTex('bossskin', 0x9a98a2, 0x6a6672, '#3a0010'), roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xff6070) }), 0xff2040, 0.35, 2.5));
    part(LATHE('bhead', [[0.0006, -0.04], [0.06, -0.03], [0.1, 0.03], [0.118, 0.11], [0.112, 0.19], [0.08, 0.245], [0.0006, 0.26]], 26), skin, j.head, 0, 0, 0.01, 0, 0, 0, 0.95, 1, 1.08);
    part(RB(0.15, 0.07, 0.11, 0.03), skin, j.head, 0, 0.0, 0.055);
    const eyeM = mats('b2_eye', () => new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0.4, roughness: 0.01, clearcoat: 1 }));
    for (const s of [-1, 1]) {
      part(SPH(0.027, 14, 10), eyeM, j.head, s * 0.044, 0.125, 0.104, 0, 0, s * 0.2, 1.3, 0.8, 0.65);
      part(G('vein', () => new THREE.BoxGeometry(0.004, 0.07, 0.004)), emissive(0x8a0010, 2.2), j.head, s * 0.07, 0.07, 0.1, 0, 0, s * 0.45);
      part(G('vein2', () => new THREE.BoxGeometry(0.004, 0.05, 0.004)), emissive(0x8a0010, 2.2), j.head, s * 0.05, 0.19, 0.09, 0.3, 0, -s * 0.6);
    }
    part(G('brow', () => new THREE.BoxGeometry(0.15, 0.022, 0.035)), skin, j.head, 0, 0.152, 0.098, -0.25);
    for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.28; part(G('crown', () => new THREE.ConeGeometry(0.016, 0.11, 5)), trim, j.head, Math.sin(a) * 0.12, 0.245 - Math.abs(i - 3) * 0.022, Math.cos(a) * 0.05 - 0.03, -0.25, 0, -a * 0.7); }
    // tattered cape
    const capeGeo = G('cape', () => { const g2 = new THREE.PlaneGeometry(0.62, 1.25, 8, 12); const p = g2.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -Math.cos((x / 0.62) * PI) * 0.05 - (0.6 - y) * 0.12); if (y < -0.45 && Math.abs(Math.sin(x * 40)) > 0.6) p.setY(i, y + 0.08); } g2.computeVertexNormals(); g2.translate(0, -0.58, 0); return g2; });
    const cape = part(capeGeo, mats('b2_cape', () => rim(new THREE.MeshStandardMaterial({ color: 0x14060a, roughness: 0.8, side: THREE.DoubleSide }), 0xff1a3a, 0.35, 2)), j.chest, 0, 0.27, -0.25 * B, 0.12, 0, 0);
    rig.attach.cape = cape;
  }
  // arms
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const sideC = s > 0 ? PI : 0;
    part(SHELL(0.128, 0, PI * 2, 0, 1.42), plate, j['sh' + n], s * 0.03, 0.03, 0, 0, 0, s * 0.3, 1.22 * B, 0.92, 1.1 * B);

    part(G('pstripe', () => new THREE.BoxGeometry(0.012, 0.012, 0.25)), glow, j['sh' + n], s * 0.085, 0.125, 0, 0, 0, s * 0.32);
    if (dark) for (let i = 0; i < 3; i++) part(G('bspike', () => new THREE.ConeGeometry(0.022, 0.13, 6)), trim, j['sh' + n], s * (0.06 + i * 0.03), 0.13 - i * 0.02, (i - 1) * 0.06, 0, 0, -s * (0.5 + i * 0.25));
    part(LIMB(0.062 * B, 0.052 * B, 0.3, 0.38), suit, j['ua' + n]);
    part(ARC(0.07 * B, 0.064 * B, 0.15, s * PI / 2, 2.3), plate, j['ua' + n], 0, -0.13, 0);
    part(LATHE('gaunt' + B, [[0.052 * B, -0.27], [0.058 * B, -0.2], [0.067 * B, -0.08], [0.074 * B, -0.02], [0.062 * B, 0.012]], 18), plate, j['el' + n]);
    part(TOR(0.06 * B, 0.01), trim, j['el' + n], 0, -0.255, 0, PI / 2);
    part(G('gstripe', () => new THREE.BoxGeometry(0.01, 0.17, 0.01)), glow, j['el' + n], 0, -0.13, 0.066 * B);
    part(RB(0.09 * B, 0.09, 0.105, 0.03), trim, j['ha' + n], 0, -0.045, 0.01);
    part(RB(0.095 * B, 0.03, 0.045, 0.01), plate, j['ha' + n], 0, -0.02, 0.05);
    part(RB(0.03, 0.05, 0.035, 0.01), trim, j['ha' + n], -s * 0.05, -0.04, 0.03);
    void sideC;
  }
  // legs
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    part(LIMB(0.09 * B, 0.067 * B, 0.45, 0.25), suit, j['th' + n]);
    part(ARC(0.1 * B, 0.084 * B, 0.3, s * 0.55, 2.5), plate, j['th' + n], 0, -0.18, 0);
    part(G('tstripe', () => new THREE.BoxGeometry(0.01, 0.22, 0.01)), glow, j['th' + n], s * 0.098 * B, -0.18, 0.0);
    part(SHELL(0.072, PI / 2, 2.4, 0.25, 1.6), trim, j['kn' + n], 0, 0.0, 0.016);
    part(LIMB(0.07 * B, 0.05 * B, 0.43, 0.32), suit, j['kn' + n]);
    part(ARC(0.08 * B, 0.062 * B, 0.33, 0, 2.6), plate, j['kn' + n], 0, -0.2, 0.004);
    part(G('sstripe', () => new THREE.BoxGeometry(0.012, 0.25, 0.012)), glow, j['kn' + n], 0, -0.2, 0.079 * B);
    part(RB(0.115, 0.095, 0.26, 0.035), trim, j['ft' + n], 0, -0.035, 0.05);
    part(SHELL(0.065, PI / 2, PI, 0.2, 1.3), plate, j['ft' + n], 0, -0.02, 0.13, 0, 0, 0, 0.9, 0.7, 1);
    part(RB(0.12, 0.022, 0.27, 0.008), mats('h2_sole', () => new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.9 })), j['ft' + n], 0, -0.082, 0.05);
  }
  // holstered sword & knife
  const swordBack = buildSword(glowC); swordBack.position.set(0.08, 0.05, -0.28 * B); swordBack.rotation.set(0, 0, PI * 0.85); j.chest.add(swordBack);
  swordBack.children.forEach((ch, i) => { if (i >= 2) ch.visible = false; }); // holstered: blade powered down
  const knifeHol = buildKnife(); knifeHol.position.set(0.11, -0.12, 0.03); knifeHol.rotation.set(PI, 0, 0.1); j.thL.add(knifeHol);
  rig.attach.swordBack = swordBack; rig.attach.knifeHol = knifeHol;
  const hand = j.haR;
  const weapons = { rifle: buildRifle(glowC), sword: buildSword(glowC), knife: buildKnife(), sniper: buildSniper() };
  for (const k in weapons) { const w = weapons[k]; w.visible = false; hand.add(w); }
  weapons.rifle.position.set(0, -0.085, 0.09); weapons.rifle.rotation.set(PI / 2, 0, 0);
  weapons.sniper.position.set(0, -0.08, 0.12); weapons.sniper.rotation.set(PI / 2, 0, 0);
  weapons.sword.position.set(0, -0.08, 0.04); weapons.sword.rotation.set(PI / 2, 0, 0);
  weapons.knife.position.set(0, -0.08, 0.04); weapons.knife.rotation.set(PI / 2, 0, 0);
  rig.weapons = weapons;
  rig.eyes = [new THREE.Vector3(0.045, 0.125, 0.14), new THREE.Vector3(-0.045, 0.125, 0.14)];
  rig.glowColor = glowC;
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return rig;
}

export function setHeroWeapon(rig, w) {
  for (const k in rig.weapons) rig.weapons[k].visible = k === w;
  rig.attach.swordBack.visible = w !== 'sword' && rig.hasSword !== false;
  rig.attach.knifeHol.visible = w !== 'knife' && rig.hasKnife !== false;
}

// ------------------------------------------------------------------ weapons
// heavy pulse rifle: large silhouette, glowing energy cells, long-range optic
export function buildRifle(glowC = 0x4ef2ff) {
  const g = new THREE.Group();
  const body = mats('w2_body', () => rim(new THREE.MeshPhysicalMaterial({ color: 0x1e242c, metalness: 0.9, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 }), 0x9fe6ff, 0.2, 3));
  const light = mats('w2_light', () => rim(new THREE.MeshPhysicalMaterial({ color: 0xd4dbe4, metalness: 0.7, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }), 0x9fe6ff, 0.2, 3));
  const glow = emissive(glowC, 3.2);
  const k = 1.45;
  const P = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => part(geo, mat, g, x * k, y * k, z * k, rx, ry, rz, k, k, k);
  P(RB(0.07, 0.1, 0.46, 0.018), body, 0, 0, 0.1);
  P(RB(0.074, 0.055, 0.34, 0.016), light, 0, 0.058, 0.16);
  P(RB(0.078, 0.07, 0.24, 0.02), light, 0, -0.005, 0.42);
  for (let i = 0; i < 4; i++) P(G('vent', () => new THREE.BoxGeometry(0.08, 0.008, 0.02)), body, 0, 0.028, 0.34 + i * 0.045);
  P(CYL(0.019, 0.019, 0.26, 12), body, 0, 0.012, 0.62, PI / 2);
  P(CYL(0.032, 0.028, 0.09, 12), body, 0, 0.012, 0.77, PI / 2);
  P(TOR(0.03, 0.006), glow, 0, 0.012, 0.735);
  P(RB(0.05, 0.16, 0.085, 0.015), body, 0, -0.11, 0.17, 0.35);
  P(CYL(0.016, 0.016, 0.07, 10), glow, 0, -0.1, 0.2, 0.35);
  P(RB(0.045, 0.12, 0.055, 0.012), body, 0, -0.075, -0.03, -0.3);
  P(RB(0.055, 0.09, 0.2, 0.02), body, 0, -0.01, -0.22);
  P(RB(0.06, 0.03, 0.08, 0.01), light, 0, -0.045, -0.31);
  P(CYL(0.026, 0.026, 0.2, 14), body, 0, 0.115, 0.16, PI / 2);
  P(CYL(0.031, 0.026, 0.035, 14), body, 0, 0.115, 0.275, PI / 2);
  P(CYL(0.021, 0.021, 0.004, 14), emissive(0x2a8aa0, 0.9), 0, 0.115, 0.06, PI / 2); // rear lens (dim, so it never blinds the first-person view)
  for (const s of [-1, 1]) P(G('rstripe', () => new THREE.BoxGeometry(0.004, 0.012, 0.36)), glow, s * 0.037, 0.0, 0.15);
  P(G('rstripe2', () => new THREE.BoxGeometry(0.08, 0.006, 0.2)), glow, 0, -0.04, 0.42);
  g.userData.muzzle = new THREE.Vector3(0, 0.012 * k, 0.83 * k);
  return g;
}
export function buildSniper() {
  const g = new THREE.Group();
  const body = mats('s2_body', () => rim(new THREE.MeshStandardMaterial({ color: 0x3a3226, metalness: 0.55, roughness: 0.45 }), 0xffd8a0, 0.15, 3));
  const metal = mats('s2_metal', () => new THREE.MeshPhysicalMaterial({ color: 0x1c1e22, metalness: 0.92, roughness: 0.28, clearcoat: 0.6 }));
  part(RB(0.065, 0.085, 0.52, 0.018), body, g, 0, 0, 0.1);
  part(CYL(0.019, 0.022, 0.74, 12), metal, g, 0, 0.02, 0.7, PI / 2);
  part(CYL(0.032, 0.032, 0.09, 12), metal, g, 0, 0.02, 1.08, PI / 2);
  part(CYL(0.034, 0.034, 0.32, 14), metal, g, 0, 0.11, 0.16, PI / 2);
  part(CYL(0.044, 0.034, 0.045, 14), metal, g, 0, 0.11, 0.33, PI / 2);
  part(CYL(0.03, 0.03, 0.004, 14), emissive(0x7ad8ff, 2), g, 0, 0.11, 0.355, PI / 2);
  part(RB(0.052, 0.15, 0.065, 0.014), body, g, 0, -0.095, 0.02, 0.3);
  part(RB(0.055, 0.11, 0.26, 0.022), body, g, 0, -0.02, -0.26);
  for (const s of [-1, 1]) part(CYL(0.006, 0.006, 0.22, 6), metal, g, s * 0.03, -0.1, 0.62, 0.35, 0, s * 0.3);
  g.userData.muzzle = new THREE.Vector3(0, 0.02, 1.13);
  return g;
}
export function buildSword(glowC = 0x4ef2ff) {
  const g = new THREE.Group();
  const hilt = mats('sw2_hilt', () => new THREE.MeshPhysicalMaterial({ color: 0x1c2027, metalness: 0.92, roughness: 0.25, clearcoat: 0.8 }));
  part(CYL(0.019, 0.019, 0.21, 12), hilt, g, 0, 0, -0.045, PI / 2);
  part(RB(0.16, 0.034, 0.045, 0.012), hilt, g, 0, 0, 0.07);
  part(SPH(0.026, 12, 8), emissive(glowC, 3), g, 0, 0, -0.16);
  const blade = part(G('blade2', () => { const sh = new THREE.Shape(); sh.moveTo(-0.022, 0); sh.lineTo(0.022, 0); sh.lineTo(0.016, 0.9); sh.lineTo(0, 1.0); sh.lineTo(-0.016, 0.9); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }).rotateX(PI / 2).translate(0, 0.004, 0.09); }), emissive(glowC, 3.6), g);
  part(G('bladecore2', () => new THREE.BoxGeometry(0.008, 0.012, 0.86)), emissive(0xffffff, 4), g, 0, 0, 0.52);
  g.userData.tip = new THREE.Vector3(0, 0, 1.08);
  g.userData.blade = blade;
  return g;
}
export function buildKnife() {
  const g = new THREE.Group();
  const hilt = mats('kn2_hilt', () => new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.6, roughness: 0.5 }));
  const steel = mats('kn2_steel', () => new THREE.MeshPhysicalMaterial({ color: 0xe4e9ef, metalness: 1, roughness: 0.12, clearcoat: 1 }));
  part(CYL(0.017, 0.017, 0.12, 8), hilt, g, 0, 0, -0.02, PI / 2);
  part(G('knblade2', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.024, 0); s.lineTo(0.014, 0.21); s.lineTo(0, 0.26); s.lineTo(-0.006, 0.0); return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }).rotateX(PI / 2).translate(-0.008, 0, 0.04); }), steel, g);
  return g;
}

// ------------------------------------------------------------------ Klin'Tar aliens
export const ALIEN_LOOK = {
  1: { skin: 0x5d7a52, spot: 0x34452e, vein: '#1a2a12', armor: 0x7a5a32, trim: 0xc09a52, eye: 0xff3a2a, head: 'dome' },
  2: { skin: 0x7a52a0, spot: 0x3a2452, vein: '#1a0830', armor: 0x2e2244, trim: 0x9a6ad8, eye: 0xff2ad8, head: 'crest' },
  3: { skin: 0x8a8a7e, spot: 0x4a4a42, vein: '#2a2a20', armor: 0x15151b, trim: 0xd8ac3e, eye: 0xffc02a, head: 'horns' },
  4: { skin: 0x9a3a3a, spot: 0x4a1414, vein: '#2a0505', armor: 0x2a1014, trim: 0xd04040, eye: 0xff5a2a, head: 'spikes' },
  5: { skin: 0x2e2e3a, spot: 0x121218, vein: '#3a0010', armor: 0x0c0a10, trim: 0x6a1a2e, eye: 0xff1a3a, head: 'visor' },
};

export function buildAlien(style = 1, kind = 'soldier', weapon = 'plasma') {
  const L = ALIEN_LOOK[style] || ALIEN_LOOK[1];
  const brute = kind === 'brute' || kind === 'executioner';
  const elite = kind === 'elite';
  const rig = new Rig(brute ? { scale: 1.42, sw: 0.34, hw: 0.15, ua: 0.32, fa: 0.33, thigh: 0.42, shin: 0.4 } : elite ? { scale: 1.12, sw: 0.25 } : { scale: 1.06, sw: 0.215, ua: 0.34, fa: 0.33, thigh: 0.48, shin: 0.47 });
  const j = rig.j;
  const skin = mats('a2_skin' + style, () => rim(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: skinTex('askin' + style, L.skin, L.spot, L.vein), roughness: 0.5, metalness: 0.05, sheen: 0.7, sheenColor: new THREE.Color(L.skin).offsetHSL(0, 0, 0.25), clearcoat: 0.25, clearcoatRoughness: 0.5 }), L.eye, 0.16, 2.8));
  const armor = mats('a2_armor' + style, () => rim(new THREE.MeshPhysicalMaterial({ color: L.armor, metalness: 0.78, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide }), L.eye, 0.14, 3.2));
  const trim = mats('a2_trim' + style, () => new THREE.MeshPhysicalMaterial({ color: L.trim, metalness: 0.95, roughness: 0.22, clearcoat: 0.6, side: THREE.DoubleSide }));
  const eye = emissive(L.eye, 4.2);
  const b = brute ? 1.75 : elite ? 1.15 : 1;
  // pelvis, belt & loin plates
  part(LATHE('apelvis', [[0.09, -0.12], [0.125, -0.06], [0.135, 0.02], [0.12, 0.08]]), skin, j.hips, 0, 0, 0, 0, 0, 0, 1.15 * b, 1, 0.82 * b);
  part(TOR(0.135, 0.022), trim, j.hips, 0, 0.05, 0, PI / 2, 0, 0, 1.15 * b, 0.82 * b, 1);
  part(RB(0.13 * b, 0.16, 0.025, 0.01), armor, j.hips, 0, -0.06, 0.1 * b, 0.12);
  part(RB(0.15 * b, 0.14, 0.025, 0.01), armor, j.hips, 0, -0.05, -0.1 * b, -0.12);
  // waist & torso
  part(LATHE('aabd', [[0.105, -0.03], [0.095, 0.06], [0.11, 0.16], [0.14, 0.27]]), skin, j.spine, 0, 0, 0, 0, 0, 0, 1.18 * b, 1, 0.8 * b);
  for (let i = 0; i < 3; i++) part(RB(0.13 * b, 0.04, 0.03, 0.01), brute ? armor : trim, j.spine, 0, 0.05 + i * 0.065, 0.09 * b, -0.05);
  const chest = part(LATHE('achest', [[0.14, -0.06], [0.18, 0.04], [0.205, 0.14], [0.205, 0.22], [0.17, 0.28], [0.07, 0.31]]), skin, j.chest, 0, 0, brute ? 0.03 : 0, brute ? 0.25 : 0, 0, 0, 1.3 * b, 1, 0.78 * b);
  void chest;
  part(SHELL(0.214, PI / 2, 2.4, 0.55, 1.1), armor, j.chest, 0, 0.1, brute ? 0.04 : 0, brute ? 0.25 : 0, 0, 0, 1.32 * b, 1.12, 0.84 * b);
  part(SHELL(0.214, 1.5 * PI, 2.2, 0.5, 1.2), armor, j.chest, 0, 0.1, brute ? 0.02 : 0, brute ? 0.25 : 0, 0, 0, 1.32 * b, 1.12, 0.84 * b);
  part(RB(0.26 * b, 0.05, 0.03, 0.01), trim, j.chest, 0, 0.2, 0.17 * b);
  part(SPH(0.034, 12, 8), eye, j.chest, 0, 0.13, 0.18 * b);
  part(TOR(0.05, 0.008), trim, j.chest, 0, 0.13, 0.172 * b);
  if (brute) {
    for (let i = 0; i < 5; i++) part(G('bspine', () => new THREE.ConeGeometry(0.035, 0.18, 6)), trim, j.chest, 0, 0.3 - i * 0.07, -0.2 * b, -1.0);
    part(RB(0.45, 0.16, 0.3, 0.05), armor, j.chest, 0, 0.29, -0.04, 0.2);
  }
  if (elite) for (const s of [-1, 1]) { const w = part(G('ewing2', () => new THREE.BoxGeometry(0.025, 0.55, 0.2)), trim, j.chest, s * 0.2, 0.27, -0.21, 0.3, 0, s * 0.6); part(G('ewingG2', () => new THREE.BoxGeometry(0.01, 0.5, 0.02)), eye, w, 0, 0, 0.1); }
  // neck & head
  part(LIMB(0.05 * b, 0.06 * b, 0.15, 0.1), skin, j.neck, 0, 0.1, 0);
  const head = J(j.head, 0, 0.06, 0); head.scale.setScalar(brute ? 0.85 : 1);
  part(LATHE('askull', [[0.0006, -0.05], [0.07, -0.04], [0.11, 0.02], [0.125, 0.1], [0.115, 0.18], [0.075, 0.24], [0.0006, 0.26]], 26), L.head === 'visor' ? armor : skin, head, 0, 0, -0.03, -0.42, 0, 0, 0.9, 1.05, 1.18);
  part(RB(0.11, 0.07, 0.1, 0.03), skin, head, 0, -0.02, 0.07);
  if (L.head === 'dome') {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) part(G('frill2', () => new THREE.ConeGeometry(0.03, 0.15, 5)), trim, head, s * 0.11, 0.06 + i * 0.05, -0.05 - i * 0.03, 0.4, 0, -s * (1.2 + i * 0.1));
    part(TOR(0.11, 0.012, PI), trim, head, 0, 0.12, -0.02, 0, PI / 2, 0);
  } else if (L.head === 'crest') {
    part(G('crestfin2', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.12, 0.22, -0.18, 0.34); sh.lineTo(-0.22, 0.05); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false }).rotateY(PI / 2).translate(-0.008, 0.08, 0.02); }), trim, head, 0, 0, 0);
  } else if (L.head === 'horns') {
    part(SHELL(0.122, PI / 2, 2.0, 0.9, 0.95), trim, head, 0, 0.09, 0.0);
    for (const s of [-1, 1]) part(TOR(0.12, 0.022, PI * 0.8), trim, head, s * 0.06, 0.2, -0.02, 0, s * 0.3, s > 0 ? 0.2 : PI - 0.2);
  } else if (L.head === 'spikes') {
    for (let i = 0; i < 7; i++) part(G('spk2', () => new THREE.ConeGeometry(0.022, 0.16, 5)), armor, head, (i - 3) * 0.035, 0.2 - Math.abs(i - 3) * 0.015, -0.06 - Math.abs(i - 3) * 0.02, -0.6);
  } else {
    part(G('avisor2', () => new THREE.BoxGeometry(0.19, 0.03, 0.04)), eye, head, 0, 0.1, 0.11);
    part(RB(0.035, 0.05, 0.25, 0.01), trim, head, 0, 0.22, -0.06, -0.3);
  }
  if (L.head !== 'visor') {
    const nEyes = style === 2 ? 4 : 2;
    for (let i = 0; i < nEyes; i++) { const s = i % 2 ? -1 : 1, row = Math.floor(i / 2); part(SPH(0.024, 10, 8), eye, head, s * 0.047, 0.075 + row * 0.045, 0.108 - row * 0.012, 0, 0, s * 0.3, 1.4, 0.65, 0.6); }
    if (brute) for (const s of [-1, 1]) part(G('tusk2', () => new THREE.ConeGeometry(0.02, 0.13, 6)), mats('a2_tusk', () => new THREE.MeshPhysicalMaterial({ color: 0xece4cc, roughness: 0.35, clearcoat: 0.6 })), head, s * 0.05, -0.04, 0.12, -0.5, 0, s * 0.25);
  }
  rig.headNode = head;
  // limbs
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    part(SHELL(0.11, 0, PI * 2, 0, 1.25), armor, j['sh' + n], s * 0.03, 0.03, 0, 0, 0, s * 0.35, 1.3 * b, 0.82, 1.15 * b);
    if (brute || elite || style >= 3) part(G('shspike', () => new THREE.ConeGeometry(0.03, 0.16, 6)), trim, j['sh' + n], s * 0.09 * b, 0.11, 0, 0, 0, -s * 0.7);
    part(LIMB(0.052 * b, 0.044 * b, rig.p.ua, brute ? 0.55 : 0.32), skin, j['ua' + n]);
    part(LIMB(0.05 * b, 0.04 * b, rig.p.fa, brute ? 0.6 : 0.3), skin, j['el' + n]);
    part(ARC(0.062 * b, 0.054 * b, rig.p.fa * 0.55, 0, 2.6), armor, j['el' + n], 0, -rig.p.fa * 0.45, 0);
    part(G('fglow', () => new THREE.BoxGeometry(0.008, 0.12, 0.008)), eye, j['el' + n], 0, -rig.p.fa * 0.45, 0.06 * b);
    part(RB(0.075 * b, 0.07, 0.08 * b, 0.02), skin, j['ha' + n], 0, -0.035, 0);
    for (let f = 0; f < 3; f++) part(G('finger', () => new THREE.CapsuleGeometry(0.011, 0.06, 3, 6)), skin, j['ha' + n], (f - 1) * 0.022 * b, -0.1, 0.02, 0.2, 0, 0, b, b, b);
    part(LIMB(0.075 * b, 0.058 * b, rig.p.thigh, brute ? 0.4 : 0.22), skin, j['th' + n]);
    part(ARC(0.085 * b, 0.07 * b, rig.p.thigh * 0.62, s * 0.4, 2.4), armor, j['th' + n], 0, -rig.p.thigh * 0.42, 0);
    part(SHELL(0.062 * b, PI / 2, 2.2, 0.3, 1.5), trim, j['kn' + n], 0, 0, 0.012);
    if (brute) part(G('knspike', () => new THREE.ConeGeometry(0.03, 0.14, 6)), trim, j['kn' + n], 0, 0.02, 0.08 * b, PI / 2.6);
    part(LIMB(0.058 * b, 0.042 * b, rig.p.shin, 0.3), skin, j['kn' + n]);
    part(ARC(0.067 * b, 0.05 * b, rig.p.shin * 0.6, 0, 2.6), trim, j['kn' + n], 0, -rig.p.shin * 0.45, 0.003);
    part(RB(0.1 * b, 0.07, 0.24 * b, 0.03), armor, j['ft' + n], 0, -0.03, 0.06);
    for (const c of [-1, 1]) part(G('claw', () => new THREE.ConeGeometry(0.014, 0.06, 5)), trim, j['ft' + n], c * 0.03 * b, -0.04, 0.19 * b, PI / 2);
  }
  const w = buildAlienWeapon(weapon, L);
  j.haR.add(w);
  rig.weapon = w;
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return rig;
}

export function buildAlienWeapon(kind, L) {
  const g = new THREE.Group();
  const metal = mats('aw2_metal', () => rim(new THREE.MeshPhysicalMaterial({ color: 0x1a1a20, metalness: 0.9, roughness: 0.3, clearcoat: 0.6 }), 0xff6060, 0.15, 3));
  const trim = mats('aw2_trim' + L.trim, () => new THREE.MeshPhysicalMaterial({ color: L.trim, metalness: 0.95, roughness: 0.25, clearcoat: 0.6 }));
  const glow = emissive(L.eye, 3.6);
  g.rotation.set(PI / 2, 0, 0); g.position.set(0, -0.08, 0.1);
  if (kind === 'plasma' || kind === 'pistol') {
    const len = kind === 'pistol' ? 0.28 : 0.62;
    part(RB(0.065, 0.085, len, 0.02), metal, g, 0, 0, len * 0.35);
    part(CYL(0.036, 0.03, len * 0.5, 12), trim, g, 0, 0.02, len * 0.62, PI / 2);
    for (let i = 0; i < 3; i++) part(TOR(0.042, 0.009), glow, g, 0, 0.02, len * 0.45 + i * 0.065);
    part(RB(0.04, 0.11, 0.05, 0.012), metal, g, 0, -0.08, len * 0.12, 0.3);
    g.userData.muzzle = new THREE.Vector3(0, 0.02, len * 0.9);
  } else if (kind === 'scatter') {
    part(RB(0.11, 0.11, 0.5, 0.025), metal, g, 0, 0, 0.16);
    part(CYL(0.075, 0.055, 0.22, 12), trim, g, 0, 0.0, 0.48, PI / 2);
    part(CYL(0.065, 0.065, 0.012, 12), glow, g, 0, 0.0, 0.595, PI / 2);
    g.userData.muzzle = new THREE.Vector3(0, 0, 0.6);
  } else if (kind === 'heavy') {
    part(CYL(0.13, 0.15, 0.86, 14), metal, g, 0, 0.0, 0.26, PI / 2);
    part(TOR(0.14, 0.026), glow, g, 0, 0, 0.52); part(TOR(0.14, 0.026), glow, g, 0, 0, 0.36);
    part(RB(0.22, 0.22, 0.32, 0.05), trim, g, 0, 0.0, -0.1);
    g.userData.muzzle = new THREE.Vector3(0, 0, 0.7);
  } else if (kind === 'blade') {
    part(CYL(0.02, 0.02, 0.18, 8), metal, g, 0, 0, 0, PI / 2);
    part(G('eblade2', () => new THREE.BoxGeometry(0.045, 0.012, 0.85)), glow, g, 0, 0, 0.5);
    g.userData.muzzle = new THREE.Vector3(0, 0, 0.5);
  } else if (kind === 'axe') {
    part(CYL(0.026, 0.026, 1.45, 8), mats('axe2_h', () => new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })), g, 0, 0, 0.45, PI / 2);
    part(G('axeblade2', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.36, 0.05, 0.44, 0.34); s.lineTo(0.4, -0.3); s.quadraticCurveTo(0.31, -0.05, 0, -0.07); return new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }).translate(0, 0, -0.011); }), mats('axe2_b', () => new THREE.MeshPhysicalMaterial({ color: 0x9a9aa4, metalness: 1, roughness: 0.18, clearcoat: 0.5 })), g, 0.02, 0, 1.06, 0, PI / 2, PI / 2);
    g.userData.muzzle = new THREE.Vector3(0, 0, 1.1);
  }
  return g;
}

// ------------------------------------------------------------------ civilians / hostages / dealer
export const CIV_LOOK = {
  kepler: { skin: 0x5aa8d8, spot: 0x2a6a9a, robe: '#2e4a8a', robe2: '#c8b890', trim: '#e8c86a', eye: 0x101820, tall: 1.12 },
  trappist: { skin: 0xd8884a, spot: 0x9a4a1a, robe: '#7a2a5a', robe2: '#e0a040', trim: '#f0d090', eye: 0x101010, tall: 0.98 },
  human: { skin: 0xc89a7a, spot: 0xa0705a, robe: '#2a3a5a', robe2: '#8a8a9a', trim: '#c0c0c8', eye: 0x101010, tall: 1 },
};
export function buildCivilian(look = 'kepler', seed = 1, extra = {}) {
  const L = CIV_LOOK[look];
  const r = new RNG(seed);
  const rig = new Rig({ scale: L.tall * r.range(0.92, 1.06), sw: 0.2, ua: 0.31, fa: 0.29 });
  const j = rig.j;
  const skin = mats('c2_skin' + look, () => rim(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: skinTex('cskin' + look, L.skin, L.spot, null), roughness: 0.45, sheen: 0.8, sheenColor: new THREE.Color(L.skin).offsetHSL(0, 0, 0.3) }), 0xffffff, 0.08, 3));
  const variant = r.int(0, 3);
  const robeCols = [L.robe, L.robe2, '#3a6a4a', '#6a3a2a'];
  const robe = mats('c2_robe' + look + variant, () => rim(new THREE.MeshStandardMaterial({ map: clothTex('cloth' + look + variant, robeCols[variant], 'rgba(255,255,255,0.12)', L.trim), roughness: 0.82, side: THREE.DoubleSide }), 0xffffff, 0.12, 2.4));
  const trim = mats('c2_trim' + look, () => new THREE.MeshStandardMaterial({ color: L.trim, metalness: 0.7, roughness: 0.3 }));
  part(LATHE('robeSkirt2', [[0.31, -0.9], [0.27, -0.62], [0.2, -0.3], [0.15, -0.05], [0.14, 0.05]], 24), robe, j.hips, 0, 0, 0);
  part(LATHE('cabd', [[0.12, -0.02], [0.115, 0.1], [0.135, 0.27]]), robe, j.spine, 0, 0, 0, 0, 0, 0, 1.15, 1, 0.82);
  part(LATHE('cchest', [[0.135, -0.05], [0.17, 0.06], [0.18, 0.18], [0.15, 0.27], [0.06, 0.3]]), robe, j.chest, 0, 0, 0, 0, 0, 0, 1.18, 1, 0.8);
  part(TOR(0.15, 0.02), trim, j.spine, 0, 0.02, 0, PI / 2, 0, 0, 1.15, 0.82, 1);
  part(TOR(0.08, 0.012), trim, j.chest, 0, 0.27, 0.01, PI / 2 - 0.3);
  part(SPH(0.02, 8, 6), emissive(look === 'kepler' ? 0x6affd0 : 0xffb04a, 2.5), j.chest, 0, 0.2, 0.14);
  part(CYL(0.044, 0.05, 0.12, 10), skin, j.neck, 0, 0.02, 0);
  const head = J(j.head, 0, 0.07, 0);
  if (look === 'kepler') {
    part(LATHE('khead', [[0.0006, -0.06], [0.06, -0.05], [0.1, 0.02], [0.11, 0.1], [0.1, 0.2], [0.06, 0.27], [0.0006, 0.29]], 24), skin, head, 0, 0, 0, -0.15, 0, 0, 0.92, 1, 1.02);
    for (const s of [-1, 1]) part(SPH(0.04, 12, 10), mats('c2_eyeK', () => new THREE.MeshPhysicalMaterial({ color: 0x05080c, roughness: 0.03, clearcoat: 1 })), head, s * 0.046, 0.07, 0.088, 0, 0, s * 0.45, 1, 1.55, 0.6);
    part(TOR(0.105, 0.012), trim, head, 0, 0.17, -0.02, PI / 2.3);
    part(SPH(0.018, 8, 6), emissive(0x6affd0, 3), head, 0, 0.2, 0.08);
  } else if (look === 'trappist') {
    part(LATHE('thead', [[0.0006, -0.05], [0.08, -0.04], [0.125, 0.02], [0.13, 0.08], [0.11, 0.15], [0.0006, 0.18]], 24), skin, head, 0, 0, 0.01, 0, 0, 0, 1.12, 1, 1.05);
    for (const s of [-1, 1]) {
      part(SPH(0.032, 12, 10), mats('c2_eyeT', () => new THREE.MeshPhysicalMaterial({ color: 0x1a0a00, roughness: 0.05, clearcoat: 1 })), head, s * 0.065, 0.085, 0.085);
      part(G('tfrill2', () => new THREE.ConeGeometry(0.07, 0.2, 4)), mats('c2_frill', () => rim(new THREE.MeshStandardMaterial({ color: 0xe08a3a, roughness: 0.5, side: THREE.DoubleSide }), 0xffd0a0, 0.3, 2)), head, s * 0.13, 0.06, -0.02, 0, 0, -s * 1.3, 1, 1, 0.3);
    }
  } else {
    part(SPH(0.11, 18, 14), skin, head, 0, 0.06, 0, 0, 0, 0, 0.9, 1.08, 1);
  }
  if (extra.hood) part(SHELL(0.15, 1.5 * PI, PI * 1.6, 0, 1.9), robe, head, 0, 0.07, -0.01, -0.2, 0, 0, 1, 1.15, 1.1);
  if (extra.goggles) { part(TOR(0.12, 0.018), trim, head, 0, 0.09, 0.02, 0, 0, 0, 1, 0.5, 1); for (const s of [-1, 1]) part(CYL(0.032, 0.032, 0.02, 12), emissive(0xffb04a, 2), head, s * 0.045, 0.09, 0.105, PI / 2); }
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    part(LIMB(0.055, 0.075, 0.31, 0.05), robe, j['ua' + n]);
    part(LIMB(0.07, 0.085, 0.24, 0.02), robe, j['el' + n]);
    part(LIMB(0.03, 0.026, 0.27, 0.2), skin, j['el' + n], 0, -0.02, 0);
    part(SPH(0.042, 10, 8), skin, j['ha' + n], 0, -0.04, 0);
    part(LIMB(0.06, 0.05, 0.44, 0.15), robe, j['th' + n]);
    part(LIMB(0.048, 0.04, 0.43, 0.2), skin, j['kn' + n]);
    part(RB(0.08, 0.06, 0.18, 0.025), trim, j['ft' + n], 0, -0.03, 0.04);
  }
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return rig;
}

// ------------------------------------------------------------------ creatures
export function buildGorilla(seed = 1) {
  const root = new THREE.Group();
  const skin = mats('g_skin2', () => rim(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: skinTex('gorilla', 0x3a2e36, 0x15101a, '#5a0a0a'), roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0x8a5a6a) }), 0xff5a3a, 0.35, 2.2));
  const plate = mats('g_plate2', () => rim(new THREE.MeshPhysicalMaterial({ color: 0x4a1a24, metalness: 0.75, roughness: 0.3, clearcoat: 0.7 }), 0xff5a3a, 0.25, 3));
  const eye = emissive(0xff2a1a, 5);
  const vein = emissive(0xff3a1a, 2.2);
  const body = J(root, 0, 1.4, 0);
  part(SPH(0.9, 20, 16), skin, body, 0, 0.1, 0.1, 0, 0, 0, 1.05, 0.9, 1.15);
  part(SPH(0.7, 18, 14), skin, body, 0, -0.1, -0.7, 0, 0, 0, 0.9, 0.8, 0.9);
  part(RB(1.2, 0.3, 1.2, 0.12), plate, body, 0, 0.75, -0.05, -0.15);
  for (let i = 0; i < 5; i++) part(G('gspike', () => new THREE.ConeGeometry(0.1, 0.5, 6)), plate, body, 0, 0.85 + Math.sin(i) * 0.05, 0.4 - i * 0.3, -0.5);
  for (const s of [-1, 1]) part(G('gvein', () => new THREE.BoxGeometry(0.03, 0.6, 0.03)), vein, body, s * 0.6, 0.0, 0.55, 0.4, 0, s * 0.5);
  const head = J(body, 0, 0.2, 0.95);
  part(SPH(0.42, 16, 12), skin, head, 0, 0, 0.1, 0, 0, 0, 1, 0.85, 1);
  const jaw = J(head, 0, -0.2, 0.15);
  part(RB(0.5, 0.18, 0.4, 0.06), skin, jaw, 0, -0.05, 0.12);
  for (const s of [-1, 1]) { part(SPH(0.07, 8, 6), eye, head, s * 0.17, 0.08, 0.42); part(G('ghorn', () => new THREE.ConeGeometry(0.07, 0.4, 6)), plate, head, s * 0.3, 0.3, 0, -0.6, 0, -s * 0.7); part(G('gtusk', () => new THREE.ConeGeometry(0.035, 0.16, 6)), mats('a_tusk', () => new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 })), jaw, s * 0.16, 0.06, 0.3); }
  const limbs = {};
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const sh = J(body, s * 0.9, 0.3, 0.45);
    part(SPH(0.4, 14, 10), skin, sh, 0, 0, 0);
    part(RB(0.5, 0.25, 0.5, 0.08), plate, sh, s * 0.1, 0.25, 0);
    part(CAP(0.28, 0.7), skin, sh, 0, -0.55, 0);
    const el = J(sh, 0, -1.0, 0);
    part(CAP(0.3, 0.55), skin, el, 0, -0.35, 0);
    part(SPH(0.32, 12, 10), plate, el, 0, -0.75, 0, 0, 0, 0, 1.1, 0.8, 1.1);
    const hip = J(body, s * 0.5, -0.3, -0.8);
    part(CAP(0.24, 0.4), skin, hip, 0, -0.35, 0);
    const kn = J(hip, 0, -0.6, 0);
    part(CAP(0.2, 0.3), skin, kn, 0, -0.25, 0.1);
    limbs['sh' + n] = sh; limbs['el' + n] = el; limbs['hip' + n] = hip; limbs['kn' + n] = kn;
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(1.15);
  return { root, body, head, jaw, limbs, t: Math.random() * 10 };
}
export function animateGorilla(g, s, dt) {
  g.t += dt * (s.move > 0.1 ? 1 : 0.4);
  const p = g.t * (s.run ? 9 : 5);
  const mv = Math.min(1, s.move || 0);
  const L = g.limbs;
  const k = 1 - Math.exp(-dt * 12);
  const set = (o, x, z = 0) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.z += (z - o.rotation.z) * k; };
  if (s.dead > 0) {
    g.root.rotation.z = damp(g.root.rotation.z, 1.4, 4, dt); g.body.position.y = damp(g.body.position.y, 0.8, 4, dt); return;
  }
  const atk = s.attack ? s.attack.t : -1;
  if (atk >= 0) {
    const a = atk < 0.4 ? -2.6 * (atk / 0.4) : -2.6 + 3.4 * Math.min(1, (atk - 0.4) / 0.15);
    set(L.shL, a); set(L.shR, a); set(L.elL, -0.3); set(L.elR, -0.3);
    g.body.rotation.x = damp(g.body.rotation.x, atk < 0.4 ? -0.5 : 0.35, 10, dt);
  } else {
    set(L.shL, Math.sin(p) * 0.7 * mv - 0.2); set(L.shR, -Math.sin(p) * 0.7 * mv - 0.2);
    set(L.elL, -0.3 - Math.max(0, Math.cos(p)) * 0.6 * mv); set(L.elR, -0.3 - Math.max(0, -Math.cos(p)) * 0.6 * mv);
    g.body.rotation.x = damp(g.body.rotation.x, 0.15 + mv * 0.1, 6, dt);
  }
  set(L.hipL, -Math.sin(p + 1) * 0.6 * mv); set(L.hipR, Math.sin(p + 1) * 0.6 * mv);
  set(L.knL, 0.4 + Math.max(0, Math.cos(p)) * 0.5 * mv); set(L.knR, 0.4 + Math.max(0, -Math.cos(p)) * 0.5 * mv);
  g.body.position.y = 1.4 + Math.abs(Math.sin(p)) * 0.12 * mv;
  g.jaw.rotation.x = damp(g.jaw.rotation.x, s.roar ? 0.6 : 0.05, 10, dt);
}

export function buildFlyer(seed = 1, color = 0xff2ad8) {
  const root = new THREE.Group();
  const skin = mats('f_skin2', () => rim(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: skinTex('flyer', 0x2a1e3a, 0x0a0812, '#7a2aff'), roughness: 0.4, metalness: 0.2, clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xb06aff) }), 0xc06aff, 0.45, 2.2));
  const memb = mats('f_memb' + color, () => new THREE.MeshStandardMaterial({ color: 0x2a1030, roughness: 0.6, emissive: color, emissiveIntensity: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  const glow = emissive(color, 4);
  part(SPH(1.2, 16, 12), skin, root, 0, 0, 0, 0, 0, 0, 1, 0.6, 2.2);
  part(SPH(0.7, 14, 10), skin, root, 0, 0.1, 2.3, 0, 0, 0, 0.9, 0.7, 1.3);
  for (const s of [-1, 1]) { part(SPH(0.15, 8, 6), glow, root, s * 0.35, 0.25, 3.0); part(G('fmand', () => new THREE.ConeGeometry(0.12, 0.8, 6)), skin, root, s * 0.3, -0.2, 3.2, Math.PI / 2 + 0.3, 0, s * 0.3); }
  for (let i = 0; i < 4; i++) part(G('fvein', () => new THREE.BoxGeometry(0.06, 0.06, 1.2)), glow, root, 0, 0.62, 1.2 - i * 0.9);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = J(root, s * 0.9, 0.2, 0.3);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(s * 4.5, 1.2); shape.lineTo(s * 6.5, -1.5); shape.lineTo(s * 3.5, -1.2); shape.lineTo(s * 2.0, -2.8); shape.lineTo(0, -1.6);
    const wm = part(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), memb, w);
    part(G('fbone', () => new THREE.CylinderGeometry(0.08, 0.04, 4.6, 6).rotateZ(Math.PI / 2).translate(2.3, 0, 0)), skin, w, 0, 0.02, 0, 0, s < 0 ? Math.PI : 0, 0.26 * s);
    wings.push({ w, s, wm });
  }
  const tail = [];
  let prev = root;
  for (let i = 0; i < 6; i++) { const t = J(prev, 0, 0, i === 0 ? -2.4 : -0.7); part(SPH(0.35 - i * 0.05, 8, 6), skin, t, 0, 0, 0, 0, 0, 0, 1, 0.7, 1.5); tail.push(t); prev = t; }
  part(G('ftip', () => new THREE.ConeGeometry(0.2, 0.9, 6)), glow, prev, 0, 0, -0.5, -Math.PI / 2);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, wings, tail, t: seed * 3.1 };
}
export function animateFlyer(f, dt, flap = 1) {
  f.t += dt * (3 + flap * 4);
  for (const w of f.wings) w.w.rotation.z = w.s * Math.sin(f.t) * 0.6 * flap;
  f.tail.forEach((t, i) => { t.rotation.y = Math.sin(f.t * 0.6 - i * 0.6) * 0.25; t.rotation.x = Math.cos(f.t * 0.5 - i * 0.5) * 0.12; });
}
