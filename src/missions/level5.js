// LEVEL 5 — HR 8799: the Shadow Guard, comets vs dreadnoughts, the throne world and the final boss (Nova from the future).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { rand, clamp, pick, damp, wrapAngle } from '../core/util.js';
import { Mission } from './common.js';
import { buildHero, setHeroWeapon, animateRig } from '../gfx/models-chars.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function raySphereT(o, d, c, r) { _v.subVectors(o, c); const b = _v.dot(d); const cc = _v.lengthSq() - r * r; const h = b * b - cc; if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 ? t : -1; }

// ------------------------------------------------------------------ the final boss
class Boss {
  constructor(gm, pos) {
    this.gm = gm; this.kind = 'boss'; this.state = 'combat'; this.alive = true; this.noCount = false;
    this.rig = buildHero({ dark: true, scale: 1.6, pods: true });
    setHeroWeapon(this.rig, null);
    this.root = this.rig.root; gm.scene.add(this.root);
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.knock = new THREE.Vector3();
    this.yaw = Math.PI; this.radius = 0.9; this.height = 3.0; this.headY = 2.75;
    this.maxHp = 5200; this.hp = this.maxHp;
    this.st = { grounded: true, move: 0, weapon: 'fists', guard: true, aim: 0 };
    this.t = 0; this.action = null; this.actionT = 0; this.cd = 2; this.phase = 1; this.flying = false;
    this.dodgeCd = 0; this.blockT = 0; this.active = false;
    this.dead = 0;
  }
  forward(v) { return v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  headPos(v) { return v.set(this.pos.x, this.pos.y + this.headY, this.pos.z); }
  alert() {}
  rayHit(o, d, maxD) {
    if (!this.alive) return null;
    const th = raySphereT(o, d, this.headPos(_v3).clone(), 0.33);
    if (th >= 0 && th < maxD) return { part: 'head', t: th };
    for (const f of [0.35, 0.55, 0.75]) { const tb = raySphereT(o, d, new THREE.Vector3(this.pos.x, this.pos.y + this.height * f, this.pos.z), 0.55); if (tb >= 0 && tb < maxD) return { part: 'body', t: tb }; }
    return null;
  }
  damage(amount, part = 'body', dir = null, opts = {}) {
    if (!this.alive || !this.active) return false;
    let dmg = amount * (part === 'head' ? 1.6 : 1);
    // smart guard: blocks frontal melee when not attacking
    const hero = this.gm.hero;
    const toHero = _v2.subVectors(hero.pos, this.pos); toHero.y = 0; const dist = toHero.length();
    if (dist < 4.5 && !this.action && Math.random() < 0.4 && this.forward(_v).dot(toHero.normalize()) > 0.4) {
      dmg *= 0.25; this.blockT = 0.3;
      this.gm.fx.spark(new THREE.Vector3(this.pos.x, this.pos.y + 2, this.pos.z), toHero.clone().negate(), 12, 0xff2a4a, 10, 0.25, 0.3);
      game.audio.hit(true);
      if (Math.random() < 0.3) game.voice.bark('BOSS', pick(['Predictable.', 'I know every move you make.', 'Too slow.']), 1);
    }
    this.hp -= dmg;
    this.hitT = 0.2;
    if (dir) this.knock.addScaledVector(dir, (opts.knock || 2) * 0.35);
    this.gm.fx.blood(new THREE.Vector3(this.pos.x, this.pos.y + 2, this.pos.z), dir, 0x6a0010);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.gm.mission.bossDefeated(this.gm, this); return true; }
    return false;
  }
  setAction(name, dur) { this.action = name; this.actionT = 0; this.actionDur = dur; this.hitDone = false; }

