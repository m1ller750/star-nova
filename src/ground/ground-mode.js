// Ground gameplay: Nova on foot / flying, melee & firearms, stealth, Klin'Tar AI, artillery, vehicles, NPCs, interactions.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { clamp, damp, rand, pick, lerp, wrapAngle } from '../core/util.js';
import { FX } from '../gfx/fx.js';
import { buildHero, setHeroWeapon, buildAlien, buildCivilian, buildGorilla, animateRig, animateGorilla, buildRifle, buildSword, buildKnife, buildSniper } from '../gfx/models-chars.js';
import { buildBolt, buildRocket, emissive, cachedMaterial } from '../gfx/models-ships.js';
import { buildLocation } from './maps.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const LF = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.45, 5: 1.65 };

export const ALIEN_BARKS = {
  alert: ['Intruder! Over there!', 'Human detected!', 'It is the Nova! Kill it!', 'Sound the alarm!', 'Weapons free!'],
  combat: ['Flank him!', 'For the Empire!', 'Suppressing fire!', 'Do not let him escape!', 'Reinforcements, now!', 'Crush the human!'],
  hurt: ['Aaargh!', 'I am hit!', 'Medic!'],
  fear: ['He is too strong!', 'Fall back! Fall back!', 'Impossible!'],
  brute: ['I will crush you, little human!', 'Rraaagh! Come here!', 'Your bones will break!'],
  search: ['Where did he go?', 'Search the area!', 'He was here...'],
};

// ------------------------------------------------------------------ collision world
class World {
  constructor() { this.boxes = []; this.grid = new Map(); this.cell = 10; this.heightFn = () => 0; this.waterY = -1e9; }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  addBox(min, max, opts = {}) {
    const b = { min: min.clone(), max: max.clone(), solid: opts.solid !== false, walk: opts.walk !== false, tag: opts.tag || null, hp: opts.hp, onHit: opts.onHit };
    this.boxes.push(b);
    const c = this.cell;
    for (let ix = Math.floor(min.x / c); ix <= Math.floor(max.x / c); ix++) for (let iz = Math.floor(min.z / c); iz <= Math.floor(max.z / c); iz++) {
      const k = this.key(ix, iz); let arr = this.grid.get(k); if (!arr) this.grid.set(k, (arr = [])); arr.push(b);
    }
    return b;
  }
  addMeshBox(mesh, opts) { mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh); return this.addBox(bb.min, bb.max, opts); }
  near(x, z, r = 1) {
    const c = this.cell, out = new Set();
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
      const arr = this.grid.get(this.key(ix, iz)); if (arr) for (const b of arr) out.add(b);
    }
    return out;
  }
  // highest walkable surface under (x,z) not above y+step
  groundAt(x, z, y, step = 0.6) {
    let g = this.heightFn(x, z);
    for (const b of this.near(x, z, 0.5)) {
      if (!b.walk) continue;
      if (x >= b.min.x - 0.25 && x <= b.max.x + 0.25 && z >= b.min.z - 0.25 && z <= b.max.z + 0.25 && b.max.y <= y + step && b.max.y > g) g = b.max.y;
    }
    return g;
  }
  // push a vertical capsule out of solid boxes; returns true if hit a wall
  collide(pos, radius, height, vel) {
    let hit = false;
    for (const b of this.near(pos.x, pos.z, radius + 1)) {
      if (!b.solid) continue;
      if (pos.y + height <= b.min.y || pos.y + 0.45 >= b.max.y) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); const push = radius - d; pos.x += (dx / d) * push; pos.z += (dz / d) * push; if (vel) { const vn = (vel.x * dx + vel.z * dz) / d; if (vn < 0) { vel.x -= (dx / d) * vn; vel.z -= (dz / d) * vn; } } }
        else { // inside: push along smallest axis
          const pxn = pos.x - b.min.x, pxp = b.max.x - pos.x, pzn = pos.z - b.min.z, pzp = b.max.z - pos.z;
          const m = Math.min(pxn, pxp, pzn, pzp);
          if (m === pxn) pos.x = b.min.x - radius; else if (m === pxp) pos.x = b.max.x + radius; else if (m === pzn) pos.z = b.min.z - radius; else pos.z = b.max.z + radius;
        }
      }
      // ceiling
      if (vel && vel.y > 0 && pos.y + height > b.min.y && pos.y < b.min.y && pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z) { vel.y = 0; pos.y = b.min.y - height; }
    }
    return hit;
  }
  // ray vs boxes + terrain. returns distance or Infinity
  raycast(o, d, maxD, wantBox = false) {
    let best = maxD, bestBox = null;
    // broad phase: walk grid cells along the ray (coarse)
    const seen = new Set();
    const steps = Math.ceil(maxD / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxD, i * this.cell * 0.5);
      if (t > best) break;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      const arr = this.grid.get(this.key(Math.floor(px / this.cell), Math.floor(pz / this.cell)));
      if (!arr) continue;
      for (const b of arr) {
        if (seen.has(b) || !b.solid) continue; seen.add(b);
        const tt = rayBox(o, d, b.min, b.max);
        if (tt >= 0 && tt < best) { best = tt; bestBox = b; }
      }
    }
    // terrain march
    let prevT = 0;
    const dt = 1.2;
    for (let t = dt; t < best; t += dt) {
      const y = o.y + d.y * t;
      const h = this.heightFn(o.x + d.x * t, o.z + d.z * t);
      if (y < h) {
        // refine
        let a = prevT, b2 = t;
        for (let k = 0; k < 6; k++) { const m = (a + b2) / 2; if (o.y + d.y * m < this.heightFn(o.x + d.x * m, o.z + d.z * m)) b2 = m; else a = m; }
        best = b2; bestBox = null; break;
      }
      prevT = t;
    }
    return wantBox ? { t: best, box: bestBox } : best;
  }
}
function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < min[ax] || o[ax] > max[ax]) return -1; continue; }
    let t1 = (min[ax] - o[ax]) / d[ax], t2 = (max[ax] - o[ax]) / d[ax];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
function raySphereT(o, d, c, r) {
  _v.subVectors(o, c); const b = _v.dot(d); const cc = _v.lengthSq() - r * r; const h = b * b - cc;
  if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 ? t : -1;
}

// ------------------------------------------------------------------ actors
let ACTOR_ID = 1;

