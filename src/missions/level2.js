// LEVEL 2 — Kepler-90: energy shield, the colonizer ring ship, hostages, the 5-minute fusion charge, the Keplerian homeworld.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { clamp, rand, pick, fmtTime } from '../core/util.js';
import { Mission } from './common.js';
import { buildColonizer, buildPlayerShip } from '../gfx/models-ships.js';
import { buildHero, setHeroWeapon, animateRig } from '../gfx/models-chars.js';
import { beamMaterial } from '../gfx/shaders.js';

const BOMB_TIME = 300;

// tractor beam from the hovering ship
export function addBeam(gm, pos, height = 40, opts = {}) {
  const g = new THREE.Group(); g.position.copy(pos);
  const mat = beamMaterial(opts.color || 0x9fe8ff);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, height, 32, 1, true).translate(0, height / 2, 0), mat);
  g.add(cone);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.y = 0.06; g.add(ring);
  const ship = buildPlayerShip(); ship.group.position.set(0, height + 3, 0); ship.group.rotation.x = 0.0; g.add(ship.group);
  const light = new THREE.PointLight(0x9fe8ff, 260, 40, 2); light.position.set(0, 6, 0); g.add(light);
  gm.scene.add(g);
  gm.uniforms.push(mat.uniforms);
  const snd = game.audio.loop('beam');
  const b = {
    group: g, pos: pos.clone(), height, ship, snd,
    update(dt) {
      ring.rotation.z += dt; ship.group.position.y = height + 3 + Math.sin(gm.time * 1.2) * 0.4; ship.group.rotation.y += dt * 0.1;
      for (const f of ship.engines) { f.material.uniforms.uTime.value = gm.time; f.scale.z = 0.4; }
      if (Math.random() < 0.6) gm.fx.trail(new THREE.Vector3(pos.x + rand(-2.5, 2.5), pos.y + rand(0, 3), pos.z + rand(-2.5, 2.5)), 0x9fe8ff, 0.25, 2.5, new THREE.Vector3(0, 6, 0));
    },
    remove() { gm.scene.remove(g); snd.stop(); },
  };
  return b;
}

// Nova rising up the beam into the ship
export function beamUp(gm, beam, onDone) {
  if (gm.beamingUp) return;
  gm.beamingUp = true;
  gm.cinematic = true;
  const h = gm.hero;
  h.flying = false; h.vel.set(0, 0, 0);
  game.audio.teleport();
  let t = 0;
  const up = (dt) => {
    t += dt;
    h.pos.x += (beam.pos.x - h.pos.x) * dt * 3; h.pos.z += (beam.pos.z - h.pos.z) * dt * 3;
    h.pos.y += dt * (4 + t * 6);
    h.st.beam = true;
    if (t > 2.6) { gm.locUpdates.splice(gm.locUpdates.indexOf(up), 1); game.ui.flashWhite(0.8, '#bff8ff'); onDone(); }
  };
  gm.locUpdates.push(up);
}

export class Level2 extends Mission {
  constructor() {
    super(2);
    this.phase = 'space';
    this.bomb = null; // seconds left
    this.colonizerDestroyed = false;
    this.hostagesFreed = false;
    this.hostagesAboard = 0;
    this.hostagesHome = false;
    this.hostageTotal = 8;
  }

  spawn(sm) {
    const h = sm.env.bodyByName('KEPLER-90 h');
    const out = h.pos.clone().normalize();
    const side = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = h.pos.clone().addScaledVector(out, h.radius * 4.5).addScaledVector(side, h.radius * 2.5).add(new THREE.Vector3(0, h.radius * 0.6, 0));
    return { pos, look: h.pos.clone() };
  }