  update(dt) {
    const gm = this.gm, hero = gm.hero;
    this.t += dt; this.hitT = Math.max(0, (this.hitT || 0) - dt); this.blockT = Math.max(0, this.blockT - dt);
    if (!this.alive) {
      this.dead = Math.min(1, this.dead + dt * 0.8);
      this.st.kneel = this.dead; this.st.attack = null; this.st.fly = 0; this.st.grounded = true;
      animateRig(this.rig, this.st, dt);
      return;
    }
    if (!this.active) { this.st.talk = gm.mission.bossTalking ? 1 : 0; animateRig(this.rig, this.st, dt); this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; return; }
    // phase changes
    const frac = this.hp / this.maxHp;
    if (this.phase === 1 && frac < 0.66) this.enterPhase(2);
    if (this.phase === 2 && frac < 0.33) this.enterPhase(3);
    const toH = _v.subVectors(hero.pos, this.pos); const dy = toH.y; toH.y = 0;
    const dist = toH.length();
    const dirTo = toH.clone().normalize();
    const speedMul = this.phase === 3 ? 1.35 : 1;
    // face the hero
    this.yaw += wrapAngle(Math.atan2(dirTo.x, dirTo.z) - this.yaw) * Math.min(1, dt * 8);
    // dodge when the hero aims & fires at us
    this.dodgeCd -= dt;
    const camF = new THREE.Vector3(0, 0, -1).applyQuaternion(gm.camera.quaternion);
    const toBoss = _v2.set(this.pos.x, this.pos.y + 1.6, this.pos.z).sub(gm.camera.position).normalize();
    if (this.dodgeCd <= 0 && !this.action && camF.dot(toBoss) > 0.995 && game.input.mouseDown(0) && dist > 6) {
      this.dodgeCd = this.phase === 3 ? 1.2 : 2.2;
      const side = new THREE.Vector3(-dirTo.z, 0, dirTo.x).multiplyScalar(pick([-1, 1]));
      this.vel.addScaledVector(side, 22 * speedMul);
      gm.fx.trail(new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z), 0xff1a3a, 1.5, 0.4);
      game.audio.whoosh(0.2, 400);
    }
    let want = new THREE.Vector3();
    this.cd -= dt;
    // ---------------- choose an action
    if (!this.action && this.cd <= 0) {
      const r = Math.random();
      if (dist < 4.5) this.setAction('combo', 1.5);
      else if (this.phase >= 2 && r < 0.25) this.setAction('eyes', 2.6);
      else if (this.phase === 3 && r < 0.5) this.setAction('slam', 1.4);
      else if (dist > 18 && r < 0.65) this.setAction('missiles', 1.0);
      else if (dist > 10 && r < 0.85) this.setAction('rifle', 2.0);
      else this.setAction('dash', 0.9);
    }
    // ---------------- execute
    const A = this.action;
    if (A) {
      this.actionT += dt;
      const k = this.actionT / this.actionDur;
      this.st.attack = null;
      if (A === 'combo') {
        const step = Math.floor(k * 3);
        const anim = ['cross', 'hook', this.phase === 3 ? 'round' : 'upper'][Math.min(2, step)];
        this.st.attack = { kind: anim, t: (k * 3) % 1 };
        if (dist > 2.6) want.copy(dirTo).multiplyScalar(9 * speedMul);
        if ((k * 3) % 1 > 0.45 && this.lastHitStep !== step) {
          this.lastHitStep = step;
          if (dist < 4.2 && Math.abs(dy) < 3) { hero.damage(16 * (this.phase === 3 ? 1.3 : 1), this.pos, { knock: step === 2 ? 16 : 6 }); game.audio.megaPunch(); game.engine.shake(0.8, 0.2); }
          else game.audio.whoosh(0.2, 500);
        }
      } else if (A === 'dash') {
        want.copy(dirTo).multiplyScalar(30 * speedMul);
        if (dist < 3.5) { this.action = null; this.setAction('combo', 1.5); }
      } else if (A === 'rifle') {
        setHeroWeapon(this.rig, 'rifle'); this.st.weapon = 'rifle'; this.st.aim = 1;
        this.fireCd = (this.fireCd || 0) - dt;
        const strafe = new THREE.Vector3(-dirTo.z, 0, dirTo.x).multiplyScalar(Math.sin(this.t) > 0 ? 5 : -5);
        want.copy(strafe);
        if (this.fireCd <= 0) {
          this.fireCd = 0.16;
          this.root.updateMatrixWorld();
          const muz = this.rig.weapons.rifle.localToWorld(this.rig.weapons.rifle.userData.muzzle.clone());
          const tgt = new THREE.Vector3(hero.pos.x, hero.pos.y + 1.2, hero.pos.z).addScaledVector(hero.vel, dist / 70);
          gm.fireBolt(muz, tgt.sub(muz).normalize().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.035)).normalize(), 75, 9, 0xff1a3a, 1, 'enemy');
          game.audio.enemyShot(this.pos, 'plasma');
        }
      } else if (A === 'missiles') {
        if (!this.hitDone && k > 0.3) {
          this.hitDone = true;
          this.root.updateMatrixWorld();
          for (let i = 0; i < 3; i++) {
            const from = this.rig.j.chest.localToWorld(new THREE.Vector3((i - 1) * 0.2, 0.3, -0.25));
            gm.fireShell(from, new THREE.Vector3(hero.pos.x + rand(-2, 2), gm.world.heightFn(hero.pos.x, hero.pos.z), hero.pos.z + rand(-2, 2)), 22, 0xff1a3a);
          }
          game.audio.missileSalvo();
        }
      } else if (A === 'eyes') {
        this.st.lookPitch = 0.2;
        if (k > 0.25) {
          this.root.updateMatrixWorld();
          this.laserTgt = this.laserTgt || hero.pos.clone();
          const aimAt = new THREE.Vector3(hero.pos.x, hero.pos.y + 1.2, hero.pos.z);
          this.laserTgt.lerp(aimAt, dt * (this.phase === 3 ? 3.5 : 2.2));
          const eyes = this.rig.eyes.map((e) => this.rig.j.head.localToWorld(e.clone()));
          eyes.forEach((e, i) => gm.fx.beam('beye' + i, e, this.laserTgt, 0xff0a1a, 0.12));
          if (this.laserTgt.distanceTo(aimAt) < 1.4) hero.damage(45 * dt, this.pos);
          if (!this.eyeSnd) this.eyeSnd = game.audio.loop('eyelaser');
        }
        if (this.flying) want.y = (8 - (this.pos.y - gm.world.heightFn(this.pos.x, this.pos.z))) * 2;
      } else if (A === 'slam') {
        if (k < 0.45) { want.y = 14; want.addScaledVector(dirTo, 10); }
        else { want.y = -40; }
        const gy = gm.world.heightFn(this.pos.x, this.pos.z);
        if (k > 0.45 && this.pos.y - gy < 0.6 && !this.hitDone) {
          this.hitDone = true;
          gm.fx.shockwave(new THREE.Vector3(this.pos.x, gy + 0.2, this.pos.z), 1, 16, 0xff2a3a, 0.6, new THREE.Vector3(0, 1, 0));
          gm.fx.explosion(new THREE.Vector3(this.pos.x, gy + 0.5, this.pos.z), 2.5, { grav: 12, debris: true, ground: gy });
          game.engine.shake(1.6, 0.6);
          if (hero.pos.distanceTo(this.pos) < 9 && hero.pos.y - gy < 2.5) hero.damage(35, this.pos, { knock: 18 });
        }
      }
      if (this.actionT >= this.actionDur) {
        if (A === 'rifle') { setHeroWeapon(this.rig, null); this.st.weapon = 'fists'; this.st.aim = 0; }
        if (A === 'eyes') { this.laserTgt = null; if (this.eyeSnd) { this.eyeSnd.stop(); this.eyeSnd = null; } }
        this.action = null; this.lastHitStep = -1;
        this.cd = (this.phase === 3 ? 0.5 : this.phase === 2 ? 0.9 : 1.3) * rand(0.7, 1.2);
      }
    } else {
      // reposition between attacks
      if (dist > 7) want.copy(dirTo).multiplyScalar(8 * speedMul);
      else want.set(-dirTo.z, 0, dirTo.x).multiplyScalar(4 * Math.sin(this.t * 0.7));
    }
    // flight in phase 2
    const gy = gm.world.heightFn(this.pos.x, this.pos.z);
    if (this.phase === 2 && this.action !== 'combo' && this.action !== 'slam') { this.flying = true; want.y = (want.y || 0) + (7 - (this.pos.y - gy)) * 2; }
    else if (this.action !== 'slam') { this.flying = false; }
    // integrate
    this.vel.x = damp(this.vel.x, want.x, 5, dt); this.vel.z = damp(this.vel.z, want.z, 5, dt);
    if (this.flying || this.action === 'slam') this.vel.y = damp(this.vel.y, want.y || 0, 4, dt);
    else this.vel.y -= 25 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.exp(-dt * 4));
    if (this.pos.y < gy) { this.pos.y = gy; if (this.vel.y < 0) this.vel.y = 0; }
    gm.clampToBounds(this.pos);
    gm.world.collide(this.pos, this.radius, this.height, this.vel);
    // animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.st.grounded = !this.flying && this.pos.y - gy < 0.2;
    this.st.fly = this.flying ? 1 : 0;
    this.st.flyFwd = clamp(hs / 20, 0, 1);
    this.st.move = clamp(hs / 6, 0, 1.4); this.st.run = hs > 7;
    this.st.hurt = this.hitT > 0 ? 1 : 0;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    animateRig(this.rig, this.st, dt);
    // dark aura
    if (Math.random() < 0.6) gm.fx.smokePuff(new THREE.Vector3(this.pos.x + rand(-0.6, 0.6), this.pos.y + rand(0.5, 2.8), this.pos.z + rand(-0.6, 0.6)), 0.6, 1.2, 0x100004, new THREE.Vector3(0, 1, 0), 0.5);
    if (Math.random() < 0.3) gm.fx.trail(new THREE.Vector3(this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.5, 2.8), this.pos.z + rand(-0.5, 0.5)), 0xff1a3a, 0.2, 0.6, new THREE.Vector3(0, 1.5, 0));
  }

  enterPhase(p) {
    this.phase = p;
    const gm = this.gm;
    game.audio.bossAppear();
    game.engine.shake(1.2, 1);
    gm.fx.shockwave(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z), 1, 30, 0xff1a3a, 0.8);
    if (p === 2) game.voice.say('BOSS', 'You fight like I used to. Hopeful. Naive. Let me show you what a century in the dark does to a hero!', { interrupt: true });
    if (p === 3) game.voice.say('BOSS', 'Enough! I will tear this planet apart with you on it!', { interrupt: true });
    gm.mission.spawnGorillas(gm, 2);
  }
}