export class GroundEnemy {
  constructor(gm, o) {
    this.gm = gm; this.id = ACTOR_ID++;
    this.kind = o.kind || 'soldier'; this.weapon = o.weapon || 'plasma';
    this.style = o.style || gm.level;
    const lf = LF[gm.level] || 1;
    this.pos = o.pos.clone(); this.vel = new THREE.Vector3(); this.yaw = o.yaw ?? rand(0, Math.PI * 2);
    this.patrol = o.patrol || null; this.patrolIdx = 0;
    this.state = 'idle'; this.stateT = 0; this.alertT = 0; this.lastSeen = new THREE.Vector3();
    this.alive = true; this.dead = 0; this.fireCd = rand(0.5, 1.5); this.burst = 0; this.strafe = pick([-1, 1]); this.strafeT = 0;
    this.scripted = !!o.scripted; this.tag = o.tag || null; this.noCount = !!o.noCount;
    this.knock = new THREE.Vector3();
    if (this.kind === 'gorilla') {
      this.g = buildGorilla(this.id); this.root = this.g.root; this.maxHp = 900; this.radius = 1.4; this.height = 3; this.walk = 3; this.run = 8.5; this.headY = 2.3;
    } else {
      const k = this.kind === 'executioner' ? 'executioner' : this.kind;
      const rk = this.kind === 'sniper' ? 'soldier' : k;
      this.rig = buildAlien(this.style, rk === 'executioner' ? 'brute' : rk, this.weapon); this.root = this.rig.root;
      const brute = this.kind === 'brute' || this.kind === 'executioner';
      this.maxHp = (brute ? 320 : this.kind === 'elite' ? 380 : 90) * lf;
      this.radius = brute ? 0.62 : 0.4; this.height = brute ? 2.8 : 2.0;
      this.walk = brute ? 1.5 : 2.3; this.run = brute ? 3.1 : 5.4;
      this.headY = brute ? 2.55 : 1.9;
    }
    if (o.hp) this.maxHp = o.hp;
    this.hp = this.maxHp;
    this.dmgMul = lf;
    this.st = { grounded: true, move: 0, weapon: this.weapon === 'heavy' ? 'heavy' : this.weapon === 'axe' ? 'axe' : 'plasma', aim: 0, kneel: 0, guard: true };
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    gm.scene.add(this.root);
    this.aware = 0;
  }
  get brute() { return this.kind === 'brute' || this.kind === 'executioner'; }
  headPos(v) { return v.set(this.pos.x, this.pos.y + this.headY * (this.st.kneel > 0.5 ? 0.62 : 1), this.pos.z); }
  forward(v) { return v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // returns {part:'head'|'body', t} for a ray
  rayHit(o, d, maxD) {
    if (!this.alive) return null;
    const hp = this.headPos(_v3);
    const hr = this.kind === 'gorilla' ? 0.55 : this.brute ? 0.26 : 0.19;
    const th = raySphereT(o, d, hp, hr);
    let best = null;
    if (th >= 0 && th < maxD) best = { part: 'head', t: th };
    const sc = this.kind === 'gorilla' ? 1.3 : this.brute ? 0.5 : 0.33;
    const kneelF = this.st.kneel > 0.5 ? 0.6 : 1;
    for (const f of [0.35, 0.55, 0.75]) {
      const c = _v4.set(this.pos.x, this.pos.y + this.height * f * kneelF, this.pos.z);
      const tb = raySphereT(o, d, c, sc);
      if (tb >= 0 && tb < maxD && (!best || tb < best.t - 0.05)) best = { part: best && best.part === 'head' && th <= tb ? 'head' : 'body', t: tb };
    }
    return best;
  }

  alert(pos, shout = true) {
    if (!this.alive || this.scripted) return;
    if (this.state !== 'combat') {
      this.state = 'combat'; this.stateT = 0;
      if (shout && Math.random() < 0.6) {
        if (this.kind === 'gorilla') game.audio.growl('gorilla', this.pos);
        else game.voice.bark(this.brute ? 'BRUTE' : 'ALIEN', pick(this.brute ? ALIEN_BARKS.brute : ALIEN_BARKS.alert), 0.7);
      }
      for (const e of this.gm.enemies) if (e !== this && e.alive && e.pos.distanceTo(this.pos) < 28 && e.state !== 'combat') e.alert(pos, false);
    }
    if (pos) this.lastSeen.copy(pos);
    this.alertT = 8;
  }

  damage(amount, part = 'body', dir = null, opts = {}) {
    if (!this.alive) return false;
    let dmg = amount * (part === 'head' ? (opts.headMul || 2.5) : 1);
    this.hp -= dmg;
    this.hitT = 0.25;
    if (dir) this.knock.addScaledVector(dir, opts.knock || 1.5);
    if (!opts.silent) this.alert(this.gm.hero.pos);
    this.gm.fx.blood(_v.set(this.pos.x, this.pos.y + (part === 'head' ? this.headY : this.height * 0.6), this.pos.z), dir, this.kind === 'gorilla' ? 0xff5a2a : 0x4aff9a);
    if (this.hp <= 0) { this.die(dir, opts); return true; }
    if (Math.random() < 0.25 && !opts.silent) { if (this.kind === 'gorilla') game.audio.growl('gorilla', this.pos); else game.voice.bark(this.brute ? 'BRUTE' : 'ALIEN', pick(ALIEN_BARKS.hurt), 0.3); }
    return false;
  }

  die(dir, opts = {}) {
    this.alive = false; this.dead = 0.001; this.state = 'dead';
    this.deadDir = dir && this.forward(_v).dot(dir) > 0 ? 1 : -1;
    if (opts.fling) { this.flingVel = dir.clone().multiplyScalar(opts.fling).add(new THREE.Vector3(0, opts.fling * 0.5, 0)); }
    if (!opts.silent) game.audio.deathCry(this.kind === 'gorilla' ? 'gorilla' : this.brute ? 'brute' : 'alien', this.pos);
    this.gm.onEnemyKilled(this, opts);
  }

  update(dt) {
    const gm = this.gm, hero = gm.hero;
    if (!this.alive) {
      this.dead = Math.min(1, this.dead + dt * 1.6);
      if (this.flingVel) {
        this.pos.addScaledVector(this.flingVel, dt); this.flingVel.y -= 20 * dt;
        const gy = gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
        if (this.pos.y < gy) { this.pos.y = gy; this.flingVel.multiplyScalar(0.3); if (Math.abs(this.flingVel.y) < 1) this.flingVel = null; else this.flingVel.y = Math.abs(this.flingVel.y) * 0.3; }
        this.root.rotation.x += dt * 6;
      }
      this.st.dead = this.dead; this.st.deadDir = this.deadDir;
      if (this.rig) animateRig(this.rig, this.st, dt); else animateGorilla(this.g, { dead: 1 }, dt);
      this.root.position.copy(this.pos);
      this.deadTime = (this.deadTime || 0) + dt;
      if (this.deadTime > 25 && !this.keepBody) { gm.scene.remove(this.root); this.removed = true; }
      return;
    }
    this.stateT += dt; this.hitT = Math.max(0, (this.hitT || 0) - dt);
    const toH = (this._toH || (this._toH = new THREE.Vector3())).subVectors(hero.pos, this.pos); toH.y = 0;
    const dist = toH.length();
    const lf = this.dmgMul;
    // perception
    let sees = false;
    if (hero.alive && !gm.heroHidden && !this.scripted) {
      const range = (hero.crouch && !hero.flying ? 26 : 55) * (this.state === 'combat' ? 1.6 : 1);
      if (dist < range) {
        const f = this.forward(_v2);
        const dot = dist > 0.01 ? f.dot(_v3.copy(toH).normalize()) : 1;
        const fovOk = this.state === 'combat' || dot > 0.35 || dist < 3.5;
        if (fovOk && !gm.inSmoke(this.pos, hero.pos)) {
          const eye = this.headPos(_v3).clone();
          const tgt = _v4.set(hero.pos.x, hero.pos.y + 1.4, hero.pos.z);
          const dd = _v2.subVectors(tgt, eye); const L = dd.length(); dd.normalize();
          if (gm.world.raycast(eye, dd, L) >= L - 0.3) sees = true;
        }
      }
    }
    if (sees) {
      this.aware = Math.min(1, this.aware + dt * (dist < 12 ? 3 : 1.2) * (hero.crouch ? 0.5 : 1));
      if (this.aware >= 1 || this.state === 'combat') this.alert(hero.pos);
      else if (this.state !== 'suspicious') { this.state = 'suspicious'; this.stateT = 0; }
      this.lastSeen.copy(hero.pos);
    } else this.aware = Math.max(0, this.aware - dt * 0.3);
    for (const n of gm.noises) if (n.pos.distanceTo(this.pos) < n.r && !this.scripted) this.alert(n.pos);

    let moveDir = null, speed = 0, faceTo = null, aim = 0;
    if (this.scripted) {
      // scripted actors (e.g. the executioner) only play animations driven by the mission
    } else if (this.state === 'idle') {
      if (this.patrol && this.patrol.length > 1) {
        const p = this.patrol[this.patrolIdx];
        const d = _v2.subVectors(p, this.pos); d.y = 0;
        if (d.length() < 1) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.stateT = 0; }
        else if (this.stateT > 1.5) { moveDir = d.normalize().clone(); speed = this.walk; }
      } else if (this.stateT > 4) { this.yaw += rand(-1.2, 1.2); this.stateT = 0; }
    } else if (this.state === 'suspicious') {
      faceTo = this.lastSeen;
      if (this.stateT > 6) this.state = 'idle';
    } else if (this.state === 'combat') {
      this.alertT -= dt;
      faceTo = sees ? hero.pos : this.lastSeen;
      aim = 1;
      if (!sees && this.alertT < 0) { this.state = 'search'; this.stateT = 0; if (Math.random() < 0.5) game.voice.bark('ALIEN', pick(ALIEN_BARKS.search), 0.4); }
      const pref = this.kind === 'gorilla' ? 0 : this.brute ? 5 : this.kind === 'sniper' ? 35 : this.weapon === 'scatter' ? 7 : 16;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(1.5, 3.5); this.strafe = pick([-1, 1, 0]); }
      const dirTo = _v2.copy(toH).normalize();
      if (this.kind === 'gorilla' || this.brute) {
        if (dist > 2.6) { moveDir = dirTo.clone(); speed = this.run; }
      } else if (dist > pref + 6) { moveDir = dirTo.clone(); speed = this.run; }
      else if (dist < pref - 5) { moveDir = dirTo.clone().negate(); speed = this.walk * 1.3; }
      else if (this.strafe && this.kind !== 'sniper') { moveDir = _v3.set(-dirTo.z * this.strafe, 0, dirTo.x * this.strafe).clone(); speed = this.walk * 1.4; }
      // attacks
      this.fireCd -= dt;
      if (this.kind === 'gorilla') {
        if (dist < 3.4 && this.fireCd <= 0) { this.fireCd = 1.6; this.attackT = 0.001; }
        if (dist > 8 && dist < 18 && this.fireCd <= 0 && Math.random() < dt * 1.2) { this.fireCd = 2.5; this.leapVel = dirTo.clone().multiplyScalar(dist * 1.4).add(new THREE.Vector3(0, 9, 0)); game.audio.growl('gorilla', this.pos); }
      } else if (this.brute && dist < 3.2 && this.fireCd <= 0) {
        this.fireCd = 1.8; this.attackT = 0.001; this.st.weapon = 'heavy';
      } else if (sees && this.fireCd <= 0 && this.kind !== 'executioner') {
        this.fireWeapon(hero, dist);
      }
      if (Math.random() < dt * 0.06) game.voice.bark(this.brute ? 'BRUTE' : 'ALIEN', pick(this.brute ? ALIEN_BARKS.brute : this.hp < this.maxHp * 0.3 ? ALIEN_BARKS.fear : ALIEN_BARKS.combat), 0.5);
    } else if (this.state === 'search') {
      const d = _v2.subVectors(this.lastSeen, this.pos); d.y = 0;
      if (d.length() > 2) { moveDir = d.normalize().clone(); speed = this.walk * 1.5; }
      if (this.stateT > 10) this.state = 'idle';
    }
    // melee strike frames
    if (this.attackT > 0 && !this.scripted) {
      this.attackT += dt / (this.kind === 'gorilla' ? 0.9 : 1.0);
      if (this.attackT > 0.55 && !this.attackHit) {
        this.attackHit = true;
        const r = this.kind === 'gorilla' ? 4.2 : 3.4;
        if (hero.pos.distanceTo(this.pos) < r) hero.damage((this.kind === 'gorilla' ? 34 : 28) * lf, this.pos, { knock: 9 });
        gm.fx.shockwave(_v2.set(this.pos.x, this.pos.y + 0.1, this.pos.z), 0.5, 5, 0xffb070, 0.35, UP);
        gm.fx.smokePuff(this.pos, 1.5, 1.2, 0x7a6a5a, null, 0.5);
        game.audio.land(true);
        game.engine.shake(0.6, 0.3);
      }
      if (this.attackT >= 1) { this.attackT = 0; this.attackHit = false; }
      moveDir = null;
    }
    // movement
    if (this.leapVel) {
      this.vel.copy(this.leapVel); this.leapVel = null; this.airborne = true;
    }
    if (this.airborne) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gy = gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (this.pos.y <= gy) {
        this.pos.y = gy; this.airborne = false; this.vel.set(0, 0, 0);
        if (hero.pos.distanceTo(this.pos) < 5) hero.damage(30 * lf, this.pos, { knock: 12 });
        gm.fx.shockwave(_v2.set(this.pos.x, gy + 0.1, this.pos.z), 0.5, 7, 0xffb070, 0.4, UP); game.audio.land(true); game.engine.shake(0.8, 0.3);
      }
    } else {
      const want = moveDir ? moveDir.multiplyScalar(speed) : _v2.set(0, 0, 0);
      this.vel.x = damp(this.vel.x, want.x, 8, dt); this.vel.z = damp(this.vel.z, want.z, 8, dt);
      this.pos.x += (this.vel.x + this.knock.x) * dt; this.pos.z += (this.vel.z + this.knock.z) * dt;
      this.knock.multiplyScalar(Math.exp(-dt * 5));
      gm.world.collide(this.pos, this.radius, this.height, this.vel);
      // keep away from other actors
      for (const o of gm.enemies) { if (o === this || !o.alive) continue; const d = _v3.subVectors(this.pos, o.pos); d.y = 0; const l = d.length(); const m = this.radius + o.radius; if (l < m && l > 0.001) this.pos.addScaledVector(d.normalize(), (m - l) * 0.5); }
      const gy = gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
      this.pos.y = damp(this.pos.y, gy, 20, dt);
      gm.clampToBounds(this.pos);
    }
    if (faceTo) { const d = _v2.subVectors(faceTo, this.pos); this.yaw += wrapAngle(Math.atan2(d.x, d.z) - this.yaw) * Math.min(1, dt * 6); }
    else if (moveDir && moveDir.lengthSq() > 0.01) this.yaw += wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 5);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.rig) {
      this.st.move = clamp(hs / this.walk, 0, 1.4); this.st.run = hs > this.walk * 1.3; this.st.aim = damp(this.st.aim, aim, 6, dt);
      const fwd = this.forward(_v3); this.st.back = (this.vel.x * fwd.x + this.vel.z * fwd.z) < -0.3;
      this.st.hurt = this.hitT > 0 ? this.hitT * 3 : 0;
      this.st.attack = this.attackT > 0 ? { kind: this.kind === 'executioner' ? 'axe' : 'slam', t: this.attackT } : (this.fireAnim > 0 ? null : null);
      this.st.recoil = this.fireAnim || 0; this.fireAnim = Math.max(0, (this.fireAnim || 0) - dt * 6);
      animateRig(this.rig, this.st, dt);
    } else {
      animateGorilla(this.g, { move: hs / 4, run: hs > 5, attack: this.attackT > 0 ? { t: this.attackT } : null, roar: this.state === 'combat' && this.stateT < 1 }, dt);
    }
  }

  fireWeapon(hero, dist) {
    const gm = this.gm, lf = this.dmgMul;
    const muz = this.rig.weapon.userData.muzzle ? this.rig.weapon.localToWorld(_v4.copy(this.rig.weapon.userData.muzzle)).clone() : this.headPos(new THREE.Vector3());
    const target = _v2.set(hero.pos.x, hero.pos.y + (hero.crouch ? 0.9 : 1.3), hero.pos.z);
    const lead = dist / 70;
    target.addScaledVector(hero.vel, lead * 0.6);
    let spread = (0.02 + dist * 0.0015) * (hero.flying ? 1.6 : 1) * (gm.inSmoke(this.pos, hero.pos) ? 4 : 1) / Math.sqrt(lf);
    const dir = target.sub(muz).normalize();
    const col = { 1: 0xff3a2a, 2: 0xff2ad8, 3: 0xffb02a, 4: 0xff4a2a, 5: 0xff1a3a }[this.style] || 0xff3a2a;
    if (this.weapon === 'scatter') {
      for (let i = 0; i < 6; i++) gm.fireBolt(muz, dir.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.08)).normalize(), 55, 5 * lf, col, 0.6, 'enemy');
      this.fireCd = rand(1.2, 1.8);
    } else if (this.weapon === 'heavy') {
      gm.fireBolt(muz, dir.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread)).normalize(), 38, 24 * lf, col, 1.8, 'enemy', { splash: 3 });
      this.fireCd = rand(1.8, 2.6);
    } else if (this.kind === 'sniper') {
      gm.fireBolt(muz, dir.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread * 0.4)).normalize(), 140, 26 * lf, 0xff2a2a, 0.7, 'enemy');
      this.fireCd = rand(2.5, 3.5);
    } else {
      gm.fireBolt(muz, dir.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread)).normalize(), 68, 7 * lf, col, 0.8, 'enemy');
      this.burst++;
      if (this.burst >= 3) { this.burst = 0; this.fireCd = rand(0.9, 1.6) / Math.sqrt(lf); } else this.fireCd = 0.16;
    }
    this.fireAnim = 1;
    game.audio.enemyShot(this.pos, this.weapon === 'heavy' ? 'heavy' : 'plasma');
    gm.fx.muzzle(muz, dir, col, 0.4);
  }
}

