// LEVEL 3 — TRAPPIST-1: ship laser, EVA & flight, three fortresses, and the public execution in the city on TRAPPIST-1 e.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { rand, pick, clamp, RNG } from '../core/util.js';
import { Mission } from './common.js';
import { addBeam, beamUp } from './level2.js';

const EXECUTION_TIME = 150;

export class Level3 extends Mission {
  constructor() {
    super(3);
    this.inventory = null;
  }

  spawn(sm) {
    const st = sm.env.star;
    const h = sm.env.bodyByName('TRAPPIST-1 h');
    const pos = h.pos.clone().multiplyScalar(1.12).add(new THREE.Vector3(0, 900, 0));
    return { pos, look: st.pos.clone() };
  }

  setupSpace(sm) {
    const env = sm.env;
    const sets = { 'TRAPPIST-1 d': [3, 0], 'TRAPPIST-1 e': [3, 1], 'TRAPPIST-1 f': [3, 0], 'TRAPPIST-1 g': [3, 1] };
    for (const [name, [f, c]] of Object.entries(sets)) this.spawnPatrol(sm, this.guardPoint(env.bodyByName(name)), f, c, 700);
    this.spawnPatrol(sm, env.bodyByName('TRAPPIST-1 h').pos.clone().add(new THREE.Vector3(1500, 300, 0)), 2, 0, 600);
    game.voice.dialogue([
      ['WAIT', 1.2],
      ['AI', 'TRAPPIST-1. An ultracool red dwarf with seven Earth-sized worlds, forty light-years from home.'],
      ['HALE', 'Four of these worlds are under Klin\'Tar control. Three hold prisoners inside fortresses. On TRAPPIST-1 e they are about to execute a rebel leader in public.'],
      ['AI', 'New systems online: a mining laser — hold F. And you can now leave the ship in flight — press X.'],
      ['NOVA', 'And down there I can fly myself. Good. Let\'s go to work.'],
    ]);
    game.ui.toast('NEW · SHIP LASER', 'Hold F · fighters in 3 s · cruisers in 5 s');
    setTimeout(() => game.ui.toast('NEW · EJECT & FLY', 'X in space · SPACE in the air on planets · R back missiles'), 2500);
  }

  objectives(sm) {
    const total = this.totalShips(sm), left = this.shipsLeft(sm);
    const list = [{ text: `Destroy Klin'Tar ships (${total - left}/${total})`, done: left === 0 }];
    for (const [name, st] of Object.entries(this.planets)) {
      if (!st.captured) continue;
      const p = this.sys.planets.find((x) => x.name === name);
      list.push({ text: p.city ? `${name}: stop the public execution` : `${name}: free the prisoners from the fortress`, done: st.cleared, red: !st.cleared });
    }
    return list;
  }

  markers(sm) {
    const list = [];
    for (const b of sm.env.bodies) {
      const st = this.planets[b.name]; if (!st || !st.captured) continue;
      const def = b.def;
      list.push({ id: 'cap_' + b.name, pos: b.pos.clone().add(new THREE.Vector3(0, b.radius * 1.25, 0)), label: st.cleared ? 'LIBERATED' : def.city ? 'EXECUTION' : 'FORTRESS', icon: st.cleared ? '✓' : '!', kind: 'skull', color: st.cleared ? '#5dff9b' : def.city ? '#ffd23f' : '#ff3b4e', edge: !st.cleared, showDist: !st.cleared });
    }
    return list;
  }

  onComplete() {
    game.voice.dialogue([
      ['HALE', 'TRAPPIST-1 is free. Nova... we just intercepted something. The Klin\'Tar command signal comes from Cygnus X-1.'],
      ['AI', 'Cygnus X-1: a black hole of twenty-one solar masses. Extremely dangerous.'],
      ['NOVA', 'Then I\'ll go and see who is calling the shots.'],
    ]);
  }

  // ---------------------------------------------------------------- ground
  groundConfig(body, how) {
    const def = body.def || body;
    const st = this.planets[def.name];
    const captured = !!(st && st.captured && !st.cleared);
    if (def.city) return { kind: 'city', body, level: 3, arrival: how, captured, mission: this, city: true };
    return { kind: 'planet', body, level: 3, arrival: how, captured, fortress: captured ? def.fortress : null, mission: this };
  }

