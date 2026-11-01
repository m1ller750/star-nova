// LEVEL 1 — Solar System: defend Earth, liberate Mercury, Venus and Mars.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { Mission } from './common.js';

export class Level1 extends Mission {
  constructor() {
    super(1);
    this.unlocks = { shield: false, laser: false, eject: false };
  }

  spawn(sm) {
    const earth = sm.env.bodyByName('EARTH');
    const sunDir = earth.pos.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = earth.pos.clone().addScaledVector(sunDir, earth.radius * 2.0).addScaledVector(side, earth.radius * 1.4).add(new THREE.Vector3(0, earth.radius * 0.3, 0));
    const look = earth.pos.clone().addScaledVector(side, earth.radius * 1.05).add(new THREE.Vector3(0, earth.radius * 0.1, 0));
    return { pos, look };
  }

  setupSpace(sm) {
    const env = sm.env;
    for (const name of ['MERCURY', 'VENUS', 'MARS']) {
      const b = env.bodyByName(name);
      this.spawnPatrol(sm, this.guardPoint(b), 2, name === 'MARS' ? 1 : 0, 700);
    }
    const earth = env.bodyByName('EARTH');
    this.earthWave = this.guardPoint(earth, -2.6);
    game.voice.dialogue([
      ['WAIT', 1.2],
      ['HALE', 'Nova, this is Admiral Hale, Earth Defense Command. The Klin\'Tar have seized Mercury, Venus and Mars.'],
      ['NOVA', 'I see them, Admiral. Nova-1 is ready.'],
      ['AI', 'Hostile fighters approaching Earth orbit. Cannon hits charge your rockets. One rocket destroys a fighter. Cruisers need two.'],
      ['HALE', 'Clear the skies, then land on the marked worlds and drive them out. And stay away from the Sun — your hull will not survive the heat.'],
    ]);
    setTimeout(() => {
      if (game.space !== sm) return;
      this.spawnPatrol(sm, this.earthWave, 2, 0, 500);
      for (const e of sm.enemies) if (e.guard.distanceTo(this.earthWave) < 10) e.engaged = true;
      game.ui.hint('Mouse: aim · W/S: throttle · SHIFT: boost · LMB: cannons · RMB: rocket', 8);
    }, 9000);
    game.ui.hint('Move the mouse to steer — the ship follows your crosshair', 6);
  }

  onComplete(sm) {
    game.voice.dialogue([
      ['HALE', 'The Solar System is free. Incredible work, Nova.'],
      ['HALE', 'Our scans traced the invasion fleet to Kepler-90, two thousand seven hundred light-years away. Their staging ground.'],
      ['NOVA', 'Then that is where I am going. Spinning up the jump drive.'],
    ]);
    game.ui.hint('Press J to jump to light speed', 10);
  }

  canLand(sm, body) {
    return { ok: true };
  }
}