// civilians, hostages, merchants
export class NPC {
  constructor(gm, o) {
    this.gm = gm; this.id = ACTOR_ID++;
    this.look = o.look || 'kepler';
    this.rig = buildCivilian(this.look, o.seed || this.id, o.extra || {});
    this.root = this.rig.root;
    this.pos = o.pos.clone(); this.vel = new THREE.Vector3(); this.yaw = o.yaw ?? rand(0, 6.28);
    this.st = { grounded: true, move: 0, kneel: o.kneel ? 1 : 0, cheer: 0, talk: 0, panic: false };
    this.mode = o.mode || 'idle'; // idle | wander | follow | goto | panic | hostage | cheer | beam
    this.target = null; this.speed = o.speed || 1.6; this.alive = true; this.hp = 40; this.tag = o.tag || null; this.hostage = !!o.hostage;
    this.home = this.pos.clone(); this.wanderT = rand(0, 5);
    gm.scene.add(this.root);
    this.root.position.copy(this.pos);
  }
  headPos(v) { return v.set(this.pos.x, this.pos.y + 1.75 * (this.st.kneel > 0.5 ? 0.62 : 1), this.pos.z); }
  rayHit(o, d, maxD) {
    if (!this.alive) return null;
    const th = raySphereT(o, d, this.headPos(_v3), 0.2);
    if (th >= 0 && th < maxD) return { part: 'head', t: th };
    const k = this.st.kneel > 0.5 ? 0.6 : 1;
    for (const f of [0.35, 0.6]) { const tb = raySphereT(o, d, _v4.set(this.pos.x, this.pos.y + 1.8 * f * k, this.pos.z), 0.3); if (tb >= 0 && tb < maxD) return { part: 'body', t: tb }; }
    return null;
  }
  damage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.alive = false; this.st.dead = 0.01; game.audio.scream(this.pos); this.gm.onNPCKilled(this); }
  }
  update(dt) {
    const gm = this.gm;
    if (!this.alive) { this.st.dead = Math.min(1, this.st.dead + dt * 1.5); animateRig(this.rig, this.st, dt); return; }
    let want = null, spd = this.speed;
    if (this.mode === 'wander') {
      this.wanderT -= dt;
      if (!this.target || this.wanderT <= 0 || this.pos.distanceTo(this.target) < 1) { this.target = this.home.clone().add(new THREE.Vector3(rand(-10, 10), 0, rand(-10, 10))); this.wanderT = rand(4, 10); }
      want = this.target;
    } else if (this.mode === 'goto' || this.mode === 'follow') {
      want = this.mode === 'follow' ? gm.hero.pos : this.target;
      if (want && this.pos.distanceTo(want) < (this.mode === 'follow' ? 3 : 0.6)) { want = null; if (this.mode === 'goto' && this.onArrive) { const f = this.onArrive; this.onArrive = null; f(this); } }
    } else if (this.mode === 'panic') {
      spd = 4.8; this.st.panic = true;
      if (!this.target || this.pos.distanceTo(this.target) < 2) this.target = this.home.clone().add(new THREE.Vector3(rand(-40, 40), 0, rand(-40, 40)));
      want = this.target;
      if (Math.random() < dt * 0.4) game.audio.scream(this.pos);
    }
    if (this.mode === 'beam') {
      this.pos.y += dt * 3.2;
      this.yaw += dt * 1.2;
      this.st.beam = true; this.st.grounded = false;
      if (this.beamTop && this.pos.y > this.beamTop) { this.alive = false; this.gone = true; gm.scene.remove(this.root); if (this.onGone) this.onGone(this); return; }
    } else if (want) {
      const d = _v.subVectors(want, this.pos); d.y = 0;
      if (d.lengthSq() > 0.01) { d.normalize(); this.vel.x = damp(this.vel.x, d.x * spd, 6, dt); this.vel.z = damp(this.vel.z, d.z * spd, 6, dt); }
    } else { this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt); }
    if (this.mode !== 'beam') {
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      gm.world.collide(this.pos, 0.35, 1.8, this.vel);
      this.pos.y = damp(this.pos.y, gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5), 15, dt);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 0.2) this.yaw += wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 6);
      else if (this.faceHero) { const d = _v.subVectors(gm.hero.pos, this.pos); this.yaw += wrapAngle(Math.atan2(d.x, d.z) - this.yaw) * Math.min(1, dt * 4); }
      this.st.move = clamp(hs / 1.6, 0, 1.5); this.st.run = hs > 3;
    }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    animateRig(this.rig, this.st, dt);
  }
}

