// Space gameplay: starship flight & combat, Nova flying in space, enemies, hazards, landing and light-speed jumps.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { clamp, damp, rand, pick } from '../core/util.js';
import { SYSTEMS, LEVEL_SYSTEM } from '../data/systems.js';
import { SpaceEnv } from '../gfx/space-env.js';
import { FX } from '../gfx/fx.js';
import { buildPlayerShip, buildEnemyFighter, buildEnemyCruiser, buildRocket, buildBolt, buildDreadnought, buildStation, emissive } from '../gfx/models-ships.js';
import { buildHero, buildAlien, buildFlyer, animateRig, animateFlyer, setHeroWeapon } from '../gfx/models-chars.js';
import { shieldMaterial, beamMaterial } from '../gfx/shaders.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DIFF = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.45, 5: 1.7 };

// closest approach of segment ab to point c; returns t in [0,1] if within r, else -1
function segSphere(a, b, c, r) {
  _v4.subVectors(b, a);
  const len2 = _v4.lengthSq();
  let t = len2 > 0 ? _v.subVectors(c, a).dot(_v4) / len2 : 0;
  t = clamp(t, 0, 1);
  _v.copy(a).addScaledVector(_v4, t);
  return _v.distanceToSquared(c) <= r * r ? t : -1;
}
function raySphere(o, d, c, r) {
  _v.subVectors(o, c);
  const b = _v.dot(d); const cc = _v.lengthSq() - r * r;
  const h = b * b - cc; if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (-b + Math.sqrt(h) >= 0 ? 0 : -1);
}

let ENEMY_ID = 1;