  setupSpace(sm) {
    const env = sm.env;
    for (const name of ['KEPLER-90 i', 'KEPLER-90 d', 'KEPLER-90 e']) this.spawnPatrol(sm, this.guardPoint(env.bodyByName(name)), 2, name === 'KEPLER-90 e' ? 1 : 0, 750);
    // the colonizer ring around Kepler-90 h
    const h = env.bodyByName('KEPLER-90 h');
    const R = h.radius * 1.9, tube = 260;
    const col = buildColonizer(R, tube);
    col.group.position.copy(h.pos);
    col.group.rotation.set(Math.PI / 2 - 0.35, 0.2, 0);
    sm.scene.add(col.group);
    this.col = { ...col, center: h.pos.clone(), planet: h };
    this.spawnPatrol(sm, h.pos.clone().add(new THREE.Vector3(R * 0.9, 300, 0)), 3, 1, 900);
    game.voice.dialogue([
      ['WAIT', 1.5],
      ['AI', 'Arrived in the Kepler-90 system. Eight planets, two thousand seven hundred light-years from Earth.'],
      ['HALE', 'Nova, our scans show a Klin\'Tar colonizer — a ring ship the size of a moon — orbiting Kepler-90 h. It is full of prisoners from Kepler-90 f.'],
      ['HALE', 'Your ship now has an energy shield. Press Q to raise it. It will not last forever, so use it wisely.'],
      ['NOVA', 'Understood. I\'ll clear their fighters, free the captured worlds, and get those people out.'],
    ]);
    game.ui.toast('NEW · ENERGY SHIELD', 'Q to raise / lower · drains while active');
  }

  // ---------------------------------------------------------------- colonizer geometry
  ringDistance(p) {
    const c = this.col;
    const local = p.clone().sub(c.center).applyQuaternion(c.group.quaternion.clone().invert());
    const q = Math.hypot(Math.hypot(local.x, local.y) - c.R, local.z);
    return q - c.tube;
  }
  raycastRing(o, d) {
    let t = 0;
    for (let i = 0; i < 400 && t < 12000; i++) {
      const p = o.clone().addScaledVector(d, t);
      const dist = this.ringDistance(p);
      if (dist < 3) return p;
      t += Math.max(dist * 0.9, 4);
    }
    return null;
  }

  updateSpace(sm, dt) {
    // bomb countdown keeps running in space
    if (this.bomb !== null && !this.colonizerDestroyed) {
      this.bomb -= dt;
      game.ui.timer(this.bomb, 'COLONIZER DETONATION');
      if (this.bomb <= 0) this.detonate(sm);
    } else if (this.colonizerDestroyed) game.ui.timer(null);
    if (this.col && !this.colonizerDestroyed) this.col.group.rotation.z += dt * 0.006;
    if (this.col && this.col.core) this.col.core.scale.setScalar(1 + Math.sin(sm.time * 3) * 0.06);
    // keep the player from flying through the ring
    if (this.col && !this.colonizerDestroyed && (sm.mode === 'ship' || sm.mode === 'hero')) {
      const c = sm.mode === 'hero' ? sm.h : sm.p;
      const d = this.ringDistance(c.pos);
      if (d < 20) { const n = c.pos.clone().sub(this.col.center).normalize(); c.vel.addScaledVector(n, 200 * dt * 10); sm.damagePlayer(5, c.pos.clone().sub(n)); }
    }
    this.checkComplete(sm);
  }

  extraDone() { return this.colonizerDestroyed && this.hostagesHome; }

  objectives(sm) {
    const list = this.baseObjectives(sm);
    if (!this.hostagesFreed) list.push({ text: 'Infiltrate the colonizer ring at KEPLER-90 h', red: true });
    else if (!this.colonizerDestroyed) list.push({ text: this.bomb !== null ? `Get clear — fusion charge detonates in ${fmtTime(this.bomb)}` : 'Destroy the colonizer', red: true });
    else list.push({ text: 'Destroy the colonizer', done: true });
    list.push({ text: this.hostagesHome ? 'Hostages returned home' : this.hostagesFreed ? `Bring ${this.hostagesAboard} hostages home to KEPLER-90 f` : 'Rescue the Keplerian hostages', done: this.hostagesHome });
    return list;
  }

  markers(sm) {
    const list = super.markers(sm);
    if (this.col && !this.colonizerDestroyed) {
      const p = this.col.center.clone().add(new THREE.Vector3(0, this.col.R * 0.5, 0));
      list.push({ id: 'colonizer', pos: p, label: 'COLONIZER', kind: 'objective', color: '#ffd23f', edge: !this.hostagesFreed, showDist: true });
    }
    if (this.hostagesFreed && !this.hostagesHome) {
      const f = sm.env.bodyByName('KEPLER-90 f');
      list.push({ id: 'home', pos: f.pos.clone().add(new THREE.Vector3(0, f.radius * 1.3, 0)), label: 'HOMEWORLD', kind: 'objective', color: '#5dff9b', edge: true, showDist: true });
    }
    if (sm.mode === 'target' && sm.target && sm.target.point) list.push({ id: 'dropzone', pos: sm.target.point, label: 'DROP ZONE', kind: 'lock', color: '#5dff9b' });
    return list;
  }