// static turret / artillery and hover tanks
export class Machine {
  constructor(gm, o) {
    this.gm = gm; this.id = ACTOR_ID++; this.kind = o.kind; this.pos = o.pos.clone(); this.alive = true; this.tag = o.tag || null;
    const lf = LF[gm.level] || 1;
    this.maxHp = (this.kind === 'tank' ? 650 : 420) * lf; this.hp = this.maxHp; this.lf = lf;
    this.root = new THREE.Group(); this.root.position.copy(this.pos);
    const style = { 1: [0x4a5a3a, 0xb08a4a, 0xff3a2a], 2: [0x2e2244, 0x8a5ac8, 0xff2ad8], 3: [0x16161c, 0xd4a83a, 0xffc02a], 5: [0x0c0a10, 0x5a1a2a, 0xff1a3a] }[gm.level] || [0x4a5a3a, 0xb08a4a, 0xff3a2a];
    const hull = cachedMaterial('m_hull' + gm.level, () => new THREE.MeshStandardMaterial({ color: style[0], metalness: 0.7, roughness: 0.4 }));
    const trim = cachedMaterial('m_trim' + gm.level, () => new THREE.MeshStandardMaterial({ color: style[1], metalness: 0.9, roughness: 0.3 }));
    const glow = emissive(style[2], 3);
    this.color = style[2];
    const add = (geo, mat, x, y, z, parent = this.root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    if (this.kind === 'tank') {
      add(new THREE.BoxGeometry(4.2, 1.3, 6.4), hull, 0, 1.3, 0);
      add(new THREE.BoxGeometry(3.6, 0.6, 5), trim, 0, 2.2, -0.3);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(1.0, 0.9, 6.8), hull, s * 2.4, 1.0, 0); add(new THREE.BoxGeometry(0.9, 0.15, 6.2), glow, s * 2.4, 0.5, 0); }
      this.turret = new THREE.Group(); this.turret.position.set(0, 2.6, 0.3); this.root.add(this.turret);
      add(new THREE.CylinderGeometry(1.3, 1.6, 0.9, 10), hull, 0, 0.2, 0, this.turret);
      const barrel = add(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 10), trim, 0, 0.35, 2.4, this.turret); barrel.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.25, 8, 6), glow, 0, 0.35, 4.55, this.turret);
      this.muzzle = new THREE.Vector3(0, 0.35, 4.6);
      this.path = o.path; this.pathIdx = 0; this.speed = 4.5; this.yaw = 0; this.radius = 3.2; this.height = 3.2;
      this.hoverLight = add(new THREE.PlaneGeometry(4, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: style[2], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.15, 0);
    } else {
      add(new THREE.CylinderGeometry(2.2, 2.8, 1.4, 10), hull, 0, 0.7, 0);
      this.turret = new THREE.Group(); this.turret.position.set(0, 1.6, 0); this.root.add(this.turret);
      add(new THREE.BoxGeometry(2.4, 1.4, 2.6), trim, 0, 0.3, 0, this.turret);
      this.barrel = new THREE.Group(); this.barrel.position.set(0, 0.6, 0.4); this.turret.add(this.barrel);
      const b = add(new THREE.CylinderGeometry(0.35, 0.45, 5, 10), hull, 0, 0, 2.2, this.barrel); b.rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.45, 0.08, 6, 14), glow, 0, 0, 4.6, this.barrel);
      this.barrel.rotation.x = -0.7;
      this.radius = 2.8; this.height = 3;
    }
    this.fireCd = rand(2, 4);
    gm.scene.add(this.root);
    this.colBox = null;
  }
  rayHit(o, d, maxD) { if (!this.alive) return null; const t = raySphereT(o, d, _v3.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z), this.radius); return t >= 0 && t < maxD ? { part: 'body', t } : null; }
  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.gm.fx.explosion(_v.set(this.pos.x, this.pos.y + 1.5, this.pos.z).clone(), 2.4, { grav: 12, ground: this.pos.y, rise: 2 });
      game.engine.shake(0.8, 0.5);
      this.root.traverse((m) => { if (m.isMesh && m.material && m.material.color && !m.material.userData.shared) m.material.color.multiplyScalar(0.25); });
      this.root.rotation.z = 0.15; this.root.position.y -= 0.4;
      this.burning = 8;
      this.gm.onEnemyKilled(this, {});
      return true;
    }
    return false;
  }
  update(dt) {
    const gm = this.gm, hero = gm.hero;
    if (!this.alive) { if (this.burning > 0) { this.burning -= dt; if (Math.random() < 0.5) gm.fx.smokePuff(_v.set(this.pos.x + rand(-1, 1), this.pos.y + 2, this.pos.z + rand(-1, 1)), 1.5, 2.5, 0x222222, null, 0.6, 2); if (Math.random() < 0.3) gm.fx.trail(_v.set(this.pos.x + rand(-1, 1), this.pos.y + 1.8, this.pos.z), 0xff7a2a, 1.4, 0.5); } return; }
    const toH = _v.subVectors(hero.pos, this.pos); const dist = toH.length();
    const engaged = hero.alive && !gm.heroHidden && dist < (this.kind === 'tank' ? 70 : 120);
    if (this.kind === 'tank') {
      if (this.path && this.path.length > 1) {
        const p = this.path[this.pathIdx]; const d = _v2.subVectors(p, this.pos); d.y = 0;
        if (d.length() < 3) this.pathIdx = (this.pathIdx + 1) % this.path.length;
        else { d.normalize(); this.yaw += wrapAngle(Math.atan2(d.x, d.z) - this.yaw) * Math.min(1, dt * 1.2); const sp = engaged && dist < 25 ? 1 : this.speed; this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt; }
      }
      this.pos.y = damp(this.pos.y, gm.world.heightFn(this.pos.x, this.pos.z) + 0.3 + Math.sin(gm.time * 2 + this.id) * 0.08, 6, dt);
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      if (engaged) { const ty = Math.atan2(toH.x, toH.z) - this.yaw; this.turret.rotation.y += wrapAngle(ty - this.turret.rotation.y) * Math.min(1, dt * 2); }
      this.fireCd -= dt;
      if (engaged && this.fireCd <= 0) {
        this.fireCd = rand(2.5, 3.5) / Math.sqrt(this.lf);
        this.root.updateMatrixWorld();
        const mz = this.turret.localToWorld(_v2.copy(this.muzzle)).clone();
        const tgt = _v3.set(hero.pos.x, hero.pos.y + 1, hero.pos.z).addScaledVector(hero.vel, dist / 50);
        gm.fireBolt(mz, tgt.sub(mz).normalize().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.03)).normalize(), 50, 28 * this.lf, this.color, 2.2, 'enemy', { splash: 4 });
        game.audio.enemyShot(this.pos, 'heavy');
        gm.fx.muzzle(mz, toH.clone().normalize(), this.color, 1.2);
      }
    } else {
      if (engaged) {
        const ty = Math.atan2(toH.x, toH.z); this.turret.rotation.y += wrapAngle(ty - this.turret.rotation.y) * Math.min(1, dt * 1.5);
        this.fireCd -= dt;
        if (this.fireCd <= 0) {
          this.fireCd = rand(4, 6) / Math.sqrt(this.lf);
          const target = _v2.set(hero.pos.x, gm.world.heightFn(hero.pos.x, hero.pos.z), hero.pos.z).addScaledVector(hero.vel, 1.2);
          gm.fireShell(_v3.set(this.pos.x, this.pos.y + 3, this.pos.z).clone(), target.clone(), 34 * this.lf, this.color);
          game.audio.explosion(0.6, this.pos);
          gm.fx.smokePuff(_v3.set(this.pos.x, this.pos.y + 4, this.pos.z), 2, 2, 0x555555, null, 0.6, 2);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ hero
class Hero {
  constructor(gm) {
    this.gm = gm;
    const lvl = gm.level;
    this.rig = buildHero({ pods: lvl >= 3 });
    gm.scene.add(this.rig.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.bodyYaw = 0;
    this.grounded = true; this.crouch = false; this.flying = false;
    this.maxHp = lvl >= 5 ? 600 : lvl >= 4 ? 360 : lvl >= 3 ? 280 : 200; this.hp = this.maxHp;
    this.alive = true; this.lastHit = -10; this.invuln = 0;
    this.inv = Object.assign({ fists: true, knife: true, sword: true, rifle: true, sniper: false, smoke: 0 }, gm.cfg.inventory || {});
    this.weapon = 'rifle'; this.sight = 'iron'; this.aiming = false;
    this.attack = null; this.combo = 0; this.attackCd = 0; this.gunCd = 0;
    this.sniperAmmo = gm.cfg.sniperAmmo ?? 5; this.boltCd = 0;
    this.boost = 100; this.boostLock = false; this.missiles = 2; this.missileCd = 0;
    this.canFly = lvl >= 3; this.eyeLasers = lvl >= 4; this.titan = lvl >= 5;
    this.st = { grounded: true, move: 0, weapon: 'rifle', aim: 0, guard: true };
    this.firstPerson = false;
    this.landPose = 0;
    this.stepT = 0;
    setHeroWeapon(this.rig, 'rifle');
    this.buildViewModel();
  }
  setWeapon(w) {
    if (w === 'sniper' && !this.inv.sniper) return;
    if (!this.inv[w] && w !== 'fists') return;
    if (this.weapon === w) return;
    this.weapon = w; this.attack = null;
    this.rig.hasSword = this.inv.sword; this.rig.hasKnife = this.inv.knife;
    setHeroWeapon(this.rig, w === 'fists' ? null : w);
    this.updateViewModel();
    game.audio.ui('click');
  }
  buildViewModel() {
    const vm = this.vm = new THREE.Group();
    const plate = cachedMaterial('vm_plate', () => new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.6, roughness: 0.3 }));
    const dark = cachedMaterial('vm_dark', () => new THREE.MeshStandardMaterial({ color: 0x2a323d, metalness: 0.85, roughness: 0.3 }));
    const glow = emissive(0x4ef2ff, 3);
    const arm = (s) => {
      const g = new THREE.Group();
      const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.34, 12), plate); fa.rotation.x = Math.PI / 2; g.add(fa);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.22), glow); st.position.set(0, 0.05, 0); g.add(st);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.1), dark); hand.position.set(0, 0, 0.21); g.add(hand);
      g.position.set(s * 0.2, -0.2, -0.35); g.rotation.y = Math.PI + s * 0.12;
      return g;
    };
    this.vmR = arm(-1); this.vmL = arm(1);
    this.vmL.position.set(-0.17, -0.22, -0.42);
    vm.add(this.vmR, this.vmL);
    this.vmWeapons = { rifle: buildRifle(), sniper: buildSniper(), sword: buildSword(), knife: buildKnife() };
    for (const k in this.vmWeapons) { const w = this.vmWeapons[k]; w.rotation.y = Math.PI; w.position.set(0.16, -0.17, -0.3); w.visible = false; vm.add(w); }
    this.vmWeapons.sword.rotation.set(-0.9, Math.PI, 0.3); this.vmWeapons.sword.position.set(0.22, -0.28, -0.42);
    this.vmWeapons.rifle.position.set(0.17, -0.21, -0.24); this.vmWeapons.sniper.position.set(0.17, -0.2, -0.3);
    this.vmWeapons.knife.rotation.set(-0.4, Math.PI, 0); this.vmWeapons.knife.position.set(0.2, -0.22, -0.4);
    vm.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    vm.visible = false;
    this.gm.camera.add(vm);
    this.updateViewModel();
  }
  updateViewModel() {
    for (const k in this.vmWeapons) this.vmWeapons[k].visible = k === this.weapon;
    const gun = this.weapon === 'rifle' || this.weapon === 'sniper';
    this.vmL.visible = this.weapon === 'fists' || gun;
    this.vmR.visible = true;
    if (gun) { this.vmR.position.set(0.16, -0.24, -0.25); this.vmL.position.set(0.05, -0.2, -0.55); }
    else { this.vmR.position.set(0.2, -0.2, -0.35); this.vmL.position.set(-0.2, -0.2, -0.35); }
  }

  damage(amount, fromPos = null, opts = {}) {
    if (!this.alive || this.invuln > 0 || this.gm.cinematic) return;
    this.hp -= amount;
    this.lastHit = this.gm.time;
    game.engine.damageFlash(clamp(amount / 30, 0.15, 0.8));
    game.engine.shake(clamp(amount / 15, 0.15, 1), 0.2);
    game.audio.playerHurt();
    if (fromPos) {
      const local = _v.copy(fromPos).sub(this.gm.camera.position).applyQuaternion(_q.copy(this.gm.camera.quaternion).invert());
      game.ui.damageDir(Math.atan2(local.x, -local.z) + 0);
      if (opts.knock) { const d = _v2.subVectors(this.pos, fromPos); d.y = 0; d.normalize(); this.vel.addScaledVector(d, opts.knock); this.vel.y += opts.knock * 0.3; this.grounded = false; }
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.gm.heroDied(); }
  }

  update(dt) {
    const gm = this.gm, inp = game.input, cam = gm.camera;
    if (!this.alive) { this.st.dead = Math.min(1, (this.st.dead || 0) + dt * 1.5); animateRig(this.rig, this.st, dt); this.rig.root.position.copy(this.pos); return; }
    this.invuln = Math.max(0, this.invuln - dt);
    if (gm.time - this.lastHit > 5) this.hp = Math.min(this.maxHp, this.hp + (this.titan ? 14 : 6) * dt);
    const locked = gm.cinematic || gm.inputLocked;
    // look
    if (!locked) {
      const sens = 0.0022 * game.settings.sens * (this.aiming ? (this.weapon === 'sniper' ? 0.18 : this.sight === 'reddot' ? 0.4 : 0.7) : 1);
      this.yaw -= inp.mouse.dx * sens;
      this.pitch = clamp(this.pitch - inp.mouse.dy * sens, -1.35, 1.35);
    }
    // weapon select
    if (!locked) {
      if (inp.pressed('Digit1')) this.setWeapon('fists');
      if (inp.pressed('Digit2')) { if (this.inv.knife) this.setWeapon('knife'); else game.ui.hint('You traded your knife', 1.5); }
      if (inp.pressed('Digit3')) { if (this.inv.sword) this.setWeapon('sword'); else game.ui.hint('You traded your sword', 1.5); }
      if (inp.pressed('Digit4')) this.setWeapon('rifle');
      if (inp.pressed('Digit5')) { if (this.inv.sniper) this.setWeapon('sniper'); else game.ui.hint('No sniper rifle', 1.2); }
      if (inp.mouse.wheel && !this.aiming) { const order = ['fists', 'knife', 'sword', 'rifle', 'sniper'].filter((w) => w === 'fists' || this.inv[w]); const i = order.indexOf(this.weapon); this.setWeapon(order[(i + (inp.mouse.wheel > 0 ? 1 : order.length - 1)) % order.length]); }
      if (inp.pressed('KeyV')) { this.firstPerson = !this.firstPerson; }
      if (inp.pressed('KeyZ') && this.weapon === 'rifle') { this.sight = this.sight === 'iron' ? 'reddot' : 'iron'; game.ui.toast(this.sight === 'reddot' ? 'LONG-RANGE RED DOT' : 'STANDARD SIGHT', 'Z to switch'); }
    }
    const gun = this.weapon === 'rifle' || this.weapon === 'sniper';
    this.aiming = !locked && inp.mouseDown(2) && gun;
    // crosshair magnetism while aiming / firing the rifle or the eye lasers
    if (!locked && ((this.weapon === 'rifle' && (this.aiming || inp.mouseDown(0))) || (this.eyeLasers && inp.down('KeyQ')))) {
      const t = this.assistTarget(this.aiming ? 6 : 9, 150);
      if (t) {
        const act = Math.min(1, (Math.abs(inp.mouse.dx) + Math.abs(inp.mouse.dy)) / 20);
        const k = (this.aiming ? 5 : 3.2) * dt * (1 - act * 0.75);
        const wy = Math.atan2(t.dir.x, t.dir.z), wp = Math.asin(clamp(t.dir.y, -1, 1));
        this.yaw += clamp(wrapAngle(wy - this.yaw), -1, 1) * Math.min(1, k);
        this.pitch += (wp - this.pitch) * Math.min(1, k);
      }
    }
    // movement
    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = _v2.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const mv = _v3.set(0, 0, 0);
    if (!locked) {
      if (inp.down('KeyW')) mv.add(fwd); if (inp.down('KeyS')) mv.sub(fwd);
      if (inp.down('KeyD')) mv.add(right); if (inp.down('KeyA')) mv.sub(right);
    }
    const moving = mv.lengthSq() > 0;
    if (moving) mv.normalize();
    if (!locked && inp.pressed('KeyC') && !this.flying) this.crouch = !this.crouch;
    const sprint = !locked && (inp.down('ShiftLeft') || inp.down('ShiftRight'));
    if (sprint && this.crouch) this.crouch = false;
    // flight toggle
    if (this.canFly && !locked && inp.pressed('Space') && !this.grounded && !this.flying && this.airT > 0.12) { this.flying = true; this.vel.y = Math.max(this.vel.y, 2); game.audio.whoosh(0.25, 500); gm.startJet(); }
    let boosting = false;
    if (this.flying) {
      boosting = sprint && (this.titan || (this.boost > 1 && !this.boostLock));
      if (boosting && !this.titan) { this.boost -= 25 * dt; if (this.boost <= 0) { this.boost = 0; this.boostLock = true; game.ui.hint('Boost recharging…', 1.5); } }
      const camF = _v4.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const fly = new THREE.Vector3();
      if (!locked) {
        if (inp.down('KeyW')) fly.add(camF); if (inp.down('KeyS')) fly.sub(camF);
        if (inp.down('KeyD')) fly.add(right); if (inp.down('KeyA')) fly.sub(right);
        if (inp.down('Space')) fly.y += 1; if (inp.down('KeyC')) fly.y -= 1;
      }
      if (boosting && fly.lengthSq() < 0.01) fly.copy(camF);
      if (fly.lengthSq() > 0) fly.normalize();
      const sp = boosting ? (this.titan ? 95 : 60) : 16;
      this.vel.lerp(fly.multiplyScalar(sp), 1 - Math.exp(-dt * (boosting ? 3 : 4)));
      gm.setJet(boosting ? 1 : 0.4 + this.vel.length() / 40);
      // landing
      const gy = gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
      if (this.pos.y - gy < 0.3 && this.vel.y < 0.5 && inp.down('KeyC')) { this.flying = false; gm.stopJet(); }
    } else {
      const speed = this.crouch ? 2.6 : sprint ? 9.5 : 5.2;
      const ctrl = this.grounded ? 12 : 2.5;
      this.vel.x = damp(this.vel.x, mv.x * speed, ctrl, dt);
      this.vel.z = damp(this.vel.z, mv.z * speed, ctrl, dt);
      this.vel.y -= gm.gravity * dt;
      if (this.grounded && !locked && inp.pressed('Space')) { this.vel.y = 7.2 / Math.sqrt(Math.max(0.5, gm.gravity / 20)) * 1.0; this.grounded = false; this.crouch = false; game.audio.jump(); }
    }
    if (!this.flying) this.boost = Math.min(100, this.boost + 15 * dt); else if (!boosting) this.boost = Math.min(100, this.boost + 8 * dt);
    if (this.boostLock && this.boost > 35) this.boostLock = false;
    // integrate
    this.pos.addScaledVector(this.vel, dt);
    gm.world.collide(this.pos, 0.42, this.crouch ? 1.2 : 1.85, this.vel);
    const gy = gm.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, this.flying ? 0.3 : 0.65);
    if (this.pos.y <= gy) {
      if (!this.grounded && !this.flying) {
        const impact = -this.vel.y;
        if (impact > 14) { game.audio.land(true); game.engine.shake(0.6, 0.3); gm.fx.shockwave(_v4.set(this.pos.x, gy + 0.1, this.pos.z), 0.3, 4, 0xbfe8ff, 0.35, UP); this.landPose = 1; }
        else if (impact > 3) game.audio.land(false);
      }
      this.pos.y = gy; if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true; this.airT = 0;
      if (this.flying && this.vel.y <= 0.1 && !inp.down('Space')) { /* hovering just above ground keeps flying */ this.pos.y = gy + 0.02; }
    } else { this.grounded = this.flying ? false : (this.pos.y - gy < 0.08); this.airT = (this.airT || 0) + dt; }
    if (gm.world.waterY > -1e8 && this.pos.y < gm.world.waterY - 1.2 && !this.flying) { this.vel.y = Math.max(this.vel.y, 3); }
    gm.clampToBounds(this.pos);
    this.landPose = Math.max(0, this.landPose - dt * 1.4);
    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 1.5) { this.stepT -= dt * hs; if (this.stepT <= 0) { this.stepT = 3.2; game.audio.footstep(gm.surface); } }
    // facing
    const wantYaw = (this.aiming || gun || this.attack || this.flying) ? this.yaw : (hs > 0.5 ? Math.atan2(this.vel.x, this.vel.z) : this.bodyYaw);
    this.bodyYaw += wrapAngle(wantYaw - this.bodyYaw) * Math.min(1, dt * 12);
    this.combat(dt, locked);
    // animation
    const st = this.st;
    st.grounded = this.grounded || (this.flying && this.pos.y - gy < 0.3 && this.vel.length() < 3);
    st.fly = this.flying ? 1 : 0; st.boost = boosting ? 1 : 0;
    const localV = _v4.copy(this.vel).applyAxisAngle(UP, -this.bodyYaw);
    st.flyFwd = clamp(localV.z / 30, 0, 1);
    st.move = clamp(hs / 5.2, 0, 1.4); st.run = hs > 6.5; st.crouch = this.crouch;
    st.back = localV.z < -0.5 && !this.flying;
    st.weapon = this.weapon === 'sniper' ? 'sniper' : this.weapon; st.aim = damp(st.aim || 0, this.aiming || (gun && inp.mouseDown(0)) ? 1 : gun ? 0.35 : 0, 10, dt);
    st.aimPitch = this.pitch; st.guard = true; st.landPose = this.landPose;
    st.lookPitch = gun ? 0 : this.pitch * 0.5;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.bodyYaw;
    animateRig(this.rig, st, dt);
    if (this.flying && hs + Math.abs(this.vel.y) > 2 && Math.random() < 0.7) {
      this.rig.root.updateMatrixWorld();
      for (const s of [-1, 1]) { const p = this.rig.j.chest.localToWorld(_v4.set(s * 0.1, -0.12, -0.26)); gm.fx.trail(p, boosting ? 0xffd27a : 0x4ef2ff, boosting ? 0.5 : 0.25, 0.25, _v.set(0, -3, 0)); }
    }
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const gm = this.gm, cam = gm.camera;
    const head = _v.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62), this.pos.z);
    const fp = this.firstPerson || (this.aiming && this.weapon === 'sniper');
    const camF = _v2.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    if (fp) {
      cam.position.copy(head).addScaledVector(camF, 0.12);
      this.rig.root.visible = false;
      this.vm.visible = !(this.aiming && this.weapon === 'sniper') && !gm.cinematic;
    } else {
      this.rig.root.visible = true; this.vm.visible = false;
      const right = _v3.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const back = this.aiming ? (this.sight === 'reddot' ? 1.2 : 1.7) : this.flying ? 4.2 : 3.1;
      const side = this.aiming ? 0.48 : 0.62;
      const want = _v4.copy(head).addScaledVector(right, side).addScaledVector(camF, -back).add(new THREE.Vector3(0, this.aiming ? 0.05 : 0.12, 0));
      // camera collision
      const dir = want.clone().sub(head); const L = dir.length(); dir.normalize();
      const hit = gm.world.raycast(head, dir, L + 0.3);
      const dist = Math.min(L, hit - 0.3);
      want.copy(head).addScaledVector(dir, Math.max(0.3, dist));
      cam.position.lerp(want, 1 - Math.exp(-dt * 25));
    }
    cam.lookAt(_v4.copy(cam.position).add(camF));
    let fov = game.settings.fov;
    if (this.aiming) fov = this.weapon === 'sniper' ? 7 : this.sight === 'reddot' ? 24 : 48;
    if (this.flying && this.st.boost) fov += 14;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = damp(cam.fov, fov, 14, dt); cam.updateProjectionMatrix(); }
    // sniper sway
    if (this.aiming && this.weapon === 'sniper') {
      const steady = game.input.down('ShiftLeft') ? 0.15 : 1;
      cam.rotateX(Math.sin(gm.time * 0.9) * 0.0035 * steady); cam.rotateY(Math.cos(gm.time * 0.7) * 0.0045 * steady);
    }
    // viewmodel bob / swing
    if (this.vm.visible) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const bob = Math.sin(gm.time * 9) * 0.008 * clamp(hs / 5, 0, 1.5);
      this.vm.position.set(0, bob, 0);
      const a = this.attack ? this.attack.t : 0;
      this.vm.rotation.set(this.attack ? -Math.sin(a * Math.PI) * 0.8 : 0, this.attack ? Math.sin(a * Math.PI) * (this.combo % 2 ? 0.6 : -0.6) : 0, 0);
      if (this.aiming && this.weapon === 'rifle') this.vm.position.set(-0.17, 0.045, 0.07);
    }
  }

  aimRay(o, d) { o.copy(this.gm.camera.position); d.set(0, 0, -1).applyQuaternion(this.gm.camera.quaternion); }

  combat(dt, locked) {
    const gm = this.gm, inp = game.input;
    this.gunCd -= dt; this.attackCd -= dt; this.boltCd -= dt; this.missileCd -= dt;
    if (this.missileCd <= 0 && this.missiles < 2) { this.missiles++; this.missileCd = 1.4; }
    if (this.attack) {
      this.attack.t += dt / this.attack.dur;
      if (!this.attack.hit && this.attack.t >= this.attack.hitAt) { this.attack.hit = true; this.meleeHit(this.attack); }
      if (this.attack.t >= 1) this.attack = null;
    }
    this.st.attack = this.attack ? { kind: this.attack.anim, t: this.attack.t } : null;
    if (locked) { this.stopEyes(); return; }
    // takedown prompt
    const td = this.findTakedown();
    gm.takedownTarget = td;
    if (td && inp.pressed('KeyF')) { this.doTakedown(td); return; }
    if (inp.pressed('KeyF') && !this.attack && this.attackCd <= 0) this.startMelee(true);
    const w = this.weapon;
    if (w === 'rifle') {
      if (inp.mouseDown(0) && this.gunCd <= 0) this.fireRifle();
    } else if (w === 'sniper') {
      if (inp.mousePressed(0) && this.boltCd <= 0) this.fireSniper();
    } else if (inp.mousePressed(0) || (inp.mouseDown(0) && !this.attack && this.attackCd <= 0)) {
      if (!this.attack && this.attackCd <= 0) this.startMelee(false);
    }
    // smoke grenade
    if (inp.pressed('KeyG')) {
      if (this.inv.smoke > 0) { this.inv.smoke--; this.throwSmoke(); } else { game.audio.denied(); game.ui.hint('No smoke grenades', 1.2); }
    }
    // back missiles
    if (this.gm.level >= 3 && inp.pressed('KeyR')) {
      if (this.missiles > 0) this.fireMissiles(); else game.audio.denied();
    }
    // eye lasers
    if (this.eyeLasers && inp.down('KeyQ')) this.fireEyes(dt); else this.stopEyes();
  }

  findTakedown() {
    const f = _v.set(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
    for (const e of this.gm.enemies) {
      if (!e.alive || e.kind === 'gorilla' || e.state === 'combat' || e.scripted) continue;
      const d = _v2.subVectors(e.pos, this.pos); d.y = 0; const L = d.length();
      if (L > 2.3) continue;
      const ef = e.forward(_v3);
      if (ef.dot(d.normalize()) > 0.2 && f.dot(d) > 0.3) return e;
    }
    return null;
  }
  doTakedown(e) {
    this.attack = { anim: this.inv.knife ? 'takedown' : 'cross', t: 0, dur: 0.6, hitAt: 0.4, hit: true };
    if (this.inv.knife) setHeroWeapon(this.rig, 'knife');
    this.bodyYaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    this.yaw = this.bodyYaw;
    e.damage(1e4, 'body', null, { silent: true });
    game.audio.stab(); game.audio.knife();
    this.gm.stealthKills = (this.gm.stealthKills || 0) + 1;
    game.ui.toast('SILENT TAKEDOWN', 'Nobody heard a thing');
    setTimeout(() => { if (this.weapon !== 'knife') setHeroWeapon(this.rig, this.weapon === 'fists' ? null : this.weapon); }, 700);
  }

  startMelee(quick) {
    const w = quick && (this.weapon === 'rifle' || this.weapon === 'sniper') ? 'fists' : this.weapon;
    this.combo = (this.combo + 1) % 6;
    let anim, dur, range, dmg;
    if (w === 'sword') { anim = ['slash', 'slash2', 'overhead'][this.combo % 3]; dur = 0.5; range = 3.0; dmg = 65; game.audio.swordSwing(); }
    else if (w === 'knife') { anim = 'stab'; dur = 0.32; range = 2.0; dmg = 42; game.audio.knife(); }
    else { anim = ['jab', 'cross', 'hook', 'upper', 'kick', 'round'][this.combo]; dur = anim === 'kick' || anim === 'round' ? 0.55 : 0.36; range = anim === 'kick' || anim === 'round' ? 2.4 : 1.9; dmg = anim === 'kick' || anim === 'round' || anim === 'upper' ? 34 : 24; game.audio.whoosh(0.12, 600); }
    if (this.titan) { range += 1.2; dmg *= 3; }
    if (this.flying) { range += 1.0; }
    this.attack = { anim, t: 0, dur, hitAt: 0.42, hit: false, range, dmg, w };
    this.attackCd = dur * 0.8;
    // lunge toward the nearest enemy in front
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let best = null, bd = this.flying ? 14 : 5;
    for (const e of this.gm.enemies) { if (!e.alive) continue; const d = _v2.subVectors(e.pos, this.pos); d.y = 0; const L = d.length(); if (L < bd && f.dot(d.normalize()) > 0.6) { bd = L; best = e; } }
    if (best && bd > range * 0.7) { const d = _v2.subVectors(best.pos, this.pos); d.y = this.flying ? d.y : 0; this.vel.addScaledVector(d.normalize(), Math.min(14, bd * 4)); }
  }

  meleeHit(a) {
    const gm = this.gm;
    const f = _v.set(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
    let any = false;
    const targets = [...gm.enemies, ...gm.machines];
    for (const e of targets) {
      if (!e.alive) continue;
      const d = _v2.subVectors(e.pos, this.pos); const dy = d.y; d.y = 0;
      const L = d.length();
      if (L > a.range + (e.radius || 0.4) || Math.abs(dy) > 3) continue;
      if (L > 0.5 && f.dot(d.normalize()) < 0.35) continue;
      any = true;
      if (e instanceof Machine) { e.damage(a.dmg * (this.titan ? 3 : 0.5)); continue; }
      const dir = _v3.copy(f);
      const fling = this.titan ? 26 : (a.anim === 'upper' || a.anim === 'round' || a.anim === 'kick') ? 3 : 0;
      e.damage(a.dmg, a.anim === 'upper' ? 'head' : 'body', dir.clone(), { knock: this.titan ? 18 : 4, fling: e.hp <= a.dmg ? fling : 0, headMul: 1.5 });
      if (this.titan && e.alive) { e.knock.addScaledVector(dir, 14); }
    }
    for (const n of gm.npcs) { if (!n.alive || !n.hostage) continue; const d = _v2.subVectors(n.pos, this.pos); d.y = 0; if (d.length() < a.range && f.dot(d.normalize()) > 0.35) n.damage(a.dmg); }
    if (any) {
      if (a.w === 'sword') game.audio.swordHit(); else if (a.w === 'knife') game.audio.stab(); else if (this.titan) game.audio.megaPunch(); else game.audio.punch(a.anim === 'kick' || a.anim === 'round' || a.anim === 'upper');
      game.engine.shake(this.titan ? 0.9 : 0.25, 0.15);
      game.ui.hitmarker(false);
      const p = _v4.copy(this.pos).addScaledVector(f, 1.2); p.y += 1.3;
      gm.fx.impact(p, f, a.w === 'sword' ? 0x9ff8ff : 0xffffff, a.w === 'sword' ? 1.2 : 0.8, false);
      if (this.titan) gm.fx.shockwave(p, 0.5, 6, 0xffffff, 0.3);
    }
    if (a.w === 'sword') { const p = _v4.copy(this.pos).addScaledVector(f, 1.4); p.y += 1.2; for (let i = 0; i < 6; i++) gm.fx.trail(p.clone().add(new THREE.Vector3(rand(-0.8, 0.8), rand(-0.4, 0.4), rand(-0.8, 0.8))), 0x4ef2ff, 0.3, 0.3); }
  }

  // aim assist: nearest visible hostile close to the crosshair
  assistTarget(maxDeg, maxDist = 160) {
    const gm = this.gm, cam = gm.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const cosMax = Math.cos((maxDeg * Math.PI) / 180);
    let best = null, bestC = cosMax;
    const consider = (a, point) => {
      const to = point.clone().sub(cam.position); const L = to.length(); if (L > maxDist || L < 0.5) return;
      to.divideScalar(L);
      const c = to.dot(f); if (c <= bestC) return;
      if (gm.world.raycast(cam.position, to, L) < L - 0.6) return;
      bestC = c; best = { point, actor: a, dir: to };
    };
    for (const e of gm.enemies) { if (!e.alive || e.kind === 'executioner') continue; consider(e, new THREE.Vector3(e.pos.x, e.pos.y + (e.height || 2) * (this.aiming ? 0.78 : 0.6), e.pos.z)); }
    for (const m of gm.machines) if (m.alive) consider(m, new THREE.Vector3(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z));
    return best;
  }

  shootRay(spread, maxD = 400) {
    const o = _v.copy(this.gm.camera.position);
    let d = _v2.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(spread).add(_v3.set(0, 0, -1)).normalize().applyQuaternion(this.gm.camera.quaternion);
    if (this.weapon === 'rifle' || this.weapon === 'fists' || this.eyeAssist) {
      const t = this.assistTarget(this.aiming ? 3.5 : 7, 170);
      if (t) d = _v2.copy(t.point).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread * 6)).sub(o).normalize();
    }
    // start the ray beyond the hero in third person
    const skip = this.firstPerson ? 0 : Math.max(0, _v4.subVectors(this.pos, o).dot(d) - 0.3);
    o.addScaledVector(d, skip);
    return this.gm.raycastAll(o.clone(), d.clone(), maxD, { skipHero: true });
  }

  fireRifle() {
    const gm = this.gm;
    this.gunCd = 0.062;
    const spread = this.aiming ? (this.sight === 'reddot' ? 0.002 : 0.006) : 0.03 + Math.hypot(this.vel.x, this.vel.z) * 0.004;
    const hit = this.shootRay(spread, 450);
    this.rig.root.updateMatrixWorld();
    const muz = this.vm.visible ? this.vmWeapons.rifle.localToWorld(_v4.copy(this.vmWeapons.rifle.userData.muzzle)) : this.rig.weapons.rifle.localToWorld(_v4.copy(this.rig.weapons.rifle.userData.muzzle));
    const muzzle = muz.clone();
    gm.fx.tracer(muzzle, hit.point, 0xffe0a0, 0.025, 0.06, 900);
    gm.fx.muzzle(muzzle, _v3.subVectors(hit.point, muzzle).normalize(), 0xffd27a, 0.35);
    game.audio.rifle();
    gm.noise(this.pos, 45);
    this.pitch += 0.0022 * (this.aiming ? 0.5 : 1); this.yaw += rand(-0.0012, 0.0012);
    this.st.recoil = 1;
    gm.applyShot(hit, 22, { headMul: 2.6 });
  }

  fireSniper() {
    const gm = this.gm;
    if (this.sniperAmmo <= 0) { game.audio.denied(); game.ui.hint('Out of sniper rounds', 1.5); return; }
    this.sniperAmmo--; this.boltCd = 1.15;
    const hit = this.shootRay(this.aiming ? 0.0004 : 0.04, 900);
    const muzzle = this.rig.weapons.sniper.localToWorld(_v4.copy(this.rig.weapons.sniper.userData.muzzle)).clone();
    gm.fx.tracer(this.aiming ? gm.camera.position.clone().add(new THREE.Vector3(0, -0.2, 0)) : muzzle, hit.point, 0xfff0c0, 0.04, 0.25, 1600);
    game.audio.sniper();
    game.engine.shake(0.5, 0.2);
    gm.noise(this.pos, 70);
    this.pitch += 0.03;
    gm.applyShot(hit, 260, { headMul: 4, sniper: true });
  }

  throwSmoke() {
    const gm = this.gm;
    this.attack = { anim: 'throw', t: 0, dur: 0.5, hitAt: 2, hit: true };
    const o = _v.set(this.pos.x, this.pos.y + 1.8, this.pos.z);
    const d = _v2.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch) + 0.25, Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
    gm.throwGrenade(o.clone(), d.multiplyScalar(19).add(this.vel));
    game.audio.whoosh(0.15, 500);
  }

  fireMissiles() {
    const gm = this.gm;
    const n = this.missiles; this.missiles = 0; this.missileCd = 2.2;
    const hit = this.shootRay(0, 500);
    this.rig.root.updateMatrixWorld();
    for (let i = 0; i < n; i++) {
      const from = this.rig.j.chest.localToWorld(_v4.set(i ? 0.16 : -0.16, 0.3, -0.25)).clone();
      gm.fireMissile(from, hit.actor || null, hit.point.clone());
    }
    game.audio.missileSalvo();
  }

  fireEyes(dt) {
    const gm = this.gm;
    this.eyeAssist = true;
    const hit = this.shootRay(0, 300);
    this.eyeAssist = false;
    this.rig.root.updateMatrixWorld();
    const eyes = this.rig.eyes.map((e) => this.rig.j.head.localToWorld(e.clone()));
    if (this.firstPerson) { eyes[0] = gm.camera.position.clone().add(new THREE.Vector3(0.05, -0.05, 0).applyQuaternion(gm.camera.quaternion)); eyes[1] = gm.camera.position.clone().add(new THREE.Vector3(-0.05, -0.05, 0).applyQuaternion(gm.camera.quaternion)); }
    eyes.forEach((e, i) => gm.fx.beam('heye' + i, e, hit.point, 0xff2020, 0.05));
    if (hit.actor && hit.actor.alive) {
      if (hit.actor instanceof Machine) hit.actor.damage(220 * dt);
      else if (hit.actor instanceof NPC) hit.actor.damage(200 * dt);
      else hit.actor.damage(190 * dt, hit.part, null, { headMul: 1.5 });
    }
    if (Math.random() < 0.5) gm.fx.impact(hit.point, null, 0xff3a2a, 0.6, true);
    if (!this.eyeSnd) this.eyeSnd = game.audio.loop('eyelaser');
    gm.noise(this.pos, 30);
  }
  stopEyes() { if (this.eyeSnd) { this.eyeSnd.stop(); this.eyeSnd = null; } }
}