  setupGround(gm, cfg) {
    const def = cfg.body ? (cfg.body.def || cfg.body) : {};
    this.currentPlanet = def.name;
    if (cfg.city) return cfg.captured ? this.setupCity(gm, cfg) : this.setupCalm(gm, cfg);
    if (cfg.fortress) return this.setupFortress(gm, cfg);
    return this.setupCalm(gm, cfg);
  }

  setupCalm(gm, cfg) {
    this.gmState = { cfg: { ...cfg, captured: false }, calm: true, boarded: false };
    this.addExtraction(gm, cfg, true);
    game.ui.hint(`${this.currentPlanet} — no Klin'Tar presence. Return to your ship when ready.`, 6);
    game.audio.setMusic('space');
  }

  // extraction: landed ship or the tractor beam (when Nova dropped from orbit)
  addExtraction(gm, cfg, enabledNow = false) {
    const S = this.gmState;
    S.extractReady = enabledNow;
    if (cfg.arrival === 'ship' && gm.shipModel) {
      const sp = gm.shipModel.group.position.clone(); sp.y = gm.world.heightFn(sp.x, sp.z);
      gm.addInteract({ pos: sp, radius: 6, label: 'BOARD SHIP · RETURN TO ORBIT', enabled: () => S.extractReady || !S.cfg.captured, onDone: () => this.extract(gm) });
      S.extractPos = sp;
    } else {
      S.extractPos = (S.beamAt || gm.lz || gm.spawn.pos).clone();
      S.extractPos.y = gm.world.heightFn(S.extractPos.x, S.extractPos.z);
      if (enabledNow) this.openBeam(gm);
    }
  }
  openBeam(gm) {
    const S = this.gmState;
    if (S.beam || !S.extractPos) return;
    S.beam = addBeam(gm, S.extractPos.clone(), 36);
    game.voice.dialogue([['AI', 'Tractor beam deployed. Step into the light, Nova.']]);
  }
  extract(gm) {
    const S = this.gmState;
    if (S.boarded) return; S.boarded = true;
    if (S.cfg.captured && S.done) { const st = this.planets[this.currentPlanet]; if (st) st.cleared = true; }
    game.audio.teleport();
    game.flow.exitGround({ how: 'ship' });
  }

  // ---------------------------------------------------------------- fortresses
  setupFortress(gm, cfg) {
    const F = gm.fortress;
    const rng = new RNG(F.cells.length * 7 + cfg.fortress.length);
    this.gmState = { cfg, fortress: true, cells: [], freed: 0, done: false, boarded: false };
    const S = this.gmState;
    for (const p of F.courtyard) gm.addEnemy({ kind: rng.next() < 0.25 ? 'brute' : 'soldier', weapon: rng.next() < 0.3 ? 'scatter' : 'plasma', pos: p, patrol: rng.next() < 0.5 ? [p.clone(), p.clone().add(new THREE.Vector3(rng.range(-12, 12), 0, rng.range(-12, 12)))] : null, style: 3 });
    for (const e of gm.enemies) if (e.kind === 'brute') { e.weapon = 'heavy'; e.st.weapon = 'heavy'; }
    for (const t of [F.towers[0], F.towers[1]]) gm.addEnemy({ kind: 'sniper', weapon: 'plasma', pos: t.clone().add(new THREE.Vector3(0, 0.2, 0)), style: 3 });
    for (const w of F.walls) gm.addEnemy({ kind: 'soldier', weapon: 'plasma', pos: w.clone(), style: 3 });
    for (const k of F.keepGuards) gm.addEnemy({ kind: 'soldier', weapon: 'scatter', pos: k, style: 3 });
    gm.addEnemy({ kind: 'brute', weapon: 'heavy', pos: F.keep.clone().add(new THREE.Vector3(0, 0, 5)), style: 3 });
    gm.addMachine({ kind: 'artillery', pos: F.center.clone().add(new THREE.Vector3(-22, 0, -30)).setY(gm.world.heightFn(F.center.x - 22, F.center.z - 30)) });
    F.cells.forEach((cell, i) => {
      const n = i % 2 ? 1 : 2;
      cell.hostages = [];
      for (let k = 0; k < n; k++) cell.hostages.push(gm.addNPC({ look: 'trappist', pos: cell.pos.clone().add(new THREE.Vector3((k - (n - 1) / 2) * 1.2, 0, 0.5)), yaw: Math.PI, kneel: true, hostage: true, seed: 300 + i * 3 + k }));
      cell.open = false;
      S.cells.push(cell);
      gm.addInteract({ pos: cell.pos.clone().add(new THREE.Vector3(0, 0, -2.8)), radius: 2.6, hold: 2, label: 'OPEN THE CELL (HOLD E)', enabled: () => !cell.open, onDone: () => this.openCell(gm, cell) });
    });
    this.addExtraction(gm, cfg, false);
    gm.showRemaining = false;
    gm.onEnter = () => {
      game.audio.setMusic('stealth');
      const theme = { sand: 'a sandstone citadel', ice: 'a fortress of ice and crystal', obsidian: 'an obsidian stronghold' }[cfg.fortress];
      game.voice.dialogue([
        ['NOVA', `There it is — ${theme}. The prisoners must be inside the keep.`],
        ['AI', 'Snipers on the towers. Use cover, or fly over the walls.'],
      ]);
      game.ui.hint('Break into the fortress and open every cell in the keep', 6);
    };
  }