  actions(sm) {
    const acts = super.actions(sm);
    if (this.col && !this.hostagesFreed && (sm.mode === 'ship' || sm.mode === 'target')) {
      const d = this.ringDistance(sm.p.pos);
      if (sm.mode === 'target') {
        acts.push({ id: 'cancel', label: 'CANCEL TARGETING', key: 'KeyT', keyLabel: 'T', onClick: () => sm.cancelTargeting() });
        if (sm.target && sm.target.valid) acts.push({ id: 'launch', label: 'LAUNCH NOVA', key: 'Enter', keyLabel: 'ENTER', big: true, onClick: () => this.launchNova(sm) });
      } else if (d < 4200 && d > 450) {
        acts.push({ id: 'target', label: 'TARGET DROP ZONE', key: 'KeyT', keyLabel: 'T', big: true, onClick: () => sm.startTargeting({ raycast: (o, dir) => this.raycastRing(o, dir) }) });
      } else if (d <= 450) {
        game.ui.hint('Too close to the colonizer — pull back to target a drop zone', 1);
      }
    }
    return acts;
  }

  canLand(sm, body) {
    if (body.name === 'KEPLER-90 h') return { ok: false, reason: 'KEPLER-90 h — GAS GIANT GUARDED BY THE COLONIZER' };
    return { ok: true };
  }

  // Nova flies from the ship to the targeted spot on the ring
  launchNova(sm) {
    const target = sm.target.point.clone();
    sm.zoom = false;
    sm.ensureHero();
    const h = sm.h;
    h.pos.copy(sm.p.pos).add(new THREE.Vector3(0, -3, 0).applyQuaternion(sm.p.q));
    sm.hero.root.visible = true;
    setHeroWeapon(sm.hero, null);
    const start = h.pos.clone();
    const dist = start.distanceTo(target);
    let t = 0;
    game.audio.whoosh(0.4, 300); game.audio.rocket();
    game.ui.hint('Nova launches toward the colonizer…', 3);
    sm.playCine((dt) => {
      t += dt;
      const k = Math.min(1, t / 2.6);
      const e = k * k * (3 - 2 * k);
      h.pos.copy(start).lerp(target, e);
      const dir = target.clone().sub(start).normalize();
      sm.aimQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      h.vel.copy(dir).multiplyScalar(dist / 2.6);
      h.st.boost = 1;
      sm.updateHeroModel(dt, true);
      sm.fx.trail(h.pos.clone(), 0x9ff8ff, 3, 0.8);
      sm.fovExtra = 30 * Math.sin(k * Math.PI);
      if (k >= 1 && !this._landed) {
        this._landed = true;
        game.engine.shake(1.5, 0.5); game.audio.land(true);
        game.ui.fadeTo(1, 0.4).then(() => this.enterColonizer(sm));
      }
      return false;
    }, { hero: true });
  }

  async enterColonizer(sm) {
    this.phase = 'colonizer';
    sm.hero.root.visible = false;
    sm.mode = 'ship'; sm.cineFn = null; sm.cineHero = false;
    await game.flow.enterLocation({ kind: 'colonizer', biome: 'colonizer', arrival: 'drop', colonizer: true });
  }

  // ---------------------------------------------------------------- ground: colonizer & homeworld
  groundConfig(body, how) {
    const def = body.def || body;
    if (def.homeworld) return { kind: 'planet', body, level: 2, arrival: how, captured: false, village: true, mission: this, homeworld: true };
    return super.groundConfig(body, how);
  }

  setupGround(gm, cfg) {
    if (cfg.colonizer) return this.setupColonizer(gm);
    if (cfg.homeworld) return this.setupHomeworld(gm, cfg);
    return super.setupGround(gm, cfg);
  }