// ------------------------------------------------------------------ ground mode
export class GroundMode {
  constructor(cfg) {
    this.cfg = cfg;
    this.level = cfg.level;
    this.mission = cfg.mission;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(game.settings.fov, window.innerWidth / window.innerHeight, 0.08, 9000);
    this.scene.add(this.camera);
    game.engine.registerCamera(this.camera);
    this.fx = new FX(this.scene, { scale: 1, max: 6000, maxSmoke: 3500, lights: 4 });
    this.world = new World();
    this.time = 0;
    this.enemies = []; this.npcs = []; this.machines = []; this.interacts = [];
    this.bolts = []; this.shells = []; this.missiles = []; this.grenades = []; this.smokes = []; this.noises = [];
    this.markers = []; this.gravity = 20; this.surface = 'rock'; this.bounds = 300;
    this.cinematic = false; this.inputLocked = false; this.heroHidden = false;
    this.killCount = 0;
    this.hero = new Hero(this);
    buildLocation(this, cfg);
    if (this.mission.setupGround) this.mission.setupGround(this, cfg);
    this.hero.pos.copy(this.spawn.pos);
    this.hero.yaw = this.spawn.yaw || 0; this.hero.bodyYaw = this.hero.yaw;
    this.hero.pos.y = this.world.groundAt(this.hero.pos.x, this.hero.pos.z, this.hero.pos.y + 50, 100);
    this.camera.position.copy(this.hero.pos).add(new THREE.Vector3(0, 2, -3));
    this.ambientSnd = this.ambienceKind ? game.audio.loop(this.ambienceKind) : null;
  }

