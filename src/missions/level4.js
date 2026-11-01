// LEVEL 4 — Cygnus X-1: the black hole trap, ejecting from the doomed ship, eye lasers, void creatures and the portal.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { rand, clamp, pick } from '../core/util.js';
import { Mission } from './common.js';
import { buildRocket } from '../gfx/models-ships.js';
import { portalMaterial } from '../gfx/shaders.js';

export class Level4 extends Mission {
  constructor() {
    super(4);
    this.unlocks = { shield: true, laser: true, eject: true };
    this.phase = 'arrive';
    this.t = 0;
    this.portal = null;
    this.blockLanding = true;
  }

  spawn(sm) {
    const B = sm.env.blackHole;
    const pos = new THREE.Vector3(5200, 900, 3800);
    return { pos, look: B.pos.clone().add(new THREE.Vector3(0, 0, 0)) };
  }

  setupSpace(sm) {
    // ambush fleet hiding in the accretion glare
    this.ambusher = sm.spawnEnemy('cruiser', new THREE.Vector3(-1800, 1400, 4200), { guard: new THREE.Vector3(-1800, 1400, 4200), guardR: 200 });
    for (let i = 0; i < 7; i++) sm.spawnEnemy('fighter', new THREE.Vector3(rand(-6000, 6000), rand(-1500, 1500), rand(-6000, 6000)), { guard: new THREE.Vector3(rand(-4500, 4500), rand(-800, 800), rand(-4500, 4500)), guardR: 1200 });
    for (let i = 0; i < 8; i++) sm.spawnEnemy('flyer', new THREE.Vector3(rand(-5000, 5000), rand(-1200, 1200), rand(-5000, 5000)), { guard: new THREE.Vector3(rand(-4000, 4000), rand(-600, 600), rand(-4000, 4000)), guardR: 900 });
    for (const e of sm.enemies) e.engaged = false;
    this.totalShipsN = sm.enemies.filter((e) => e.type === 'fighter' || e.type === 'cruiser').length;
    this.totalFlyers = sm.enemies.filter((e) => e.type === 'flyer').length;
    sm.musicOverride = 'blackhole';
    game.voice.dialogue([
      ['WAIT', 1],
      ['AI', 'Arrived at Cygnus X-1. A black hole of twenty-one solar masses, feeding on the blue supergiant HDE 226868.'],
      ['AI', 'Seven thousand two hundred light-years from Earth. Klin\'Tar command signal is strong here.'],
    ]);
    this.cometT = 2;
  }

  spawnComet(sm) {
    const pp = sm.playerPos();
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    const start = pp.clone().addScaledVector(dir, rand(3500, 5000));
    const target = pp.clone().add(new THREE.Vector3(rand(-600, 600), rand(-200, 200), rand(-600, 600)));
    sm.env.spawnComet(start, target.sub(start).normalize().multiplyScalar(rand(220, 380)), rand(18, 45));
  }