  setupColonizer(gm) {
    const L = gm.loc;
    this.gmState = { cfg: { captured: false, colonizer: true }, step: 'infiltrate', guards: [], hostages: [], beam: null };
    const S = this.gmState;
    for (const pt of L.patrols) gm.addEnemy({ kind: 'soldier', weapon: 'plasma', pos: pt.pos, patrol: pt.path, style: 2 });
    for (const g of L.guards) S.guards.push(gm.addEnemy({ kind: g.kind, weapon: g.weapon, pos: g.pos, yaw: Math.PI, style: 2 }));
    L.hostageSpots.forEach((p, i) => S.hostages.push(gm.addNPC({ look: 'kepler', pos: p, yaw: Math.PI + rand(-0.3, 0.3), kneel: true, hostage: true, seed: 40 + i })));
    gm.onEnter = () => {
      gm.hero.landPose = 1; game.engine.shake(1.2, 0.5); game.audio.land(true);
      gm.fx.shockwave(gm.hero.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.5, 9, 0xbfe8ff, 0.5, new THREE.Vector3(0, 1, 0));
      game.audio.setMusic('stealth');
      game.voice.dialogue([
        ['NOVA', 'I\'m on the hull. Moving inside.'],
        ['AI', 'Hostages detected in the central hangar. Patrols ahead — approach from behind and press F for a silent takedown.'],
      ]);
      game.ui.hint('Follow the green marker to the hostages · C to crouch · F behind an enemy = silent takedown', 7);
    };
    gm.addInteract({ pos: L.hangar.clone().add(new THREE.Vector3(0, 0, -1)), radius: 6, hold: 2.5, label: 'FREE THE HOSTAGES (HOLD E)', enabled: () => S.step === 'infiltrate' && S.guards.every((g) => !g.alive), onDone: () => this.freeHostages(gm) });
    gm.addInteract({ pos: L.console.clone(), radius: 3.2, hold: 3, label: 'PLANT FUSION CHARGE (HOLD E)', enabled: () => S.step === 'bomb', onDone: () => this.plantBomb(gm), onHolding: () => { if (Math.random() < 0.1) game.audio.tick(); } });
  }

  freeHostages(gm) {
    const S = this.gmState;
    S.step = 'freed';
    this.hostagesFreed = true;
    game.audio.objective();
    for (const h of S.hostages) { h.st.kneel = 0; h.mode = 'idle'; h.faceHero = true; h.st.cheer = 1; setTimeout(() => (h.st.cheer = 0), 2500); }
    const giver = S.hostages[2];
    gm.cinematic = true;
    game.voice.dialogue([
      ['HOSTAGE', 'You came for us! Bless you, stranger from the stars!'],
      () => { giver.mode = 'goto'; giver.target = gm.hero.pos.clone().add(new THREE.Vector3(0, 0, 1.4)); giver.faceHero = true; },
      ['WAIT', 1.4],
      () => { giver.mode = 'idle'; giver.st.attack = { kind: 'give', t: 0 }; let t = 0; const f = (dt) => { t += dt; giver.st.attack = { kind: 'give', t: Math.min(1, t) }; if (t > 1.5) { giver.st.attack = null; gm.locUpdates.splice(gm.locUpdates.indexOf(f), 1); } }; gm.locUpdates.push(f); },
      ['HOSTAGE', 'Take this. Our engineers built it in secret, right under their noses. A fusion charge.', { }],
      () => { this.showItemCard('FUSION CHARGE', 'Plant it on the reactor core · 5:00 fuse'); },
      ['HOSTAGE', 'Place it on the reactor core. It will tear this abomination apart.'],
      ['NOVA', 'Get everyone ready. I\'m calling my ship.'],
    ]).then(() => {
      gm.cinematic = false;
      S.step = 'beam';
      game.ui.hint('Press B to call the tractor beam for the hostages', 6);
    });
  }

