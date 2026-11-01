// Particle effects: sparks, fire, smoke, explosions, tracers, laser beams, shockwaves, debris, flash lights.
import * as THREE from 'three';
import { glowTexture, smokeTexture, rand, clamp } from '../core/util.js';
import { fireballMaterial } from './shaders.js';
import { game } from '../core/game.js';

const LOGV = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGF = '#include <logdepthbuf_pars_fragment>\n';

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max; this.next = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: additive ? glowTexture() : smokeTexture() }, uScale: { value: 500 } },
      vertexShader: LOGV + `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha <= 0.0 ? 0.0 : min(aSize * uScale / max(-mv.z, 0.1), 700.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LOGF + `
        uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(uTex, gl_PointCoord);
          ${additive ? 'gl_FragColor = vec4(vColor * t.a * vAlpha, 1.0);' : 'gl_FragColor = vec4(vColor, t.a * vAlpha); if (gl_FragColor.a < 0.01) discard;'}
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.geo = g;
    this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, alpha = 1, drag = 0, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav; this.size[i] = s0; this.alpha[i] = alpha;
  }
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    const { pos, vel, life, maxLife, size, alpha, s0, s1, drag, grav, a0 } = this;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; any = true; } continue; }
      any = true;
      life[i] -= dt;
      const t = 1 - Math.max(0, life[i]) / maxLife[i];
      const i3 = i * 3;
      const dr = drag[i] > 0 ? Math.exp(-drag[i] * dt) : 1;
      vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - grav[i] * dt; vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      size[i] = s0[i] + (s1[i] - s0[i]) * t;
      alpha[i] = life[i] <= 0 ? 0 : a0[i] * (t < 0.1 ? t / 0.1 : 1) * (1 - t * t);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true; this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const ZAXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class FX {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.scaleUnit = opts.scale || 1;
    this.add = new ParticleSystem(scene, opts.max || 7000, true);
    this.smoke = new ParticleSystem(scene, opts.maxSmoke || 3000, false);
    this.tracers = [];
    this.tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.tracerGeo.userData.shared = true;
    this.beams = new Map();
    this.shocks = [];
    this.fireballs = [];
    this.debrisList = [];
    this.debrisGeo = new THREE.DodecahedronGeometry(1, 0); this.debrisGeo.userData.shared = true;
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8, metalness: 0.4, emissive: 0x220800 });
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 64); this.ringGeo.userData.shared = true;
    this.fbGeo = new THREE.IcosahedronGeometry(1, 4); this.fbGeo.userData.shared = true;
    this.lights = [];
    for (let i = 0; i < (opts.lights ?? 6); i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 100, 2);
      l.userData.t = 0; l.userData.dur = 1; l.userData.i0 = 0;
      scene.add(l); this.lights.push(l);
    }
    this.lightIdx = 0;
    this.time = 0;
  }

  _pscale(camera) {
    const h = game.engine.renderer.getDrawingBufferSize(_v2).y;
    return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  update(dt, camera) {
    this.time += dt;
    const scale = this._pscale(camera);
    this.add.update(dt, scale);
    this.smoke.update(dt, scale);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.speed) {
        t.mesh.position.addScaledVector(t.dir, t.speed * dt);
        t.traveled += t.speed * dt;
        if (t.traveled > t.len) t.life = 0;
      }
      t.mesh.material.opacity = clamp(t.life / t.max, 0, 1);
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (const [id, b] of this.beams) {
      if (!b.touched) { this.scene.remove(b.group); b.mat.dispose(); b.coreMat.dispose(); this.beams.delete(id); continue; }
      b.touched = false;
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.t += dt;
      const k = s.t / s.dur;
      const r = s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - k, 3));
      s.mesh.scale.setScalar(r);
      if (s.face) s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.material.opacity = (1 - k) * s.op;
      if (k >= 1) { this.scene.remove(s.mesh); s.mesh.material.dispose(); this.shocks.splice(i, 1); }
    }
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(f.r * (0.3 + 0.7 * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3))));
      f.mesh.material.uniforms.uAge.value = k;
      f.mesh.material.uniforms.uTime.value = this.time;
      if (k >= 1) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.fireballs.splice(i, 1); }
    }
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life -= dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.y -= d.grav * dt;
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt;
      if (d.ground !== null && d.mesh.position.y < d.ground) { d.mesh.position.y = d.ground; d.vel.multiplyScalar(0.4); d.vel.y = Math.abs(d.vel.y) * 0.3; }
      if (Math.random() < 0.6 && d.life > 0.4) {
        const p = d.mesh.position;
        this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.35, d.size * 1.6, d.size * 0.4, 1, 0.45, 0.12, 0.8);
        if (Math.random() < 0.4) this.smoke.emit(p.x, p.y, p.z, 0, d.size * 0.5, 0, 1.4, d.size * 1.2, d.size * 4, 0.12, 0.11, 0.1, 0.5, 0.5);
      }
      if (d.life <= 0) { this.scene.remove(d.mesh); this.debrisList.splice(i, 1); }
    }
    for (const l of this.lights) {
      if (l.userData.t > 0) {
        l.userData.t -= dt;
        l.intensity = l.userData.i0 * Math.max(0, l.userData.t / l.userData.dur);
      } else if (l.intensity !== 0) l.intensity = 0;
    }
  }

  // ------------------------------------------------------------- emitters
  spark(pos, dir, count = 10, color = 0xffc070, speed = 30, size = 0.3, life = 0.4, spread = 0.6, grav = 0) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      const vx = (dir ? dir.x : 0) + rand(-spread, spread), vy = (dir ? dir.y : 0) + rand(-spread, spread), vz = (dir ? dir.z : 0) + rand(-spread, spread);
      const sp = speed * rand(0.4, 1.2);
      const l = Math.hypot(vx, vy, vz) || 1;
      this.add.emit(pos.x, pos.y, pos.z, (vx / l) * sp, (vy / l) * sp, (vz / l) * sp, life * rand(0.6, 1.3), size, size * 0.2, _c.r * 2, _c.g * 2, _c.b * 2, 1, 2.5, grav);
    }
  }
  glow(pos, color, size, life = 0.12, intensity = 2) {
    _c.set(color);
    this.add.emit(pos.x, pos.y, pos.z, 0, 0, 0, life, size, size * 1.3, _c.r * intensity, _c.g * intensity, _c.b * intensity, 1);
  }
  trail(pos, color, size, life = 0.5, vel = null, intensity = 1.6) {
    _c.set(color);
    this.add.emit(pos.x, pos.y, pos.z, vel ? vel.x : 0, vel ? vel.y : 0, vel ? vel.z : 0, life, size, size * 0.15, _c.r * intensity, _c.g * intensity, _c.b * intensity, 0.9, 1.5);
  }
  smokePuff(pos, size = 2, life = 2, color = 0x555555, vel = null, alpha = 0.55, rise = 0) {
    _c.set(color);
    this.smoke.emit(pos.x, pos.y, pos.z, vel ? vel.x : rand(-0.5, 0.5) * size, (vel ? vel.y : rand(-0.2, 0.5) * size) + rise, vel ? vel.z : rand(-0.5, 0.5) * size, life * rand(0.8, 1.2), size, size * 3, _c.r, _c.g, _c.b, alpha, 0.6, -rise * 0.2);
  }
  muzzle(pos, dir, color = 0xffd27a, size = 0.5) {
    this.glow(pos, color, size * 2.2, 0.05, 3);
    this.spark(pos, dir, 3, color, 18 * size, size * 0.35, 0.08, 0.3);
    this.light(pos, color, 6 * size * this.scaleUnit, 12 * size * this.scaleUnit, 0.05);
  }
  impact(pos, normal, color = 0xffb060, size = 1, smoke = true) {
    this.spark(pos, normal, 8, color, 14 * size, 0.25 * size, 0.35, 0.8, 9.8 * (this.scaleUnit < 2 ? 1 : 0));
    this.glow(pos, color, size * 1.4, 0.08, 2.5);
    if (smoke) this.smokePuff(pos, size * 0.5, 0.9, 0x6a6560, null, 0.4);
  }
  blood(pos, dir, color = 0x40ff90) {
    _c.set(color);
    for (let i = 0; i < 10; i++) {
      this.smoke.emit(pos.x, pos.y, pos.z, (dir ? dir.x * 3 : 0) + rand(-2, 2), rand(0, 3), (dir ? dir.z * 3 : 0) + rand(-2, 2), 0.6, 0.18, 0.06, _c.r, _c.g, _c.b, 0.95, 1, 9.8);
    }
    this.glow(pos, color, 0.6, 0.1, 1.2);
  }

  explosion(pos, size = 1, opts = {}) {
    const c1 = opts.color || 0xff8a30;
    // flash
    this.glow(pos, 0xfff2d0, size * 9, 0.18, 4);
    this.glow(pos, c1, size * 14, 0.45, 1.6);
    // fireball particles
    _c.set(c1);
    for (let i = 0; i < 30 + size * 8; i++) {
      const d = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const sp = size * rand(3, 11);
      this.add.emit(pos.x, pos.y, pos.z, d.x * sp, d.y * sp, d.z * sp, rand(0.4, 1.1), size * rand(2.5, 4.5), size * rand(4, 7), _c.r * 1.8, _c.g * 1.5, _c.b * 1.2, 1, 3);
    }
    // sparks
    this.spark(pos, null, 22 + size * 4, 0xffd890, size * 28, size * 0.45, 1.0, 1, opts.grav || 0);
    // smoke
    for (let i = 0; i < 10 + size * 3; i++) {
      const d = _v.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize();
      const sp = size * rand(1.5, 5);
      this.smoke.emit(pos.x, pos.y, pos.z, d.x * sp, d.y * sp + (opts.rise || 0), d.z * sp, rand(1.8, 3.6), size * 3.5, size * 9, 0.13, 0.12, 0.11, 0.6, 1.2, -(opts.rise || 0) * 0.15);
    }
    // fireball mesh
    if (size >= 1.5 || opts.fireball) this.fireball(pos, size * 4.2, 1.1 + size * 0.08);
    this.shockwave(pos, size * 0.5, size * 16, 0xffc890, 0.55, opts.shockNormal);
    if (opts.debris !== false) this.debris(pos, Math.min(12, 3 + Math.floor(size * 2)), size * 0.5, size * 14, opts.ground ?? null, opts.grav || 0);
    this.light(pos, c1, 40 * size * this.scaleUnit, 60 * size * this.scaleUnit, 0.5 + size * 0.05);
    if (game.audio && !opts.silent) game.audio.explosion(Math.min(4, size * (opts.audioScale || 1)), pos);
  }

  megaExplosion(pos, size) {
    // used for the colonizer ring ship & dreadnoughts
    this.explosion(pos, size * 0.15, { silent: true, fireball: true, debris: false });
    this.fireball(pos, size * 0.9, 4.5);
    this.fireball(pos, size * 0.55, 3.0);
    this.shockwave(pos, size * 0.1, size * 3.2, 0xffe0b0, 3.2, null, 0.9);
    this.shockwave(pos, size * 0.05, size * 2.0, 0x9ad8ff, 2.2, null, 0.7);
    for (let i = 0; i < 600; i++) {
      const d = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const sp = size * rand(0.2, 1.4);
      _c.setHSL(rand(0.02, 0.12), 1, rand(0.5, 0.7));
      this.add.emit(pos.x, pos.y, pos.z, d.x * sp, d.y * sp, d.z * sp, rand(1.5, 4.5), size * rand(0.03, 0.09), size * rand(0.06, 0.16), _c.r * 2, _c.g * 2, _c.b * 2, 1, 0.6);
    }
    for (let i = 0; i < 160; i++) {
      const d = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const sp = size * rand(0.1, 0.6);
      this.smoke.emit(pos.x + d.x * size * 0.1, pos.y + d.y * size * 0.1, pos.z + d.z * size * 0.1, d.x * sp, d.y * sp, d.z * sp, rand(4, 8), size * 0.12, size * 0.4, 0.15, 0.12, 0.1, 0.55, 0.3);
    }
    this.light(pos, 0xffc080, 1e6, size * 30, 5);
  }

  fireball(pos, radius, dur = 1.2) {
    const m = new THREE.Mesh(this.fbGeo, fireballMaterial());
    m.position.copy(pos); m.scale.setScalar(radius * 0.3);
    m.renderOrder = 6;
    this.scene.add(m);
    this.fireballs.push({ mesh: m, t: 0, dur, r: radius });
  }

  shockwave(pos, r0, r1, color = 0xffd0a0, dur = 0.6, normal = null, op = 0.8) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos);
    if (normal) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.scale.setScalar(r0);
    this.scene.add(m);
    this.shocks.push({ mesh: m, t: 0, dur, r0, r1, face: !normal, op });
  }

  debris(pos, count, size, speed, ground = null, grav = 0) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat);
      const s = size * rand(0.3, 1);
      m.scale.set(s * rand(0.6, 1.4), s * rand(0.4, 1), s * rand(0.6, 1.5));
      m.position.copy(pos);
      this.scene.add(m);
      const vel = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
      this.debrisList.push({ mesh: m, vel, spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), 0), life: rand(1.2, 2.6), size: s, ground, grav });
    }
  }

  light(pos, color, intensity, distance, dur) {
    const l = this.lights[this.lightIdx]; if (!l) return;
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    l.position.copy(pos); l.color.set(color); l.distance = distance; l.userData.i0 = intensity; l.userData.t = dur; l.userData.dur = dur; l.intensity = intensity;
  }

  // instant line (hitscan tracer) or traveling streak
  tracer(from, to, color = 0xffd27a, width = 0.03, life = 0.06, speed = 0) {
    const dir = _v.subVectors(to, from);
    const len = dir.length(); if (len < 0.01) return;
    dir.normalize();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.color.multiplyScalar(3);
    const m = new THREE.Mesh(this.tracerGeo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(ZAXIS, dir);
    const segLen = speed ? Math.min(len, speed * 0.04) : len;
    m.scale.set(width, width, segLen);
    this.scene.add(m);
    this.tracers.push({ mesh: m, life, max: life, speed, dir: dir.clone(), len: Math.max(0, len - segLen), traveled: 0 });
  }

  // persistent beam, call every frame while active
  beam(id, from, to, color = 0xff2a3a, width = 0.25) {
    let b = this.beams.get(id);
    if (!b) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.color.multiplyScalar(2.5);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      coreMat.color.multiplyScalar(3);
      const outer = new THREE.Mesh(this.tracerGeo, mat); const core = new THREE.Mesh(this.tracerGeo, coreMat);
      group.add(outer, core); this.scene.add(group);
      b = { group, outer, core, mat, coreMat };
      this.beams.set(id, b);
    }
    b.touched = true;
    const dir = _v.subVectors(to, from); const len = dir.length(); dir.normalize();
    b.group.position.copy(from);
    b.group.quaternion.setFromUnitVectors(ZAXIS, dir);
    const flick = 0.85 + Math.random() * 0.3;
    b.outer.scale.set(width * flick, width * flick, len);
    b.core.scale.set(width * 0.3, width * 0.3, len);
    if (Math.random() < 0.5) this.spark(to, dir.clone().negate(), 2, color, 12 * width * 4, width * 1.5, 0.25, 0.9);
    if (Math.random() < 0.6) this.glow(to, color, width * 9, 0.06, 2.5);
  }

  dispose() {
    this.add.dispose(); this.smoke.dispose();
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const [, b] of this.beams) this.scene.remove(b.group);
    for (const s of this.shocks) this.scene.remove(s.mesh);
    for (const f of this.fireballs) this.scene.remove(f.mesh);
    for (const d of this.debrisList) this.scene.remove(d.mesh);
    for (const l of this.lights) this.scene.remove(l);
  }
}

export { UP };