  openCell(gm, cell) {
    const S = this.gmState;
    cell.open = true;
    if (cell.door) cell.door.visible = false;
    if (cell.box) cell.box.solid = false;
    S.freed++;
    game.audio.objective();
    game.voice.say('PRISONER', pick(['Free! We are free!', 'Thank you, thank you!', 'The human came for us!']), { label: 'TRAPPENI PRISONER' });
    // the ship beams the prisoners out of the keep
    cell.hostages.forEach((h, i) => {
      h.st.kneel = 0; h.st.cheer = 1;
      setTimeout(() => { h.st.cheer = 0; h.mode = 'beam'; h.beamTop = h.pos.y + 22; h.onGone = () => {}; game.audio.teleport(); }, 1500 + i * 600);
    });
    if (S.freed >= S.cells.length) {
      S.done = true;
      game.ui.center('PRISONERS FREED', `${this.currentPlanet}`, 3.5, 'gold');
      game.voice.dialogue([['AI', 'All prisoners are aboard. Extraction is ready.'], ['NOVA', 'Leaving. This fortress just lost its reason to exist.']]);
      S.extractReady = true;
      if (!gm.shipModel) this.openBeam(gm);
      const st = this.planets[this.currentPlanet]; if (st) st.cleared = true;
    }
  }

