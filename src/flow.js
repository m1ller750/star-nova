// Game flow: title, cinematics, levels, landing/takeoff, pause, death & checkpoints, light-speed jumps, ending.
import * as THREE from 'three';
import { game } from './core/game.js';
import { SYSTEMS, allSystemsList } from './data/systems.js';
import { SpaceEnv } from './gfx/space-env.js';
import { FX } from './gfx/fx.js';
import { buildPlayerShip } from './gfx/models-ships.js';
import { SpaceMode } from './space/space-mode.js';
import { GroundMode } from './ground/ground-mode.js';
import { createMission } from './missions/index.js';
import { playIntro, playEnding } from './cinematics/cinematics.js';
import { SYSTEM_NAMES } from './missions/common.js';

// Title backdrop: Earth from orbit with NOVA-1 drifting by.
class TitleBackdrop {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2e6);
    game.engine.registerCamera(this.camera);
    this.fx = new FX(this.scene, { scale: 10, lights: 1 });
    this.env = new SpaceEnv(this.scene, SYSTEMS.sol, this.fx);
    this.earth = this.env.bodyByName('EARTH');
    this.ship = buildPlayerShip();
    this.scene.add(this.ship.group);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const e = this.earth;
    const sunDir = e.pos.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
    const a = this.t * 0.03;
    const camPos = e.pos.clone().addScaledVector(sunDir, -e.radius * (1.55 + Math.sin(a) * 0.05)).addScaledVector(side, e.radius * 1.2).add(new THREE.Vector3(0, e.radius * 0.28, 0));
    this.camera.position.copy(camPos);
    const look = e.pos.clone().addScaledVector(side, e.radius * 0.15).addScaledVector(sunDir, e.radius * 0.4);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const drift = (this.t * 1.6) % 140 - 40;
    const sp = camPos.clone().addScaledVector(fwd, 70).addScaledVector(right, 14 + drift * 0.12).addScaledVector(up, -7 + Math.sin(this.t * 0.5) * 0.8);
    this.ship.group.position.copy(sp);
    this.ship.group.lookAt(sp.clone().addScaledVector(fwd, 60).addScaledVector(right, 25));
    this.ship.group.rotateZ(Math.sin(this.t * 0.4) * 0.12 - 0.15);
    for (const f of this.ship.engines) { f.material.uniforms.uTime.value = this.t; f.scale.z = 0.8 + Math.sin(this.t * 20) * 0.05; }
    this.env.update(dt, this.camera);
    this.fx.update(dt, this.camera);
    game.engine.setSunRays(this.env.star.pos, this.camera, 0.7, this.env.star.color, 1.6);
    game.engine.render(this.scene, this.camera, dt);
  }
  dispose() { this.env.dispose(); this.fx.dispose(); game.engine.setSunRays(null); }
}