// ------------------------------------------------------------------ mission
export class Level5 extends Mission {
  constructor() {
    super(5);
    this.unlocks = { shield: false, laser: false, eject: false };
    this.startAsHero = true;
    this.blockLanding = true;
    this.noBoard = true;
    this.phase = 'battle';
    this.cometT = 1;
  }

  spawn(sm) {
    const c = sm.env.bodyByName('HR 8799 c');
    const e = sm.env.bodyByName('HR 8799 e');
    const pos = e.pos.clone().lerp(c.pos, 0.35).add(new THREE.Vector3(0, 1500, 0));
    return { pos, look: c.pos.clone() };
  }

  setupSpace(sm) {
    const env = sm.env;
    const pp = sm.p.pos.clone();
    const names = ['HR 8799 e', 'HR 8799 d', 'HR 8799 b'];
    this.dreads = names.map((n, i) => {
      const b = env.bodyByName(n);
      const pos = b.pos.clone().addScaledVector(pp.clone().sub(b.pos).normalize(), b.radius * 1.6).add(new THREE.Vector3(0, 300 + i * 200, 0));
      return sm.spawnEnemy('dreadnought', pos, { scale: 1.6 });
    });
    for (const p of env.bodies) if (p.mesh && !p.isStar) for (let k = 0; k < 2; k++) {
      const pos = p.pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0.2, 0.6), rand(-1, 1)).normalize().multiplyScalar(p.radius * 1.5));
      sm.spawnEnemy('station', pos, { scale: 2.6 });
    }
    for (let i = 0; i < 10; i++) sm.spawnEnemy('fighter', pp.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(4000)), { guard: pp.clone().add(new THREE.Vector3(rand(-3000, 3000), rand(-500, 500), rand(-3000, 3000))), guardR: 900 });
    for (let i = 0; i < 10; i++) sm.spawnEnemy('flyer', pp.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(3500)), { guard: pp.clone().add(new THREE.Vector3(rand(-2500, 2500), rand(-400, 400), rand(-2500, 2500))), guardR: 700 });
    for (let i = 0; i < 10; i++) sm.spawnEnemy('elite', pp.clone().add(new THREE.Vector3(Math.cos(i) * 1600, rand(-200, 200), Math.sin(i) * 1600)), { guard: pp.clone(), guardR: 300 });
    for (const e of sm.enemies) e.engaged = false;
    sm.musicOverride = 'boss';
    game.engine.flash(1, 0x9a6aff);
    game.voice.dialogue([
      ['WAIT', 1.5],
      ['AI', 'HR 8799. Four giant worlds, each up to ten times the mass of Jupiter. The heart of the Klin\'Tar Empire.'],
      ['HALE', 'Nova... your signal is breaking up... we have no fleet that can reach you there.'],
      ['NOVA', 'Then I\'ll finish it alone.'],
      ['ELITE', 'The Shadow Guard greets you, human. You will not leave this system alive.'],
      () => { for (const e of sm.enemies) e.engaged = true; },
    ]);
    setTimeout(() => { game.ui.toast('NOVA · UNLEASHED', 'Infinite boost · F titan punch destroys ships · X leap'); game.ui.hint('X: leap onto the nearest comet or ship · ride a comet and hurl it (LMB) at a dreadnought', 9); }, 4000);
  }

  spawnComet(sm) {
    const pp = sm.playerPos();
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    const start = pp.clone().addScaledVector(dir, rand(1200, 2400));
    const vel = new THREE.Vector3(rand(-1, 1), rand(-0.2, 0.2), rand(-1, 1)).normalize().multiplyScalar(rand(120, 220));
    sm.env.spawnComet(start, vel, rand(25, 40));
  }

  counts(sm) {
    const c = (t) => sm.enemies.filter((e) => e.type === t);
    const left = (t) => c(t).filter((e) => e.alive).length;
    return { elite: [c('elite').length - left('elite'), c('elite').length], fighter: [c('fighter').length - left('fighter'), c('fighter').length], flyer: [c('flyer').length - left('flyer'), c('flyer').length], dread: [c('dreadnought').length - left('dreadnought'), c('dreadnought').length] };
  }

  updateSpace(sm, dt) {
    this.cometT -= dt;
    if (this.cometT <= 0 && sm.env.comets.length < 8) { this.cometT = rand(3, 5); this.spawnComet(sm); }
    const k = this.counts(sm);
    const allDone = k.elite[0] === k.elite[1] && k.fighter[0] === k.fighter[1] && k.flyer[0] === k.flyer[1] && k.dread[0] === k.dread[1];
    if (allDone && this.phase === 'battle') {
      this.phase = 'approach';
      game.voice.dialogue([
        ['AI', 'The Shadow Guard is broken. Dreadnoughts destroyed.'],
        ['AI', 'A single life sign on HR 8799 c. It reads... exactly like yours, Nova.'],
        ['NOVA', 'Like mine? ...Let\'s find out.'],
      ]);
      game.ui.hint('Fly to HR 8799 c — the throne world', 6);
    }
    if (this.phase === 'approach') {
      const c = sm.env.bodyByName('HR 8799 c');
      const d = sm.playerPos().distanceTo(c.pos) - c.radius;
      if (d < c.radius * 2.2 && !this.darkened) {
        this.darkened = true;
        game.audio.bossAppear();
        game.voice.say('BOSS', 'Come to me, Nova. I have waited a hundred years for this.', { interrupt: true });
      }
      if (this.darkened) {
        this.dark = Math.min(1, (this.dark || 0) + dt * 0.25);
        sm.env.sky.material.uniforms.uDark.value = this.dark * 0.75; sm.env.sky.material.uniforms.uRed.value = this.dark * 0.6;
        sm.env.starfield.material.uniforms.uDark.value = this.dark * 0.7;
        game.engine.u.uTint.value.setRGB(1.25, 0.55, 0.55); game.engine.u.uTintAmt.value = this.dark * 0.6;
        this.blockLanding = false;
      }
    }
  }

  canLand(sm, body) {
    if (this.phase !== 'approach' || !this.darkened) return { ok: false, reason: 'DEFEAT THE KLIN\'TAR FORCES FIRST' };
    if (body.name !== 'HR 8799 c') return { ok: false, reason: 'THE ENEMY IS ON HR 8799 c' };
    return { ok: true };
  }

  objectives(sm) {
    const k = this.counts(sm);
    if (this.phase !== 'battle') return [{ text: 'Shadow Guard eliminated', done: true }, { text: 'Fleet & creatures destroyed', done: true }, { text: 'Dreadnoughts destroyed', done: true }, { text: 'Fly to HR 8799 c and face the master of the Klin\'Tar', red: true }];
    return [
      { text: `Defeat the Shadow Guard elite squad (${k.elite[0]}/${k.elite[1]})`, done: k.elite[0] === k.elite[1], red: true },
      { text: `Destroy Klin'Tar fighters (${k.fighter[0]}/${k.fighter[1]})`, done: k.fighter[0] === k.fighter[1] },
      { text: `Destroy the void creatures (${k.flyer[0]}/${k.flyer[1]})`, done: k.flyer[0] === k.flyer[1] },
      { text: `Hurl comets into the dreadnoughts (${k.dread[0]}/${k.dread[1]})`, done: k.dread[0] === k.dread[1] },
    ];
  }

  markers(sm) {
    const list = [];
    for (const e of this.dreads || []) if (e.alive) list.push({ id: 'dn' + e.id, pos: e.pos, label: 'DREADNOUGHT', icon: '!', kind: 'skull', color: '#ff3b4e', edge: true, showDist: true });
    if (this.phase === 'approach') { const c = sm.env.bodyByName('HR 8799 c'); list.push({ id: 'throne', pos: c.pos.clone().add(new THREE.Vector3(0, c.radius * 1.2, 0)), label: 'THRONE WORLD', icon: '☠', kind: 'skull', color: '#ff1a3a', edge: true, showDist: true }); }
    for (const c of sm.env.comets) if (!c.launched && c.pos.distanceTo(sm.playerPos()) < 3000) list.push({ id: 'cm' + c.group.id, pos: c.pos, label: 'COMET', kind: 'enemy', color: '#9fe8ff' });
    return list;
  }

  actions() { return []; }
  checkComplete() {}

  // ---------------------------------------------------------------- the throne arena
  groundConfig(body, how) {
    return { kind: 'throne', body, level: 5, arrival: 'drop', biome: 'throne', mission: this };
  }

  spawnGorillas(gm, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const e = gm.addEnemy({ kind: 'gorilla', pos: new THREE.Vector3(Math.cos(a) * 55, 0, Math.sin(a) * 55), style: 5 });
      e.alert(gm.hero.pos, i === 0);
    }
  }

  setupGround(gm, cfg) {
    this.gmState = { cfg, step: 'intro' };
    const S = this.gmState;
    gm.showRemaining = false;
    const boss = new Boss(gm, new THREE.Vector3(0, 60, 40));
    this.boss = boss;
    gm.enemies.push(boss);
    gm.extraTargets = [];
    game.engine.u.uTintAmt.value = 0.25; game.engine.u.uTint.value.setRGB(1.2, 0.7, 0.7);
    gm.onEnter = async () => {
      gm.hero.landPose = 1; game.audio.land(true); game.engine.shake(1.2, 0.5);
      this.spawnGorillas(gm, 3);
      game.voice.dialogue([['NOVA', 'Gorilla-beasts... the Emperor\'s pets. Bring it!']]);
      await new Promise((r) => setTimeout(r, 2500));
      S.step = 'gorillas';
    };
  }

  async bossIntro(gm) {
    const S = this.gmState;
    S.step = 'cine';
    const boss = this.boss;
    gm.inputLocked = true;
    game.audio.setMusic(null);
    game.audio.bossAppear();
    game.engine.u.uDark.value = 0.2;
    // the boss descends
    const t0 = performance.now();
    const fall = (dt) => {
      boss.pos.y = Math.max(0, boss.pos.y - dt * 45);
      boss.st.fly = 1; boss.st.grounded = false;
      if (boss.pos.y <= 0 && !S.landed) {
        S.landed = true;
        boss.st.fly = 0; boss.st.grounded = true; boss.st.landPose = 1;
        gm.fx.shockwave(new THREE.Vector3(boss.pos.x, 0.2, boss.pos.z), 1, 26, 0xff1a3a, 0.9, new THREE.Vector3(0, 1, 0));
        gm.fx.explosion(new THREE.Vector3(boss.pos.x, 0.5, boss.pos.z), 3, { grav: 10, ground: 0 });
        game.engine.shake(2, 0.8);
        game.ui.center('FINAL BOSS', '', 3.5, 'boss');
        setTimeout(() => { boss.st.landPose = 0; }, 900);
        gm.locUpdates.splice(gm.locUpdates.indexOf(fall), 1);
      }
    };
    gm.locUpdates.push(fall);
    // camera looks at the boss during the talk
    const look = (dt) => {
      const cam = gm.camera; const h = gm.hero;
      const toB = new THREE.Vector3(boss.pos.x - h.pos.x, 0, boss.pos.z - h.pos.z);
      h.yaw = Math.atan2(toB.x, toB.z); h.pitch = damp(h.pitch, Math.atan2(boss.pos.y + 2 - (h.pos.y + 1.6), toB.length()), 4, dt);
    };
    gm.locUpdates.push(look);
    await new Promise((r) => setTimeout(r, 4200));
    this.bossTalking = true;
    await game.voice.dialogue([
      ['NOVA', 'Who are you?'],
      ['BOSS', 'Look closely, Nova. You know this face. I am you.', { label: 'NOVA · FROM THE FUTURE' }],
      ['BOSS', 'Three hundred years from now, the people you saved will betray you. They will call you a weapon, and lock you in a prison among the stars.', { label: 'NOVA · FROM THE FUTURE' }],
      ['BOSS', 'One hundred years in the dark. When I escaped, I built an army. The Klin\'Tar. And I came back for all of them.', { label: 'NOVA · FROM THE FUTURE' }],
      ['NOVA', 'Then you are not me anymore. You are everything I will never become.'],
      ['BOSS', 'We shall see. Every soldier you killed was mine. Now I will end you myself!', { label: 'NOVA · FROM THE FUTURE' }],
    ]);
    this.bossTalking = false;
    gm.locUpdates.splice(gm.locUpdates.indexOf(look), 1);
    gm.inputLocked = false;
    game.engine.u.uDark.value = 0;
    boss.active = true;
    S.step = 'fight';
    game.audio.setMusic('boss');
    this.spawnGorillas(gm, 2);
  }

  updateGround(gm, dt) {
    const S = this.gmState; if (!S) return;
    if (S.step === 'gorillas') {
      const left = gm.enemies.filter((e) => e.alive && e.kind === 'gorilla').length;
      if (left === 0) this.bossIntro(gm);
    }
    if (this.boss && (S.step === 'fight' || S.step === 'cine')) game.ui.boss('NOVA · FROM THE FUTURE', this.boss.hp / this.boss.maxHp);
    if (S.step === 'won' && S.explosionsT !== undefined) {
      S.explosionsT -= dt;
      if (S.explosionsT <= 0 && S.blasts < 14) {
        S.explosionsT = rand(0.4, 1.1); S.blasts++;
        const a = rand(0, Math.PI * 2), d = rand(500, 1300);
        const p = new THREE.Vector3(Math.cos(a) * d, rand(120, 420), Math.sin(a) * d);
        gm.fx.megaExplosion(p, rand(120, 260));
        game.audio.explosion(4, gm.hero.pos.clone().add(p.clone().sub(gm.hero.pos).normalize().multiplyScalar(200)));
        game.engine.shake(0.6, 0.6);
      }
    }
  }

  bossDefeated(gm, boss) {
    const S = this.gmState;
    S.step = 'won';
    game.ui.boss(null);
    if (boss.eyeSnd) { boss.eyeSnd.stop(); boss.eyeSnd = null; }
    for (const e of gm.enemies) if (e.alive && e !== boss) e.damage(1e6, 'body', null, {});
    game.audio.setMusic(null);
    game.engine.shake(1.5, 1);
    game.ui.center('VICTORY', 'THE KLIN\'TAR EMPIRE HAS FALLEN', 5, 'gold');
    game.voice.dialogue([
      ['BOSS', 'You... cannot change... what is coming...', { label: 'NOVA · FROM THE FUTURE' }],
      ['NOVA', 'Watch me.'],
      () => {
        for (let i = 0; i < 80; i++) gm.fx.smokePuff(new THREE.Vector3(boss.pos.x + rand(-1, 1), boss.pos.y + rand(0, 3), boss.pos.z + rand(-1, 1)), 1.2, 3, 0x100004, new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), 0.7);
        gm.scene.remove(boss.root); boss.removed = true;
        S.explosionsT = 0.5; S.blasts = 0;
        game.audio.megaExplosion();
      },
      ['WAIT', 2],
      ['HALE', 'Nova! Every Klin\'Tar base and station in the system is exploding! Their whole network is collapsing!'],
      ['NOVA', 'It\'s over.'],
      ['HALE', 'Come home, Nova.'],
    ]).then(() => { S.homeReady = true; game.audio.setMusic('peace'); game.ui.hint('Press H to go home', 10); });
    game.save.complete(5);
  }

  groundObjectives(gm) {
    const S = this.gmState; if (!S) return [];
    if (S.step === 'intro' || S.step === 'gorillas') return [{ text: `Kill the gorilla-beasts (${gm.enemies.filter((e) => e.kind === 'gorilla' && !e.alive).length}/${gm.enemies.filter((e) => e.kind === 'gorilla').length})`, red: true }];
    if (S.step === 'cine' || S.step === 'fight') return [{ text: 'Defeat the master of the Klin\'Tar', red: true }];
    return [{ text: 'The Klin\'Tar Empire has fallen', done: true }, { text: 'Go home', red: !S.homeReady }];
  }
  groundMarkers() { return []; }
  groundActions(gm) {
    const S = this.gmState;
    if (S && S.homeReady) return [{ id: 'home', label: 'HOME', key: 'KeyH', keyLabel: 'H', big: true, onClick: () => { if (S.going) return; S.going = true; game.audio.teleport(); game.engine.flash(1, 0xbff8ff); game.flow.ending(); } }];
    return [];
  }
  onGroundKill() {}
  onNPCKilled() {}
}