  showItemCard(title, sub) {
    game.audio.pickup();
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:50%;top:58%;transform:translate(-50%,-50%) scale(0.6);opacity:0;transition:all .45s cubic-bezier(.2,1.4,.4,1);text-align:center;font-family:Orbitron,sans-serif;pointer-events:none;';
    el.innerHTML = `<div style="width:120px;height:80px;margin:0 auto 12px;border:2px solid #ffd23f;background:linear-gradient(135deg,#1a1a10,#3a3420);box-shadow:0 0 30px rgba(255,210,63,.6);position:relative"><div style="position:absolute;left:14px;top:18px;width:90px;height:40px;background:#222;border:1px solid #666"></div><div style="position:absolute;right:16px;top:24px;width:10px;height:10px;border-radius:50%;background:#ff2030;box-shadow:0 0 10px #ff2030;animation:pulse .6s infinite"></div><div style="position:absolute;left:22px;top:28px;color:#ff4a4a;font-size:14px;letter-spacing:2px">05:00</div></div><div style="color:#ffd23f;font-size:13px;letter-spacing:5px">ACQUIRED</div><div style="color:#fff;font-size:26px;letter-spacing:4px;font-weight:900;text-shadow:0 0 14px rgba(255,210,63,.8)">${title}</div><div style="color:#cfe;font-family:Rajdhani;font-size:16px;letter-spacing:1px">${sub}</div>`;
    document.getElementById('ui').appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = 1; el.style.transform = 'translate(-50%,-50%) scale(1)'; });
    setTimeout(() => { el.style.opacity = 0; el.style.transform = 'translate(-50%,-50%) scale(0.9)'; }, 3800);
    setTimeout(() => el.remove(), 4400);
  }

  callBeam(gm) {
    const S = this.gmState;
    if (S.beam) return;
    S.beam = addBeam(gm, gm.loc.beam.clone(), 30);
    S.step = 'bomb';
    game.voice.dialogue([['AI', 'Tractor beam locked. Bringing them aboard.'], ['NOVA', 'Now, the reactor core.']]);
    game.ui.hint('Head to the reactor core (yellow marker) and plant the charge', 6);
    S.hostages.forEach((h, i) => {
      setTimeout(() => {
        if (!h.alive) return;
        h.mode = 'goto'; h.speed = 2.2; h.faceHero = false;
        h.target = gm.loc.beam.clone().add(new THREE.Vector3(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)));
        h.onArrive = (n) => { n.mode = 'beam'; n.beamTop = 26; n.onGone = () => { this.hostagesAboard++; game.ui.toast('HOSTAGE ABOARD', `${this.hostagesAboard}/${this.hostageTotal}`); }; };
      }, 1500 + i * 1700);
    });
  }

  plantBomb(gm) {
    const S = this.gmState;
    S.step = 'escape';
    this.bomb = BOMB_TIME;
    game.audio.bombPlant();
    game.audio.klaxon();
    game.audio.setMusic('tension');
    S.alarm = game.audio.loop('alarm');
    setTimeout(() => S.alarm && S.alarm.stop(), 6000);
    game.ui.center('CHARGE ARMED', '05:00 · GET TO THE BEAM', 3, 'red');
    game.voice.dialogue([['NOVA', 'Charge planted. Five minutes. Time to go.'], ['ALIEN', 'Sabotage at the core! Kill the human!']]);
    // reinforcement waves
    S.waveT = 3;
    // mark bomb
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2a20, metalness: 0.6, roughness: 0.4 }));
    b.position.copy(gm.loc.console).add(new THREE.Vector3(0, 1.55, 0)); gm.scene.add(b);
    const led = new THREE.PointLight(0xff2030, 4, 6, 2); led.position.copy(b.position).add(new THREE.Vector3(0, 0.5, 0)); gm.scene.add(led);
    S.bombMesh = b; S.led = led;
  }

  updateGround(gm, dt) {
    const S = this.gmState;
    if (!S || !S.cfg) return;
    if (S.cfg.homeworld) return this.updateHomeworld(gm, dt);
    if (!S.cfg.colonizer) return;
    if (S.beam) {
      S.beam.update(dt);
      if (S.step === 'escape' && gm.hero.pos.distanceTo(S.beam.pos) < 3.4 && !gm.beamingUp) {
        beamUp(gm, S.beam, () => this.leaveColonizer(gm));
      }
    }
    if (S.step === 'beam' && game.input.pressed('KeyB')) this.callBeam(gm);
    if (this.bomb !== null) {
      this.bomb -= dt;
      game.ui.timer(this.bomb, 'FUSION CHARGE');
      if (S.led) S.led.intensity = Math.sin(gm.time * 8) > 0 ? 6 : 0.5;
      if (Math.floor(this.bomb) !== Math.floor(this.bomb + dt) && this.bomb < 30) game.audio.beep(1800, 0.06);
      S.waveT -= dt;
      if (S.waveT <= 0 && S.step === 'escape') {
        S.waveT = rand(14, 22);
        const alive = gm.enemies.filter((e) => e.alive).length;
        if (alive < 10) {
          const spots = gm.loc.waves;
          for (let i = 0; i < 3; i++) {
            const p = pick(spots).clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
            const e = gm.addEnemy({ kind: Math.random() < 0.2 ? 'brute' : 'soldier', weapon: Math.random() < 0.3 ? 'scatter' : 'plasma', pos: p, style: 2 });
            if (e.kind === 'brute') e.weapon = 'heavy';
            e.alert(gm.hero.pos, i === 0);
          }
        }
      }
      if (this.bomb <= 0) {
        game.ui.timer(null);
        this.bomb = 0;
        gm.fx.megaExplosion(gm.hero.pos.clone(), 200);
        game.audio.megaExplosion(); game.engine.flash(1, 0xffe0c0);
        gm.hero.alive = false;
        game.flow.death('CAUGHT IN THE BLAST', 'Nova was still aboard when the fusion charge detonated.');
      }
    }
  }

  async leaveColonizer(gm) {
    game.ui.timer(this.bomb, 'COLONIZER DETONATION');
    const S = this.gmState;
    if (S.beam) S.beam.remove();
    this.phase = 'escape';
    // any hostages still walking are pulled up instantly
    for (const h of S.hostages) if (h.alive && !h.gone) this.hostagesAboard++;
    this.hostagesAboard = Math.min(this.hostageTotal, this.hostagesAboard);
    await game.flow.exitGround({ how: 'beam', colonizer: true });
  }

  onReturnToSpace(sm, result, body) {
    if (result && result.colonizer) {
      // place the ship near the colonizer, pointing away from it
      const out = sm.p.pos.clone().sub(this.col.center).normalize();
      sm.p.pos.copy(this.col.center).addScaledVector(out, this.col.R + 1500).add(new THREE.Vector3(0, 400, 0));
      sm.ship.group.position.copy(sm.p.pos);
      const f = sm.env.bodyByName('KEPLER-90 f');
      const dir = f.pos.clone().sub(sm.p.pos).normalize();
      sm.aimQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); sm.p.q.copy(sm.aimQ);
      sm.p.vel.copy(dir).multiplyScalar(150);
      // interceptors on the way home
      const mid = sm.p.pos.clone().lerp(f.pos, 0.45);
      for (let i = 0; i < 4; i++) { const e = sm.spawnEnemy('fighter', mid.clone().add(new THREE.Vector3(rand(-600, 600), rand(-200, 200), rand(-600, 600))), { engaged: true }); e.engaged = true; }
      game.audio.setMusic('combat');
      game.voice.dialogue([
        ['AI', `${this.hostagesAboard} Keplerians aboard. Fighters intercepting on the route to Kepler-90 f.`],
        ['NOVA', 'Hold on back there. We\'re going home.'],
      ]);
      game.ui.hint('Fly to KEPLER-90 f (green marker) and land with E', 6);
    }
    if (result && result.homeworldDone) game.voice.dialogue([['HALE', 'The Keplerians are home. Finish the remaining Klin\'Tar forces in this system, Nova.']]);
  }

  detonate(sm) {
    this.colonizerDestroyed = true;
    this.bomb = null;
    game.ui.timer(null);
    const c = this.col;
    // destroy enemies near the ring
    for (const e of sm.enemies) if (e.alive && this.ringDistance(e.pos) < 1500) sm.killEnemy(e, 'mega');
    const prevMode = sm.mode;
    const camStart = sm.camera.position.clone();
    const blast = c.center.clone().add(new THREE.Vector3(c.R, 0, 0).applyQuaternion(c.group.quaternion));
    let t = 0;
    game.voice.dialogue([['AI', 'Detonation confirmed. The colonizer is breaking apart!']]);
    sm.mode = 'cine';
    sm.camOverride = true;
    sm.cineFn = (dt) => {
      t += dt;
      const look = c.center.clone();
      const dir = sm.p.pos.clone().sub(c.center).normalize();
      sm.camera.position.copy(c.center).addScaledVector(dir, c.R * 2.6).add(new THREE.Vector3(0, c.R * 0.7, 0));
      sm.camera.lookAt(look);
      if (t > 0.3 && !this._boom1) { this._boom1 = true; sm.fx.megaExplosion(c.center.clone(), c.R * 0.6); game.audio.megaExplosion(); game.engine.flash(1, 0xffe8c8); game.engine.shake(3, 3); }
      if (t > 1.1 && !this._boom2) { this._boom2 = true; sm.fx.megaExplosion(blast, c.R * 0.5); c.group.visible = false; for (let i = 0; i < 40; i++) sm.fx.debris(c.center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(c.R)), 2, 60, 900); }
      if (t > 1.8 && !this._boom3) { this._boom3 = true; for (let i = 0; i < 6; i++) setTimeout(() => sm.fx.explosion(c.center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(c.R)), 40, { silent: i > 1 }), i * 300); }
      if (t > 5.5) {
        sm.mode = prevMode === 'cine' || prevMode === 'target' ? 'ship' : prevMode; sm.cineFn = null;
        sm.camOverride = false;
        sm.camPos.copy(camStart);
        game.ui.center('COLONIZER DESTROYED', 'THE RING SHIP IS GONE', 4, 'gold');
        game.audio.objective();
        return true;
      }
      return false;
    };
  }

  // ---------------------------------------------------------------- homeworld: Kepler-90 f
  setupHomeworld(gm, cfg) {
    this.gmState = { cfg, step: 'arrive', npcs: [] };
    const S = this.gmState;
    const v = gm.village.center;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; S.npcs.push(gm.addNPC({ look: 'kepler', pos: v.clone().add(new THREE.Vector3(Math.cos(a) * 14, 0, Math.sin(a) * 14)), mode: 'wander', seed: 100 + i })); }
    const elder = gm.addNPC({ look: 'kepler', pos: v.clone().add(new THREE.Vector3(0, 0, 4)), seed: 7, extra: { hood: true } });
    elder.faceHero = true; S.elder = elder;
    gm.addInteract({ pos: gm.shipModel.group.position.clone().setY(gm.world.heightFn(gm.shipModel.group.position.x, gm.shipModel.group.position.z)), radius: 6, label: 'BOARD SHIP · RETURN TO ORBIT', enabled: () => S.step === 'done' || !this.hostagesFreed, onDone: () => this.leaveGround(gm, 'ship') });
    this.gmState.boarded = false;
    this.currentPlanet = 'KEPLER-90 f';
    gm.onEnter = () => {
      game.audio.setMusic('peace');
      if (!this.hostagesFreed || this.hostagesHome) { game.ui.hint('KEPLER-90 f — the Keplerian homeworld', 5); S.step = 'done'; return; }
      // hostages walk out of the ship
      const shipPos = gm.shipModel.group.position.clone();
      const n = Math.max(1, this.hostagesAboard);
      S.hostages = [];
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const h = gm.addNPC({ look: 'kepler', pos: shipPos.clone().add(new THREE.Vector3(2, 0, 3)).setY(gm.world.heightFn(shipPos.x + 2, shipPos.z + 3)), seed: 40 + i, mode: 'goto' });
          h.target = v.clone().add(new THREE.Vector3(-6 + (i % 4) * 4, 0, -4 + Math.floor(i / 4) * 2.5)); h.speed = 2; h.onArrive = (nn) => { nn.faceHero = true; nn.st.cheer = 1; };
          S.hostages.push(h);
        }, 800 + i * 700);
      }
      S.step = 'reunion';
      setTimeout(() => {
        game.audio.crowdCheer(6);
        for (const c of S.npcs) { c.mode = 'idle'; c.faceHero = true; c.st.cheer = 1; }
        game.voice.dialogue([
          ['HOSTAGE', 'We are home! Look, everyone, we are home!'],
          ['ELDER', 'Child of Earth... you brought our people back from the dark. The Keplerians will sing of this day for a thousand years.'],
          ['HOSTAGE', 'Thank you, Nova. Thank you!'],
          ['NOVA', 'Your world is free now. Rebuild it. I will make sure the Klin\'Tar never come back.'],
          ['ELDER', 'Go with the light of Kepler, warrior. Our hearts fly with you.'],
        ]).then(() => {
          this.hostagesHome = true; S.step = 'done';
          game.audio.objective();
          game.ui.center('HOSTAGES HOME', 'KEPLER-90 f', 3.5, 'gold');
          game.ui.hint('Return to your ship', 5);
          for (const c of S.npcs) c.st.cheer = 0;
          S.elder.st.talk = 0;
        });
        S.elder.st.talk = 1;
      }, 800 + n * 700 + 2500);
    };
  }

  updateHomeworld(gm, dt) {}

  groundObjectives(gm) {
    const S = this.gmState; if (!S) return [];
    if (S.cfg.colonizer) {
      const guardsLeft = S.guards.filter((g) => g.alive).length;
      return [
        { text: 'Infiltrate the hangar', done: S.step !== 'infiltrate' || guardsLeft < S.guards.length },
        { text: `Eliminate the hostage guards (${S.guards.length - guardsLeft}/${S.guards.length})`, done: guardsLeft === 0, red: guardsLeft > 0 },
        { text: 'Free the hostages', done: this.hostagesFreed },
        { text: 'Call the tractor beam (B)', done: !!S.beam },
        { text: 'Plant the fusion charge on the reactor core', done: this.bomb !== null },
        { text: 'Return to the beam and escape', done: false },
      ];
    }
    if (S.cfg.homeworld) return [{ text: 'Reunite the hostages with their people', done: this.hostagesHome || !this.hostagesFreed }, { text: 'Return to your ship', done: false }];
    return super.groundObjectives(gm);
  }

  groundMarkers(gm) {
    const S = this.gmState; if (!S) return [];
    if (S.cfg.colonizer) {
      const L = gm.loc, list = [];
      if (S.step === 'infiltrate') list.push({ id: 'hangar', pos: L.hangar.clone().add(new THREE.Vector3(0, 3, 0)), label: 'HOSTAGES', kind: 'objective', color: '#5dff9b', edge: true, showDist: true });
      if (S.step === 'beam' || S.step === 'freed') list.push({ id: 'hangar', pos: L.hangar.clone().add(new THREE.Vector3(0, 3, 0)), label: 'HOSTAGES', kind: 'objective', color: '#5dff9b', edge: true });
      if (S.step === 'bomb') list.push({ id: 'core', pos: L.console.clone().add(new THREE.Vector3(0, 3, 0)), label: 'REACTOR CORE', kind: 'objective', color: '#ffd23f', edge: true, showDist: true });
      if (S.step === 'escape') list.push({ id: 'beam', pos: L.beam.clone().add(new THREE.Vector3(0, 3, 0)), label: 'TRACTOR BEAM', kind: 'objective', color: '#4ef2ff', edge: true, showDist: true });
      return list;
    }
    if (S.cfg.homeworld) return gm.shipModel ? [{ id: 'ship', pos: gm.shipModel.group.position.clone().add(new THREE.Vector3(0, 4, 0)), label: 'YOUR SHIP', kind: 'objective', color: '#4ef2ff', edge: S.step === 'done', showDist: true }] : [];
    return super.groundMarkers(gm);
  }

  groundActions(gm) {
    const S = this.gmState;
    if (S && S.cfg && S.cfg.colonizer && S.step === 'beam') return [{ id: 'beam', label: 'BEAM HOSTAGES ABOARD', key: 'KeyB', keyLabel: 'B', big: true, onClick: () => this.callBeam(gm) }];
    return [];
  }

  onGroundKill(gm, e) {
    const S = this.gmState;
    if (S && S.cfg && S.cfg.colonizer) {
      if (S.step === 'infiltrate' && S.guards.every((g) => !g.alive)) { game.ui.hint('The guards are down — hold E near the hostages to free them', 5); game.audio.objective(); }
      return;
    }
    return super.onGroundKill(gm, e);
  }

  onNPCKilled(gm, n) {
    if (n.hostage) game.flow.fail('HOSTAGE KILLED', 'Nova must never harm the people he came to save.');
  }

  leaveGround(gm, how) {
    const S = this.gmState;
    if (S && S.cfg && S.cfg.homeworld) { if (S.boarded) return; S.boarded = true; game.audio.teleport(); game.flow.exitGround({ how, homeworldDone: this.hostagesHome }); return; }
    super.leaveGround(gm, how);
  }
}