  // ------------------------------------------------------------------ spawners
  addEnemy(o) { const e = new GroundEnemy(this, o); this.enemies.push(e); return e; }
  addNPC(o) { const n = new NPC(this, o); this.npcs.push(n); return n; }
  addMachine(o) { const m = new Machine(this, o); this.machines.push(m); return m; }
  addInteract(o) { const it = Object.assign({ radius: 2.2, hold: 0, key: 'KeyE', progress: 0, enabled: () => true }, o); this.interacts.push(it); return it; }
  removeInteract(it) { const i = this.interacts.indexOf(it); if (i >= 0) this.interacts.splice(i, 1); }
  hostiles() { return [...this.enemies.filter((e) => e.alive && !e.noCount), ...this.machines.filter((m) => m.alive)]; }

  noise(pos, r) { this.noises.push({ pos: pos.clone(), r }); }
  inSmoke(a, b) {
    for (const s of this.smokes) {
      if (s.t > s.dur) continue;
      const r = s.r * Math.min(1, s.t / 2);
      // distance from smoke center to segment ab
      const ab = _v4.subVectors(b, a); const L2 = ab.lengthSq();
      const t = L2 > 0 ? clamp(_v.subVectors(s.pos, a).dot(ab) / L2, 0, 1) : 0;
      const p = _v.copy(a).addScaledVector(ab, t);
      if (p.distanceTo(s.pos) < r) return true;
    }
    return false;
  }

