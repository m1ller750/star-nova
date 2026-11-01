// Procedural audio: every sound effect and music track is synthesized with the Web Audio API.
import * as THREE from 'three';
import { game } from './game.js';
import { clamp, rand, pick } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.listenerPos = new THREE.Vector3();
    this.listenerRight = new THREE.Vector3(1, 0, 0);
    this.loops = new Set();
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = game.settings.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 18; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = game.settings.music; this.musicBus.connect(this.master);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this._impulse(3.2, 2.6);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.9; this.revSend.connect(this.reverb); this.reverb.connect(this.master);
    this.musicRev = ctx.createGain(); this.musicRev.gain.value = 0.5; this.musicRev.connect(this.reverb);
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.36;
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay); this.delay.connect(this.musicBus);
    this.noiseBuf = this._noise(2, 'white');
    this.brownBuf = this._noise(4, 'brown');
    this.music = new Music(this);
    this.ready = true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusic(name) { if (this.music) this.music.play(name); }
  setVolume(v) { game.settings.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { game.settings.music = v; if (this.musicBus) this.musicBus.gain.value = v; }

  _impulse(dur, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  _noise(dur, kind) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  setListener(camera) {
    if (!camera) return;
    this.listenerPos.copy(camera.position);
    this.listenerRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  // distance attenuation + stereo pan for a world position
  spatial(pos, ref = 60, maxD = 3000) {
    if (!pos) return { vol: 1, pan: 0 };
    const d = pos.distanceTo(this.listenerPos);
    if (d > maxD) return { vol: 0, pan: 0 };
    const vol = clamp(ref / (ref + d), 0, 1);
    const dir = pos.clone().sub(this.listenerPos).normalize();
    return { vol, pan: clamp(dir.dot(this.listenerRight), -1, 1) * 0.8 };
  }

  _out(vol, pan, rev = 0, dest = null) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = vol;
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(dest || this.sfx);
    if (rev > 0) { const r = ctx.createGain(); r.gain.value = rev; node.connect(r); r.connect(this.revSend); }
    return g;
  }

  // ------------------------------------------------------------- primitives
  tone({ type = 'sine', f = 440, f2 = null, dur = 0.3, vol = 0.3, a = 0.005, rel = null, pan = 0, rev = 0, filter = null, ff = 2000, ff2 = null, q = 1, delay = 0, dest = null, vib = 0, vibRate = 6, curve = 'exp' }) {
    if (!this.ready) return null;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2 !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
      else o.frequency.linearRampToValueAtTime(f2, t + dur);
    }
    if (vib) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (rel || dur));
    let src = o;
    if (filter) {
      const fl = ctx.createBiquadFilter(); fl.type = filter; fl.frequency.setValueAtTime(ff, t); fl.Q.value = q;
      if (ff2) fl.frequency.exponentialRampToValueAtTime(ff2, t + dur);
      o.connect(fl); src = fl;
    }
    src.connect(env);
    env.connect(this._out(vol, pan, rev, dest));
    o.start(t); o.stop(t + (rel || dur) + 0.05);
    return o;
  }

  noise({ dur = 0.3, vol = 0.3, a = 0.003, type = 'lowpass', f = 2000, f2 = null, q = 0.7, pan = 0, rev = 0, delay = 0, brown = false, dest = null, rate = 1 }) {
    if (!this.ready) return null;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = brown ? this.brownBuf : this.noiseBuf; s.loop = true; s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(env); env.connect(this._out(vol, pan, rev, dest));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.lastPlay[key] && now - this.lastPlay[key] < ms) return false;
    this.lastPlay[key] = now; return true;
  }

  // ------------------------------------------------------------- weapons
  shipGun() {
    if (!this.throttle('shipgun', 40)) return;
    this.tone({ type: 'square', f: 1500, f2: 220, dur: 0.1, vol: 0.06, filter: 'lowpass', ff: 3500, rev: 0.1 });
    this.noise({ dur: 0.05, vol: 0.08, type: 'highpass', f: 3000 });
  }
  rifle(silenced = false) {
    if (!this.throttle('rifle', 40)) return;
    this.noise({ dur: 0.11, vol: silenced ? 0.08 : 0.32, type: 'bandpass', f: 1600, q: 0.8, rev: 0.25 });
    this.tone({ type: 'sine', f: 150, f2: 45, dur: 0.12, vol: 0.4 });
    this.tone({ type: 'square', f: 2600, f2: 900, dur: 0.025, vol: 0.05 });
  }
  sniper() {
    this.noise({ dur: 0.5, vol: 0.55, type: 'lowpass', f: 6000, f2: 300, rev: 0.7 });
    this.tone({ type: 'sine', f: 110, f2: 30, dur: 0.5, vol: 0.7 });
    this.noise({ dur: 1.6, vol: 0.12, type: 'bandpass', f: 500, f2: 120, rev: 0.6, delay: 0.1 });
    this.tone({ type: 'square', f: 400, f2: 300, dur: 0.05, vol: 0.06, delay: 0.75 }); // bolt
    this.noise({ dur: 0.06, vol: 0.1, type: 'highpass', f: 2500, delay: 0.85 });
  }
  enemyShot(pos, kind = 'plasma') {
    if (!this.throttle('eshot', 35)) return;
    const s = this.spatial(pos, 50); if (s.vol < 0.02) return;
    if (kind === 'heavy') {
      this.tone({ type: 'sawtooth', f: 300, f2: 60, dur: 0.35, vol: 0.25 * s.vol, pan: s.pan, filter: 'lowpass', ff: 1200, rev: 0.2 });
    } else {
      this.tone({ type: 'sawtooth', f: 1100, f2: 180, dur: 0.16, vol: 0.13 * s.vol, pan: s.pan, filter: 'lowpass', ff: 2800, rev: 0.15 });
    }
  }
  rocket() {
    this.noise({ dur: 0.9, vol: 0.3, type: 'bandpass', f: 300, f2: 1600, q: 1.5, rev: 0.3 });
    this.tone({ type: 'sawtooth', f: 90, f2: 40, dur: 0.6, vol: 0.15, filter: 'lowpass', ff: 400 });
  }
  missileSalvo() {
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.5, vol: 0.18, type: 'bandpass', f: 500, f2: 2000, q: 2, delay: i * 0.08 });
  }
  hit(metal = true) {
    if (!this.throttle('hit', 30)) return;
    if (metal) { this.tone({ type: 'triangle', f: 2400, f2: 1300, dur: 0.06, vol: 0.08 }); this.noise({ dur: 0.04, vol: 0.06, type: 'highpass', f: 4000 }); }
    else { this.noise({ dur: 0.08, vol: 0.18, type: 'lowpass', f: 900 }); this.tone({ type: 'sine', f: 180, f2: 70, dur: 0.08, vol: 0.2 }); }
  }
  hitMarker(kill = false) {
    if (kill) { this.tone({ type: 'sine', f: 1200, dur: 0.07, vol: 0.12 }); this.tone({ type: 'sine', f: 1800, dur: 0.12, vol: 0.12, delay: 0.06 }); }
    else this.tone({ type: 'sine', f: 2200, dur: 0.035, vol: 0.05 });
  }
  shieldHit() {
    if (!this.throttle('shield', 60)) return;
    this.tone({ type: 'sine', f: 500, f2: 1600, dur: 0.25, vol: 0.15, rev: 0.4 });
    this.noise({ dur: 0.2, vol: 0.08, type: 'bandpass', f: 3000, q: 4 });
  }
  shieldOn(on) { this.tone({ type: 'sine', f: on ? 300 : 900, f2: on ? 1000 : 250, dur: 0.4, vol: 0.14, rev: 0.4 }); }
  playerHurt() {
    if (!this.throttle('hurt', 120)) return;
    this.noise({ dur: 0.18, vol: 0.25, type: 'lowpass', f: 700 });
    this.tone({ type: 'sine', f: 120, f2: 50, dur: 0.2, vol: 0.35 });
  }

  explosion(size = 1, pos = null) {
    const s = this.spatial(pos, 160 * size, 9000);
    if (s.vol < 0.01) return;
    const v = clamp(s.vol * (0.5 + size * 0.35), 0, 1.1);
    const dur = 0.8 + size * 0.9;
    this.noise({ dur, vol: 0.9 * v, type: 'lowpass', f: 2600, f2: 90, q: 0.5, pan: s.pan, rev: 0.6, a: 0.005 });
    this.tone({ type: 'sine', f: 95, f2: 28, dur: dur * 0.9, vol: 1.0 * v, pan: s.pan });
    this.noise({ dur: dur * 1.6, vol: 0.35 * v, brown: true, type: 'lowpass', f: 220, pan: s.pan, a: 0.05 });
    for (let i = 0; i < 3 + size * 2; i++) this.noise({ dur: 0.06, vol: 0.18 * v, type: 'bandpass', f: rand(800, 3000), q: 2, delay: rand(0.05, dur * 0.7), pan: s.pan });
  }
  megaExplosion() {
    this.explosion(4);
    for (let i = 1; i < 7; i++) setTimeout(() => this.explosion(2 + Math.random() * 2), i * 380 + Math.random() * 200);
    this.noise({ dur: 9, vol: 0.9, brown: true, type: 'lowpass', f: 160, a: 0.2, rev: 0.5 });
    this.tone({ type: 'sine', f: 50, f2: 22, dur: 6, vol: 0.9 });
  }

  // ------------------------------------------------------------- melee & movement
  whoosh(vol = 0.18, f = 600) { this.noise({ dur: 0.22, vol, type: 'bandpass', f: f * 0.5, f2: f * 2.5, q: 1.2 }); }
  punch(heavy = false) {
    this.whoosh(0.1, 500);
    this.noise({ dur: 0.08, vol: heavy ? 0.5 : 0.32, type: 'lowpass', f: 1300, delay: 0.06 });
    this.tone({ type: 'sine', f: heavy ? 110 : 150, f2: 40, dur: heavy ? 0.22 : 0.13, vol: heavy ? 0.7 : 0.45, delay: 0.06 });
  }
  megaPunch() {
    this.noise({ dur: 0.5, vol: 0.7, type: 'lowpass', f: 3000, f2: 120, rev: 0.5 });
    this.tone({ type: 'sine', f: 90, f2: 25, dur: 0.6, vol: 0.9 });
    this.tone({ type: 'sawtooth', f: 200, f2: 50, dur: 0.3, vol: 0.2, filter: 'lowpass', ff: 900 });
  }
  swordSwing() {
    this.noise({ dur: 0.28, vol: 0.2, type: 'bandpass', f: 400, f2: 2600, q: 1.5 });
    this.tone({ type: 'sawtooth', f: 160, f2: 240, dur: 0.3, vol: 0.09, filter: 'bandpass', ff: 600, ff2: 1500, q: 3 });
  }
  swordHit() {
    this.noise({ dur: 0.25, vol: 0.3, type: 'highpass', f: 2500, rev: 0.2 });
    this.tone({ type: 'sine', f: 220, f2: 60, dur: 0.15, vol: 0.35 });
  }
  knife() { this.noise({ dur: 0.12, vol: 0.14, type: 'bandpass', f: 1200, f2: 3500, q: 2 }); }
  stab() { this.noise({ dur: 0.1, vol: 0.25, type: 'lowpass', f: 900, delay: 0.05 }); this.tone({ type: 'sine', f: 160, f2: 60, dur: 0.12, vol: 0.3, delay: 0.05 }); }
  footstep(surface = 'rock') {
    if (!this.throttle('step', 180)) return;
    const f = surface === 'metal' ? 2200 : surface === 'sand' ? 900 : 1300;
    this.noise({ dur: 0.07, vol: surface === 'metal' ? 0.08 : 0.06, type: 'bandpass', f: f * rand(0.85, 1.15), q: 1.2 });
    if (surface === 'metal') this.tone({ type: 'triangle', f: rand(300, 360), dur: 0.05, vol: 0.03 });
  }
  land(heavy = false) {
    this.noise({ dur: heavy ? 0.9 : 0.25, vol: heavy ? 0.6 : 0.2, type: 'lowpass', f: heavy ? 900 : 1200, f2: 80, rev: heavy ? 0.4 : 0 });
    this.tone({ type: 'sine', f: heavy ? 80 : 120, f2: 30, dur: heavy ? 0.7 : 0.2, vol: heavy ? 0.9 : 0.3 });
  }
  jump() { this.noise({ dur: 0.12, vol: 0.06, type: 'bandpass', f: 700 }); }

  // ------------------------------------------------------------- UI & misc
  ui(kind = 'click') {
    if (kind === 'hover') this.tone({ type: 'sine', f: 1800, dur: 0.03, vol: 0.025 });
    else if (kind === 'back') this.tone({ type: 'triangle', f: 700, f2: 400, dur: 0.08, vol: 0.06 });
    else { this.tone({ type: 'triangle', f: 1000, f2: 1500, dur: 0.06, vol: 0.07 }); }
  }
  pickup() { [72, 76, 79, 84].forEach((m, i) => this.tone({ type: 'triangle', f: mtof(m), dur: 0.25, vol: 0.09, delay: i * 0.07, rev: 0.3 })); }
  objective() { [67, 74, 79].forEach((m, i) => this.tone({ type: 'sine', f: mtof(m), dur: 0.5, vol: 0.1, delay: i * 0.09, rev: 0.5 })); }
  levelComplete() { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone({ type: 'triangle', f: mtof(m), dur: 0.9, vol: 0.09, delay: i * 0.1, rev: 0.6 })); }
  fail() { [64, 60, 55, 48].forEach((m, i) => this.tone({ type: 'sawtooth', f: mtof(m), dur: 0.7, vol: 0.07, delay: i * 0.22, filter: 'lowpass', ff: 900, rev: 0.6 })); }
  beep(f = 1800, vol = 0.08) { this.tone({ type: 'sine', f, dur: 0.08, vol }); }
  tick() { this.tone({ type: 'square', f: 1400, dur: 0.03, vol: 0.04 }); }
  heartbeat() { this.tone({ type: 'sine', f: 60, f2: 40, dur: 0.12, vol: 0.5 }); this.tone({ type: 'sine', f: 55, f2: 38, dur: 0.12, vol: 0.4, delay: 0.18 }); }
  denied() { this.tone({ type: 'square', f: 180, dur: 0.15, vol: 0.06, filter: 'lowpass', ff: 800 }); }
  bombPlant() {
    for (let i = 0; i < 4; i++) this.tone({ type: 'square', f: 900 + i * 200, dur: 0.05, vol: 0.06, delay: i * 0.12 });
    this.tone({ type: 'sine', f: 2000, dur: 0.4, vol: 0.12, delay: 0.55 });
  }
  smoke() { this.noise({ dur: 3.5, vol: 0.18, type: 'highpass', f: 1800, f2: 900, a: 0.05, rev: 0.2 }); this.tone({ type: 'sine', f: 300, f2: 200, dur: 0.1, vol: 0.1 }); }
  teleport() { this.tone({ type: 'sine', f: 200, f2: 2400, dur: 1.2, vol: 0.18, rev: 0.6 }); this.noise({ dur: 1.2, vol: 0.12, type: 'bandpass', f: 800, f2: 6000, q: 3, rev: 0.5 }); }
  warp() {
    this.tone({ type: 'sawtooth', f: 50, f2: 1400, dur: 3.0, vol: 0.18, filter: 'lowpass', ff: 300, ff2: 6000, rev: 0.4, curve: 'exp' });
    this.noise({ dur: 3.2, vol: 0.3, type: 'bandpass', f: 200, f2: 5000, q: 1, a: 0.6, rev: 0.4 });
    this.tone({ type: 'sine', f: 40, f2: 120, dur: 3.0, vol: 0.4 });
    this.explosion(1.5);
  }
  warpArrive() { this.noise({ dur: 1.4, vol: 0.4, type: 'lowpass', f: 5000, f2: 100, rev: 0.6 }); this.tone({ type: 'sine', f: 300, f2: 40, dur: 1.2, vol: 0.4 }); }
  thunder() {
    this.noise({ dur: 0.15, vol: 0.5, type: 'highpass', f: 2000 });
    this.noise({ dur: 4, vol: 0.6, brown: true, type: 'lowpass', f: 400, f2: 60, a: 0.05, rev: 0.6, delay: 0.1 });
  }
  bossAppear() {
    this.tone({ type: 'sine', f: 41, dur: 7, vol: 0.6, a: 1.5 });
    this.tone({ type: 'sine', f: 43.5, dur: 7, vol: 0.5, a: 1.5 });
    this.tone({ type: 'sawtooth', f: 55, f2: 52, dur: 7, vol: 0.12, a: 2, filter: 'lowpass', ff: 300, rev: 0.8 });
    this.noise({ dur: 4, vol: 0.4, type: 'bandpass', f: 100, f2: 3000, q: 1, a: 3.8, rev: 0.6 });
    [48, 49, 55, 58].forEach((m) => this.tone({ type: 'sawtooth', f: mtof(m), dur: 6, vol: 0.05, a: 3, filter: 'lowpass', ff: 700, rev: 0.9, delay: 3.6 }));
    this.tone({ type: 'sine', f: 70, f2: 25, dur: 3, vol: 1, delay: 3.9 });
    this.noise({ dur: 3, vol: 0.7, type: 'lowpass', f: 1800, f2: 60, delay: 3.9, rev: 0.8 });
  }
  alarmOnce() { this.tone({ type: 'square', f: 880, f2: 640, dur: 0.45, vol: 0.07, filter: 'lowpass', ff: 2200, curve: 'lin' }); }
  klaxon() { this.tone({ type: 'sawtooth', f: 420, f2: 300, dur: 0.6, vol: 0.09, filter: 'lowpass', ff: 1400, curve: 'lin' }); this.tone({ type: 'sawtooth', f: 423, f2: 302, dur: 0.6, vol: 0.06, filter: 'lowpass', ff: 1400, curve: 'lin' }); }

  // creature & alien voices (non-speech)
  growl(kind = 'brute', pos = null) {
    const s = this.spatial(pos, 60, 600); if (s.vol < 0.02) return;
    const v = s.vol, p = s.pan;
    if (kind === 'gorilla') {
      this.tone({ type: 'sawtooth', f: 85, f2: 60, dur: 1.2, vol: 0.4 * v, pan: p, filter: 'bandpass', ff: 420, q: 2, vib: 9, vibRate: 13, rev: 0.4 });
      this.noise({ dur: 1.1, vol: 0.35 * v, type: 'bandpass', f: 700, f2: 300, q: 1.5, pan: p, rev: 0.3 });
    } else if (kind === 'creature') {
      this.tone({ type: 'sawtooth', f: rand(900, 1300), f2: rand(400, 600), dur: 0.7, vol: 0.18 * v, pan: p, filter: 'bandpass', ff: 2400, q: 3, vib: 120, vibRate: 31, rev: 0.4 });
      this.noise({ dur: 0.5, vol: 0.12 * v, type: 'bandpass', f: 3500, q: 3, pan: p });
    } else if (kind === 'alien') {
      this.tone({ type: 'sawtooth', f: rand(180, 260), f2: rand(120, 160), dur: 0.5, vol: 0.18 * v, pan: p, filter: 'bandpass', ff: 900, q: 4, vib: 40, vibRate: 22 });
    } else if (kind === 'elite') {
      this.tone({ type: 'square', f: rand(140, 170), f2: 90, dur: 0.6, vol: 0.15 * v, pan: p, filter: 'bandpass', ff: 700, q: 3, vib: 30, vibRate: 18, rev: 0.3 });
    } else {
      this.tone({ type: 'sawtooth', f: rand(70, 90), f2: 55, dur: 0.9, vol: 0.32 * v, pan: p, filter: 'bandpass', ff: 380, q: 2.2, vib: 10, vibRate: 11, rev: 0.3 });
      this.noise({ dur: 0.7, vol: 0.12 * v, type: 'bandpass', f: 500, q: 2, pan: p });
    }
  }
  deathCry(kind = 'alien', pos = null) {
    const s = this.spatial(pos, 50, 500); if (s.vol < 0.02) return;
    if (!this.throttle('death', 90)) return;
    const base = kind === 'brute' ? 140 : kind === 'creature' ? 1000 : kind === 'gorilla' ? 120 : 420;
    this.tone({ type: 'sawtooth', f: base * rand(0.9, 1.2), f2: base * 0.35, dur: 0.75, vol: 0.2 * s.vol, pan: s.pan, filter: 'bandpass', ff: base * 3, q: 2, vib: base * 0.08, vibRate: 15, rev: 0.4 });
    this.noise({ dur: 0.4, vol: 0.1 * s.vol, type: 'bandpass', f: base * 4, q: 2, pan: s.pan });
  }
  scream(pos = null, female = Math.random() < 0.5) {
    const s = this.spatial(pos, 40, 400); if (s.vol < 0.03) return;
    const f = female ? rand(700, 1000) : rand(350, 520);
    this.tone({ type: 'sawtooth', f, f2: f * rand(1.15, 1.4), dur: rand(0.5, 0.9), vol: 0.1 * s.vol, pan: s.pan, filter: 'bandpass', ff: f * 2.4, q: 3, vib: f * 0.04, vibRate: 8, rev: 0.3, curve: 'lin' });
  }
  crowdPanic(duration = 6, pos = null) {
    this.noise({ dur: duration, vol: 0.18, type: 'bandpass', f: 900, q: 0.8, a: 0.3, rev: 0.4 });
    const n = Math.floor(duration * 5);
    for (let i = 0; i < n; i++) setTimeout(() => this.scream(pos), Math.random() * duration * 1000);
  }
  crowdCheer(duration = 6) {
    this.noise({ dur: duration, vol: 0.3, type: 'bandpass', f: 1100, q: 0.6, a: 0.6, rev: 0.5 });
    for (let i = 0; i < duration * 14; i++) this.noise({ dur: 0.03, vol: rand(0.05, 0.12), type: 'bandpass', f: rand(1500, 3000), q: 1, delay: Math.random() * duration });
    for (let i = 0; i < duration * 1.5; i++) this.tone({ type: 'sine', f: rand(1500, 2200), f2: rand(2400, 3200), dur: 0.5, vol: 0.05, delay: Math.random() * duration, curve: 'lin' });
    for (let i = 0; i < duration * 3; i++) setTimeout(() => this.scream(null, Math.random() < 0.5), Math.random() * duration * 1000);
  }

  // ------------------------------------------------------------- loops (return handle with set/stop)
  loop(kind) {
    if (!this.ready) return { set() {}, stop() {} };
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(this.sfx);
    const nodes = [];
    const osc = (type, f, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(); nodes.push(o); return o; };
    const noiseSrc = (dest, brown = false) => { const s = ctx.createBufferSource(); s.buffer = brown ? this.brownBuf : this.noiseBuf; s.loop = true; s.connect(dest); s.start(); nodes.push(s); return s; };
    const filt = (type, f, q = 1, dest = out) => { const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; fl.connect(dest); return fl; };
    let set = () => {};
    let base = 0.2;
    if (kind === 'engine') {
      const lp = filt('lowpass', 300, 1);
      const o1 = osc('sawtooth', 48, lp), o2 = osc('sawtooth', 48.7, lp);
      const nf = filt('bandpass', 600, 0.6); noiseSrc(nf);
      const ng = ctx.createGain(); ng.gain.value = 0.3; nf.disconnect(); nf.connect(ng); ng.connect(out);
      base = 0.12;
      set = (thr = 0.5, boost = 0) => {
        const tt = ctx.currentTime;
        lp.frequency.setTargetAtTime(250 + thr * 500 + boost * 900, tt, 0.1);
        o1.frequency.setTargetAtTime(42 + thr * 22 + boost * 25, tt, 0.15); o2.frequency.setTargetAtTime(42.6 + thr * 22 + boost * 25, tt, 0.15);
        nf.frequency.setTargetAtTime(500 + thr * 700 + boost * 2000, tt, 0.1);
        ng.gain.setTargetAtTime(0.15 + boost * 0.5, tt, 0.1);
        out.gain.setTargetAtTime(base * (0.6 + thr * 0.5 + boost * 0.4), tt, 0.1);
      };
    } else if (kind === 'laser' || kind === 'eyelaser') {
      const bp = filt('bandpass', kind === 'laser' ? 900 : 1600, 2);
      osc('sawtooth', kind === 'laser' ? 110 : 220, bp); osc('sawtooth', kind === 'laser' ? 111.5 : 223, bp);
      const hi = ctx.createGain(); hi.gain.value = 0.25; hi.connect(out); osc('sine', kind === 'laser' ? 1760 : 2400, hi);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 17; const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); nodes.push(lfo);
      base = 0.14;
    } else if (kind === 'alarm') {
      const lp = filt('lowpass', 2000, 1);
      const o = osc('square', 700, lp);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); nodes.push(lfo);
      base = 0.05;
      set = (rate = 2) => { lfo.frequency.setTargetAtTime(rate, ctx.currentTime, 0.05); };
    } else if (kind === 'beam' || kind === 'portal') {
      const lp = filt('lowpass', kind === 'beam' ? 1400 : 600, 1);
      osc('sine', kind === 'beam' ? 220 : 55, lp); osc('sine', kind === 'beam' ? 223.3 : 82.5, lp); osc('triangle', kind === 'beam' ? 440 : 110.7, lp);
      const trem = ctx.createGain(); trem.gain.value = 0.6; lp.disconnect(); lp.connect(trem); trem.connect(out);
      const lfo = ctx.createOscillator(); lfo.frequency.value = kind === 'beam' ? 6 : 0.7; const lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(trem.gain); lfo.start(); nodes.push(lfo);
      const hp = filt('bandpass', 5000, 3); noiseSrc(hp);
      base = kind === 'beam' ? 0.16 : 0.22;
    } else if (kind === 'jet') {
      const lp = filt('lowpass', 500, 0.8); noiseSrc(lp);
      const lp2 = filt('lowpass', 120, 1); osc('sawtooth', 60, lp2);
      base = 0.12;
      set = (lvl = 0.5) => { lp.frequency.setTargetAtTime(300 + lvl * 2500, ctx.currentTime, 0.08); out.gain.setTargetAtTime(base * (0.25 + lvl), ctx.currentTime, 0.08); };
    } else if (kind === 'wind') {
      const bp = filt('bandpass', 400, 0.5); noiseSrc(bp, true);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); nodes.push(lfo);
      base = 0.35;
    } else if (kind === 'rumble') {
      const lp = filt('lowpass', 140, 1); noiseSrc(lp, true); osc('sine', 38, lp);
      base = 0.5;
      set = (lvl = 1) => out.gain.setTargetAtTime(base * lvl, ctx.currentTime, 0.2);
    } else if (kind === 'heat') {
      const o = osc('sine', 1500, out);
      const am = ctx.createGain(); am.gain.value = 0; o.disconnect(); o.connect(am); am.connect(out);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); lfo.start(); nodes.push(lfo);
      base = 0.06;
      set = (rate = 2) => lfo.frequency.setTargetAtTime(rate, ctx.currentTime, 0.05);
    }
    out.gain.setTargetAtTime(base, t, 0.08);
    const handle = {
      set: (...a) => set(...a),
      stop: () => {
        if (handle.stopped) return; handle.stopped = true;
        const tt = ctx.currentTime;
        out.gain.setTargetAtTime(0.0001, tt, 0.08);
        setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) { /* ignore */ } } out.disconnect(); }, 400);
        this.loops.delete(handle);
      },
    };
    this.loops.add(handle);
    return handle;
  }
  stopAllLoops() { for (const h of [...this.loops]) h.stop(); }
}