  // ---------------------------------------------------------------- the city (TRAPPIST-1 e)
  setupCity(gm, cfg) {
    const L = gm.loc;
    this.gmState = { cfg, city: true, step: 'dealer', done: false, boarded: false, execT: null };
    const S = this.gmState;
    const rng = new RNG(31);
    // crowd watching the execution
    S.crowd = [];
    for (let i = 0; i < 22; i++) {
      const a = rng.range(-1.1, 1.1) - Math.PI / 2, r = rng.range(11, 20);
      const p = new THREE.Vector3(Math.cos(a) * r, 1, Math.sin(a) * r);
      const n = gm.addNPC({ look: 'trappist', pos: p, seed: 500 + i });
      n.yaw = Math.atan2(-p.x, -p.z); S.crowd.push(n);
    }
    // shoppers in the bazaar
    for (let i = 0; i < 14; i++) { const n = gm.addNPC({ look: 'trappist', pos: L.bazaar.clone().add(new THREE.Vector3(rng.range(-30, 30), 0, rng.range(-12, 14))), mode: 'wander', seed: 600 + i }); S.crowd.push(n); }
    // execution stage
    S.prisoner = gm.addNPC({ look: 'trappist', pos: new THREE.Vector3(0, 3.62, 0.4), yaw: Math.PI, kneel: true, hostage: true, seed: 999, extra: {} });
    S.exe = gm.addEnemy({ kind: 'executioner', weapon: 'axe', pos: new THREE.Vector3(0.0, 3.62, 2.4), yaw: Math.PI, scripted: true, style: 3, noCount: true });
    S.exe.keepBody = true;
    const exe = S.exe;
    exe.damage = (amount, part, dir, opts = {}) => {
      if (!exe.alive) return false;
      if (part === 'head' || exe.wounded) {
        exe.hp = 0; exe.die(dir, { fling: 0 });
        return true;
      }
      exe.wounded = true; exe.hitT = 0.6;
      gm.fx.blood(new THREE.Vector3(exe.pos.x, exe.pos.y + 1.6, exe.pos.z), dir, 0x4aff9a);
      game.voice.say('EXECUTIONER', 'Aaargh! A sniper! Finish him, now!', { interrupt: true });
      if (S.execT !== null) S.execT = Math.min(S.execT, 8);
      return false;
    };
    S.guards = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; S.guards.push(gm.addEnemy({ kind: i % 3 === 0 ? 'brute' : 'soldier', weapon: i % 3 === 0 ? 'heavy' : 'plasma', pos: new THREE.Vector3(Math.cos(a) * 9, 1, Math.sin(a) * 9), yaw: a + Math.PI / 2, style: 3 })); }
    for (let i = 0; i < 4; i++) gm.addEnemy({ kind: 'soldier', weapon: 'plasma', pos: new THREE.Vector3(rng.range(-60, 60), 1, rng.range(-60, 60)), patrol: [new THREE.Vector3(rng.range(-80, 80), 1, rng.range(-80, 80)), new THREE.Vector3(rng.range(-80, 80), 1, rng.range(-80, 80))], style: 3 });
    // the arms dealer
    S.dealer = gm.addNPC({ look: 'trappist', pos: L.dealer.clone().add(new THREE.Vector3(-1, 0, 2.2)), seed: 77, extra: { hood: true, goggles: true } });
    S.dealer.faceHero = true; S.dealer.yaw = Math.PI;
    gm.addInteract({ pos: L.dealer.clone(), radius: 3.4, label: 'TALK TO THE ARMS DEALER', enabled: () => S.step === 'dealer', onDone: () => this.talkDealer(gm) });
    gm.addInteract({ pos: new THREE.Vector3(0, 3.62, -0.6), radius: 2.8, hold: 2, label: 'FREE THE PRISONER (HOLD E)', enabled: () => S.step === 'rescue', onDone: () => this.freePrisoner(gm) });
    S.beamAt = L.bazaar.clone();
    this.addExtraction(gm, cfg, false);
    gm.showRemaining = false;
    gm.onEnter = () => {
      game.audio.setMusic('ground');
      if (cfg.arrival === 'drop') { gm.hero.landPose = 1; game.engine.shake(1, 0.4); game.audio.land(true); }
      game.voice.dialogue([
        ['HALE', 'Nova, the Klin\'Tar are going to execute Kesh, leader of the Trappeni resistance, in the main square.'],
        ['HALE', 'If you charge in, they will kill him on the spot. Find the arms dealer in the bazaar. You need a long-range rifle.'],
        ['NOVA', 'Understood. Quiet and precise.'],
      ]);
      game.ui.hint('Find the arms dealer in the Grand Bazaar (yellow marker)', 7);
    };
  }

  async talkDealer(gm) {
    const S = this.gmState;
    S.step = 'talking';
    gm.inputLocked = true;
    S.dealer.st.talk = 1;
    await game.voice.dialogue([
      ['DEALER', 'A human? Ha! Your kind does not come to the Bazaar of Ilaq. What do you want?'],
      ['NOVA', 'A long-range rifle, and something to hide my approach.'],
      ['DEALER', 'A Lancer-9 sniper rifle, five rounds, and a smoke grenade. But Zobb does not take promises. Give me one of your blades.'],
    ]);
    const choice = await game.ui.choice('TRADE WITH ZOBB', 'Choose what to give the arms dealer for the sniper rifle and the smoke grenade.', [
      { label: 'GIVE THE PLASMA SWORD' }, { label: 'GIVE THE COMBAT KNIFE' },
    ]);
    const h = gm.hero;
    if (choice === 0) { h.inv.sword = false; if (h.weapon === 'sword') h.setWeapon('rifle'); h.rig.hasSword = false; h.rig.attach.swordBack.visible = false; }
    else { h.inv.knife = false; if (h.weapon === 'knife') h.setWeapon('rifle'); h.rig.hasKnife = false; h.rig.attach.knifeHol.visible = false; }
    h.inv.sniper = true; h.sniperAmmo = 5; h.inv.smoke = 1;
    this.inventory = { ...h.inv };
    game.input.lock();
    game.audio.pickup();
    game.ui.toast('ACQUIRED · LANCER-9 SNIPER RIFLE', '5 rounds · key 5 · hold RMB to scope');
    setTimeout(() => game.ui.toast('ACQUIRED · SMOKE GRENADE', 'G to throw'), 900);
    await game.voice.dialogue([
      ['DEALER', choice === 0 ? 'A plasma sword! Beautiful. Pleasure doing business, human.' : 'A fine human blade. Pleasure doing business.'],
      ['DEALER', 'Now hurry. When the bells ring, the axe falls.'],
      ['AI', 'High vantage point marked: the tower east of the square. You can fly there.'],
    ]);
    S.dealer.st.talk = 0;
    gm.inputLocked = false;
    S.step = 'tower';
    S.execT = EXECUTION_TIME;
    game.voice.say('EXECUTIONER', 'Behold the fate of all who defy the Emperor!');
    game.ui.hint('Reach the top of the tower — SPACE twice to fly · then equip the sniper (5)', 7);
  }

  freePrisoner(gm) {
    const S = this.gmState;
    S.step = 'extract';
    S.done = true;
    const p = S.prisoner;
    p.st.kneel = 0; p.faceHero = true;
    game.audio.objective();
    game.voice.dialogue([
      ['PRISONER', 'You... you saved me! The Trappeni will remember this day, Nova!', { label: 'KESH · RESISTANCE LEADER' }],
      ['NOVA', 'Stay close. We\'re leaving.'],
    ]);
    p.mode = 'follow'; p.speed = 4.5;
    S.extractReady = true;
    if (!gm.shipModel) this.openBeam(gm);
    const st = this.planets[this.currentPlanet]; if (st) st.cleared = true;
    game.ui.hint(gm.shipModel ? 'Escort Kesh back to your ship' : 'Get to the tractor beam in the bazaar', 6);
  }

  updateGround(gm, dt) {
    const S = this.gmState; if (!S) return;
    if (S.beam) {
      S.beam.update(dt);
      if (S.extractReady && gm.hero.pos.distanceTo(S.beam.pos) < 3.4 && !gm.beamingUp) {
        if (S.prisoner && S.prisoner.alive && S.prisoner.mode !== 'beam') { S.prisoner.mode = 'beam'; S.prisoner.beamTop = S.prisoner.pos.y + 28; }
        beamUp(gm, S.beam, () => this.extract(gm));
      }
    }
    if (!S.city) return;
    const exe = S.exe;
    // execution countdown
    if (S.execT !== null && exe.alive && S.step !== 'failed') {
      // guards in combat -> the executioner hurries
      if (S.guards.some((g) => g.alive && g.state === 'combat') && S.execT > 10) { S.execT = 10; game.voice.say('EXECUTIONER', 'An intruder! Kill the prisoner!', { interrupt: true }); }
      S.execT -= dt;
      game.ui.timer(S.execT, 'EXECUTION IN');
      if (S.execT < 3.2 && !S.swing) { S.swing = true; S.swingT = 0; }
      if (S.swing) {
        S.swingT += dt / 3.2;
        exe.attackT = Math.min(0.99, S.swingT);
        if (S.swingT >= 1) this.executed(gm);
      }
    }
    if (exe && exe.alive) { exe.st.weapon = 'axe'; }
    if (S.step === 'tower' || S.step === 'snipe') {
      const top = gm.loc.towerTop;
      if (S.step === 'tower' && Math.abs(gm.hero.pos.x - top.x) < 10 && Math.abs(gm.hero.pos.z - top.z) < 10 && gm.hero.pos.y > top.y - 1.5) {
        S.step = 'snipe';
        game.voice.dialogue([['NOVA', 'In position. One shot... make it count.']]);
        game.ui.hint('Equip the sniper (5) · hold RMB to scope · hold SHIFT to steady · headshot kills instantly', 8);
      }
    }
    if (!exe.alive && !S.exeDown) {
      S.exeDown = true;
      game.ui.timer(null);
      S.execT = null;
      game.audio.crowdPanic(8);
      game.ui.center('EXECUTIONER DOWN', 'RESCUE THE PRISONER', 3, 'gold');
      for (const c of S.crowd) { c.mode = 'panic'; c.home = c.pos.clone(); }
      for (const g of S.guards) if (g.alive) g.alert(gm.loc.tower, false);
      game.voice.dialogue([['ALIEN', 'The executioner is dead! Find the shooter!'], ['CITIZEN', 'Run! Everybody run!', { label: 'TRAPPENI CITIZEN' }], ['NOVA', 'Now — get to the stage. Smoke will cover me.']]);
      S.step = 'rescue';
      game.ui.hint('Fly to the stage · throw smoke (G) · hold E on the prisoner', 7);
    }
  }

  executed(gm) {
    const S = this.gmState;
    if (S.step === 'failed') return;
    S.step = 'failed';
    game.ui.timer(null);
    game.audio.scream(null, false);
    game.engine.flash(0.8, 0x300000);
    game.ui.fadeTo(1, 0.15);
    setTimeout(() => game.flow.fail('THE PRISONER WAS EXECUTED', 'You were too late to stop the executioner. Try again.'), 400);
  }

  onNPCKilled(gm, n) {
    if (n.hostage) {
      if (this.gmState && this.gmState.city && n === this.gmState.prisoner) game.flow.fail('YOU SHOT THE PRISONER', 'Kesh, leader of the Trappeni resistance, is dead.');
      else game.flow.fail('HOSTAGE KILLED', 'Nova must never harm the people he came to save.');
    }
  }

  onGroundKill(gm, e) {}

  groundObjectives(gm) {
    const S = this.gmState; if (!S) return [];
    if (S.calm) return [{ text: 'Explore the surface' }, { text: 'Return when ready' }];
    if (S.fortress) return [{ text: `Open the prison cells (${S.freed}/${S.cells.length})`, done: S.done, red: !S.done }, { text: gm.shipModel ? 'Return to your ship' : 'Reach the tractor beam', done: false }];
    if (S.city) {
      const st = S.step;
      return [
        { text: 'Find the arms dealer in the bazaar', done: st !== 'dealer' && st !== 'talking' },
        { text: 'Trade for a sniper rifle', done: gm.hero.inv.sniper },
        { text: 'Reach the high-rise rooftop', done: ['snipe', 'rescue', 'extract'].includes(st) || S.exeDown },
        { text: 'Kill the executioner before the axe falls', done: !!S.exeDown, red: !S.exeDown && st !== 'dealer' },
        { text: 'Free the prisoner', done: st === 'extract' },
        { text: gm.shipModel ? 'Escort him to your ship' : 'Escape through the tractor beam', done: false },
      ];
    }
    return [];
  }

  groundMarkers(gm) {
    const S = this.gmState; if (!S) return [];
    const list = [];
    if (S.city) {
      if (S.step === 'dealer') list.push({ id: 'dealer', pos: gm.loc.dealer.clone().add(new THREE.Vector3(0, 4, 0)), label: 'ARMS DEALER', kind: 'objective', color: '#ffd23f', edge: true, showDist: true });
      if (S.step === 'tower') list.push({ id: 'tower', pos: gm.loc.towerTop.clone().add(new THREE.Vector3(0, 2, 0)), label: 'VANTAGE POINT', kind: 'objective', color: '#ffd23f', edge: true, showDist: true });
      if (['tower', 'snipe'].includes(S.step) && S.exe.alive) list.push({ id: 'exe', pos: S.exe.pos.clone().add(new THREE.Vector3(0, 4.4, 0)), label: 'EXECUTIONER', kind: 'objective', color: '#ff3b4e', edge: S.step === 'snipe', showDist: true });
      if (S.step === 'rescue') list.push({ id: 'pris', pos: S.prisoner.pos.clone().add(new THREE.Vector3(0, 2.5, 0)), label: 'PRISONER', kind: 'objective', color: '#5dff9b', edge: true, showDist: true });
    }
    if (S.fortress && !S.done) for (const c of S.cells) if (!c.open) list.push({ id: 'cell' + c.pos.x, pos: c.pos.clone().add(new THREE.Vector3(0, 3, 0)), label: 'PRISONERS', kind: 'objective', color: '#ff3b4e', edge: true, showDist: true });
    if ((S.extractReady || S.calm) && S.extractPos) list.push({ id: 'extract', pos: S.extractPos.clone().add(new THREE.Vector3(0, 4, 0)), label: gm.shipModel ? 'YOUR SHIP' : 'TRACTOR BEAM', kind: 'objective', color: '#4ef2ff', edge: true, showDist: true });
    return list;
  }
}
