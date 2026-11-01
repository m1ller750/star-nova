// Shared mission logic: captured planets with Klin'Tar bases, liberation, boarding the ship, level completion and the light-speed jump.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { RNG, hashString, pick, rand } from '../core/util.js';
import { SYSTEMS, LEVEL_SYSTEM } from '../data/systems.js';

export const SYSTEM_NAMES = { 1: 'SOLAR SYSTEM', 2: 'KEPLER-90', 3: 'TRAPPIST-1', 4: 'CYGNUS X-1', 5: 'HR 8799' };

export class Mission {
  constructor(n) {
    this.n = n;
    this.sys = SYSTEMS[LEVEL_SYSTEM[n]];
    this.unlocks = { shield: n >= 2, laser: n >= 3, eject: n >= 3 };
    this.planets = {};
    for (const p of this.sys.planets) this.planets[p.name] = { captured: !!p.captured, cleared: false };
    this.shipKills = 0;
    this.complete = false;
    this.flags = {};
    this.style = n;
  }

  // ------------------------------------------------------------------ space
  totalShips(sm) { return sm.enemies.filter((e) => !e.station).length; }
  shipsLeft(sm) { return sm.aliveEnemies((e) => !e.station).length; }
  capturedLeft() { return Object.values(this.planets).filter((p) => p.captured && !p.cleared).length; }