export class SpaceMode {
  constructor(level, mission) {
    this.level = level;
    this.mission = mission;
    this.diff = DIFF[level];
    this.sys = SYSTEMS[LEVEL_SYSTEM[level]];
    this.unlocks = mission.unlocks || {};
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(game.settings.fov, window.innerWidth / window.innerHeight, 0.3, 2.5e6);
    game.engine.registerCamera(this.camera);
    this.fx = new FX(this.scene, { scale: 8, max: 9000, maxSmoke: 3500, lights: 6 });
    this.env = new SpaceEnv(this.scene, this.sys, this.fx);
    this.time = 0;
    this.enemies = [];
    this.bullets = [];
    this.bolts = [];
    this.rockets = [];
    this.statics = [];
    this.mode = 'ship';
    this.camMode = 'third';
    this.aimQ = new THREE.Quaternion();
    this.camPos = new THREE.Vector3();
    this.fovExtra = 0;
    this.prompt = null;
    this.actions = [];
    this.markersExtra = [];
    this.musicOverride = null;
    this.lockTarget = null;
    this.aimPoint = new THREE.Vector3();
    this.aimEnemy = null;

    // player ship
    this.ship = buildPlayerShip();
    this.scene.add(this.ship.group);
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(9.5, 32, 20), shieldMaterial(0x4ef2ff));
    this.shieldMesh.scale.set(1, 0.65, 1.15); this.shieldMesh.visible = false;
    this.ship.group.add(this.shieldMesh);
    this.p = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), speed: 0, throttle: 0.35,
      hp: 200, maxHp: 200, shield: 100, shieldOn: false, shieldCd: 0, boost: 100, heat: 0, rockets: 1, charge: 0, chargeNeed: 12,
      laser: 100, laserLock: false, gunCd: 0, gunSide: 0, alive: true, invuln: 0, bank: 0, parked: false,
    };
    // Nova (space EVA)
    this.hero = null;
    this.h = null;
    this.engineSnd = game.audio.loop('engine');
    this.heatSnd = null;
    this.alarmSnd = null;
    const sp = mission.spawn ? mission.spawn(this) : { pos: new THREE.Vector3(0, 0, 20000), look: new THREE.Vector3() };
    this.p.pos.copy(sp.pos);
    _v.subVectors(sp.look, sp.pos).normalize();
    this.aimQ.setFromUnitVectors(Z, _v);
    this.p.q.copy(this.aimQ);
    this.ship.group.position.copy(this.p.pos);
    this.ship.group.quaternion.copy(this.p.q);
    this.camPos.copy(this.p.pos).add(new THREE.Vector3(0, 6, -20).applyQuaternion(this.aimQ));
    this.updateCamera(1);
    if (mission.setupSpace) mission.setupSpace(this);
    this.arriveT = 1.6;
    if (mission.startAsHero) { this.enterHeroMode(false); }
  }

  // ------------------------------------------------------------------ helpers
  controlled() { return this.mode === 'hero' || (this.mode === 'cine' && this.h && this.cineHero) ? this.h : this.p; }
  playerPos() { return (this.h && (this.mode === 'hero' || this.cineHero)) ? this.h.pos : this.p.pos; }
  playerVel() { return (this.h && (this.mode === 'hero' || this.cineHero)) ? this.h.vel : this.p.vel; }
  playerRadius() { return (this.h && this.mode === 'hero') ? 1.6 : 6; }
  aliveEnemies(filter) { return this.enemies.filter((e) => e.alive && (!filter || filter(e))); }

  // ------------------------------------------------------------------ enemies
  spawnEnemy(type, pos, opts = {}) {
    const lv = opts.style || this.level;
    const e = { id: ENEMY_ID++, type, pos: pos.clone(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), alive: true, state: 'patrol', t: rand(0, 5), fireCd: rand(0.5, 2), guard: opts.guard ? opts.guard.clone() : pos.clone(), guardR: opts.guardR || 900, engaged: !!opts.engaged, tag: opts.tag || null, hitFlash: 0 };
    e.q.setFromAxisAngle(Y, rand(0, Math.PI * 2));
    if (type === 'fighter') {
      const m = buildEnemyFighter(lv); e.model = m; e.radius = 7; e.maxHp = 100; e.speed = 170 * (0.9 + this.diff * 0.15); e.turn = 1.7 + this.diff * 0.3; e.big = false; e.score = 1;
    } else if (type === 'cruiser') {
      const m = buildEnemyCruiser(lv); e.model = m; e.radius = 44; e.maxHp = 200; e.speed = 40; e.turn = 0.25; e.big = true; e.score = 3;
    } else if (type === 'flyer') {
      const m = buildFlyer(e.id, lv >= 5 ? 0xff2a4a : 0xb02aff); e.model = { group: m.root, engines: [], fl: m }; e.radius = 8; e.maxHp = 150; e.speed = 210 * (0.9 + this.diff * 0.1); e.turn = 2.4; e.creature = true; e.score = 1;
      m.root.scale.setScalar(1.6);
    } else if (type === 'elite') {
      const rig = buildAlien(5, 'elite', 'blade'); e.model = { group: rig.root, engines: [], rig }; e.radius = 3; e.maxHp = 420; e.speed = 240; e.turn = 4; e.elite = true; e.score = 2;
      rig.root.scale.setScalar(2.2); e.st = { grounded: false, fly: 1, boost: 0.6, move: 1, weapon: 'blade', guard: true };
    } else if (type === 'dreadnought') {
      const m = buildDreadnought(opts.scale || 1.6); e.model = m; e.radius = m.radius * 0.8; e.maxHp = 5000; e.speed = 0; e.turn = 0; e.big = true; e.huge = true; e.score = 5;
      m.turrets = [];
    } else if (type === 'station') {
      const m = buildStation(e.id, opts.scale || 2.5); e.model = m; e.radius = m.radius; e.maxHp = 1e9; e.speed = 0; e.station = true; e.invulnerable = true;
    }
    e.hp = e.maxHp;
    e.model.group.position.copy(e.pos);
    e.model.group.quaternion.copy(e.q);
    this.scene.add(e.model.group);
    this.enemies.push(e);
    return e;
  }

  damageEnemy(e, amount, kind = 'bullet', from = null) {
    if (!e.alive || e.invulnerable) return false;
    let dmg = amount;
    if (e.big && !e.huge && kind === 'bullet') dmg *= 0.25;
    if (e.huge && kind !== 'comet' && kind !== 'mega') dmg *= 0.05;
    e.hp -= dmg;
    e.hitFlash = 0.08;
    e.engaged = true;
    if (e.hp <= 0) { this.killEnemy(e, kind); return true; }
    return false;
  }

  killEnemy(e, kind = '') {
    if (!e.alive) return;
    e.alive = false;
    const size = e.huge ? 30 : e.big ? 9 : e.creature ? 3.5 : e.elite ? 2.5 : 3.6;
    if (e.huge) {
      this.fx.megaExplosion(e.pos, 900);
      game.audio.megaExplosion();
      game.engine.shake(2.5, 2.5); game.engine.flash(0.6, 0xffd0a0);
    } else {
      this.fx.explosion(e.pos, size, { color: e.creature ? 0xff4ad8 : 0xff8a30 });
      if (e.big) { setTimeout(() => this.fx.explosion(e.pos.clone().add(new THREE.Vector3(rand(-20, 20), rand(-10, 10), rand(-30, 30))), 5), 250); setTimeout(() => this.fx.explosion(e.pos.clone().add(new THREE.Vector3(rand(-20, 20), rand(-10, 10), rand(-30, 30))), 6), 520); }
      const d = e.pos.distanceTo(this.camera.position);
      if (d < 600) game.engine.shake(clamp((600 - d) / 300, 0.2, 1.5), 0.5);
    }
    if (e.creature) game.audio.deathCry('creature', e.pos);
    if (e.elite) game.audio.deathCry('alien', e.pos);
    this.scene.remove(e.model.group);
    if (this.lockTarget === e) this.lockTarget = null;
    game.ui.hitmarker(true);
    if (this.mission.onEnemyKilled) this.mission.onEnemyKilled(this, e, kind);
  }

  updateEnemies(dt) {
    const tp = this.playerPos(), tv = this.playerVel();
    const pr = this.playerRadius();
    const df = this.diff;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      const g = e.model.group;
      if (e.station) { g.rotation.y += dt * 0.05; continue; }
      const toP = _v2.subVectors(tp, e.pos);
      const dist = toP.length();
      if (!e.engaged && (dist < 2600 || tp.distanceTo(e.guard) < e.guardR + 1800)) e.engaged = true;
      if (this.playerHidden) e.engaged = false;
      if (e.type === 'fighter' || e.type === 'flyer' || e.type === 'elite') {
        let desired = _v3;
        if (e.engaged && this.p.alive) {
          if (e.state === 'evade') {
            if (e.t > e.evadeUntil) e.state = 'attack';
            desired.copy(e.evadeDir);
          } else {
            e.state = 'attack';
            const lead = clamp(dist / 900, 0, 1.6);
            desired.copy(tp).addScaledVector(tv, lead * (e.elite ? 0.4 : 0.9)).sub(e.pos).normalize();
            const close = e.elite ? 10 : e.creature ? 14 : 90;
            if (dist < close + pr) {
              e.state = 'evade'; e.evadeUntil = e.t + rand(1.2, 2.4);
              e.evadeDir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().addScaledVector(toP.clone().normalize(), -0.8).normalize();
              if (e.creature || e.elite) this.meleeHit(e);
            }
            // elites dodge when aimed at
            if (e.elite && this.mode === 'hero') {
              const af = _v.set(0, 0, 1).applyQuaternion(this.aimQ);
              const toE = _v4.subVectors(e.pos, this.camera.position).normalize();
              if (af.dot(toE) > 0.995 && Math.random() < dt * 3) { e.state = 'evade'; e.evadeUntil = e.t + 0.6; e.evadeDir = new THREE.Vector3().crossVectors(af, Y).normalize().multiplyScalar(pick([-1, 1])); }
            }
          }
        } else {
          // patrol around guard point
          const a = e.t * 0.25 + e.id;
          desired.set(Math.cos(a) * e.guardR, Math.sin(a * 0.7) * 120, Math.sin(a) * e.guardR).add(e.guard).sub(e.pos).normalize();
        }
        // turn toward desired
        const fwd = _v.set(0, 0, 1).applyQuaternion(e.q);
        _q.setFromUnitVectors(Z, desired);
        e.q.rotateTowards(_q, e.turn * dt);
        let spd = e.engaged ? e.speed : e.speed * 0.45;
        if (e.state === 'attack' && dist < 400 && !e.creature && !e.elite) spd *= 0.75;
        e.vel.lerp(fwd.multiplyScalar(spd), 1 - Math.exp(-dt * 2.5));
        // separation
        for (const o of this.enemies) {
          if (o === e || !o.alive) continue;
          const d = e.pos.distanceTo(o.pos);
          const minD = e.radius + o.radius + 30;
          if (d < minD && d > 0.01) e.vel.addScaledVector(_v4.subVectors(e.pos, o.pos).normalize(), (minD - d) * 3 * dt * 60);
        }
        e.pos.addScaledVector(e.vel, dt);
        // fire
        e.fireCd -= dt;
        const facing = _v.set(0, 0, 1).applyQuaternion(e.q).dot(toP.clone().normalize());
        if (e.engaged && this.p.alive && !this.playerHidden && e.fireCd <= 0 && dist < (e.elite ? 900 : 1500) && facing > 0.96) {
          e.fireCd = (e.creature ? 1.6 : e.elite ? 1.1 : 0.55) / Math.sqrt(df) * rand(0.8, 1.3);
          const n = e.creature ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const off = e.creature ? _v.set(0, 0, 4 * 1.6) : _v.set(i ? -3 : 3, 0, 4);
            const mp = off.applyQuaternion(e.q).add(e.pos);
            const aimAt = _v4.copy(tp).addScaledVector(tv, dist / 900 * (0.5 + Math.random() * 0.5));
            aimAt.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar((e.elite ? 4 : 10) / df));
            this.fireBolt(mp, aimAt.sub(mp).normalize(), e.creature ? 0x9aff2a : e.elite ? 0xff1a4a : this.boltColor(), (e.creature ? 9 : e.elite ? 10 : 5.5) * df);
          }
          game.audio.enemyShot(e.pos, e.creature ? 'heavy' : 'plasma');
        }
        if (e.type === 'flyer') animateFlyer(e.model.fl, dt, 1);
        if (e.type === 'elite') { e.st.move = 1; e.st.boost = e.state === 'evade' ? 1 : 0.5; e.st.attack = e.meleeT > 0 ? { kind: 'slash', t: 1 - e.meleeT / 0.4 } : null; e.meleeT = Math.max(0, (e.meleeT || 0) - dt); animateRig(e.model.rig, e.st, dt); }
      } else if (e.type === 'cruiser') {
        const a = e.t * 0.03 + e.id;
        const target = _v3.set(Math.cos(a) * e.guardR, Math.sin(a) * 60, Math.sin(a) * e.guardR).add(e.guard);
        const desired = target.sub(e.pos).normalize();
        _q.setFromUnitVectors(Z, desired); e.q.rotateTowards(_q, e.turn * dt);
        e.vel.copy(_v.set(0, 0, 1).applyQuaternion(e.q)).multiplyScalar(e.speed);
        e.pos.addScaledVector(e.vel, dt);
        // turrets
        g.updateMatrixWorld();
        for (const t of e.model.turrets) {
          t.cd -= dt;
          const wp = t.base.getWorldPosition(_v4);
          const d = wp.distanceTo(tp);
          if (d < 2000 && e.engaged) {
            t.barrel.lookAt(tp);
            if (t.cd <= 0 && this.p.alive && !this.playerHidden) {
              t.cd = 1.4 / df * rand(0.8, 1.2);
              const aimAt = _v.copy(tp).addScaledVector(tv, d / 900).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(14 / df));
              this.fireBolt(wp.clone(), aimAt.sub(wp).normalize(), this.boltColor(), 8 * df, 1.6);
              game.audio.enemyShot(wp, 'heavy');
            }
          }
        }
      } else if (e.type === 'dreadnought') {
        g.rotation.y += dt * 0.004;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && dist < 5000 && !this.playerHidden && this.p.alive) {
          e.fireCd = 0.9 / df;
          const mp = e.pos.clone().add(new THREE.Vector3(rand(-120, 120), rand(20, 80), rand(-150, 150)));
          const aimAt = _v.copy(tp).addScaledVector(tv, mp.distanceTo(tp) / 900).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(30));
          this.fireBolt(mp, aimAt.sub(mp).normalize(), 0xff2a4a, 12, 2.4);
        }
      }
      g.position.copy(e.pos);
      g.quaternion.copy(e.q);
      if (e.model.engines) for (const f of e.model.engines) { f.material.uniforms.uTime.value = this.time; f.scale.z = 0.8 + Math.sin(this.time * 30 + e.id) * 0.1; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      // collisions with player
      const pd = e.pos.distanceTo(tp);
      if (pd < e.radius + pr && (this.mode === 'ship' || this.mode === 'hero')) {
        if (e.huge || e.big) { this.bouncePlayer(e.pos, e.radius + pr, 25); }
        else if (this.mode === 'ship') { this.damagePlayer(35, e.pos); this.killEnemy(e, 'ram'); }
      }
    }
  }

  meleeHit(e) {
    if (this.mode !== 'hero' && this.mode !== 'ship') return;
    const dmg = (e.elite ? 16 : 12) * this.diff;
    e.meleeT = 0.4;
    this.damagePlayer(dmg, e.pos);
    game.audio.punch(true);
    if (e.elite) game.voice.bark('ELITE', pick(['Die, human!', 'You cannot win!', 'For the Emperor!', 'Strike him down!']), 0.25);
    if (e.creature) game.audio.growl('creature', e.pos);
  }

  boltColor() { return { 1: 0xff3a2a, 2: 0xff2ad8, 3: 0xffb02a, 4: 0xff4a2a, 5: 0xff1a3a }[this.level]; }

  // ------------------------------------------------------------------ projectiles
  fireBolt(pos, dir, color, dmg, size = 1) {
    const m = buildBolt(color, 5 * size, 0.6 * size);
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(Z, dir);
    this.scene.add(m);
    this.bolts.push({ mesh: m, pos: m.position, vel: dir.clone().multiplyScalar(900), life: 3.2, dmg, color });
  }

  spawnBullet(pos, dir, speed, dmg, color = 0x4ef2ff, len = 9, width = 0.35, target = null) {
    let mesh = this._bulletPool && this._bulletPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this._bulletGeo || (this._bulletGeo = new THREE.CapsuleGeometry(1, 1, 3, 6).rotateX(Math.PI / 2)), emissive(color, 4));
    }
    mesh.material = emissive(color, 4);
    mesh.scale.set(width, width, len);
    mesh.position.copy(pos); mesh.quaternion.setFromUnitVectors(Z, dir);
    mesh.visible = true;
    this.scene.add(mesh);
    // shots fired at the auto-aim target curve onto it (only when roughly aimed at it already)
    const homing = target && target.alive && _v.subVectors(target.pos, pos).normalize().dot(dir) > 0.97 ? target : null;
    this.bullets.push({ mesh, pos: mesh.position, prev: pos.clone(), vel: dir.clone().multiplyScalar(speed).add(this.playerVel()), life: 1.6, dmg, homing });
  }

  fireRocket(from, dir, target, opts = {}) {
    const m = buildRocket(opts.color || 0xff7a2a);
    m.scale.setScalar(opts.scale || 2.4);
    m.position.copy(from); m.quaternion.setFromUnitVectors(Z, dir);
    this.scene.add(m);
    this.rockets.push({ mesh: m, pos: m.position, vel: dir.clone().multiplyScalar(opts.speed0 || 120).add(this.playerVel()), dir: dir.clone(), target, life: 7, speed: opts.speed0 || 120, maxSpeed: opts.maxSpeed || 1000, dmg: opts.dmg || 100, turn: opts.turn || 3.2 });
    game.audio.rocket();
  }

  updateProjectiles(dt) {
    const pp = this.playerPos(); const pr = this.playerRadius();
    // player bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.homing && b.homing.alive) {
        const to = _v.subVectors(b.homing.pos, b.pos);
        if (to.dot(b.vel) > 0) {
          const sp = b.vel.length();
          b.vel.lerp(to.setLength(sp), Math.min(1, dt * 6)).setLength(sp);
          b.mesh.quaternion.setFromUnitVectors(Z, _v.copy(b.vel).normalize());
        } else b.homing = null;
      }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (!e.alive || e.station) continue;
        const r = e.radius * (e.big ? 1.1 : 1.6);
        if (segSphere(b.prev, b.pos, e.pos, r) >= 0) {
          const killed = this.damageEnemy(e, b.dmg, 'bullet');
          this.fx.impact(_v.copy(b.pos), null, 0x9ff8ff, e.big ? 3 : 1.6, false);
          game.audio.hit(true);
          if (!killed) game.ui.hitmarker(false);
          if (this.mode === 'ship') this.addCharge(1);
          hit = true; break;
        }
      }
      if (!hit) {
        for (const c of this.env.comets) if (segSphere(b.prev, b.pos, c.pos, c.radius) >= 0) { this.fx.impact(b.pos, null, 0xbfe8ff, 3, true); hit = true; break; }
      }
      if (!hit && Math.random() < 0.5) { const a = this.env.asteroidHit(b.pos, 2); if (a) { this.fx.impact(b.pos, null, 0xffc080, 3); hit = true; } }
      if (hit || b.life <= 0) { this.scene.remove(b.mesh); (this._bulletPool = this._bulletPool || []).push(b.mesh); this.bullets.splice(i, 1); }
    }
    // enemy bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      _v3.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let hit = false;
      if ((this.mode === 'ship' || this.mode === 'hero') && segSphere(_v3, b.pos, pp, pr + 1.5) >= 0) {
        this.damagePlayer(b.dmg, _v3.clone());
        this.fx.impact(b.pos, null, b.color, 2.5, false);
        hit = true;
      } else if (this.mode === 'hero' && this.ship && !this.p.parkedHidden && segSphere(_v3, b.pos, this.p.pos, 6) >= 0) {
        this.fx.impact(b.pos, null, b.color, 2, false); hit = true;
      }
      if (hit || b.life <= 0) { this.scene.remove(b.mesh); this.bolts.splice(i, 1); }
    }
    // rockets / missiles
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.speed = Math.min(r.maxSpeed, r.speed + 900 * dt);
      if (r.target && r.target.alive) {
        const want = _v.subVectors(r.target.pos, r.pos).normalize();
        r.dir.lerp(want, clamp(r.turn * dt, 0, 1)).normalize();
      }
      r.vel.lerp(_v2.copy(r.dir).multiplyScalar(r.speed), 1 - Math.exp(-dt * 6));
      _v3.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.quaternion.setFromUnitVectors(Z, _v.copy(r.vel).normalize());
      this.fx.trail(_v4.copy(r.pos).addScaledVector(r.dir, -3), 0xff9a4a, 3.2, 0.35);
      if (Math.random() < 0.7) this.fx.smokePuff(_v4, 2.5, 1.6, 0x8a8a8a, null, 0.4);
      let hit = null;
      for (const e of this.enemies) {
        if (!e.alive || e.station) continue;
        if (segSphere(_v3, r.pos, e.pos, e.radius * 1.2 + 3) >= 0) { hit = e; break; }
      }
      if (hit) {
        this.fx.explosion(r.pos.clone(), hit.big ? 5 : 3.5);
        this.damageEnemy(hit, r.dmg, 'rocket');
        this.scene.remove(r.mesh); this.rockets.splice(i, 1); continue;
      }
      if (r.life <= 0 || this.env.asteroidHit(r.pos, 3)) { this.fx.explosion(r.pos.clone(), 2.5); this.scene.remove(r.mesh); this.rockets.splice(i, 1); }
    }
  }

  addCharge(n) {
    const p = this.p;
    if (p.rockets >= 4) { p.charge = 0; return; }
    p.charge += n;
    if (p.charge >= p.chargeNeed) { p.charge = 0; p.rockets++; game.audio.pickup(); }
  }

  // ------------------------------------------------------------------ player damage
  damagePlayer(amount, fromPos = null) {
    if (this.mode === 'cine' && !this.cineVulnerable) return;
    const c = this.mode === 'hero' ? this.h : this.p;
    if (!c || !c.alive || c.invuln > 0) return;
    if (this.mode === 'ship' && this.p.shieldOn) {
      this.p.shield -= amount * 0.8;
      this.shieldMesh.material.uniforms.uHit.value = 1;
      if (fromPos) this.shieldMesh.material.uniforms.uHitDir.value.copy(fromPos).sub(this.p.pos).applyQuaternion(_q.copy(this.p.q).invert());
      game.audio.shieldHit();
      if (this.p.shield <= 0) { this.p.shield = 0; this.setShield(false); }
      return;
    }
    c.hp -= amount;
    c.lastHit = this.time;
    game.engine.damageFlash(clamp(amount / 30, 0.15, 0.8));
    game.engine.shake(clamp(amount / 12, 0.2, 1.2), 0.25);
    game.audio.playerHurt();
    if (fromPos) {
      const local = _v.copy(fromPos).sub(this.camera.position).applyQuaternion(_q.copy(this.camera.quaternion).invert());
      game.ui.damageDir(Math.atan2(local.x, -local.z));
    }
    if (c.hp <= 0) {
      c.hp = 0;
      this.die(this.mode === 'hero' ? 'NOVA HAS FALLEN' : 'SHIP DESTROYED', this.mode === 'hero' ? 'Nova was overwhelmed by Klin\'Tar forces.' : 'Your starship was destroyed in combat.');
    }
  }

  die(title, sub) {
    const c = this.mode === 'hero' ? this.h : this.p;
    if (!c.alive) return;
    c.alive = false;
    this.p.alive = false;
    const pos = this.playerPos().clone();
    this.fx.explosion(pos, this.mode === 'hero' ? 3 : 6);
    if (this.mode === 'ship') { this.ship.group.visible = false; }
    if (this.mode === 'hero' && this.hero) this.hero.root.visible = false;
    game.engine.shake(2, 1);
    this.stopLoops();
    this.mode = 'dead';
    setTimeout(() => game.flow.death(title, sub), 1800);
  }

  bouncePlayer(center, minDist, dmg) {
    const c = this.mode === 'hero' ? this.h : this.p;
    const n = _v.subVectors(c.pos, center).normalize();
    c.pos.copy(center).addScaledVector(n, minDist + 0.5);
    const vn = c.vel.dot(n);
    if (vn < 0) c.vel.addScaledVector(n, -vn * 1.6);
    if (c.invuln <= 0) { this.damagePlayer(dmg, center); c.invuln = 0.7; this.fx.spark(c.pos, n, 14, 0xffc080, 40, 1, 0.5); game.audio.hit(true); }
  }

  setShield(on) {
    const p = this.p;
    if (on && p.shield < 10) { game.audio.denied(); return; }
    p.shieldOn = on;
    this.shieldMesh.visible = on;
    game.audio.shieldOn(on);
    if (!on) p.shieldCd = 1.5;
  }

  // ------------------------------------------------------------------ aim & camera
  updateAim(dt) {
    const m = game.input.mouse;
    const s = 0.0021 * game.settings.sens * (this.zoom ? 0.35 : 1);
    this.aimQ.multiply(_q.setFromAxisAngle(Y, -m.dx * s)).multiply(_q.setFromAxisAngle(X, m.dy * s));
    let roll = 0;
    if (this.mode === 'ship') roll = game.input.axis('KeyA', 'KeyD');
    if (roll) this.aimQ.multiply(_q.setFromAxisAngle(Z, roll * 1.7 * dt));
    else {
      // gentle auto-level toward the ecliptic plane
      const fwd = _v.set(0, 0, 1).applyQuaternion(this.aimQ);
      const up = _v2.set(0, 1, 0).applyQuaternion(this.aimQ);
      const wu = _v3.set(0, 1, 0).addScaledVector(fwd, -fwd.y);
      if (wu.lengthSq() > 0.09) {
        wu.normalize();
        const ang = Math.atan2(_v4.crossVectors(up, wu).dot(fwd), up.dot(wu));
        this.aimQ.multiply(_q.setFromAxisAngle(Z, ang * Math.min(1, dt * 0.9)));
      }
    }
    this.aimQ.normalize();
  }

  computeAimPoint() {
    const o = this.camera.position;
    const d = _v2.set(0, 0, 1).applyQuaternion(this.aimQ);
    let best = Infinity, bestE = null;
    for (const e of this.enemies) {
      if (!e.alive || e.station) continue;
      const t = raySphere(o, d, e.pos, e.radius * (e.big ? 1.1 : 1.8));
      if (t > 0 && t < best && t < 6000) { best = t; bestE = e; }
    }
    this.aimEnemy = bestE;
    this.aimPoint.copy(o).addScaledVector(d, bestE ? best : 1500);
    // aim assist: the enemy nearest the crosshair inside a wide cone; the current target is sticky
    // until it leaves an even wider cone, so the lock does not hop between ships
    const maxR = this.mode === 'hero' ? 3000 : 4200;
    let aBest = -Infinity, aE = null;
    for (const e of this.enemies) {
      if (!e.alive || e.station) continue;
      const toE = _v.subVectors(e.pos, o); const dist = toE.length(); if (dist > maxR * (e.huge ? 2 : 1)) continue;
      const c = toE.multiplyScalar(1 / dist).dot(d) + (e === this.assist ? 0.035 : 0);
      if (c < 0.962) continue; // ~16° (22° to keep a lock)
      const score = c - (dist / maxR) * 0.012;
      if (score > aBest) { aBest = score; aE = e; }
    }
    this.assist = aE;
    if (aE) {
      // predictive lead point (two iterations of the intercept time)
      const speed = this.mode === 'hero' ? 1900 : 2400;
      const rel = _v4.subVectors(aE.vel, this.playerVel());
      let t = aE.pos.distanceTo(this.playerPos()) / speed;
      this.aimPoint.copy(aE.pos).addScaledVector(rel, t);
      t = this.aimPoint.distanceTo(this.playerPos()) / speed;
      this.aimPoint.copy(aE.pos).addScaledVector(rel, t);
      if (!this.aimEnemy) this.aimEnemy = aE;
    }
    // rocket lock: the assisted target, otherwise the closest to the crosshair in a wider cone
    let lock = aE;
    if (!lock) {
      let lockBest = 0.94;
      for (const e of this.enemies) {
        if (!e.alive || e.station) continue;
        const toE = _v.subVectors(e.pos, o);
        const dist = toE.length(); if (dist > 5000) continue;
        const c = toE.normalize().dot(d);
        if (c > lockBest) { lockBest = c; lock = e; }
      }
    }
    this.lockTarget = lock;
  }

  // pulls the crosshair onto the assisted target: a firm lock while firing, a soft pull otherwise;
  // moving the mouse weakens it so the player can always break away
  applyAimAssist(dt) {
    const e = this.assist;
    if (!e || !e.alive || (this.mode !== 'ship' && this.mode !== 'hero')) return;
    const m = game.input.mouse;
    const mouseActivity = Math.min(1, (Math.abs(m.dx) + Math.abs(m.dy)) / 30);
    const firing = game.input.mouseDown(0) || game.input.mouseDown(2) || game.input.down('KeyF') || game.input.down('KeyQ');
    const rate = (firing ? 9 : 3.5) * (1 - mouseActivity * 0.6);
    const want = _v3.subVectors(this.aimPoint, this.camera.position).normalize();
    // keep the current roll: rotate only the forward axis
    const fwd = _v2.set(0, 0, 1).applyQuaternion(this.aimQ);
    const ang = fwd.angleTo(want);
    if (ang < 1e-4) return;
    const axis = _v4.crossVectors(fwd, want).normalize();
    _q.setFromAxisAngle(axis, ang * (1 - Math.exp(-rate * dt)));
    this.aimQ.premultiply(_q).normalize();
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.camOverride) return;
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.aimQ);
    const up = _v2.set(0, 1, 0).applyQuaternion(this.aimQ);
    let target, back, height, side = 0;
    if ((this.mode === 'hero' || this.cineHero) && this.h) {
      target = this.h.pos; back = this.camMode === 'first' ? -0.2 : 6.5; height = this.camMode === 'first' ? 1.65 : 1.6; side = this.camMode === 'first' ? 0 : 1.1;
    } else {
      target = this.p.pos; back = this.camMode === 'first' ? -1.2 : 21; height = this.camMode === 'first' ? 0.9 : 6.2;
    }
    const right = _v3.crossVectors(fwd, up).normalize();
    const want = _v4.copy(target).addScaledVector(fwd, -back).addScaledVector(up, height).addScaledVector(right, side);
    const k = this.camMode === 'first' ? 1 : 1 - Math.exp(-dt * 14);
    this.camPos.lerp(want, k);
    if (this.camMode === 'first') this.camPos.copy(want);
    cam.position.copy(this.camPos);
    cam.up.copy(up);
    cam.lookAt(_v4.copy(cam.position).addScaledVector(fwd, 100));
    const fov = (this.zoom ? this.zoomFov || 30 : game.settings.fov) + this.fovExtra;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 6, dt); cam.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    this.time += dt;
    if (this.arriveT > 0) {
      this.arriveT -= dt;
      game.engine.u.uWarp.value = Math.max(0, this.arriveT / 1.6);
      this.fovExtra = Math.max(0, this.arriveT / 1.6) * 40;
    }
    if (this.mode === 'ship' || this.mode === 'hero' || this.mode === 'target') this.updateAim(dt);
    if (this.mode !== 'dead' && this.mode !== 'cine') { this.computeAimPoint(); this.applyAimAssist(dt); }
    if (this.mode === 'ship') this.updateShip(dt);
    else if (this.mode === 'hero') this.updateHero(dt);
    else if (this.mode === 'target') this.updateTargeting(dt);
    else if (this.mode === 'cine' && this.cineFn) { if (this.cineFn(dt)) { this.cineFn = null; } }
    if (this.mode === 'hero' || this.mode === 'cine' || this.mode === 'target' || this.mode === 'dead') this.updateParkedShip(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateComets(dt);
    if (this.mission.updateSpace) this.mission.updateSpace(this, dt);
    this.updateCamera(dt);
    this.env.update(dt, this.camera);
    this.fx.update(dt, this.camera);
    this.shieldMesh.material.uniforms.uTime.value = this.time;
    this.shieldMesh.material.uniforms.uHit.value = damp(this.shieldMesh.material.uniforms.uHit.value, 0, 5, dt);
    game.audio.setListener(this.camera);
    this.updateMusic();
    this.updateHUD();
    this.updateDust(dt);
    const st = this.env.star;
    if (st) game.engine.setSunRays(st.pos, this.camera, this.env.blackHole ? 0.5 : 0.8, st.color, 1.6); else game.engine.setSunRays(null);
    game.engine.render(this.scene, this.camera, dt);
  }

  // drifting space dust that streaks with your velocity (sense of speed)
  updateDust(dt) {
    const N = 900, R = 140;
    if (!this.dust) {
      const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
      this.dustP = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        this.dustP.set([rand(-R, R), rand(-R, R), rand(-R, R)], i * 3);
        const b = rand(0.25, 0.7); col.set([b * 0.7, b * 0.85, b, 0, 0, 0], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.dust = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
    }
    const cam = this.camera.position, v = this.playerVel();
    const speed = v.length();
    const L = Math.min(18, speed * 0.025) + 0.3;
    const dir = speed > 1 ? _v.copy(v).normalize() : _v.set(0, 0, 1);
    const pos = this.dust.geometry.attributes.position.array, P = this.dustP;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      let x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      // wrap the dust box around the camera
      x = ((x - cam.x + R) % (2 * R) + 2 * R) % (2 * R) - R + cam.x;
      y = ((y - cam.y + R) % (2 * R) + 2 * R) % (2 * R) - R + cam.y;
      z = ((z - cam.z + R) % (2 * R) + 2 * R) % (2 * R) - R + cam.z;
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z;
      const i6 = i * 6;
      pos[i6] = x; pos[i6 + 1] = y; pos[i6 + 2] = z;
      pos[i6 + 3] = x - dir.x * L; pos[i6 + 4] = y - dir.y * L; pos[i6 + 5] = z - dir.z * L;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.material.opacity = Math.min(0.55, 0.12 + speed / 900);
  }

  updateMusic() {
    if (this.musicOverride) { game.audio.setMusic(this.musicOverride); return; }
    const pp = this.playerPos();
    let combat = false;
    for (const e of this.enemies) if (e.alive && e.engaged && !e.station && e.pos.distanceTo(pp) < 2600) { combat = true; break; }
    game.audio.setMusic(combat ? 'combat' : (this.level === 4 ? 'blackhole' : 'space'));
  }

  // ------------------------------------------------------------------ ship
  updateShip(dt) {
    const p = this.p, inp = game.input;
    if (!p.alive) return;
    if (inp.down('KeyW')) p.throttle = Math.min(1, p.throttle + dt * 0.9);
    if (inp.down('KeyS')) p.throttle = Math.max(-0.25, p.throttle - dt * 1.1);
    const boosting = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const canBoost = boosting && p.boost > 1;
    if (canBoost) { p.boost -= 20 * dt; if (p.throttle < 0.6) p.throttle = 0.6; } else p.boost = Math.min(100, p.boost + 11 * dt);
    const maxSpeed = 240;
    const targetSpeed = p.throttle * maxSpeed * (canBoost ? 3.4 : 1);
    p.speed = damp(p.speed, targetSpeed, canBoost ? 2.2 : 1.4, dt);
    // rotate ship toward aim
    const before = _v.set(0, 0, 1).applyQuaternion(p.q).clone();
    p.q.rotateTowards(this.aimQ, 2.6 * dt);
    const fwd = _v2.set(0, 0, 1).applyQuaternion(p.q);
    const yawRate = _v3.crossVectors(before, fwd).dot(_v4.set(0, 1, 0).applyQuaternion(p.q)) / Math.max(dt, 1e-4);
    p.bank = damp(p.bank, clamp(-yawRate * 0.6, -0.8, 0.8), 4, dt);
    p.vel.lerp(_v3.copy(fwd).multiplyScalar(p.speed), 1 - Math.exp(-dt * 2.4));
    this.applyGravity(p, dt);
    p.pos.addScaledVector(p.vel, dt);
    p.invuln = Math.max(0, p.invuln - dt);
    // hull self-repair after 4 s without taking damage (full repair in ~25 s)
    if (this.time - (p.lastHit ?? -99) > 4) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.04 * dt);
    // visuals
    this.ship.group.position.copy(p.pos);
    this.ship.group.quaternion.copy(p.q).multiply(_q.setFromAxisAngle(Z, p.bank));
    const thr = clamp(p.speed / maxSpeed, 0, 3.4);
    for (const f of this.ship.engines) { f.material.uniforms.uTime.value = this.time; f.scale.set(1, 1, 0.3 + thr * 0.55 + (canBoost ? 0.6 : 0)); f.material.uniforms.uPower.value = 0.6 + thr * 0.3; }
    this.ship.group.traverse((o) => { if (o.userData.blink) o.visible = Math.sin(this.time * 6) > 0; });
    if (!this.engineSnd || this.engineSnd.stopped) this.engineSnd = game.audio.loop('engine');
    this.engineSnd.set(clamp(thr, 0, 1), canBoost ? 1 : 0);
    this.fovExtra = damp(this.fovExtra, canBoost ? 14 : thr * 4, 3, dt);
    if (canBoost) { game.engine.shake(0.15, 0.1); if (Math.random() < 0.5) this.fx.trail(_v4.copy(p.pos).addScaledVector(fwd, -8), 0x4ef2ff, 2.2, 0.5); }
    // weapons
    p.gunCd -= dt;
    if (inp.mouseDown(0) && p.gunCd <= 0) {
      p.gunCd = 1 / 16; p.gunSide ^= 1;
      const mz = _v3.copy(this.ship.muzzles[p.gunSide]).applyQuaternion(p.q).add(p.pos);
      const dir = _v4.subVectors(this.aimPoint, mz).normalize();
      if (dir.dot(fwd) < 0.94) dir.copy(fwd);
      dir.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.006)).normalize();
      this.spawnBullet(mz, dir, 2400, 5, 0x4ef2ff, 9, 0.35, this.assist);
      this.fx.muzzle(mz, dir, 0x4ef2ff, 1.5);
      game.audio.shipGun();
    }
    if (inp.mousePressed(2)) {
      if (p.rockets > 0) {
        p.rockets--;
        const side = (p.rocketSide = (p.rocketSide || 0) ^ 1) ? 1 : -1;
        const from = _v3.set(side * 3.2, -1.2, 0).applyQuaternion(p.q).add(p.pos);
        this.fireRocket(from.clone(), _v4.subVectors(this.aimPoint, from).normalize(), this.lockTarget);
      } else { game.audio.denied(); game.ui.hint('Rocket not charged — keep hitting enemies with cannons', 2); }
    }
    // laser (level 3+)
    if (this.unlocks.laser) {
      const firing = inp.down('KeyF') && !p.laserLock && p.laser > 0;
      if (firing) {
        p.laser -= 13 * dt;
        if (p.laser <= 0) { p.laser = 0; p.laserLock = true; }
        const from = _v3.set(0, -0.3, 6.6).applyQuaternion(p.q).add(p.pos);
        let to = _v4.copy(from).addScaledVector(fwd, 2600);
        const o = from.clone();
        let best = 2600, hitE = null;
        for (const e of this.enemies) { if (!e.alive || e.station) continue; const t = raySphere(o, fwd, e.pos, e.radius * (e.big ? 1.05 : 1.4)); if (t > 0 && t < best) { best = t; hitE = e; } }
        if (hitE) {
          to = o.clone().addScaledVector(fwd, best);
          const rate = hitE.huge ? hitE.maxHp / 40 : hitE.big ? hitE.maxHp / 5 : hitE.maxHp / 3;
          if (hitE.big) hitE.hp -= rate * dt; else hitE.hp -= rate * dt;
          hitE.engaged = true; hitE.hitFlash = 0.05;
          if (hitE.hp <= 0) this.killEnemy(hitE, 'laser');
        }
        this.fx.beam('shiplaser', from, to, 0xff2a4a, 0.9);
        if (!this.laserSnd) this.laserSnd = game.audio.loop('laser');
      } else {
        if (this.laserSnd) { this.laserSnd.stop(); this.laserSnd = null; }
        p.laser = Math.min(100, p.laser + 11 * dt);
        if (p.laserLock && p.laser > 35) p.laserLock = false;
      }
    }
    // shield (level 2+)
    if (this.unlocks.shield) {
      if (inp.pressed('KeyQ')) this.setShield(!p.shieldOn);
      if (p.shieldOn) { p.shield -= 5 * dt; if (p.shield <= 0) { p.shield = 0; this.setShield(false); } }
      else { p.shieldCd -= dt; if (p.shieldCd <= 0) p.shield = Math.min(100, p.shield + 6 * dt); }
    }
    if (inp.pressed('KeyV')) this.camMode = this.camMode === 'first' ? 'third' : 'first';
    if (this.unlocks.eject && inp.pressed('KeyX') && !this.mission.noEject) this.enterHeroMode(true);
    this.environmentHazards(p, 6, dt);
    this.updateLanding();
  }

  updateParkedShip(dt) {
    const p = this.p;
    if (!this.ship.group.visible) return;
    if (this.mode === 'cine' && this.cineShip) return;
    p.vel.multiplyScalar(Math.exp(-dt * 0.8));
    p.pos.addScaledVector(p.vel, dt);
    this.ship.group.position.copy(p.pos);
    for (const f of this.ship.engines) { f.material.uniforms.uTime.value = this.time; f.scale.z = 0.25; }
  }

  // ------------------------------------------------------------------ hazards
  applyGravity(c, dt) {
    const B = this.env.blackHole;
    if (!B) return;
    const toB = _v.subVectors(B.pos, c.pos);
    const d = toB.length();
    // the well drags you in directly: normal flight cannot escape close to the horizon, a boost can
    const pull = clamp(2.4e8 / (d * d), 0, 330) * (this.gravityScale ?? 1);
    c.pos.addScaledVector(toB.normalize(), pull * dt);
    if (pull > 60 && Math.random() < 0.3) this.fx.trail(_v2.copy(c.pos).addScaledVector(toB, 8), 0xffb070, 1.5, 0.4, toB.clone().multiplyScalar(pull));
    this.bhDanger = clamp((1 - (d - B.horizon) / 5200) * 100, 0, 100);
    if (d < B.horizon * 1.35) this.die(this.mode === 'hero' ? 'CONSUMED' : 'SHIP LOST', 'Pulled beyond the event horizon of Cygnus X-1.');
  }

  environmentHazards(c, radius, dt) {
    // planets
    for (const b of this.env.bodies) {
      if (!b.mesh || b.isStar) continue;
      const d = c.pos.distanceTo(b.pos);
      if (d < b.radius + radius) this.bouncePlayer(b.pos, b.radius + radius, 20);
    }
    // asteroids
    const a = this.env.asteroidHit(c.pos, radius);
    if (a) {
      const dmg = clamp(8 + c.vel.length() * 0.06, 8, 40);
      this.bouncePlayer(a.pos, a.radius + radius, dmg);
      game.engine.shake(1, 0.4);
    }
    // comets
    for (const cm of this.env.comets) if (!cm.ridden && c.pos.distanceTo(cm.pos) < cm.radius + radius) this.bouncePlayer(cm.pos, cm.radius + radius, 30);
    // star heat
    const st = this.env.star;
    if (st) {
      const d = c.pos.distanceTo(st.pos);
      if (d < st.radius + radius) { c.heat = 100; }
      if (d < st.heatRadius) {
        const k = 1 - (d - st.radius) / (st.heatRadius - st.radius);
        c.heat = Math.min(100, c.heat + (4 + k * k * 55) * dt);
      } else c.heat = Math.max(0, c.heat - 9 * dt);
      game.engine.u.uHeat.value = damp(game.engine.u.uHeat.value, c.heat / 100, 3, dt);
      if (c.heat > 30) {
        if (!this.heatSnd) { this.heatSnd = game.audio.loop('heat'); game.voice.say('AI', 'Warning. Hull temperature critical. Pull away from the star.', { interrupt: false }); }
        this.heatSnd.set(2 + (c.heat / 100) * 10);
      } else if (this.heatSnd) { this.heatSnd.stop(); this.heatSnd = null; }
      if (c.heat >= 100) {
        if (this.heatSnd) { this.heatSnd.stop(); this.heatSnd = null; }
        game.engine.u.uHeat.value = 0;
        this.die(this.mode === 'hero' ? 'SUIT MELTDOWN' : 'SHIP OVERHEATED', `The heat of ${st.name} tore the ${this.mode === 'hero' ? 'suit' : 'hull'} apart.`);
      }
    }
    // system boundary
    const R = (this.sys.scale ? this.sys.scale.outer : 20000) * 1.6 + 8000;
    if (c.pos.length() > R) {
      c.vel.addScaledVector(_v.copy(c.pos).normalize(), -400 * dt);
      game.ui.hint('Leaving the system — turn back', 1.2);
    }
  }

  // ------------------------------------------------------------------ landing
  nearestBody() {
    const pp = this.playerPos();
    let best = null, bd = Infinity;
    for (const b of this.env.bodies) {
      if (!b.mesh || b.isStar) continue;
      const d = pp.distanceTo(b.pos) - b.radius;
      if (d < bd) { bd = d; best = b; }
    }
    return { body: best, dist: bd };
  }

  updateLanding() {
    if (this.mission.blockLanding) { this.prompt = null; return; }
    const { body, dist } = this.nearestBody();
    this.prompt = null;
    if (!body || dist > body.radius * 0.9 + 500) return;
    if (body.def && body.def.noLanding) { this.prompt = { text: 'EARTH — LANDING DISABLED · DEFEND THE HOMEWORLD', key: '', warn: true }; return; }
    const allowed = this.mission.canLand ? this.mission.canLand(this, body) : { ok: true };
    if (!allowed.ok) { this.prompt = { text: allowed.reason, key: '', warn: true }; return; }
    this.prompt = { text: `LAND ON ${body.name}`, key: 'E' };
    if (game.input.pressed('KeyE')) this.beginLanding(body, 'ship');
  }

  beginLanding(body, how = 'ship') {
    this.mode = 'cine';
    this.cineShip = how === 'ship';
    this.cineHero = how === 'drop';
    const c = how === 'ship' ? this.p : this.h;
    const startPos = c.pos.clone();
    const dir = _v.subVectors(body.pos, startPos).normalize().clone();
    let t = 0;
    game.audio.setMusic(null);
    const rumble = game.audio.loop('rumble');
    game.ui.hint(`Entering the atmosphere of ${body.name}…`, 3);
    this.cineFn = (dt) => {
      t += dt;
      const sp = 120 + t * 260;
      c.pos.addScaledVector(dir, sp * dt);
      _q.setFromUnitVectors(Z, dir);
      this.aimQ.slerp(_q, dt * 2);
      if (how === 'ship') { this.p.q.slerp(_q, dt * 3); this.ship.group.position.copy(c.pos); this.ship.group.quaternion.copy(this.p.q); }
      else this.updateHeroModel(dt, true);
      const k = Math.min(1, t / 2.5);
      for (let i = 0; i < 6; i++) this.fx.trail(_v2.copy(c.pos).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(how === 'ship' ? 6 : 2)).addScaledVector(dir, how === 'ship' ? 7 : 2), pick([0xff7a2a, 0xffb04a, 0xff4a1a]), (how === 'ship' ? 6 : 2.5) * (0.5 + k), 0.4, _v3.copy(dir).multiplyScalar(-sp * 0.6), 2.2);
      game.engine.shake(0.4 + k, 0.1);
      game.engine.u.uHeat.value = k * 0.6;
      rumble.set(0.4 + k);
      if (t > 2.6 && !this._landFade) { this._landFade = true; game.ui.fadeTo(1, 0.6).then(() => { rumble.stop(); game.engine.u.uHeat.value = 0; this._landFade = false; game.flow.enterGround(body, how); }); }
      return false;
    };
  }

  // called when the player returns to orbit
  resumeFromGround(body, how = 'ship') {
    const out = body ? _v.subVectors(this.p.pos, body.pos).normalize() : _v.set(0, 0, 1).applyQuaternion(this.p.q);
    if (!isFinite(out.x) || out.lengthSq() < 0.5) out.set(0, 1, 0);
    if (body) this.p.pos.copy(body.pos).addScaledVector(out, body.radius + Math.max(300, body.radius * 0.6));
    this.p.vel.copy(out).multiplyScalar(120);
    this.camOverride = false;
    this.p.speed = 120; this.p.throttle = 0.4;
    this.aimQ.setFromUnitVectors(Z, out);
    this.p.q.copy(this.aimQ);
    this.ship.group.visible = true;
    this.ship.group.position.copy(this.p.pos);
    this.p.alive = true;
    if (this.hero) this.hero.root.visible = false;
    this.mode = 'ship';
    this.cineShip = false; this.cineHero = false; this.cineFn = null; this.zoom = false;
    this.p.parkedHidden = false;
    this.camPos.copy(this.p.pos).add(new THREE.Vector3(0, 6, -20).applyQuaternion(this.aimQ));
    if (!this.engineSnd || this.engineSnd.stopped) this.engineSnd = game.audio.loop('engine');
  }

  // ------------------------------------------------------------------ Nova in space
  ensureHero() {
    if (this.hero) return;
    this.hero = buildHero({ pods: this.level >= 3 });
    setHeroWeapon(this.hero, 'rifle');
    this.scene.add(this.hero.root);
    const maxHp = this.level >= 5 ? 520 : this.level >= 4 ? 340 : 240;
    this.h = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), hp: maxHp, maxHp, boost: 100, heat: 0, missileCd: 0, missiles: 2, alive: true, invuln: 0, lastHit: -10, gunCd: 0, st: { grounded: false, fly: 1, move: 0, boost: 0, weapon: 'rifle', aim: 1, guard: true }, punchT: 0, punchCd: 0, leap: null, riding: null, onShip: null };
  }

  enterHeroMode(fromShip = true) {
    if (this.mode === 'hero') return;
    this.ensureHero();
    const h = this.h;
    if (fromShip) {
      h.pos.copy(this.p.pos).add(_v.set(0, 5, 0).applyQuaternion(this.p.q));
      h.vel.copy(this.p.vel).add(_v.set(0, 25, 0).applyQuaternion(this.p.q));
      this.p.throttle = 0; this.p.speed *= 0.5;
      game.audio.teleport();
      game.ui.toast('EVA MODE', 'Nova is flying free · E near the ship to board');
      if (this.p.shieldOn) this.setShield(false);
    } else {
      h.pos.copy(this.p.pos); h.vel.copy(this.p.vel);
      this.ship.group.visible = false;
      this.p.parkedHidden = true;
    }
    h.alive = true;
    this.hero.root.visible = true;
    this.mode = 'hero';
    if (this.laserSnd) { this.laserSnd.stop(); this.laserSnd = null; }
    if (this.engineSnd) this.engineSnd.set(0, 0);
    if (!this.jetSnd || this.jetSnd.stopped) this.jetSnd = game.audio.loop('jet');
  }

  boardShip() {
    this.mode = 'ship';
    this.hero.root.visible = false;
    if (this.jetSnd) { this.jetSnd.stop(); this.jetSnd = null; }
    if (this.eyeSnd) { this.eyeSnd.stop(); this.eyeSnd = null; }
    this.aimQ.copy(this.p.q);
    game.audio.teleport();
  }

  updateHeroModel(dt, cine = false) {
    const h = this.h, rig = this.hero;
    rig.root.position.copy(h.pos).add(_v.set(0, -1.0, 0).applyQuaternion(this.aimQ));
    // face aim direction; body pose leans when moving fast
    _q.copy(this.aimQ);
    rig.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 10));
    const sp = h.vel.length();
    h.st.move = clamp(sp / 80, 0, 1);
    h.st.flyFwd = cine ? 1 : clamp(_v.copy(h.vel).applyQuaternion(_q2.copy(this.aimQ).invert()).z / 80, 0, 1);
    h.st.grounded = false; h.st.fly = 1;
    h.st.aimPitch = 0;
    animateRig(rig, h.st, dt);
    const thrusting = sp > 20;
    rig.root.traverse((o) => { if (o.userData.thruster) o.scale.setScalar(thrusting ? 1.6 : 1); });
    if (thrusting && Math.random() < 0.8) {
      const back = _v2.set(0, 0.2, -0.4).applyQuaternion(rig.root.quaternion).add(rig.root.position).add(_v3.set(0, 1.2, 0).applyQuaternion(rig.root.quaternion));
      this.fx.trail(back, h.st.boost > 0.5 ? 0xffd27a : 0x4ef2ff, h.st.boost > 0.5 ? 1.6 : 0.8, 0.35);
    }
  }

  updateHero(dt) {
    const h = this.h, inp = game.input;
    if (!h.alive) return;
    const L5 = this.level >= 5;
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.aimQ).clone();
    const right = _v2.set(-1, 0, 0).applyQuaternion(this.aimQ).clone();
    const up = _v3.set(0, 1, 0).applyQuaternion(this.aimQ).clone();
    h.invuln = Math.max(0, h.invuln - dt);
    if (this.time - h.lastHit > 4) h.hp = Math.min(h.maxHp, h.hp + (L5 ? 12 : 5) * dt);
    // riding a comet / standing on a ship / leaping
    if (h.leap) { this.updateLeap(dt); this.updateHeroModel(dt, true); return; }
    if (h.riding) { this.updateRide(dt); this.updateHeroModel(dt); this.heroWeapons(dt, fwd); return; }
    if (h.onShip) { this.updateOnShip(dt); this.updateHeroModel(dt); return; }
    const wantBoost = (inp.down('ShiftLeft') || inp.down('ShiftRight'));
    const boosting = wantBoost && (L5 || (h.boost > 1 && !h.boostLock));
    if (boosting && !L5) { h.boost -= 26 * dt; if (h.boost <= 0) { h.boost = 0; h.boostLock = true; } }
    else if (!boosting) { h.boost = Math.min(100, h.boost + 14 * dt); if (h.boostLock && h.boost > 40) h.boostLock = false; }
    const speed = boosting ? (L5 ? 620 : 300) : 70;
    const mv = _v4.set(0, 0, 0);
    if (inp.down('KeyW')) mv.add(fwd); if (inp.down('KeyS')) mv.sub(fwd);
    if (inp.down('KeyD')) mv.add(right); if (inp.down('KeyA')) mv.sub(right);
    if (inp.down('Space')) mv.add(up); if (inp.down('KeyC')) mv.sub(up);
    if (boosting && mv.lengthSq() < 0.01) mv.copy(fwd);
    if (mv.lengthSq() > 0) mv.normalize();
    h.vel.lerp(mv.multiplyScalar(speed), 1 - Math.exp(-dt * (boosting ? 2.5 : 3.5)));
    this.applyGravity(h, dt);
    h.pos.addScaledVector(h.vel, dt);
    h.st.boost = damp(h.st.boost, boosting ? 1 : 0, 6, dt);
    this.fovExtra = damp(this.fovExtra, boosting ? 18 : 0, 3, dt);
    if (this.jetSnd) this.jetSnd.set(clamp(h.vel.length() / 300, 0.1, 1));
    if (boosting) game.engine.shake(0.12, 0.1);
    this.environmentHazards(h, 1.6, dt);
    this.heroWeapons(dt, fwd);
    this.updateHeroModel(dt);
    if (inp.pressed('KeyV')) this.camMode = this.camMode === 'first' ? 'third' : 'first';
    // re-board the ship
    this.prompt = null;
    if (this.ship.group.visible && !this.p.parkedHidden && h.pos.distanceTo(this.p.pos) < 32 && !this.mission.noBoard) {
      this.prompt = { text: 'BOARD THE SHIP', key: 'E' };
      if (inp.pressed('KeyE')) { this.boardShip(); return; }
    } else if (!this.mission.blockLanding) {
      const { body, dist } = this.nearestBody();
      if (body && dist < body.radius * 0.5 + 300 && !(body.def && body.def.noLanding)) {
        const allowed = this.mission.canLand ? this.mission.canLand(this, body, 'drop') : { ok: true };
        if (allowed.ok) { this.prompt = { text: `DIVE TO ${body.name}`, key: 'E' }; if (inp.pressed('KeyE')) this.beginLanding(body, 'drop'); }
        else this.prompt = { text: allowed.reason, key: '', warn: true };
      }
    }
    if (L5 && inp.pressed('KeyX')) this.startLeap();
  }

  heroWeapons(dt, fwd) {
    const h = this.h, inp = game.input, rig = this.hero;
    h.gunCd -= dt; h.punchCd -= dt; h.missileCd -= dt;
    if (h.missileCd <= 0 && h.missiles < 2) { h.missiles++; h.missileCd = 1.6; }
    // rifle
    if (inp.mouseDown(0) && h.gunCd <= 0 && !(h.punchT > 0)) {
      h.gunCd = 0.055;
      rig.root.updateMatrixWorld();
      const mz = rig.weapons.rifle.localToWorld(_v4.copy(rig.weapons.rifle.userData.muzzle));
      const dir = _v3.subVectors(this.aimPoint, mz).normalize().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.008)).normalize();
      this.spawnBullet(mz.clone(), dir.clone(), 1900, this.level >= 5 ? 9 : 6, 0x7af8ff, 4, 0.15, this.assist);
      this.fx.muzzle(mz, dir, 0x9ff8ff, 0.5);
      game.audio.rifle();
      h.st.recoil = 1;
    }
    h.st.recoil = damp(h.st.recoil || 0, 0, 12, dt);
    // back missiles
    if (this.level >= 3 && inp.pressed('KeyR')) {
      if (h.missiles > 0) {
        const n = h.missiles; h.missiles = 0; h.missileCd = 2.2;
        for (let i = 0; i < n; i++) {
          const from = _v4.set(i ? 0.5 : -0.5, 2.2, -0.6).applyQuaternion(rig.root.quaternion).add(rig.root.position);
          this.fireRocket(from.clone(), _v3.copy(fwd).add(_v2.set(0, 0.4, 0).applyQuaternion(this.aimQ)).normalize(), this.lockTarget, { scale: 0.9, speed0: 60, maxSpeed: 900, turn: 4.5 });
        }
        game.audio.missileSalvo();
      } else game.audio.denied();
    }
    // eye lasers (level 4+)
    if (this.level >= 4 && inp.down('KeyQ')) {
      rig.root.updateMatrixWorld();
      let to = this.aimPoint.clone();
      const hitE = this.aimEnemy;
      if (hitE && hitE.alive) {
        const rate = hitE.huge ? hitE.maxHp / 60 : hitE.creature ? hitE.maxHp / 1.2 : hitE.elite ? hitE.maxHp / 2.5 : hitE.maxHp / 3;
        hitE.hp -= rate * dt; hitE.engaged = true; hitE.hitFlash = 0.05;
        if (hitE.hp <= 0) this.killEnemy(hitE, 'eyes');
        to = hitE.pos.clone();
      }
      rig.eyes.forEach((e, i) => { const from = rig.j.head.localToWorld(_v4.copy(e)); this.fx.beam('eye' + i, from.clone(), to, 0xff2a2a, 0.12); });
      if (!this.eyeSnd) this.eyeSnd = game.audio.loop('eyelaser');
    } else if (this.eyeSnd) { this.eyeSnd.stop(); this.eyeSnd = null; }
    // melee
    if (inp.pressed('KeyF') && h.punchCd <= 0) this.heroPunch(fwd);
    if (h.punchT > 0) { h.punchT -= dt; h.st.attack = { kind: h.punchKind, t: 1 - h.punchT / 0.4 }; } else h.st.attack = null;
  }

  heroPunch(fwd) {
    const h = this.h;
    h.punchCd = 0.35; h.punchT = 0.4;
    h.punchKind = pick(['cross', 'jab', 'upper', 'hook']);
    const L5 = this.level >= 5;
    // lunge toward closest target in front
    let best = null, bd = L5 ? 90 : 45;
    for (const e of this.enemies) {
      if (!e.alive || e.station || e.huge) continue;
      const toE = _v.subVectors(e.pos, h.pos); const d = toE.length() - e.radius;
      if (d < bd && toE.normalize().dot(fwd) > 0.5) { bd = d; best = e; }
    }
    game.audio.whoosh(0.2, 700);
    if (!best) return;
    h.pos.lerp(best.pos, clamp(1 - (best.radius + 2) / Math.max(1, h.pos.distanceTo(best.pos)), 0, 1) * 0.85);
    if (L5) {
      game.audio.megaPunch();
      game.engine.shake(1.4, 0.3);
      this.fx.shockwave(best.pos, 2, 40, 0xffffff, 0.35);
      if (best.elite) {
        best.vel.add(_v.copy(fwd).multiplyScalar(700)); best.state = 'evade'; best.evadeUntil = best.t + 1.5; best.evadeDir = fwd.clone();
        this.damageEnemy(best, 140, 'punch');
      } else this.damageEnemy(best, 1e5, 'punch');
    } else {
      game.audio.punch(true);
      const dmg = best.creature ? 80 : best.elite ? 60 : 45;
      this.damageEnemy(best, dmg, 'punch');
      this.fx.impact(best.pos, fwd, 0xffffff, 2);
      if (best.alive) best.vel.add(_v.copy(fwd).multiplyScalar(160));
    }
  }

  // level 5: leap to the nearest moving object
  startLeap() {
    const h = this.h;
    let best = null, bd = 5000;
    for (const c of this.env.comets) { if (!c.alive || c.launched) continue; const d = c.pos.distanceTo(h.pos); if (d < bd) { bd = d; best = { comet: c }; } }
    for (const e of this.enemies) { if (!e.alive || e.station || e.huge || e.type === 'elite') continue; const d = e.pos.distanceTo(h.pos); if (d < bd) { bd = d; best = { ship: e }; } }
    if (!best) { game.audio.denied(); game.ui.hint('No moving target in range', 1.5); return; }
    h.leap = best; h.leapT = 0;
    game.audio.whoosh(0.35, 400);
    game.engine.flash(0.15, 0x9ff8ff);
  }
  updateLeap(dt) {
    const h = this.h, L = h.leap;
    const tgt = L.comet || L.ship;
    if (!tgt || !tgt.alive) { h.leap = null; return; }
    h.leapT += dt;
    const to = _v.subVectors(tgt.pos, h.pos); const d = to.length();
    const reach = (L.comet ? tgt.radius : tgt.radius * 0.6) + 2;
    const step = Math.min(d - reach, 2600 * dt);
    h.vel.copy(to.normalize()).multiplyScalar(2600);
    h.pos.addScaledVector(to, Math.max(0, step));
    _q.setFromUnitVectors(Z, to); this.aimQ.slerp(_q, 1 - Math.exp(-dt * 8));
    this.fovExtra = damp(this.fovExtra, 30, 6, dt);
    this.fx.trail(h.pos, 0x9ff8ff, 2.5, 0.4);
    if (d - reach < 3 || h.leapT > 4) {
      h.leap = null;
      game.engine.shake(1, 0.3); game.audio.land(true);
      if (L.comet) { h.riding = tgt; tgt.ridden = true; game.ui.toast('RIDING COMET', 'Aim with the mouse · LMB to hurl it at a target'); }
      else { h.onShip = tgt; game.ui.toast('ON ENEMY SHIP', 'F to smash it · X to leap'); }
    }
  }
  updateRide(dt) {
    const h = this.h, c = h.riding, inp = game.input;
    if (!c.alive) { h.riding = null; return; }
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.aimQ);
    const sp = Math.max(160, c.vel.length());
    c.vel.lerp(_v2.copy(fwd).multiplyScalar(sp), 1 - Math.exp(-dt * 1.5));
    h.pos.copy(c.pos).addScaledVector(_v2.set(0, 1, 0).applyQuaternion(this.aimQ), c.radius + 1.5).addScaledVector(fwd, -c.radius * 0.3);
    h.vel.copy(c.vel);
    this.prompt = { text: 'HURL THE COMET', key: 'LMB' };
    if (inp.mousePressed(0) || inp.pressed('KeyF')) {
      c.vel.copy(_v2.subVectors(this.aimPoint, c.pos).normalize()).multiplyScalar(1100);
      c.launched = true; c.ridden = false; h.riding = null;
      h.vel.copy(fwd).multiplyScalar(-60);
      game.audio.megaPunch(); game.engine.shake(1.6, 0.4);
      this.fx.shockwave(c.pos, 5, 120, 0x9fe8ff, 0.6);
    }
    if (inp.pressed('KeyX')) { c.ridden = false; h.riding = null; this.startLeap(); }
  }
  updateOnShip(dt) {
    const h = this.h, e = h.onShip, inp = game.input;
    if (!e.alive) { h.onShip = null; return; }
    h.pos.copy(e.pos).add(_v.set(0, e.radius * 0.45 + 1.5, 0).applyQuaternion(e.q));
    h.vel.copy(e.vel);
    this.prompt = { text: 'SMASH THE SHIP', key: 'F' };
    if (inp.pressed('KeyF') || inp.mousePressed(0)) {
      h.punchT = 0.4; h.punchKind = 'upper';
      game.audio.megaPunch(); game.engine.shake(1.8, 0.4);
      this.killEnemy(e, 'punch');
      h.onShip = null; h.vel.set(0, 40, 0).applyQuaternion(this.aimQ);
    }
    if (inp.pressed('KeyX')) { h.onShip = null; this.startLeap(); }
  }

  // ------------------------------------------------------------------ comets
  updateComets(dt) {
    for (const c of [...this.env.comets]) {
      if (c.pos.length() > 90000) { this.env.removeComet(c); continue; }
      if (c.launched) {
        for (const e of this.enemies) {
          if (!e.alive || e.station) continue;
          if (c.pos.distanceTo(e.pos) < e.radius + c.radius) {
            if (e.huge) { this.damageEnemy(e, 1e9, 'comet'); }
            else this.damageEnemy(e, 1e5, 'comet');
            this.fx.explosion(c.pos.clone(), 8);
            this.env.removeComet(c);
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ targeting (colonizer drop)
  startTargeting(opts) {
    this.mode = 'target';
    this.target = Object.assign({ valid: false, point: null }, opts);
    this.zoom = true; this.zoomFov = 22;
    game.audio.ui();
  }
  updateTargeting(dt) {
    const t = this.target;
    const o = this.camera.position.clone();
    const d = _v.set(0, 0, 1).applyQuaternion(this.aimQ);
    const hit = t.raycast(o, d);
    t.valid = !!hit; t.point = hit;
    this.p.q.rotateTowards(this.aimQ, dt * 2);
    this.p.vel.multiplyScalar(Math.exp(-dt * 2));
    this.p.pos.addScaledVector(this.p.vel, dt);
    this.ship.group.position.copy(this.p.pos); this.ship.group.quaternion.copy(this.p.q);
    if (game.input.pressed('Escape') || game.input.mousePressed(2)) this.cancelTargeting();
  }
  cancelTargeting() { this.mode = 'ship'; this.zoom = false; this.target = null; }

  // ------------------------------------------------------------------ cinematics
  playCine(fn, opts = {}) { this.mode = 'cine'; this.cineShip = !!opts.ship; this.cineHero = !!opts.hero; this.cineVulnerable = !!opts.vulnerable; this.cineFn = (dt) => { const done = fn(dt); if (done) { this.mode = opts.after || 'ship'; this.cineShip = false; this.cineHero = false; this.cineVulnerable = false; } return done; }; }

  startWarp(onDone) {
    let t = 0;
    game.voice.stop();
    game.audio.warp();
    const c = this.p;
    if (this.mode === 'hero' && this.h) this.boardShip();
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.p.q).clone();
    game.ui.setActions([]);
    this.playCine((dt) => {
      t += dt;
      const k = Math.min(1, t / 3);
      c.speed = 200 + k * k * 9000;
      c.vel.copy(fwd).multiplyScalar(c.speed);
      c.pos.addScaledVector(c.vel, dt);
      this.ship.group.position.copy(c.pos);
      this.aimQ.copy(this.p.q);
      game.engine.u.uWarp.value = k * k;
      this.fovExtra = k * 55;
      game.engine.shake(0.3 + k, 0.1);
      for (const f of this.ship.engines) f.scale.z = 1 + k * 4;
      if (t >= 3 && !this._warpDone) {
        this._warpDone = true;
        game.ui.flashWhite(1.2);
        game.engine.u.uWarp.value = 0;
        onDone();
      }
      return false;
    }, { ship: true });
  }

  // ------------------------------------------------------------------ HUD
  updateHUD() {
    const ui = game.ui;
    ui.setLevel(this.level, this.sys.name);
    ui.setObjectives(this.mission.objectives ? this.mission.objectives(this) : []);
    const heroMode = this.mode === 'hero' || this.cineHero;
    const c = heroMode ? this.h : this.p;
    if (c) {
      ui.setBars({
        hp: [c.hp, c.maxHp], hpLabel: heroMode ? 'NOVA · VITALS' : 'HULL INTEGRITY',
        shield: !heroMode && this.unlocks.shield ? [this.p.shield, 100] : null, shieldOn: this.p.shieldOn,
        boost: heroMode ? [this.h.boost, 100] : [this.p.boost, 100], boostLabel: heroMode ? 'FLIGHT BOOST' : 'AFTERBURNER', boostInf: heroMode && this.level >= 5,
        heat: c.heat > 1 ? c.heat : null,
        danger: this.env.blackHole && this.bhDanger > 1 ? this.bhDanger : null, dangerLabel: 'GRAVITATIONAL PULL',
      });
    }
    if (heroMode && this.h) {
      const h = this.h;
      ui.setWeapons(`
        <div class="wpn active"><span class="wname">PULSE RIFLE</span><span class="wval">∞</span><span class="key">LMB</span></div>
        ${this.level >= 3 ? `<div class="wpn"><span class="wname">BACK MISSILES</span><div class="pips">${[0, 1].map((i) => `<div class="pip ${i < h.missiles ? 'on' : ''}"></div>`).join('')}</div><span class="key">R</span></div>` : ''}
        ${this.level >= 4 ? '<div class="wpn"><span class="wname">EYE LASERS</span><span class="key">Q</span></div>' : ''}
        <div class="wpn"><span class="wname">${this.level >= 5 ? 'TITAN PUNCH' : 'MELEE'}</span><span class="key">F</span></div>
        ${this.level >= 5 ? '<div class="wpn"><span class="wname">LEAP</span><span class="key">X</span></div>' : ''}`);
    } else {
      const p = this.p;
      ui.setWeapons(`
        <div class="wpn active"><span class="wname">TWIN CANNONS</span><span class="wval">∞</span><span class="key">LMB</span></div>
        <div class="wpn"><span class="wname">ROCKETS</span><div class="pips">${[0, 1, 2, 3].map((i) => `<div class="pip ${i < p.rockets ? 'on' : ''}"></div>`).join('')}</div><span class="key">RMB</span></div>
        <div class="wpn"><span class="wname">CHARGE</span><div class="meter"><div style="width:${p.rockets >= 4 ? 100 : (p.charge / p.chargeNeed) * 100}%"></div></div></div>
        ${this.unlocks.laser ? `<div class="wpn"><span class="wname">LASER ${p.laserLock ? '· COOLING' : ''}</span><div class="meter ${p.laserLock ? 'rd' : 'cy'}"><div style="width:${p.laser}%"></div></div><span class="key">F</span></div>` : ''}
        ${this.unlocks.shield ? `<div class="wpn"><span class="wname">SHIELD</span><span class="key">Q</span></div>` : ''}
        ${this.unlocks.eject ? `<div class="wpn"><span class="wname">EJECT</span><span class="key">X</span></div>` : ''}`);
    }
    ui.crosshair(this.mode === 'dead' || this.mode === 'cine' ? 'none' : this.mode === 'target' ? 'melee' : heroMode ? 'rifle' : 'ship');
    // nose marker (where the ship guns point)
    if (this.mode === 'ship') {
      const np = _v.set(0, 0, 600).applyQuaternion(this.p.q).add(this.p.pos).project(this.camera);
      if (np.z < 1) ui.noseMark((np.x * 0.5 + 0.5) * window.innerWidth, (-np.y * 0.5 + 0.5) * window.innerHeight); else ui.noseMark(null);
    } else ui.noseMark(null);
    ui.prompt(this.prompt ? this.prompt.text : null, this.prompt ? this.prompt.key : '', this.prompt && this.prompt.warn);
    // markers: bodies by name (worlds still to liberate get a gold ring) and one red chevron above every enemy
    const list = [];
    const ms = this.mission;
    for (const b of this.env.bodies) {
      const target = !!(ms.isTargetBody && ms.isTargetBody(b.name));
      const st = ms.planets && ms.planets[b.name];
      list.push({ id: 'b_' + b.name, pos: b.pos, label: b.name, kind: 'body', cls: target ? 'target' : '', edge: target, color: target ? '#ffb43c' : st && st.captured && st.cleared ? '#5dff9b' : b.isBlackHole ? '#c9a0ff' : b.isStar ? '#ffe6a8' : '#d8e8ff' });
    }
    if (ms.markers) for (const m of ms.markers(this)) list.push(m);
    const pp = this.playerPos();
    const remaining = this.aliveEnemies((e) => !e.station);
    const few = remaining.length <= 3;
    const up = _v2.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    for (const e of remaining) {
      if (!few && !e.huge && e.pos.distanceTo(pp) > 9000) continue;
      list.push({ id: 'e_' + e.id, pos: e.pos.clone().addScaledVector(up, e.radius * 1.25 + 1.5), kind: 'enemy', cls: (e === this.assist ? 'assist' : '') + (e.big ? ' big' : ''), edge: few || !!e.huge });
    }
    for (const m of this.markersExtra) list.push(m);
    ui.setMarkers(list, this.camera);
    const acts = this.mission.actions ? this.mission.actions(this) : [];
    ui.setActions(acts);
  }

  stopLoops() {
    for (const k of ['engineSnd', 'heatSnd', 'laserSnd', 'jetSnd', 'eyeSnd', 'alarmSnd']) if (this[k]) { this[k].stop(); this[k] = null; }
  }
  pauseLoops() { this.stopLoops(); this.arriveT = 0; game.engine.u.uWarp.value = 0; }
  resumeLoops() { if (this.mode === 'ship' && this.p.alive && (!this.engineSnd || this.engineSnd.stopped)) this.engineSnd = game.audio.loop('engine'); if (this.mode === 'hero') this.jetSnd = game.audio.loop('jet'); }

  dispose() {
    this.stopLoops();
    this.env.dispose();
    this.fx.dispose();
    game.engine.u.uWarp.value = 0; game.engine.u.uHeat.value = 0;
    this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
}