// ----------------------------------------------------------------- music
const TRACKS = {
  title: { bpm: 68, root: 45, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [-9, -5, 0, 3], [-2, 2, 5, 9]], pad: 0.08, bass: 0.12, arp: 0.04, drums: 0, bells: 0.05, choir: 1 },
  space: { bpm: 80, root: 50, prog: [[0, 3, 7, 12], [-2, 2, 5, 10], [-4, 0, 3, 8], [-5, -1, 2, 7]], pad: 0.07, bass: 0.1, arp: 0.045, drums: 0.35, bells: 0.04 },
  combat: { bpm: 128, root: 40, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], pad: 0.05, bass: 0.16, arp: 0.05, drums: 1, stab: 0.05 },
  ground: { bpm: 96, root: 43, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], pad: 0.06, bass: 0.13, arp: 0.03, drums: 0.7 },
  stealth: { bpm: 84, root: 41, prog: [[0, 3, 7], [1, 4, 8]], pad: 0.05, bass: 0.1, arp: 0.0, drums: 0.25, pulse: 0.06 },
  tension: { bpm: 140, root: 45, prog: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-1, 3, 6]], pad: 0.05, bass: 0.15, arp: 0.06, drums: 0.9, pulse: 0.05 },
  blackhole: { bpm: 70, root: 36, prog: [[0, 1, 7], [0, 6, 13], [-1, 6, 11]], pad: 0.08, bass: 0.14, arp: 0.02, drums: 0.4, choir: 1 },
  boss: { bpm: 150, root: 36, prog: [[0, 1, 7], [0, 3, 6], [-2, 1, 5], [0, 1, 7]], pad: 0.06, bass: 0.2, arp: 0.05, drums: 1.2, stab: 0.07, choir: 1 },
  peace: { bpm: 76, root: 48, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 17]], pad: 0.07, bass: 0.09, arp: 0.05, drums: 0, bells: 0.06 },
  ending: { bpm: 88, root: 48, prog: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]], pad: 0.08, bass: 0.13, arp: 0.05, drums: 0.6, bells: 0.07, choir: 1 },
};