export class Flow {
  constructor() {
    this.backdrop = null;
    this.cine = null;
    this.level = 1;
    game.input.onUnlock = () => { if (this.inGameplay() && !game.paused && !this.suppressPause) this.pause(); };
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.inGameplay()) { if (game.paused) this.resume(); else this.pause(); }
    });
  }

  inGameplay() { return !!game.mode && !game.inMenu && !this.cine && !this.dead; }

  // ------------------------------------------------------------------ title
  title() {
    this.cleanupModes();
    game.inMenu = true; game.paused = false; this.dead = false;
    game.ui.showHUD(false);
    game.ui.closeOverlays();
    game.input.wantLock = false; game.input.unlock();
    if (!this.backdrop) this.backdrop = new TitleBackdrop();
    game.engine.setBloom(0.9, 0.6, 0.8);
    game.ui.fadeTo(0, 1.2);
    game.audio.setMusic('title');
    const d = game.save.data;
    const show = () => game.ui.showTitle({
      canContinue: d.reached > 1 || d.completed.length > 0,
      continueLevel: d.reached,
      onNew: () => this.newGame(),
      onContinue: () => this.startLevel(d.reached),
      onControls: () => { game.ui.hideTitle(); game.ui.showControls(show); },
      onData: () => { game.ui.hideTitle(); game.ui.showData(allSystemsList(), show); },
      onSettings: () => { game.ui.hideTitle(); game.ui.showSettings(show); },
    });
    show();
  }

  async newGame() {
    game.audio.resume();
    game.ui.hideTitle();
    game.save.reset();
    this.cine = true;
    await game.ui.fadeTo(1, 0.8);
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    game.audio.setMusic(null);
    await playIntro();
    this.cine = null;
    this.startLevel(1);
  }

  // ------------------------------------------------------------------ levels
  cleanupModes() {
    game.voice.stop();
    game.audio.stopAllLoops();
    if (game.ground) { game.ground.dispose(); game.ground = null; }
    if (game.space) { game.space.dispose(); game.space = null; }
    game.mode = null;
    game.engine.preRender = null;
    game.engine.setSunRays(null);
    game.engine.u.uWarp.value = 0; game.engine.u.uHeat.value = 0; game.engine.u.uDark.value = 0; game.engine.u.uTintAmt.value = 0;
    game.ui.timer(null); game.ui.boss(null); game.ui.setActions([]); game.ui.prompt(null); game.ui.hold(null); game.ui.sight(null); game.ui.clearCenter(); game.ui.hint(null);
  }

  async startLevel(n, opts = {}) {
    game.audio.resume();
    game.ui.hideTitle(); game.ui.closeOverlays();
    this.dead = false; game.paused = false;
    if (!opts.fromWarp) await game.ui.fadeTo(1, 0.5);
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    this.cleanupModes();
    game.ui.loading(`Charting ${SYSTEM_NAMES[n]} from NASA data…`);
    await new Promise((r) => setTimeout(r, 60));
    this.level = n; game.level = n;
    const mission = createMission(n);
    game.mission = mission;
    const sm = new SpaceMode(n, mission);
    game.space = sm; game.mode = sm;
    game.inMenu = false;
    game.ui.loading(null);
    game.ui.showHUD(true);
    game.engine.setBloom(0.95, 0.6, 0.8);
    game.input.wantLock = true;
    game.input.lock();
    game.audio.warpArrive();
    game.ui.fadeTo(0, opts.fromWarp ? 0.4 : 1.0);
    game.ui.center(`LEVEL ${n}`, `${SYSTEM_NAMES[n]} · ${sm.sys.distanceText}`, 4.5);
  }

  levelComplete(n) {
    game.save.complete(n);
    game.audio.levelComplete();
    game.ui.center('LEVEL COMPLETE', n < 5 ? 'CHECKPOINT SAVED · PRESS J TO JUMP' : 'CHECKPOINT SAVED', 5, 'gold');
  }

  jump() {
    const sm = game.space; if (!sm || sm.warping) return;
    sm.warping = true;
    game.ui.setActions([]);
    sm.startWarp(async () => {
      await game.ui.fadeTo(1, 0.25);
      this.startLevel(this.level + 1, { fromWarp: true });
    });
  }

  // ------------------------------------------------------------------ ground
  async enterGround(body, how) {
    const sm = game.space;
    const mission = game.mission;
    sm.pauseLoops();
    game.engine.u.uWarp.value = 0; game.engine.u.uHeat.value = 0;
    game.ui.hint(null);
    game.ui.loading(`Descending to ${body.name}…`);
    await new Promise((r) => setTimeout(r, 50));
    const cfg = mission.groundConfig(body, how);
    const gm = new GroundMode(cfg);
    game.ground = gm; game.mode = gm;
    this.groundBody = body; this.groundHow = how;
    game.ui.loading(null);
    game.ui.setActions([]);
    game.ui.prompt(null);
    game.input.wantLock = true; game.input.lock();
    await game.ui.fadeTo(0, 0.9);
    if (gm.onEnter) gm.onEnter();
  }

  async exitGround(result = {}) {
    const gm = game.ground; if (!gm || this.exiting) return;
    this.exiting = true;
    gm.cinematic = true;
    await game.ui.fadeTo(1, 0.7);
    game.voice.stop();
    gm.dispose();
    game.ground = null;
    const sm = game.space;
    const body = result.body || this.groundBody;
    sm.resumeFromGround(body, result.how || this.groundHow);
    game.mode = sm;
    if (game.mission.onReturnToSpace) game.mission.onReturnToSpace(sm, result, body);
    game.engine.setBloom(0.95, 0.6, 0.8);
    game.engine.u.uHeat.value = 0;
    game.ui.sight(null); game.ui.hold(null);
    this.exiting = false;
    await game.ui.fadeTo(0, 0.8);
  }

  // switch from space straight into a scripted ground location (e.g. the colonizer drop)
  async enterLocation(cfg) {
    const sm = game.space;
    sm.pauseLoops();
    game.engine.u.uWarp.value = 0; game.engine.u.uHeat.value = 0; game.ui.hint(null);
    game.ui.loading('…');
    await new Promise((r) => setTimeout(r, 50));
    const gm = new GroundMode(Object.assign({ level: this.level, mission: game.mission }, cfg));
    game.ground = gm; game.mode = gm;
    this.groundBody = cfg.body || null; this.groundHow = cfg.arrival;
    game.ui.loading(null); game.ui.setActions([]); game.ui.prompt(null);
    game.input.wantLock = true; game.input.lock();
    await game.ui.fadeTo(0, 0.6);
    if (gm.onEnter) gm.onEnter();
    return gm;
  }

  // ------------------------------------------------------------------ pause / death
  pause() {
    if (game.paused || !game.mode) return;
    game.paused = true;
    game.voice.pause();
    game.input.unlock();
    game.ui.showPause({
      level: this.level,
      completed: game.save.data.completed,
      onResume: () => this.resume(),
      onRestart: () => { game.ui.closeOverlays(); this.startLevel(this.level); },
      onLevel: (n) => { game.ui.closeOverlays(); this.startLevel(n); },
      onQuit: () => { game.ui.closeOverlays(); this.title(); },
    });
  }
  resume() {
    if (!game.paused) return;
    game.paused = false;
    game.ui.closeOverlays();
    game.voice.resume();
    this.suppressPause = true;
    game.input.lock();
    setTimeout(() => (this.suppressPause = false), 400);
  }

  death(title, sub) {
    if (this.dead) return;
    this.dead = true;
    game.voice.stop();
    game.audio.stopAllLoops();
    game.audio.fail();
    game.input.unlock(); game.input.wantLock = false;
    game.ui.setActions([]); game.ui.timer(null); game.ui.sight(null);
    game.ui.showDeath(title, sub + '<br><small style="opacity:.7">You will restart this level from its checkpoint.</small>', 'RESPAWN', () => { this.dead = false; this.startLevel(this.level); });
  }
  fail(title, sub) {
    if (this.dead) return;
    this.dead = true;
    game.voice.stop();
    game.audio.stopAllLoops();
    game.audio.fail();
    game.input.unlock(); game.input.wantLock = false;
    game.ui.setActions([]); game.ui.timer(null); game.ui.sight(null);
    game.ui.showDeath(title, sub, 'START AGAIN', () => { this.dead = false; this.startLevel(this.level); });
  }

  // ------------------------------------------------------------------ ending
  async ending() {
    this.cine = true;
    game.input.unlock(); game.input.wantLock = false;
    await game.ui.fadeTo(1, 1.5);
    this.cleanupModes();
    game.ui.showHUD(false);
    await playEnding();
    this.cine = null;
    this.title();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (this.backdrop) { this.backdrop.update(dt); return; }
    if (this.cineUpdate) { this.cineUpdate(dt); return; }
    const m = game.mode;
    if (!m) return;
    if (game.paused || this.dead) { game.engine.render(m.scene, m.camera, 0); return; }
    m.update(dt);
  }
}