  fireBolt(pos, dir, speed, dmg, color, size = 1, owner = 'enemy', opts = {}) {
    const m = buildBolt(color, 0.7 * size, 0.07 * size);
    m.position.copy(pos); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(m);
    this.bolts.push({ mesh: m, pos: m.position, prev: pos.clone(), vel: dir.clone().multiplyScalar(speed), dmg, owner, life: 4, color, splash: opts.splash || 0 });
  }
  fireShell(from, target, dmg, color) {
    const g = 18;
    const d = _v.subVectors(target, from); const hd = Math.hypot(d.x, d.z);
    const T = clamp(hd / 22, 1.6, 4);
    const vel = new THREE.Vector3(d.x / T, (d.y + 0.5 * g * T * T) / T, d.z / T);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), emissive(color, 4));
    m.position.copy(from); this.scene.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.set(target.x, target.y + 0.15, target.z); this.scene.add(ring);
    this.shells.push({ mesh: m, pos: m.position, vel, g, dmg, ring, life: T + 0.5, color });
  }
  fireMissile(from, targetActor, point) {
    const m = buildRocket(0xff6a2a); m.scale.setScalar(0.45);
    m.position.copy(from); this.scene.add(m);
    this.missiles.push({ mesh: m, pos: m.position, vel: new THREE.Vector3(rand(-2, 2), 9, rand(-2, 2)), target: targetActor, point, life: 5, speed: 10 });
  }
  throwGrenade(pos, vel) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x6a7a6a, metalness: 0.5, roughness: 0.5 }));
    m.position.copy(pos); this.scene.add(m);
    this.grenades.push({ mesh: m, pos: m.position, vel, life: 1.6 });
  }

  // ray vs world + actors
  raycastAll(o, d, maxD, opts = {}) {
    const wr = this.world.raycast(o, d, maxD, true);
    let best = { t: wr.t, actor: null, part: null, box: wr.box };
    const consider = (a) => { const h = a.rayHit(o, d, best.t); if (h && h.t < best.t) best = { t: h.t, actor: a, part: h.part }; };
    for (const e of this.enemies) if (e.alive) consider(e);
    for (const m of this.machines) if (m.alive) consider(m);
    for (const n of this.npcs) if (n.alive) consider(n);
    if (this.extraTargets) for (const x of this.extraTargets) if (x.alive) consider(x);
    best.point = o.clone().addScaledVector(d, Math.min(best.t, maxD));
    best.dir = d;
    best.hitSomething = best.t < maxD;
    return best;
  }

  applyShot(hit, dmg, opts = {}) {
    if (hit.actor) {
      const a = hit.actor;
      if (a instanceof NPC) { a.damage(dmg); this.fx.blood(hit.point, hit.dir, 0x40c8ff); return; }
      if (a.onShot) { a.onShot(hit, dmg, opts); return; }
      const killed = a.damage(dmg, hit.part, hit.dir, opts);
      game.ui.hitmarker(!!killed);
      if (a instanceof Machine) this.fx.impact(hit.point, hit.dir.clone().negate(), 0xffc070, 1, false);
    } else if (hit.hitSomething) {
      const n = hit.dir.clone().negate();
      this.fx.impact(hit.point, n, 0xffc080, 0.7, true);
      if (Math.random() < 0.4) game.audio.hit(true);
      if (hit.box && hit.box.onHit) hit.box.onHit(hit);
    }
  }

  onEnemyKilled(e, opts) {
    this.killCount++;
    if (this.mission.onGroundKill) this.mission.onGroundKill(this, e, opts);
  }
  onNPCKilled(n) {
    if (this.mission.onNPCKilled) this.mission.onNPCKilled(this, n);
  }
  heroDied() {
    this.hero.stopEyes(); this.stopJet();
    this.cinematic = true;
    game.engine.shake(1, 0.6);
    setTimeout(() => game.flow.death('NOVA HAS FALLEN', 'Klin\'Tar forces overwhelmed the living weapon.'), 2000);
  }

  clampToBounds(p) {
    if (this.boundsFn) { this.boundsFn(p); return; }
    const r = Math.hypot(p.x, p.z);
    if (r > this.bounds) { p.x *= this.bounds / r; p.z *= this.bounds / r; }
  }

  startJet() { if (!this.jetSnd) this.jetSnd = game.audio.loop('jet'); }
  setJet(l) { if (this.jetSnd) this.jetSnd.set(clamp(l, 0, 1)); }
  stopJet() { if (this.jetSnd) { this.jetSnd.stop(); this.jetSnd = null; } }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    game.engine.u.uWarp.value = 0;
    const hero = this.hero;
    hero.update(dt);
    if (!hero.flying) this.stopJet();
    for (const e of this.enemies) if (!e.removed) e.update(dt);
    for (const n of this.npcs) if (!n.gone) n.update(dt);
    for (const m of this.machines) m.update(dt);
    this.updateProjectiles(dt);
    this.noises.length = 0;
    // interactions
    this.activeInteract = null;
    if (!this.cinematic && hero.alive) {
      let best = null, bd = Infinity;
      for (const it of this.interacts) {
        if (!it.enabled()) continue;
        const d = it.pos.distanceTo(hero.pos);
        if (d < it.radius && d < bd) { bd = d; best = it; }
      }
      this.activeInteract = best;
      if (best) {
        if (best.hold > 0) {
          if (game.input.down(best.key)) { best.progress += dt / best.hold; if (best.onHolding) best.onHolding(dt); if (best.progress >= 1) { best.progress = 0; best.onDone(); } }
          else best.progress = Math.max(0, best.progress - dt * 2);
        } else if (game.input.pressed(best.key)) best.onDone();
      }
      for (const it of this.interacts) if (it !== best) it.progress = 0;
    }
    if (this.mission.updateGround) this.mission.updateGround(this, dt);
    if (this.locUpdate) this.locUpdate(dt);
    this.fx.update(dt, this.camera);
    if (this.sky) { this.sky.position.copy(this.camera.position); this.sky.material.uniforms.uTime.value = this.time; }
    if (this.sun) { this.sun.position.copy(hero.pos).addScaledVector(this.sunDir, 120); this.sun.target.position.copy(hero.pos); }
    for (const u of this.uniforms || []) u.uTime.value = this.time;
    game.audio.setListener(this.camera);
    this.updateHUD();
    if (this.sunDir) game.engine.setSunRays(_v.copy(this.camera.position).addScaledVector(this.sunDir, 3000), this.camera, 0.75, this.sun ? this.sun.color : null, 1.5);
    game.engine.render(this.scene, this.camera, dt);
  }

  updateProjectiles(dt) {
    const hero = this.hero;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.prev.copy(b.pos); b.pos.addScaledVector(b.vel, dt); b.life -= dt;
      let hit = false;
      const d = _v.subVectors(b.pos, b.prev); const L = d.length(); d.normalize();
      // hero hit
      if (b.owner === 'enemy' && hero.alive) {
        for (const f of [0.5, 1.0, 1.5]) {
          const c = _v2.set(hero.pos.x, hero.pos.y + f * (hero.crouch ? 0.7 : 1), hero.pos.z);
          if (segDist(b.prev, b.pos, c) < 0.45) { hero.damage(b.dmg, b.prev.clone()); hit = true; break; }
        }
      }
      if (!hit && this.world.raycast(b.prev, d, L) < L) hit = true;
      if (hit || b.life <= 0) {
        if (hit) { this.fx.impact(b.pos, d.clone().negate(), b.color, b.splash ? 2 : 0.6, true); if (b.splash) { this.fx.explosion(b.pos.clone(), 0.8, { grav: 10 }); if (hero.pos.distanceTo(b.pos) < b.splash) hero.damage(b.dmg * 0.5, b.pos.clone(), { knock: 6 }); } }
        this.scene.remove(b.mesh); this.bolts.splice(i, 1);
      }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.vel.y -= s.g * dt; s.pos.addScaledVector(s.vel, dt); s.life -= dt;
      s.ring.material.opacity = 0.5 + 0.5 * Math.sin(this.time * 20);
      this.fx.trail(s.pos, s.color, 0.8, 0.4);
      const gy = this.world.groundAt(s.pos.x, s.pos.z, s.pos.y + 1);
      if (s.pos.y <= gy || s.life <= 0) {
        this.fx.explosion(s.pos.clone(), 1.6, { grav: 12, ground: gy, rise: 1.5 });
        const d = hero.pos.distanceTo(s.pos);
        if (d < 4.5) hero.damage(s.dmg * (1 - d / 6), s.pos.clone(), { knock: 10 });
        if (d < 25) game.engine.shake(1.2 - d / 25, 0.4);
        this.scene.remove(s.mesh); this.scene.remove(s.ring); this.shells.splice(i, 1);
      }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt; m.speed = Math.min(70, m.speed + 80 * dt);
      const tgt = m.target && m.target.alive ? _v.set(m.target.pos.x, m.target.pos.y + (m.target.height || 2) * 0.5, m.target.pos.z) : m.point;
      const want = _v2.subVectors(tgt, m.pos).normalize().multiplyScalar(m.speed);
      m.vel.lerp(want, 1 - Math.exp(-dt * 3));
      const prev = m.pos.clone();
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v3.copy(m.vel).normalize());
      this.fx.trail(m.pos, 0xff9a4a, 0.6, 0.3); if (Math.random() < 0.6) this.fx.smokePuff(m.pos, 0.4, 1.2, 0x999999, null, 0.4);
      const L = prev.distanceTo(m.pos);
      const hitWorld = this.world.raycast(prev, _v3.copy(m.vel).normalize(), L + 0.2) < L + 0.2;
      const near = m.pos.distanceTo(tgt) < 1.2;
      if (hitWorld || near || m.life <= 0) {
        this.fx.explosion(m.pos.clone(), 1.4, { grav: 10, rise: 1 });
        for (const e of [...this.enemies, ...this.machines]) if (e.alive && e.pos.distanceTo(m.pos) < 4.5) { if (e instanceof Machine) e.damage(260); else e.damage(160, 'body', _v3.subVectors(e.pos, m.pos).normalize().clone(), { knock: 8, fling: 10 }); }
        if (this.extraTargets) for (const x of this.extraTargets) if (x.alive && x.pos.distanceTo(m.pos) < 4.5 && x.onExplosion) x.onExplosion(m.pos, 160);
        this.noise(m.pos, 60);
        this.scene.remove(m.mesh); this.missiles.splice(i, 1);
      }
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vel.y -= 18 * dt; g.pos.addScaledVector(g.vel, dt); g.life -= dt; g.mesh.rotation.x += dt * 10;
      const gy = this.world.groundAt(g.pos.x, g.pos.z, g.pos.y + 0.5);
      if (g.pos.y < gy + 0.1) { g.pos.y = gy + 0.1; g.vel.multiplyScalar(0.35); g.vel.y = Math.abs(g.vel.y) * 0.3; }
      if (g.life <= 0) {
        this.scene.remove(g.mesh); this.grenades.splice(i, 1);
        this.smokes.push({ pos: g.pos.clone(), r: 9, t: 0, dur: 16 });
        game.audio.smoke();
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t += dt;
      if (s.t < s.dur - 3) for (let k = 0; k < 3; k++) {
        const a = rand(0, Math.PI * 2), r = rand(0, s.r * Math.min(1, s.t / 2));
        this.fx.smokePuff(_v.set(s.pos.x + Math.cos(a) * r, s.pos.y + rand(0, 2), s.pos.z + Math.sin(a) * r), rand(2.5, 4.5), rand(3, 5), 0xc8ccd0, _v2.set(rand(-0.3, 0.3), rand(0.2, 0.8), rand(-0.3, 0.3)), 0.55);
      }
      if (s.t > s.dur) this.smokes.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ HUD
  updateHUD() {
    const ui = game.ui, h = this.hero;
    ui.setLevel(this.level, this.locationName || '');
    ui.setObjectives(this.mission.groundObjectives ? this.mission.groundObjectives(this) : []);
    ui.setBars({ hp: [h.hp, h.maxHp], hpLabel: 'NOVA · VITALS', boost: h.canFly ? [h.boost, 100] : null, boostLabel: h.flying ? 'FLIGHT BOOST · SHIFT' : 'FLIGHT · SPACE IN AIR', boostInf: h.titan });
    const w = h.weapon;
    const row = (id, name, key, val = '') => `<div class="wpn ${w === id ? 'active' : ''}"><span class="wname">${name}</span>${val ? `<span class="wval">${val}</span>` : ''}<span class="key">${key}</span></div>`;
    ui.setWeapons([
      row('fists', h.titan ? 'TITAN FISTS' : 'FISTS', '1'),
      h.inv.knife ? row('knife', 'COMBAT KNIFE', '2') : '',
      h.inv.sword ? row('sword', 'PLASMA SWORD', '3') : '',
      row('rifle', `PULSE RIFLE · ${h.sight === 'reddot' ? 'RED DOT' : 'IRON'}`, '4', '∞'),
      h.inv.sniper ? row('sniper', 'SNIPER RIFLE', '5', String(h.sniperAmmo)) : '',
      h.inv.smoke > 0 ? `<div class="wpn"><span class="wname">SMOKE GRENADE</span><span class="wval">${h.inv.smoke}</span><span class="key">G</span></div>` : '',
      this.level >= 3 ? `<div class="wpn"><span class="wname">BACK MISSILES</span><div class="pips">${[0, 1].map((i) => `<div class="pip ${i < h.missiles ? 'on' : ''}"></div>`).join('')}</div><span class="key">R</span></div>` : '',
      h.eyeLasers ? '<div class="wpn"><span class="wname">EYE LASERS</span><span class="key">Q</span></div>' : '',
    ].join(''));
    const gun = w === 'rifle' || w === 'sniper';
    if (h.aiming && w === 'sniper') ui.sight('scope', `ROUNDS ${h.sniperAmmo}/5<br>HOLD SHIFT · STEADY`);
    else if (h.aiming && w === 'rifle' && h.sight === 'reddot') ui.sight('reddot');
    else { ui.sight(null); ui.crosshair(this.cinematic ? 'none' : gun ? 'rifle' : 'melee'); }
    // prompts
    let pr = null;
    if (this.takedownTarget && !this.cinematic) pr = { text: 'SILENT TAKEDOWN', key: 'F' };
    else if (this.activeInteract) pr = { text: this.activeInteract.label, key: this.activeInteract.keyLabel || this.activeInteract.key.replace('Key', '') };
    if (this.promptOverride) pr = this.promptOverride;
    ui.prompt(pr ? pr.text : null, pr ? pr.key : '', pr && pr.warn);
    ui.hold(this.activeInteract && this.activeInteract.hold > 0 && this.activeInteract.progress > 0 ? this.activeInteract.progress : null);
    // markers
    const list = [];
    if (this.mission.groundMarkers) for (const m of this.mission.groundMarkers(this)) list.push(m);
    for (const e of this.enemies) if (e.alive && !e.noCount && e.state === 'combat' && e.pos.distanceTo(h.pos) < 60) list.push({ id: 'ge' + e.id, pos: _v.set(e.pos.x, e.pos.y + e.height + 0.4, e.pos.z).clone(), kind: 'enemy', color: '#ff3b4e' });
    const left = this.hostiles();
    if (left.length <= 3 && this.showRemaining) for (const e of left) list.push({ id: 'gr' + e.id, pos: _v.set(e.pos.x, e.pos.y + (e.height || 2) + 0.6, e.pos.z).clone(), kind: 'enemy', color: '#ff3b4e', edge: true, showDist: true });
    ui.setMarkers(list, this.camera);
    ui.setActions(this.mission.groundActions ? this.mission.groundActions(this) : []);
  }

  pauseLoops() { this.stopJet(); this.hero.stopEyes(); if (this.ambientSnd) { this.ambientSnd.stop(); this.ambientSnd = null; } }
  resumeLoops() { if (this.ambienceKind && !this.ambientSnd) this.ambientSnd = game.audio.loop(this.ambienceKind); }

  dispose() {
    this.pauseLoops();
    this.fx.dispose();
    if (this.envTex) this.envTex.dispose();
    this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
}

function segDist(a, b, c) {
  const ab = _v3.subVectors(b, a); const L2 = ab.lengthSq();
  const t = L2 > 0 ? clamp(_v4.subVectors(c, a).dot(ab) / L2, 0, 1) : 0;
  return _v4.copy(a).addScaledVector(ab, t).distanceTo(c);
}

export { World, rayBox };