  updateSpace(sm, dt) {
    this.t += dt;
    const B = sm.env.blackHole;
    // comets streak through the system
    this.cometT -= dt;
    if (this.cometT <= 0 && this.phase !== 'arrive') { this.cometT = rand(5, 9); this.spawnComet(sm); }
    if (this.phase === 'arrive' && this.t > 11) {
      this.phase = 'trap';
      this.trapT = 0;
      sm.gravityScale = 4.5;
      sm.p.throttle = 0;
      this.alarm = game.audio.loop('alarm');
      game.audio.klaxon();
      game.voice.dialogue([
        ['AI', 'Warning! Navigation failure! Gravitational shear exceeds safe limits!'],
        ['NOVA', 'Those bastards... they knew I was coming. It\'s a trap!'],
      ]);
    }
    if (this.phase === 'trap') {
      this.trapT += dt;
      // ship spins helplessly toward the black hole
      sm.aimQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), dt * 0.35));
      sm.p.throttle = 0;
      if (sm.mode === 'ship') sm.p.pos.addScaledVector(B.pos.clone().sub(sm.p.pos).normalize(), (60 + this.trapT * 25) * dt);
      game.engine.shake(0.4, 0.1);
      if (this.trapT > 6 && !this.missile) {
        const from = this.ambusher.alive ? this.ambusher.pos.clone() : sm.p.pos.clone().add(new THREE.Vector3(-2500, 800, 1500));
        const m = buildRocket(0xff2a2a); m.scale.setScalar(9); m.position.copy(from); sm.scene.add(m);
        this.missile = { mesh: m, pos: m.position, t: 0, from };
        this.alarm.set(8);
        game.voice.dialogue([
          ['AI', 'Missile lock detected! Impact imminent! Emergency evacuation! Eject! Eject!'],
          ['NOVA', 'OH, DAMN!'],
        ]);
        game.ui.center('EJECT', 'PRESS X NOW', 3, 'red');
      }
      if (this.missile) {
        const M = this.missile;
        M.t += dt;
        const target = sm.p.pos.clone();
        const d = target.clone().sub(M.pos); const L = d.length();
        const sp = 260 + M.t * 140;
        M.pos.addScaledVector(d.normalize(), Math.min(L, sp * dt));
        M.mesh.lookAt(target);
        sm.fx.trail(M.pos.clone(), 0xff5a2a, 22, 0.6); if (Math.random() < 0.7) sm.fx.smokePuff(M.pos, 18, 2, 0x777777, null, 0.4);
        if (L < 25 || M.t > 9) this.missileImpact(sm);
      }
    }
    if (this.phase === 'fight') {
      sm.gravityScale = 1;
      const shipsLeft = sm.aliveEnemies((e) => e.type === 'fighter' || e.type === 'cruiser').length;
      const flyersLeft = sm.aliveEnemies((e) => e.type === 'flyer').length;
      if (shipsLeft === 0 && flyersLeft === 0 && !this.portal) this.openPortal(sm);
      if (this.portal) {
        const P = this.portal;
        P.t += dt;
        P.mesh.material.uniforms.uTime.value = sm.time;
        P.mesh.material.uniforms.uOpen.value = Math.min(1, P.t * 0.5);
        P.mesh.lookAt(sm.camera.position);
        if (Math.random() < 0.8) sm.fx.trail(P.pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(60)), pick([0x9a6aff, 0x4ef2ff]), 6, 1.2, P.pos.clone().sub(sm.playerPos()).normalize().multiplyScalar(-20));
        if (sm.h && sm.h.pos.distanceTo(P.pos) < 70 && !P.entered) this.enterPortal(sm);
      }
    }
  }

  missileImpact(sm) {
    const M = this.missile;
    this.phase = 'fight';
    if (this.alarm) { this.alarm.stop(); this.alarm = null; }
    sm.scene.remove(M.mesh);
    const at = sm.p.pos.clone();
    sm.fx.explosion(at, 12);
    sm.fx.fireball(at, 90, 2);
    game.audio.megaExplosion();
    game.engine.shake(2.5, 1.2); game.engine.flash(0.7, 0xffc080);
    sm.ship.group.visible = false;
    sm.p.parkedHidden = true;
    sm.fx.debris(at, 14, 3, 120);
    if (sm.mode === 'ship' || sm.mode === 'dead') {
      sm.mode = 'ship';
      sm.die('NOVA-1 DESTROYED', 'You stayed aboard. The missile destroyed the ship with Nova inside — eject with X next time.');
      return;
    }
    const d = sm.h.pos.distanceTo(at);
    const dmg = clamp(140 - d * 0.9, 0, 120);
    if (dmg > 0) sm.damagePlayer(dmg, at);
    sm.mission.noBoard = true;
    this.noBoard = true;
    for (const e of sm.enemies) e.engaged = true;
    game.voice.dialogue([
      ['NOVA', dmg > 60 ? 'Argh... that was too close. Systems still holding.' : 'Nova-1 is gone. Fine. I\'ll do this myself.'],
      ['AI', 'Suit link active. Eye lasers online — hold Q. Escape the pull with SHIFT. Comets incoming.'],
      ['ALIEN', 'The human survived! Release the void beasts!'],
    ]);
    game.ui.toast('NEW · EYE LASERS', 'Hold Q · destroys a ship in 3 seconds');
    sm.musicOverride = null;
  }

  openPortal(sm) {
    const pos = sm.h.pos.clone().add(new THREE.Vector3(0, 0, 400).applyQuaternion(sm.aimQ));
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(160, 64), portalMaterial());
    mesh.position.copy(pos); sm.scene.add(mesh);
    const light = new THREE.PointLight(0x9a6aff, 50, 2000, 1.5); light.position.copy(pos); sm.scene.add(light);
    this.portal = { mesh, pos, t: 0, snd: game.audio.loop('portal') };
    game.audio.teleport();
    game.voice.dialogue([
      ['AI', 'All hostiles eliminated. A spatial rift is opening ahead!'],
      ['NOVA', 'A portal... It leads straight to them. Let\'s end this.'],
    ]);
    game.ui.hint('Fly into the portal', 6);
  }

  async enterPortal(sm) {
    const P = this.portal; P.entered = true;
    P.snd.stop();
    game.audio.warp();
    game.engine.flash(1, 0x9a6aff);
    this.complete = true;
    game.save.complete(4);
    await game.ui.fadeTo(1, 1.2);
    game.flow.startLevel(5, { fromWarp: true, portal: true });
  }

  objectives(sm) {
    if (this.phase === 'arrive') return [{ text: 'Investigate the Klin\'Tar signal at Cygnus X-1' }];
    if (this.phase === 'trap') return [{ text: this.missile ? 'EJECT NOW (X)' : 'Regain control of the ship', red: true }];
    const shipsLeft = sm.aliveEnemies((e) => e.type === 'fighter' || e.type === 'cruiser').length;
    const flyersLeft = sm.aliveEnemies((e) => e.type === 'flyer').length;
    return [
      { text: `Destroy the Klin'Tar ships (${this.totalShipsN - shipsLeft}/${this.totalShipsN})`, done: shipsLeft === 0 },
      { text: `Destroy the void creatures (${this.totalFlyers - flyersLeft}/${this.totalFlyers})`, done: flyersLeft === 0 },
      { text: 'Stay out of the black hole (SHIFT to escape)', red: (sm.bhDanger || 0) > 50 },
      ...(this.portal ? [{ text: 'Enter the portal', red: true }] : []),
    ];
  }

  markers(sm) {
    const list = [];
    if (this.missile && this.phase === 'trap') list.push({ id: 'missile', pos: this.missile.pos, kind: 'enemy', cls: 'big', edge: true });
    if (this.portal) list.push({ id: 'portal', pos: this.portal.pos, label: 'PORTAL', kind: 'objective', color: '#b48aff', edge: true, showDist: true });
    return list;
  }

  actions(sm) {
    if (this.phase === 'trap' && this.missile && sm.mode === 'ship') return [{ id: 'eject', label: 'EJECT', key: 'KeyX', keyLabel: 'X', big: true, onClick: () => sm.enterHeroMode(true) }];
    return [];
  }

  checkComplete() {}
}