  spawnPatrol(sm, center, fighters, cruisers = 0, radius = 900) {
    for (let i = 0; i < fighters; i++) sm.spawnEnemy('fighter', center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(radius)), { guard: center, guardR: radius * 0.8 });
    for (let i = 0; i < cruisers; i++) sm.spawnEnemy('cruiser', center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.2, 0.2), rand(-1, 1)).multiplyScalar(radius * 0.6)), { guard: center, guardR: radius * 0.6 });
  }

  guardPoint(body, k = 2.2) {
    const out = body.pos.clone().normalize();
    if (out.lengthSq() < 0.5) out.set(1, 0, 0);
    return body.pos.clone().addScaledVector(out, -body.radius * k).add(new THREE.Vector3(0, body.radius * 0.4, 0));
  }

  onEnemyKilled(sm, e) { if (!e.station) this.shipKills++; }

  // worlds still to liberate: their name marker in space gets a gold ring (see SpaceMode.updateHUD)
  isTargetBody(name) { const st = this.planets[name]; return !!(st && st.captured && !st.cleared); }
  markers(sm) { return []; }

  baseObjectives(sm) {
    const total = this.totalShips(sm), left = this.shipsLeft(sm);
    const list = [{ text: `Destroy Klin'Tar ships (${total - left}/${total})`, done: left === 0 }];
    for (const [name, st] of Object.entries(this.planets)) if (st.captured) list.push({ text: `Liberate ${name}`, done: st.cleared });
    return list;
  }
  objectives(sm) { return this.baseObjectives(sm); }

  checkComplete(sm) {
    if (this.complete) return;
    if (this.shipsLeft(sm) === 0 && this.capturedLeft() === 0 && this.extraDone(sm)) {
      this.complete = true;
      game.flow.levelComplete(this.n);
      this.onComplete(sm);
    }
  }
  extraDone() { return true; }
  onComplete() {}

  updateSpace(sm, dt) { this.checkComplete(sm); }

  actions(sm) {
    if (this.complete && this.n < 5 && sm.mode === 'ship') return [{ id: 'jump', label: `JUMP TO ${SYSTEM_NAMES[this.n + 1]}`, key: 'KeyJ', keyLabel: 'J', big: true, onClick: () => game.flow.jump() }];
    return [];
  }

  canLand(sm, body) { return { ok: true }; }

  // ------------------------------------------------------------------ ground
  groundConfig(body, how) {
    const def = body.def || body;
    const st = this.planets[def.name];
    return { kind: 'planet', body, level: this.n, arrival: how, captured: !!(st && st.captured && !st.cleared), mission: this, inventory: this.inventory, sniperAmmo: this.sniperAmmo };
  }

  setupGround(gm, cfg) {
    this.gmState = { cfg, cleared: false, total: 0, boarded: false };
    const def = cfg.body ? (cfg.body.def || cfg.body) : {};
    this.currentPlanet = def.name;
    if (cfg.captured && gm.bases) this.populateBases(gm, cfg);
    gm.showRemaining = true;
    this.addBoarding(gm, cfg);
    game.audio.setMusic(cfg.captured ? 'ground' : 'space');
    if (cfg.captured) {
      game.voice.dialogue([['NOVA', pick([`Boots on the ground. ${def.name} — let's take it back.`, `Landing complete. Klin'Tar signatures everywhere.`, `This world belongs to its people, not the Empire.`])]]);
      game.ui.hint('Eliminate every Klin\'Tar soldier, artillery piece and vehicle', 6);
    } else {
      game.ui.hint(`${def.name || 'Planet'} — no Klin'Tar presence detected. Explore freely, then return to your ship.`, 6);
    }
  }

  // exactly 7 hostiles per captured planet: 5 troopers spread over the bases, an artillery piece and a hover tank;
  // the mix gets tougher with every level (a sniper from level 2, a second brute from level 3)
  populateBases(gm, cfg) {
    const rng = new RNG(hashString(this.currentPlanet || 'x'));
    const n = this.n, B = gm.bases;
    if (!B.length) return;
    const squad = n === 1 ? ['soldier', 'soldier', 'brute', 'soldier', 'soldier'] : n === 2 ? ['soldier', 'sniper', 'brute', 'soldier', 'soldier'] : ['soldier', 'sniper', 'brute', 'brute', 'soldier'];
    squad.forEach((kind, i) => {
      const b = B[i % B.length];
      if (kind === 'brute') { gm.addEnemy({ kind, weapon: 'heavy', pos: b.center.clone().add(new THREE.Vector3(rng.range(-6, 6), 0, rng.range(-6, 6))), style: this.style }); return; }
      const p = b.spawns[(i * 3) % b.spawns.length].clone().add(new THREE.Vector3(rng.range(-2, 2), 0, rng.range(-2, 2)));
      const patrol = kind === 'soldier' && i % 2 === 0 ? [p.clone(), p.clone().add(new THREE.Vector3(rng.range(-14, 14), 0, rng.range(-14, 14)))] : null;
      gm.addEnemy({ kind, weapon: kind === 'soldier' && rng.next() < 0.3 ? 'scatter' : 'plasma', pos: p, patrol, style: this.style });
    });
    const art = B[B.length - 1];
    gm.addMachine({ kind: 'artillery', pos: art.center.clone().add(new THREE.Vector3(8, 0, -8)).setY(gm.world.heightFn(art.center.x + 8, art.center.z - 8)) });
    // a hover tank patrols between the bases
    const path = B.map((b) => b.center.clone().add(new THREE.Vector3(0, 0, -34)));
    gm.addMachine({ kind: 'tank', pos: path[0].clone(), path });
    this.gmState.total = gm.hostiles().length;
  }

  addBoarding(gm, cfg) {
    if (!gm.shipModel) return;
    const pos = gm.shipModel.group.position.clone(); pos.y = gm.world.heightFn(pos.x, pos.z);
    gm.addInteract({ pos, radius: 6, label: 'BOARD SHIP · RETURN TO ORBIT', onDone: () => this.leaveGround(gm, 'ship') });
  }

  leaveGround(gm, how) {
    if (this.gmState && this.gmState.boarded) return;
    if (this.gmState) this.gmState.boarded = true;
    const st = this.planets[this.currentPlanet];
    const cleared = this.gmState && this.gmState.cleared;
    if (st && st.captured && !st.cleared && !cleared) game.ui.toast('PLANET NOT LIBERATED', 'Klin\'Tar forces remain on the surface');
    game.audio.teleport();
    game.flow.exitGround({ cleared, how });
  }

  groundObjectives(gm) {
    const s = this.gmState; if (!s) return [];
    if (!s.cfg.captured) return [{ text: 'Explore the surface' }, { text: 'Return to your ship when ready' }];
    const left = gm.hostiles().length;
    return [{ text: `Eliminate Klin'Tar forces (${s.total - left}/${s.total})`, done: left === 0, red: left > 0 }, { text: 'Return to your ship', done: false }];
  }

  groundMarkers(gm) {
    const list = [];
    if (gm.shipModel && (this.gmState && (this.gmState.cleared || !this.gmState.cfg.captured))) list.push({ id: 'ship', pos: gm.shipModel.group.position.clone().add(new THREE.Vector3(0, 4, 0)), label: 'YOUR SHIP', kind: 'objective', color: '#4ef2ff', edge: true, showDist: true });
    return list;
  }

  onGroundKill(gm, e) {
    const s = this.gmState;
    if (!s || !s.cfg.captured || s.cleared) return;
    const left = gm.hostiles().length;
    if (left === 3) game.ui.hint('3 hostiles left — their positions are marked', 4);
    if (left === 0) {
      s.cleared = true;
      const st = this.planets[this.currentPlanet];
      if (st) st.cleared = true;
      game.audio.objective();
      game.ui.center(`${this.currentPlanet} LIBERATED`, 'KLIN\'TAR FORCES ELIMINATED', 4, 'gold');
      game.voice.dialogue([['NOVA', `${this.currentPlanet} is clear. Returning to the ship.`], ['HALE', 'Outstanding work, Nova.']]);
    }
  }

  groundActions() { return []; }
  onReturnToSpace(sm) {}
}

// helper: hostage-style intro text for the HUD
export function lv(n) { return { 1: 'SOL', 2: 'KEPLER-90', 3: 'TRAPPIST-1', 4: 'CYGNUS X-1', 5: 'HR 8799' }[n]; }