class Music {
  constructor(audio) {
    this.a = audio; this.ctx = audio.ctx;
    this.current = null; this.name = null;
    this.step = 0; this.nextTime = 0;
    this.timer = setInterval(() => this._schedule(), 30);
  }
  play(name) {
    if (this.name === name) return;
    const ctx = this.ctx;
    if (this.current) { const g = this.current.gain; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8); setTimeout(() => g.disconnect(), 4000); }
    this.name = name;
    if (!name || !TRACKS[name]) { this.current = null; return; }
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(this.a.musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.6; gain.connect(rs); rs.connect(this.a.musicRev);
    gain.gain.setTargetAtTime(1, ctx.currentTime + 0.1, 1.0);
    this.current = { def: TRACKS[name], gain };
    this.step = 0; this.nextTime = ctx.currentTime + 0.1;
  }
  stop() { this.play(null); }
  _schedule() {
    if (!this.current || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx; const def = this.current.def;
    const stepDur = 60 / def.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) { this._step(def, this.step, this.nextTime, stepDur); this.step++; this.nextTime += stepDur; }
  }
  _note(type, freq, t, dur, vol, { cutoff = 2000, attack = 0.01, release = null, detune = 0, dest = null, q = 0.7 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
    const g = ctx.createGain();
    const rel = release ?? dur * 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest || this.current.gain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _drum(kind, t, vol) {
    const ctx = this.ctx, dest = this.current.gain, a = this.a;
    if (kind === 'kick') {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
    } else {
      const s = ctx.createBufferSource(); s.buffer = a.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : kind === 'tom' ? 300 : 1800; f.Q.value = kind === 'tom' ? 3 : 0.8;
      const g = ctx.createGain(); const d = kind === 'hat' ? 0.05 : kind === 'tom' ? 0.3 : 0.18;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + d + 0.02);
      if (kind === 'snare') { const o = ctx.createOscillator(); const og = ctx.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.12); }
    }
  }
  _step(def, i, t, sd) {
    const bar = Math.floor(i / 16), s = i % 16;
    const chord = def.prog[Math.floor(bar / 2) % def.prog.length];
    const root = def.root;
    const barDur = sd * 16;
    // pads: once every 2 bars
    if (s === 0 && bar % 2 === 0 && def.pad) {
      for (const iv of chord) {
        const f = mtof(root + 12 + iv);
        this._note('sawtooth', f, t, barDur * 2, def.pad, { cutoff: 1100, attack: barDur * 0.45, release: barDur * 0.8, detune: -7 });
        this._note('sawtooth', f, t, barDur * 2, def.pad, { cutoff: 1100, attack: barDur * 0.45, release: barDur * 0.8, detune: 7 });
      }
      if (def.choir) for (const iv of chord.slice(0, 3)) this._note('triangle', mtof(root + 24 + iv), t, barDur * 2, def.pad * 0.7, { cutoff: 2400, attack: barDur * 0.7, release: barDur });
    }
    // bass
    if (def.bass) {
      const pat = def.drums >= 1 ? [0, 2, 3, 6, 8, 10, 11, 14] : [0, 8];
      if (pat.includes(s)) this._note('sawtooth', mtof(root + chord[0] - (def.drums >= 1 ? 0 : 0)), t, def.drums >= 1 ? sd * 1.6 : sd * 7, def.bass, { cutoff: def.drums >= 1 ? 420 : 300, attack: 0.008, q: 4 });
    }
    // arpeggio
    if (def.arp && s % 2 === 0) {
      const n = chord[(s / 2) % chord.length];
      const oct = (Math.floor(s / 8) % 2) * 12;
      this._note('triangle', mtof(root + 24 + n + oct), t, sd * 1.8, def.arp, { cutoff: 4000, attack: 0.005, dest: this.a.delay });
      this._note('triangle', mtof(root + 24 + n + oct), t, sd * 1.8, def.arp * 0.6, { cutoff: 4000, attack: 0.005 });
    }
    if (def.pulse && s % 1 === 0) this._note('square', mtof(root + 36 + chord[0]), t, sd * 0.5, def.pulse * (s % 4 === 0 ? 1 : 0.4), { cutoff: 1800, attack: 0.002 });
    if (def.bells && (s === 0 || s === 6 || s === 10) && Math.random() < 0.7) {
      const n = chord[Math.floor(Math.random() * chord.length)];
      this._note('sine', mtof(root + 36 + n), t, sd * 10, def.bells, { cutoff: 8000, attack: 0.003, release: sd * 9, dest: this.a.delay });
      this._note('sine', mtof(root + 36 + n), t, sd * 10, def.bells * 0.8, { cutoff: 8000, attack: 0.003, release: sd * 9 });
    }
    if (def.stab && (s === 0 || s === 3 || s === 6 || (s === 12 && bar % 2 === 1))) for (const iv of chord) this._note('square', mtof(root + 12 + iv), t, sd * 1.2, def.stab, { cutoff: 1600, attack: 0.004 });
    // drums
    const d = def.drums;
    if (d) {
      if (d >= 1) {
        if (s % 4 === 0) this._drum('kick', t, 0.55 * Math.min(d, 1.2));
        if (s === 4 || s === 12) this._drum('snare', t, 0.3);
        if (s % 2 === 1) this._drum('hat', t, 0.06);
        if (d > 1 && bar % 4 === 3 && s >= 12) this._drum('tom', t, 0.35);
      } else if (d >= 0.5) {
        if (s === 0 || s === 10) this._drum('kick', t, 0.45 * d);
        if (s === 8) this._drum('snare', t, 0.18 * d);
        if (s % 4 === 2) this._drum('hat', t, 0.04);
      } else {
        if (s === 0) this._drum('kick', t, 0.4 * d);
        if (s % 8 === 4) this._drum('hat', t, 0.03);
      }
    }
  }
}

export { mtof, pick };
