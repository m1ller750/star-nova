// Builds a playable star system scene from NASA data (see data/systems.js).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { RNG, Simplex, kelvinToColor, hashString, rand } from '../core/util.js';
import { layoutSystem } from '../data/systems.js';
import { earthLandTexture } from '../data/earth-map.js';
import {
  planetMaterial, cloudMaterial, atmosphereMaterial, ringMaterial, starMaterial, coronaMaterial,
  skyMaterial, starfieldMaterial, nebulaMaterial, accretionMaterial, lensMaterial, jetMaterial,
} from './shaders.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

function asteroidGeometries(seed) {
  const n = new Simplex(seed);
  const geos = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const d = 1 + n.noise3(_v.x * 1.3 + k * 9, _v.y * 1.3, _v.z * 1.3) * 0.35 + n.noise3(_v.x * 3 + k, _v.y * 3, _v.z * 3) * 0.12;
      _v.multiplyScalar(d);
      if (k === 1) _v.x *= 1.6;
      if (k === 2) { _v.y *= 0.7; _v.z *= 1.3; }
      p.setXYZ(i, _v.x, _v.y, _v.z);
    }
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

export class SpaceEnv {
  constructor(scene, sys, fx) {
    this.scene = scene; this.sys = layoutSystem(sys); this.fx = fx;
    this.time = 0;
    this.bodies = [];
    this.belts = [];
    this.nebulae = [];
    this.comets = [];
    this.updatables = [];
    const seed = hashString(sys.id);
    this.rng = new RNG(seed);

    // ---------------- sky
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900000, 48, 32), skyMaterial(sys.sky));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.starfield = this._starfield(seed);
    scene.add(this.starfield);

    // ---------------- star / black hole
    this.ambient = new THREE.AmbientLight(0x3a4a66, 0.45);
    scene.add(this.ambient);
    this.fill = new THREE.HemisphereLight(0x8a9cc0, 0x141018, 0.9);
    scene.add(this.fill);
    if (sys.star) this._buildStar(sys.star, new THREE.Vector3(0, 0, 0));
    if (sys.blackHole) this._buildBlackHole(sys);

    // ---------------- planets & moons
    for (const p of sys.planets) this._buildPlanet(p);
    if (sys.moons) for (const m of sys.moons) this._buildPlanet(m, true);

    // ---------------- belts & clusters
    if (sys.belts) for (const b of sys.belts) this._buildBelt(b, seed);
    if (sys.asteroidClusters) for (let i = 0; i < sys.asteroidClusters; i++) {
      const pa = sys.planets[i % sys.planets.length], pb = sys.planets[(i + 1) % sys.planets.length];
      const c = pa.pos.clone().lerp(pb.pos, 0.5).add(new THREE.Vector3(this.rng.range(-1500, 1500), this.rng.range(-600, 600), this.rng.range(-1500, 1500)));
      this._buildCluster(c, 1100, 70, seed + i);
    }
    // ---------------- nebulae
    for (const nb of sys.nebulae || []) {
      const base = nb.near ? this.bodyByName(nb.near).pos : new THREE.Vector3();
      this._buildNebula(base.clone().add(new THREE.Vector3(...nb.offset)), nb.size, nb.color, nb.color2, seed + this.nebulae.length * 7);
    }
    // distant deep-sky clouds
    for (let i = 0; i < 4; i++) {
      const dir = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(-0.4, 0.4), this.rng.range(-1, 1)).normalize();
      const nb = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), nebulaMaterial(sys.sky.neb1, sys.sky.neb2, 160000, seed + i * 3.3, 0.18));
      nb.userData.offset = dir.multiplyScalar(600000);
      nb.position.copy(nb.userData.offset); nb.frustumCulled = false; nb.renderOrder = -9;
      nb.material.uniforms.uFadeNear.value = 10;
      scene.add(nb); this.farNebulae = this.farNebulae || []; this.farNebulae.push(nb);
      nb.layers.enable(1);
    }
    this._buildEnvMap();
  }

  bodyByName(name) { return this.bodies.find((b) => b.name === name); }

  _starfield(seed) {
    const r = new RNG(seed + 5);
    const N = 9000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    const c = new THREE.Color();
    const gal = new THREE.Vector3(0.25, 0.92, 0.3).normalize();
    for (let i = 0; i < N; i++) {
      _v.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
      if (_v.lengthSq() > 1 || _v.lengthSq() < 0.01) { i--; continue; }
      _v.normalize();
      // concentrate some stars along the galactic band
      if (r.next() < 0.45) { const d = _v.dot(gal); _v.addScaledVector(gal, -d * 0.85).normalize(); }
      _v.multiplyScalar(500000);
      pos.set([_v.x, _v.y, _v.z], i * 3);
      const t = r.next();
      const temp = t < 0.1 ? r.range(2800, 3800) : t < 0.7 ? r.range(4500, 7000) : r.range(7500, 20000);
      c.copy(kelvinToColor(temp));
      const bright = Math.pow(r.next(), 6);
      const b = 0.3 + bright * 2.2;
      col.set([c.r * b, c.g * b, c.b * b], i * 3);
      size[i] = (1.0 + bright * 3.2) * Math.min(1.5, window.devicePixelRatio || 1);
      ph[i] = r.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const pts = new THREE.Points(g, starfieldMaterial());
    pts.frustumCulled = false; pts.renderOrder = -9;
    pts.layers.enable(1);
    this.sky.layers.enable(1);
    return pts;
  }

  _buildStar(st, pos) {
    const color = kelvinToColor(st.teff);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(st.radius, 64, 48), starMaterial(color, st.teff < 3500 ? 3.4 : 2.6));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coronaMaterial(color, st.radius * 4.6, st.teff < 3500 ? 1.7 : 1.1));
    corona.position.copy(pos); corona.frustumCulled = false; corona.renderOrder = 2;
    this.scene.add(corona);
    const light = new THREE.PointLight(color, 3.2, 0, 0);
    light.position.copy(pos);
    this.scene.add(light);
    const body = { name: st.name, sub: st.sub, pos: pos.clone(), radius: st.radius, mesh, isStar: true, color, heatRadius: st.radius * 2.9, corona };
    this.star = body;
    this.bodies.push(body);
    mesh.layers.enable(1); corona.layers.enable(1);
    this.sunPos = pos.clone();
    this.starColor = color;
  }

  _buildPlanet(p, isMoon = false) {
    const seed = hashString(p.name);
    const landTex = p.look.type === 5 ? earthLandTexture() : null;
    const mat = planetMaterial(p.look, seed, landTex);
    mat.uniforms.uRadius.value = p.radius;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 96, 64), mat);
    mesh.position.copy(p.pos);
    mesh.rotation.set(0.2 * Math.sin(seed), seed % 6, 0.15 * Math.cos(seed));
    this.scene.add(mesh);
    const body = { name: p.name, sub: p.sub, pos: p.pos.clone(), radius: p.radius, mesh, mat, def: p, isMoon };
    if (p.look.atmo) {
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(p.radius * 1.1, 64, 40), atmosphereMaterial(p.look.atmo, (p.look.atmoK || 1) * 1.1));
      atmo.position.copy(p.pos);
      atmo.material.uniforms.uCenter.value.copy(p.pos);
      atmo.material.uniforms.uThick.value = Math.sqrt(1 - 1 / (1.1 * 1.1));
      this.scene.add(atmo); body.atmo = atmo;
    }
    if (p.look.type === 5 || p.look.type === 9) {
      const cl = new THREE.Mesh(new THREE.SphereGeometry(p.radius * 1.012, 96, 64), cloudMaterial(seed % 50));
      cl.position.copy(p.pos); this.scene.add(cl); body.clouds = cl;
    }
    if (p.look.ring) {
      const rr = p.look.ring;
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.radius * rr.inner, p.radius * rr.outer, 160, 4), ringMaterial(rr.color, p.radius * rr.inner, p.radius * rr.outer, rr.faint));
      ring.position.copy(p.pos);
      ring.rotation.x = -Math.PI / 2 + 0.42; ring.rotation.y = 0.15;
      ring.material.uniforms.uCenter.value.copy(p.pos);
      ring.material.uniforms.uR.value = p.radius;
      this.scene.add(ring); body.ring = ring;
    }
    this.bodies.push(body);
    return body;
  }

  _buildBelt(b, seed) {
    const sys = this.sys;
    const r0 = sys.auToGame ? sys.auToGame(b.a0) : b.a0, r1 = sys.auToGame ? sys.auToGame(b.a1) : b.a1;
    const group = new THREE.Group();
    const geos = asteroidGeometries(seed + 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7e72, roughness: 0.95, metalness: 0.05, flatShading: true });
    const per = Math.ceil(b.count / geos.length);
    const r = new RNG(seed + 17);
    const items = [];
    const dummy = new THREE.Object3D();
    geos.forEach((geo, gi) => {
      const inst = new THREE.InstancedMesh(geo, mat, per);
      const col = new THREE.Color();
      for (let i = 0; i < per; i++) {
        const a = r.range(0, Math.PI * 2);
        const rad = r.range(r0, r1);
        const big = r.next() < 0.04;
        const s = big ? r.range(90, 190) : r.range(10, 55);
        dummy.position.set(Math.cos(a) * rad, r.range(-1, 1) * (r1 - r0) * 0.12, Math.sin(a) * rad);
        dummy.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        col.setHSL(r.range(0.05, 0.1), r.range(0.05, 0.25), r.range(0.3, 0.55));
        inst.setColorAt(i, col);
        items.push({ p: dummy.position.clone(), r: s * 1.05 });
      }
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    });
    this.scene.add(group);
    this.belts.push({ group, items, name: b.name, r0, r1, spin: 0.0015 * (r.next() < 0.5 ? 1 : -1) });
  }

  _buildCluster(center, spread, count, seed) {
    const group = new THREE.Group(); group.position.copy(center);
    const geos = asteroidGeometries(seed);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a706a, roughness: 0.95, flatShading: true });
    const r = new RNG(seed);
    const items = [];
    const dummy = new THREE.Object3D();
    geos.forEach((geo) => {
      const n = Math.ceil(count / geos.length);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        dummy.position.set(r.range(-1, 1), r.range(-0.4, 0.4), r.range(-1, 1)).multiplyScalar(spread);
        dummy.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
        const s = r.next() < 0.08 ? r.range(80, 160) : r.range(12, 50);
        dummy.scale.setScalar(s); dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        items.push({ p: dummy.position.clone(), r: s * 1.05 });
      }
      group.add(inst);
    });
    this.scene.add(group);
    this.belts.push({ group, items, name: 'ASTEROID FIELD', spin: 0.01 * (r.next() - 0.5), cluster: true });
  }

  _buildNebula(center, size, c1, c2, seed) {
    const group = new THREE.Group(); group.position.copy(center);
    const r = new RNG(seed);
    const mats = [];
    for (let i = 0; i < 26; i++) {
      const s = size * r.range(0.22, 0.55);
      const m = nebulaMaterial(r.next() < 0.5 ? c1 : c2, r.next() < 0.5 ? c2 : c1, s, r.range(0, 50), r.range(0.16, 0.34));
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      b.position.set(r.range(-1, 1), r.range(-0.5, 0.5), r.range(-1, 1)).multiplyScalar(size * 0.55);
      b.frustumCulled = false; b.renderOrder = 1;
      b.layers.enable(1);
      group.add(b); mats.push(m);
    }
    this.scene.add(group);
    this.nebulae.push({ group, center: center.clone(), radius: size * 0.7, mats });
  }

  _buildBlackHole(sys) {
    const bh = sys.blackHole;
    const g = new THREE.Group();
    const H = bh.horizon;
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(H, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    g.add(horizon);
    const disk = new THREE.Mesh(new THREE.RingGeometry(bh.disk[0], bh.disk[1], 256, 16), accretionMaterial(bh.disk[0], bh.disk[1]));
    disk.rotation.x = -Math.PI / 2 + 0.18;
    disk.renderOrder = 4;
    disk.layers.enable(1);
    g.add(disk);
    // relativistic jets (Cygnus X-1 has jets)
    const jets = [];
    for (const s of [1, -1]) {
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.15, H * 1.8, 14000, 24, 1, true).translate(0, 7000, 0), jetMaterial(0x8ab8ff));
      jet.rotation.x = s > 0 ? 0.18 : Math.PI + 0.18;
      jet.layers.enable(1);
      g.add(jet); jets.push(jet);
    }
    this.scene.add(g);
    // lensing billboard (samples a background-only render)
    const size = new THREE.Vector2();
    game.engine.renderer.getDrawingBufferSize(size);
    const bgRT = new THREE.WebGLRenderTarget(Math.max(2, size.x >> 1), Math.max(2, size.y >> 1), { type: THREE.HalfFloatType });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lensMaterial(bgRT.texture));
    lens.material.uniforms.uSize.value = H * 9;
    lens.frustumCulled = false; lens.renderOrder = 3;
    this.scene.add(lens);
    // companion: blue supergiant HDE 226868 + gas stream into the disk
    const comp = sys.companion;
    const cdir = new THREE.Vector3(0.75, 0.12, -0.65).normalize();
    const cpos = cdir.clone().multiplyScalar(comp.dist);
    this._buildStar({ name: comp.name, sub: comp.sub, teff: comp.teff, radius: comp.radius }, cpos);
    this.star.heatRadius = comp.radius * 2.4;
    this.blackHole = { group: g, pos: new THREE.Vector3(), horizon: H, disk, jets, lens, bgRT, name: bh.name, sub: bh.sub, size, companionPos: cpos, darkening: 0 };
    this.bodies.push({ name: bh.name, sub: bh.sub, pos: new THREE.Vector3(), radius: H, isBlackHole: true });
    const self = this;
    game.engine.preRender = (renderer, scene, camera) => {
      if (scene !== self.scene) return;
      const B = self.blackHole;
      renderer.getDrawingBufferSize(B.size);
      if (bgRT.width !== Math.max(2, B.size.x >> 1)) bgRT.setSize(Math.max(2, B.size.x >> 1), Math.max(2, B.size.y >> 1));
      const prevMask = camera.layers.mask;
      camera.layers.set(1);
      lens.visible = false;
      renderer.setRenderTarget(bgRT); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      camera.layers.mask = prevMask;
      lens.visible = true;
      // screen-space params
      _v.copy(B.pos).project(camera);
      const u = lens.material.uniforms;
      u.uCenter.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
      u.uRes.value.copy(B.size);
      const dist = camera.position.distanceTo(B.pos);
      const ang = Math.atan(B.horizon / Math.max(dist, B.horizon * 1.01));
      u.uHorizon.value = ang / ((camera.fov * Math.PI) / 180) ;
      lens.position.copy(B.pos);
    };
    // gas stream from the companion (Roche-lobe overflow) curving into the disk
    const edge = new THREE.Vector3();
    this.updatables.push(() => {
      if (!this.fx) return;
      for (let i = 0; i < 3; i++) {
        const t = Math.random();
        const a = Math.atan2(cpos.z, cpos.x) + 0.6 + t * 1.4;
        edge.set(Math.cos(a) * bh.disk[1] * 0.95, Math.sin(a) * bh.disk[1] * 0.95, 0).applyQuaternion(disk.quaternion);
        const p = cpos.clone().multiplyScalar(1 - t).add(edge.multiplyScalar(t));
        p.y += Math.sin(t * Math.PI) * 900;
        p.x += (Math.random() - 0.5) * 300; p.z += (Math.random() - 0.5) * 300;
        this.fx.trail(p, 0x6aa8ff, 650 * (1 - t * 0.6) + 180, 2.2, null, 1.1);
      }
    });
  }

  // comets (fictional; the only invented bodies)
  spawnComet(pos, vel, size = 30) {
    const g = new THREE.Group();
    const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 2), new THREE.MeshStandardMaterial({ color: 0x5a5a62, roughness: 0.9, flatShading: true, emissive: 0x1a2a3a }));
    g.add(nucleus);
    const coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: (this._glow = this._glow || makeGlow()), color: 0x9fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    coma.scale.setScalar(size * 7); coma.material.color.multiplyScalar(1.6);
    g.add(coma);
    g.position.copy(pos);
    this.scene.add(g);
    const c = { group: g, pos: g.position, vel: vel.clone(), radius: size * 1.1, size, alive: true, isComet: true };
    this.comets.push(c);
    return c;
  }
  removeComet(c) { c.alive = false; this.scene.remove(c.group); const i = this.comets.indexOf(c); if (i >= 0) this.comets.splice(i, 1); }

  _buildEnvMap() {
    const envScene = new THREE.Scene();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTop: { value: new THREE.Color(0x1a2a44) }, uBot: { value: new THREE.Color(0x04060a) }, uNeb: { value: new THREE.Color(this.sys.sky.neb1) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop, uBot, uNeb; varying vec3 vP; void main(){ vec3 c = mix(uBot, uTop, vP.y*0.5+0.5); c += uNeb * pow(max(vP.x,0.0),3.0)*0.15; gl_FragColor = vec4(c,1.0); }',
    }));
    envScene.add(sphere);
    const sunDir = this.star ? this.star.pos.clone().normalize() : new THREE.Vector3(1, 0.3, 0);
    if (sunDir.lengthSq() < 0.01) sunDir.set(1, 0.4, 0.3).normalize();
    const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 8), new THREE.MeshBasicMaterial({ color: (this.starColor || new THREE.Color(1, 1, 1)).clone().multiplyScalar(14) }));
    sun.position.copy(sunDir.multiplyScalar(80)); envScene.add(sun);
    const pm = new THREE.PMREMGenerator(game.engine.renderer);
    this.envTex = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    this.scene.environment = this.envTex;
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    this.sky.position.copy(camera.position);
    this.starfield.position.copy(camera.position);
    this.starfield.material.uniforms.uTime.value = t;
    if (this.farNebulae) for (const n of this.farNebulae) n.position.copy(camera.position).add(n.userData.offset);
    const sunPos = this.sunPos || new THREE.Vector3(0, 0, 0);
    for (const b of this.bodies) {
      if (b.isStar) { b.mesh.material.uniforms.uTime.value = t; b.corona.material.uniforms.uTime.value = t; continue; }
      if (!b.mesh) continue;
      b.mesh.rotation.y += dt * 0.006;
      const u = b.mat.uniforms; u.uTime.value = t; u.uSunPos.value.copy(sunPos);
      if (b.atmo) b.atmo.material.uniforms.uSunPos.value.copy(sunPos);
      if (b.clouds) { b.clouds.rotation.y += dt * 0.009; b.clouds.material.uniforms.uSunPos.value.copy(sunPos); b.clouds.material.uniforms.uTime.value = t; }
      if (b.ring) b.ring.material.uniforms.uSunPos.value.copy(sunPos);
    }
    for (const be of this.belts) be.group.rotation.y += be.spin * dt;
    for (const n of this.nebulae) for (const m of n.mats) m.uniforms.uTime.value = t;
    if (this.blackHole) {
      const B = this.blackHole;
      B.disk.material.uniforms.uTime.value = t;
      B.disk.material.uniforms.uCamDir.value.copy(camera.position).sub(B.pos).normalize();
      for (const j of B.jets) j.material.uniforms.uTime.value = t;
    }
    for (const c of this.comets) {
      c.pos.addScaledVector(c.vel, dt);
      if (this.fx && Math.random() < 0.9) {
        const away = _v2.copy(c.pos).sub(sunPos).normalize();
        const p = _v.copy(c.pos).addScaledVector(away, c.size * 0.5).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(c.size * 0.6));
        this.fx.trail(p, 0x8fd8ff, c.size * rand(2.5, 4.5), 2.2, away.clone().multiplyScalar(c.size * 6).addScaledVector(c.vel, 0.6), 1.4);
        if (Math.random() < 0.35) this.fx.smokePuff(p, c.size * 1.2, 2.5, 0x6a8aa8, away.clone().multiplyScalar(c.size * 3), 0.25);
      }
    }
    for (const u of this.updatables) u(dt);
  }

  // asteroid collision query. returns {pos, radius} in world space or null
  asteroidHit(pos, radius) {
    for (const be of this.belts) {
      const g = be.group;
      // local position of the query point
      _q.copy(g.quaternion).invert();
      _v.copy(pos).sub(g.position).applyQuaternion(_q);
      if (!be.cluster) {
        const rr = Math.hypot(_v.x, _v.z);
        if (rr < be.r0 - 300 || rr > be.r1 + 300) continue;
      }
      for (const it of be.items) {
        const d2 = _v.distanceToSquared(it.p);
        const rs = it.r + radius;
        if (d2 < rs * rs) {
          const wp = it.p.clone().applyQuaternion(g.quaternion).add(g.position);
          return { pos: wp, radius: it.r };
        }
      }
    }
    return null;
  }

  inNebula(pos) {
    for (const n of this.nebulae) { const d = pos.distanceTo(n.center); if (d < n.radius) return 1 - d / n.radius; }
    return 0;
  }

  dispose() {
    if (this.blackHole) { game.engine.preRender = null; this.blackHole.bgRT.dispose(); }
    if (this.envTex) this.envTex.dispose();
  }
}

function makeGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
