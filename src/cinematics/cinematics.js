// Story cinematics: painted 2D frames (canvas) with narration, plus the 3D zoom-out ending.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { RNG, clamp, sleep, Simplex } from '../core/util.js';
import { earthLandTexture } from '../data/earth-map.js';
import { SYSTEMS } from '../data/systems.js';
import { SpaceEnv } from '../gfx/space-env.js';
import { FX } from '../gfx/fx.js';
import { CAST } from '../core/voice.js';

let canvas, ctx, W, H, DPR, skipFlag = false, uiEl;

function setupCanvas() {
  canvas = document.getElementById('cine');
  DPR = Math.min(1.5, window.devicePixelRatio || 1);
  const resize = () => { W = canvas.width = Math.floor(window.innerWidth * DPR); H = canvas.height = Math.floor(window.innerHeight * DPR); };
  resize();
  window.addEventListener('resize', resize);
  ctx = canvas.getContext('2d');
  canvas.style.display = 'block';
  uiEl = document.getElementById('cine-ui');
  uiEl.classList.remove('hidden');
  uiEl.innerHTML = '<div class="cine-bar top"></div><div class="cine-bar bot"></div><div class="cine-year"></div><div class="cine-text"></div><div class="cine-big" style="opacity:0"><div class="a"></div><div class="b"></div></div><div class="cine-credits" style="opacity:0"></div><button class="btn small cine-skip">SKIP ▸▸<span class="key">SPACE</span></button>';
  skipFlag = false;
  uiEl.querySelector('.cine-skip').addEventListener('click', () => { skipFlag = true; });
  const key = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') skipFlag = true; };
  window.addEventListener('keydown', key);
  return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); canvas.style.display = 'none'; uiEl.classList.add('hidden'); uiEl.innerHTML = ''; };
}

const $ = (s) => uiEl.querySelector(s);
function setText(t) { const el = $('.cine-text'); el.style.opacity = 0; setTimeout(() => { el.textContent = t; el.style.opacity = t ? 1 : 0; }, 250); }
function setYear(t) { const el = $('.cine-year'); el.style.opacity = 0; setTimeout(() => { el.textContent = t; el.style.opacity = t ? 1 : 0; }, 300); }

// ------------------------------------------------------------------ painting helpers
function off(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function starsLayer(w, h, seed, n, bright = 1) {
  return off(w, h, (g) => {
    const r = new RNG(seed);
    for (let i = 0; i < n; i++) {
      const x = r.next() * w, y = r.next() * h, s = Math.pow(r.next(), 4) * 2.4 * DPR + 0.4;
      const hue = r.pick(['255,255,255', '200,220,255', '255,230,200', '255,200,180']);
      g.fillStyle = `rgba(${hue},${(0.3 + r.next() * 0.7) * bright})`;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      if (s > 2) { const gr = g.createRadialGradient(x, y, 0, x, y, s * 5); gr.addColorStop(0, `rgba(${hue},0.35)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - s * 5, y - s * 5, s * 10, s * 10); }
    }
  });
}
function nebulaLayer(w, h, seed, colors, n = 18, alpha = 0.18) {
  return off(w, h, (g) => {
    const r = new RNG(seed);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = r.next() * w, y = r.next() * h, rad = (0.15 + r.next() * 0.35) * Math.max(w, h);
      const c = r.pick(colors);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${c},${alpha})`); gr.addColorStop(0.5, `rgba(${c},${alpha * 0.35})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}
function glow(g, x, y, r, color, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(0.35, `rgba(${color},${a * 0.35})`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
// sphere with procedural texture from a sampler(lon, lat) -> [r,g,b]
function planetImage(size, sampler, light = [-0.6, -0.3, 0.75], atmo = null, nightLights = null) {
  return off(size, size, (g) => {
    const img = g.createImageData(size, size);
    const L = new THREE.Vector3(...light).normalize();
    const R = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x - R) / R, ny = (y - R) / R;
      const d2 = nx * nx + ny * ny; if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const lat = Math.asin(-ny), lon = Math.atan2(nx, nz);
      let [r, gg, b] = sampler(lon, lat);
      const ndl = nx * L.x + (-ny) * L.y + nz * L.z;
      let k = clamp(ndl * 1.1 + 0.08, 0, 1);
      const limb = Math.pow(nz, 0.35);
      k *= limb;
      let R2 = r * k, G2 = gg * k, B2 = b * k;
      if (nightLights && ndl < 0.05) { const nl = nightLights(lon, lat); if (nl > 0) { const s = clamp(-ndl * 4 + 0.2, 0, 1) * nl; R2 += 255 * s; G2 += 170 * s; B2 += 80 * s; } }
      if (atmo) { const f = Math.pow(1 - nz, 2.5) * clamp(ndl + 0.4, 0, 1); R2 += atmo[0] * f; G2 += atmo[1] * f; B2 += atmo[2] * f; }
      const i = (y * size + x) * 4;
      img.data[i] = clamp(R2, 0, 255); img.data[i + 1] = clamp(G2, 0, 255); img.data[i + 2] = clamp(B2, 0, 255); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
let landData = null;
function landAt(lon, lat) {
  if (!landData) {
    const tex = earthLandTexture(); const c = tex.image;
    landData = { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data };
  }
  const u = ((lon / (Math.PI * 2)) + 0.5) % 1, v = 0.5 - lat / Math.PI;
  const x = Math.floor(u * landData.w), y = Math.floor(clamp(v, 0, 0.999) * landData.h);
  return landData.d[(y * landData.w + x) * 4] / 255;
}
const _sn = new Simplex(2500);
const fbm3 = (x, y, z, o = 4) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * _sn.noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.1; } return s / n; };
function earthSampler(rot = 0) {
  return (lon, lat) => {
    const l = landAt(lon + rot, lat);
    const alat = Math.abs(lat);
    const x = Math.cos(lat) * Math.cos(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon + rot);
    const n = fbm3(x * 4, y * 4, z * 4, 4);
    let c;
    if (l > 0.5) {
      const dry = clamp((1 - Math.abs(alat - 0.4) * 4.5) + n * 0.8, 0, 1);
      const g = [38 + n * 25, 88 + n * 30, 40 + n * 12];
      const d = [176 + n * 30, 146 + n * 25, 98 + n * 20];
      c = g.map((v, i) => v + (d[i] - v) * dry);
      if (alat > 1.0) c = c.map((v) => v + (235 - v) * clamp((alat - 1.0) * 5 + n, 0, 1));
    } else {
      const deep = clamp(0.6 + n * 0.6, 0, 1);
      c = [8 + 12 * (1 - deep), 34 + 40 * (1 - deep), 92 + 50 * (1 - deep)];
    }
    if (alat > 1.22) c = [235, 240, 248];
    const cl = fbm3(x * 3 + 7, y * 6, z * 3, 5);
    const cloud = clamp((cl - 0.05) * 2.6, 0, 0.92);
    return c.map((v) => v + (245 - v) * cloud);
  };
}
// silhouette of a standing humanoid; pose: 0 neutral, 1 arms raised, 2 sitting (throne)
function figure(g, x, y, h, color, pose = 0, opts = {}) {
  g.save(); g.translate(x, y); g.scale(h / 100, h / 100);
  g.fillStyle = color;
  g.beginPath();
  if (pose === 2) {
    // seated emperor: wide shoulders, cape, crown
    g.moveTo(-34, 0); g.lineTo(-30, -36); g.lineTo(-40, -40); g.lineTo(-36, -62); g.lineTo(-26, -74); g.lineTo(-14, -78);
    g.lineTo(-9, -88); g.lineTo(-11, -100); g.lineTo(-6, -96); g.lineTo(-4, -106); g.lineTo(0, -98); g.lineTo(4, -106); g.lineTo(6, -96); g.lineTo(11, -100); g.lineTo(9, -88);
    g.lineTo(14, -78); g.lineTo(26, -74); g.lineTo(36, -62); g.lineTo(40, -40); g.lineTo(30, -36); g.lineTo(34, 0); g.closePath();
  } else {
    // head
    g.ellipse(0, -89, 6.2, 7.4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    // neck & shoulders
    g.moveTo(-3, -82); g.lineTo(3, -82);
    g.quadraticCurveTo(5, -79, 13, -77);
    if (pose === 1) {
      g.quadraticCurveTo(18, -76, 21, -86); g.lineTo(27, -110); g.quadraticCurveTo(30, -114, 32, -110); g.lineTo(25, -80); g.quadraticCurveTo(22, -70, 18, -66);
    } else {
      g.quadraticCurveTo(18, -75, 18, -68); g.lineTo(19, -48); g.quadraticCurveTo(19, -42, 15, -43); g.lineTo(13, -60);
    }
    // torso narrowing to the waist, hips, legs
    g.quadraticCurveTo(12, -50, 10, -46); g.quadraticCurveTo(12, -40, 11, -36);
    g.lineTo(10, -18); g.quadraticCurveTo(10, -4, 11, 0); g.lineTo(4, 0); g.lineTo(3, -18); g.lineTo(1, -32); g.lineTo(-1, -32); g.lineTo(-3, -18); g.lineTo(-4, 0); g.lineTo(-11, 0);
    g.quadraticCurveTo(-10, -4, -10, -18); g.lineTo(-11, -36); g.quadraticCurveTo(-12, -40, -10, -46); g.quadraticCurveTo(-12, -50, -13, -60);
    if (pose === 1) {
      g.quadraticCurveTo(-22, -70, -25, -80); g.lineTo(-32, -110); g.quadraticCurveTo(-30, -114, -27, -110); g.lineTo(-21, -86); g.quadraticCurveTo(-18, -76, -13, -77);
    } else {
      g.lineTo(-15, -43); g.quadraticCurveTo(-19, -42, -19, -48); g.lineTo(-18, -68); g.quadraticCurveTo(-18, -75, -13, -77);
    }
    g.quadraticCurveTo(-5, -79, -3, -82);
    g.closePath();
  }
  g.fill();
  if (opts.visor) { g.shadowColor = opts.visor; g.shadowBlur = 18; g.fillStyle = opts.visor; g.fillRect(-5, -90, 10, 2.4); g.shadowBlur = 0; }
  g.restore();
}
function shipSil(g, x, y, s, angle, color = '#05060a', glowC = '255,60,40') {
  g.save(); g.translate(x, y); g.rotate(angle); g.scale(s, s);
  glow(g, -26, 0, 14, glowC, 0.9);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(30, 0); g.lineTo(-12, -14); g.lineTo(-22, -26); g.lineTo(-20, -8); g.lineTo(-26, 0); g.lineTo(-20, 8); g.lineTo(-22, 26); g.lineTo(-12, 14); g.closePath(); g.fill();
  g.restore();
}

// ------------------------------------------------------------------ scenes (each returns {draw(t), dur})
function sceneGalaxy() {
  const bg = starsLayer(W, H, 3, 900);
  const gal = off(Math.min(W, H) * 1.3 | 0, Math.min(W, H) * 1.3 | 0, (g, w, h) => {
    const r = new RNG(9); const cx = w / 2, cy = h / 2;
    g.globalCompositeOperation = 'lighter';
    glow(g, cx, cy, w * 0.22, '255,220,170', 0.9);
    glow(g, cx, cy, w * 0.08, '255,250,230', 1);
    for (let i = 0; i < 9000; i++) {
      const arm = i % 2; const t = Math.pow(r.next(), 0.7) * 3.2;
      const ang = t * 1.9 + arm * Math.PI + r.range(-0.35, 0.35) / (0.4 + t * 0.3);
      const rad = (0.04 + t * 0.14) * w * 0.5 * (1 + r.range(-0.12, 0.12));
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.55;
      const col = t < 0.6 ? '255,225,190' : r.next() < 0.15 ? '255,150,200' : '170,200,255';
      g.fillStyle = `rgba(${col},${0.25 + r.next() * 0.5})`;
      const s = r.next() < 0.02 ? 2.2 : 0.9;
      g.fillRect(x, y, s * DPR, s * DPR);
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 160; i++) { const t = r.range(0.3, 3); const ang = t * 1.9 + (i % 2) * Math.PI + 0.25; const rad = (0.04 + t * 0.14) * w * 0.5; g.fillStyle = 'rgba(20,10,10,0.18)'; g.beginPath(); g.ellipse(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.55, 18 * DPR, 6 * DPR, ang, 0, Math.PI * 2); g.fill(); }
  });
  const neb = nebulaLayer(W, H, 4, ['60,80,200', '160,40,120', '40,120,160'], 10, 0.12);
  const r = new RNG(77); const invaders = [];
  for (let i = 0; i < 70; i++) { const t = Math.pow(r.next(), 0.8) * 3; const ang = t * 1.9 + (i % 2) * Math.PI + r.range(-0.3, 0.3); invaders.push({ t, ang, born: 2 + r.next() * 9 }); }
  return {
    dur: 12,
    draw(t) {
      ctx.fillStyle = '#010208'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(bg, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(neb, 0, 0); ctx.globalCompositeOperation = 'source-over';
      const s = 1 + t * 0.02;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.rotate(t * 0.01);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(gal, -gal.width / 2, -gal.height / 2);
      const w = gal.width;
      for (const v of invaders) {
        if (t < v.born) continue;
        const rad = (0.04 + v.t * 0.14) * w * 0.5;
        const x = Math.cos(v.ang) * rad, y = Math.sin(v.ang) * rad * 0.55;
        const k = Math.min(1, (t - v.born) * 0.8);
        glow(ctx, x, y, (6 + 10 * k + Math.sin(t * 4 + v.t * 9) * 2) * DPR, '255,40,30', 0.9 * k);
      }
      ctx.restore(); ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function sceneEmperor() {
  const r = new RNG(5);
  const embers = Array.from({ length: 90 }, () => ({ x: r.next(), y: r.next(), s: r.range(1, 3), v: r.range(0.01, 0.04) }));
  const outside = off(W, H, (g) => {
    g.fillStyle = '#0a0204'; g.fillRect(0, 0, W, H);
    g.drawImage(starsLayer(W, H, 12, 400), 0, 0);
    glow(g, W * 0.5, H * 0.42, H * 0.5, '255,40,30', 0.45);
    const p = planetImage(Math.floor(H * 0.55), (lon, lat) => { const n = Math.sin(lon * 5 + Math.sin(lat * 8) * 2) * 0.5 + 0.5; return [150 + n * 60, 30 + n * 20, 20]; }, [-0.2, 0.5, 0.8], [255, 80, 50]);
    g.drawImage(p, W * 0.5 - p.width / 2, H * 0.12);
  });
  return {
    dur: 11,
    draw(t) {
      ctx.drawImage(outside, 0, 0);
      // fleet passing outside
      for (let i = 0; i < 9; i++) { const x = ((t * 0.03 + i * 0.13) % 1.3 - 0.15) * W; shipSil(ctx, x, H * (0.18 + (i % 4) * 0.07), (0.7 + (i % 3) * 0.3) * DPR, 0.05); }
      // throne-room frame: arched window cut out of black walls
      ctx.save();
      ctx.fillStyle = '#020102';
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      const ww = W * 0.36, wx = W * 0.5 - ww / 2, wy = H * 0.08, wh = H * 0.62;
      ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + ww / 2); ctx.arc(W * 0.5, wy + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();
      // window mullions
      ctx.strokeStyle = '#020102'; ctx.lineWidth = 10 * DPR;
      ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.08); ctx.lineTo(W * 0.5, H * 0.7); ctx.moveTo(W * 0.32, H * 0.4); ctx.lineTo(W * 0.68, H * 0.4); ctx.stroke();
      // red light falling on the floor
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, H * 0.7, 0, H); gr.addColorStop(0, 'rgba(255,40,30,0.35)'); gr.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(W * 0.32, H * 0.7); ctx.lineTo(W * 0.68, H * 0.7); ctx.lineTo(W * 0.9, H); ctx.lineTo(W * 0.1, H); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // pillars
      for (const px of [0.12, 0.84]) { ctx.fillStyle = '#050304'; ctx.fillRect(W * px, 0, W * 0.05, H); ctx.fillStyle = 'rgba(255,40,30,0.18)'; ctx.fillRect(W * px + W * 0.045, 0, W * 0.004, H); }
      // throne + emperor silhouette (pure shadow with a faint red rim)
      const s = H * 0.0034 * (1 + t * 0.008);
      ctx.save(); ctx.translate(W * 0.5, H * 0.97);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(-60 * s, 0); ctx.lineTo(-52 * s, -150 * s); ctx.lineTo(-30 * s, -175 * s); ctx.lineTo(0, -190 * s); ctx.lineTo(30 * s, -175 * s); ctx.lineTo(52 * s, -150 * s); ctx.lineTo(60 * s, 0); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'rgba(255,30,20,0.8)'; ctx.shadowBlur = 25 * DPR;
      figure(ctx, 0, -10 * s, 120 * s, '#000', 2);
      ctx.shadowBlur = 0;
      // two cold eyes in the shadow
      const blink = Math.sin(t * 0.8) > -0.97 ? 1 : 0;
      glow(ctx, -4 * s, -107 * s, 5 * s, '255,30,20', 0.9 * blink); glow(ctx, 4 * s, -107 * s, 5 * s, '255,30,20', 0.9 * blink);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) { const y = ((e.y - t * e.v) % 1 + 1) % 1; glow(ctx, e.x * W, y * H, e.s * 3 * DPR, '255,90,40', 0.6); }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function sceneDrained() {
  const pSize = Math.floor(Math.min(W, H) * 0.8);
  const r = new RNG(21);
  const cracks = Array.from({ length: 18 }, () => ({ lon: r.range(-3, 3), lat: r.range(-1.2, 1.2) }));
  const pl = planetImage(pSize, (lon, lat) => {
    let n = Math.sin(lon * 4 + Math.sin(lat * 6) * 1.5) * Math.sin(lat * 5 + lon) * 0.5 + 0.5;
    let c = [110 + n * 40, 90 + n * 30, 70 + n * 20];
    for (const k of cracks) { const d = Math.hypot((lon - k.lon) * Math.cos(lat), lat - k.lat); if (d < 0.05) c = [255, 120 + (0.05 - d) * 2000, 40]; }
    return c;
  }, [-0.8, 0.4, 0.5], [180, 120, 90]);
  const bg = starsLayer(W, H, 33, 500);
  const neb = nebulaLayer(W, H, 31, ['120,60,40', '80,30,60'], 8, 0.12);
  const parts = Array.from({ length: 160 }, () => ({ a: r.range(-0.6, 0.6), r: r.range(0.42, 0.5), v: r.range(0.04, 0.12), o: r.next() }));
  return {
    dur: 11,
    draw(t) {
      ctx.fillStyle = '#020103'; ctx.fillRect(0, 0, W, H); ctx.drawImage(bg, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(neb, 0, 0); ctx.globalCompositeOperation = 'source-over';
      const cx = W * 0.5, cy = H * 0.95 + pSize * 0.2 - t * 4 * DPR;
      ctx.drawImage(pl, cx - pSize / 2, cy - pSize / 2);
      // mining beams pulling matter up to an orbital ring
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const bx = cx + (i - 2) * pSize * 0.14, by = cy - Math.sqrt(Math.max(0, 0.25 - Math.pow((i - 2) * 0.14, 2))) * pSize;
        const gr = ctx.createLinearGradient(bx, by, bx, H * 0.18); gr.addColorStop(0, 'rgba(255,140,60,0.8)'); gr.addColorStop(1, 'rgba(255,60,40,0.05)');
        ctx.fillStyle = gr; ctx.fillRect(bx - 5 * DPR, H * 0.18, 10 * DPR, by - H * 0.18);
        glow(ctx, bx, by, 30 * DPR, '255,140,60', 0.9);
      }
      for (const p of parts) { const k = (p.o + t * p.v) % 1; const x = cx + Math.sin(p.a) * pSize * p.r * (1 - k * 0.3); const y = cy - Math.cos(p.a) * pSize * p.r - k * H * 0.5; glow(ctx, x, y, 4 * DPR, '255,150,80', 0.6 * (1 - k)); }
      ctx.globalCompositeOperation = 'source-over';
      // orbital harvesting ring
      ctx.strokeStyle = '#08070a'; ctx.lineWidth = 18 * DPR;
      ctx.beginPath(); ctx.ellipse(cx, H * 0.18, W * 0.42, H * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,60,40,0.7)'; ctx.lineWidth = 2 * DPR; ctx.stroke();
      for (let i = 0; i < 6; i++) shipSil(ctx, ((t * 0.04 + i * 0.17) % 1.2 - 0.1) * W, H * (0.3 + (i % 3) * 0.08), 0.8 * DPR, 0.1);
    },
  };
}

function sceneEarthFleet() {
  const pSize = Math.floor(Math.min(W, H) * 0.78);
  const earth = planetImage(pSize, earthSampler(1.2), [-0.7, 0.35, 0.6], [80, 140, 255], (lon, lat) => (landAt(lon + 1.2, lat) > 0.5 && Math.sin(lon * 90) * Math.sin(lat * 80) > 0.6 ? 0.6 : 0));
  const bg = starsLayer(W, H, 44, 700);
  const neb = nebulaLayer(W, H, 41, ['40,80,200', '60,40,140'], 8, 0.1);
  const r = new RNG(8);
  const fleet = Array.from({ length: 46 }, () => ({ x: r.range(0.55, 1.4), y: r.range(0.05, 0.8), s: r.range(0.35, 1.3), sp: r.range(0.015, 0.03) }));
  return {
    dur: 9,
    draw(t) {
      ctx.fillStyle = '#01020a'; ctx.fillRect(0, 0, W, H); ctx.drawImage(bg, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(neb, 0, 0); ctx.globalCompositeOperation = 'source-over';
      const ex = W * 0.3, ey = H * 0.55;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, ex, ey, pSize * 0.62, '70,130,255', 0.35); ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(earth, ex - pSize / 2, ey - pSize / 2);
      // the ring colonizer approaching
      const rx = W * (0.95 - t * 0.012), ry = H * 0.3;
      ctx.lineWidth = 16 * DPR; ctx.strokeStyle = '#06050a';
      ctx.beginPath(); ctx.ellipse(rx, ry, H * 0.2, H * 0.07, -0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2 * DPR; ctx.strokeStyle = 'rgba(255,60,220,0.8)'; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, rx, ry, 30 * DPR, '255,90,230', 0.8); ctx.globalCompositeOperation = 'source-over';
      for (const f of fleet) shipSil(ctx, (f.x - t * f.sp) * W, f.y * H, f.s * DPR, Math.PI + 0.1);
    },
  };
}

function sceneLab() {
  const r = new RNG(3);
  const bubbles = Array.from({ length: 70 }, () => ({ x: r.range(-0.07, 0.07), o: r.next(), v: r.range(0.05, 0.15), s: r.range(1, 3.5) }));
  return {
    dur: 12,
    draw(t) {
      const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#010407'); gr.addColorStop(1, '#03121a');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // back wall panels
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#03090d' : '#040c11'; ctx.fillRect(i * W / 12, H * 0.05, W / 12 - 2, H * 0.62); ctx.fillStyle = 'rgba(78,242,255,0.12)'; ctx.fillRect(i * W / 12 + 6, H * 0.12, 2, H * 0.4); }
      // holo screens
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y] of [[0.12, 0.25], [0.78, 0.22], [0.86, 0.45], [0.06, 0.48]]) {
        ctx.fillStyle = 'rgba(78,242,255,0.10)'; ctx.fillRect(W * x, H * y, W * 0.12, H * 0.14);
        ctx.strokeStyle = 'rgba(78,242,255,0.5)'; ctx.strokeRect(W * x, H * y, W * 0.12, H * 0.14);
        ctx.beginPath(); for (let k = 0; k < 20; k++) { const xx = W * x + (k / 19) * W * 0.12; const yy = H * y + H * 0.07 + Math.sin(k * 0.8 + t * 3 + x * 10) * H * 0.04; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke();
      }
      // the tank
      const cx = W * 0.5, top = H * 0.12, bot = H * 0.82, tw = W * 0.11;
      glow(ctx, cx, H * 0.45, H * 0.5, '40,200,255', 0.35);
      const lg = ctx.createLinearGradient(cx - tw, 0, cx + tw, 0); lg.addColorStop(0, 'rgba(40,180,230,0.25)'); lg.addColorStop(0.5, 'rgba(120,240,255,0.45)'); lg.addColorStop(1, 'rgba(40,180,230,0.25)');
      ctx.fillStyle = lg; ctx.fillRect(cx - tw, top, tw * 2, bot - top);
      for (const b of bubbles) { const k = (b.o + t * b.v) % 1; glow(ctx, cx + b.x * W, bot - k * (bot - top), b.s * 2 * DPR, '200,250,255', 0.6); }
      ctx.globalCompositeOperation = 'source-over';
      // warrior silhouette inside
      ctx.shadowColor = 'rgba(78,242,255,0.9)'; ctx.shadowBlur = 30 * DPR;
      figure(ctx, cx, H * 0.78, H * 0.55 * (1 + Math.sin(t * 1.2) * 0.004), 'rgba(2,10,16,0.92)', 0, { visor: t > 6 ? '#4ef2ff' : null });
      ctx.shadowBlur = 0;
      // tank caps
      ctx.fillStyle = '#0a1418'; ctx.fillRect(cx - tw * 1.25, top - H * 0.05, tw * 2.5, H * 0.06); ctx.fillRect(cx - tw * 1.3, bot, tw * 2.6, H * 0.08);
      ctx.fillStyle = 'rgba(78,242,255,0.8)'; ctx.fillRect(cx - tw * 1.25, bot + 4, tw * 2.5, 2 * DPR);
      // scientists
      figure(ctx, W * 0.24, H * 0.95, H * 0.42, '#010304'); figure(ctx, W * 0.33, H * 0.97, H * 0.38, '#010304');
      figure(ctx, W * 0.72, H * 0.96, H * 0.44, '#010304'); figure(ctx, W * 0.8, H * 0.98, H * 0.36, '#010304');
      // floor reflection
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, H * 0.95, W * 0.3, '78,242,255', 0.12); ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function sceneNova() {
  const pSize = Math.floor(W * 1.6);
  const earth = planetImage(Math.min(900, Math.floor(pSize / 2)), earthSampler(2.4), [0.2, 0.7, 0.5], [90, 150, 255]);
  const bg = starsLayer(W, H, 55, 600);
  return {
    dur: 10,
    draw(t) {
      ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H); ctx.drawImage(bg, 0, 0);
      // Earth's limb at the bottom with sunrise
      const ew = pSize, ex = W * 0.5 - ew / 2, ey = H * 0.72;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, W * 0.5, ey + ew * 0.02, ew * 0.55, '80,140,255', 0.35); glow(ctx, W * 0.72, ey + H * 0.02, H * 0.35, '255,220,170', 0.6 + Math.sin(t * 0.5) * 0.05); ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(earth, ex, ey, ew, ew);
      // god rays
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) { const a = -2.2 + i * 0.12 + Math.sin(t * 0.3 + i) * 0.01; ctx.fillStyle = 'rgba(255,230,190,0.035)'; ctx.beginPath(); ctx.moveTo(W * 0.72, ey); ctx.lineTo(W * 0.72 + Math.cos(a) * W, ey + Math.sin(a) * W); ctx.lineTo(W * 0.72 + Math.cos(a + 0.05) * W, ey + Math.sin(a + 0.05) * W); ctx.closePath(); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      // NOVA — armored suit portrait
      const s = H * 0.0066 * (1 + t * 0.01);
      ctx.save(); ctx.translate(W * 0.5, H * 0.96); ctx.scale(s, s);
      drawNovaPortrait(ctx, t);
      ctx.restore();
    },
  };
}

// detailed front view of Nova's exo-suit (shared by the intro and the ending)
function drawNovaPortrait(g, t) {
  const plate = g.createLinearGradient(30, -125, -25, 0); plate.addColorStop(0, '#f5f9fd'); plate.addColorStop(0.45, '#aeb9c6'); plate.addColorStop(1, '#3a4452');
  const plate2 = g.createLinearGradient(-30, -125, 30, 0); plate2.addColorStop(0, '#dfe7f0'); plate2.addColorStop(1, '#4a5564');
  const suit = g.createLinearGradient(0, -120, 0, 0); suit.addColorStop(0, '#1d2530'); suit.addColorStop(1, '#0c1016');
  const shape = (pts, fill) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]); else g.lineTo(p[0], p[1]); } g.closePath(); g.fillStyle = fill; g.fill(); };
  g.save(); g.shadowColor = 'rgba(78,242,255,0.75)'; g.shadowBlur = 30;
  shape([[-9, -104], [9, -104], [30, -97], [34, -60], [31, -44], [23, -44], [16, -46], [14, -36], [15, -4], [17, 0], [3, 0], [2, -30], [-2, -30], [-3, 0], [-17, 0], [-15, -4], [-14, -36], [-16, -46], [-23, -44], [-31, -44], [-34, -60], [-30, -97]], suit);
  g.restore();
  for (const s of [-1, 1]) {
    shape([[s * 4, -46], [s * 14, -46], [s * 15, -36, s * 13, -27], [s * 5, -27], [s * 3, -38, s * 4, -46]], plate);
    g.fillStyle = '#2a323d'; g.beginPath(); g.ellipse(s * 9, -25, 4.5, 3.5, 0, 0, Math.PI * 2); g.fill();
    shape([[s * 5, -22], [s * 14, -22], [s * 13, -8], [s * 6, -8]], plate2);
    shape([[s * 4, -7], [s * 15, -7], [s * 17, -1, s * 17, 0], [s * 3, 0]], '#1a2028');
  }
  shape([[-15, -50], [15, -50], [16, -44], [-16, -44]], '#2a323d');
  g.fillStyle = '#d8b46a'; g.fillRect(-15, -48, 30, 1.6);
  for (let i = 0; i < 3; i++) shape([[-8, -63 + i * 5], [8, -63 + i * 5], [7, -59 + i * 5], [-7, -59 + i * 5]], '#2c3540');
  shape([[-1, -93], [-22, -97], [-25, -84, -20, -72], [-3, -66]], plate);
  shape([[1, -93], [22, -97], [25, -84, 20, -72], [3, -66]], plate);
  shape([[-12, -100], [12, -100], [9, -95], [-9, -95]], '#2a323d');
  for (const s of [-1, 1]) {
    shape([[s * 24, -86], [s * 33, -86], [s * 33, -66], [s * 25, -66]], suit);
    shape([[s * 23, -66], [s * 34, -66], [s * 33, -50], [s * 24, -50]], plate);
    shape([[s * 24, -50], [s * 33, -50], [s * 32, -43], [s * 25, -43]], '#1a2028');
    g.save(); g.translate(s * 27, -95); g.rotate(s * 0.25);
    shape([[-12, 4], [-11, -6, 0, -8], [11, -6, 12, 4], [0, 6]], plate);
    shape([[-10, 6], [0, 9], [10, 6], [9, 11], [-9, 11]], plate2);
    g.restore();
  }
  shape([[-10, -104], [-12, -118, 0, -128], [12, -118, 10, -104], [0, -100]], plate);
  shape([[-8, -116], [8, -116], [7, -106], [0, -102], [-7, -106]], '#05080d');
  shape([[-1.2, -128], [1.2, -128], [0.8, -118], [-0.8, -118]], '#2a323d');
  g.save(); g.shadowColor = '#4ef2ff'; g.shadowBlur = 14; g.strokeStyle = '#9ff8ff'; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-7, -113); g.lineTo(0, -108); g.lineTo(7, -113); g.stroke();
  g.lineWidth = 0.9; g.beginPath();
  for (const s of [-1, 1]) { g.moveTo(s * 28.5, -63); g.lineTo(s * 28.5, -53); g.moveTo(s * 9.5, -21); g.lineTo(s * 9.5, -10); g.moveTo(s * 9, -44); g.lineTo(s * 10, -30); g.moveTo(s * 18, -93); g.lineTo(s * 6, -90); }
  g.stroke();
  g.fillStyle = '#9ff8ff'; g.beginPath(); g.arc(0, -80, 3 + Math.sin(t * 3) * 0.35, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ------------------------------------------------------------------ ending painted scenes
function sceneNews() {
  const r = new RNG(14);
  const bursts = Array.from({ length: 14 }, () => ({ x: r.range(0.1, 0.9), y: r.range(0.15, 0.85), t0: r.range(0, 8) }));
  const planet = planetImage(Math.floor(H * 0.42), (lon, lat) => { const n = Math.sin(lon * 6) * Math.sin(lat * 7) * 0.5 + 0.5; return [60 + n * 60, 30 + n * 20, 50 + n * 40]; }, [-0.5, 0.4, 0.7], [255, 80, 120]);
  return {
    dur: 14,
    draw(t) {
      const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#04122a'); gr.addColorStop(1, '#010612');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // big holo wall with the liberated worlds and exploding bases
      const sx = W * 0.42, sy = H * 0.1, sw = W * 0.52, sh = H * 0.52;
      ctx.fillStyle = 'rgba(30,90,160,0.25)'; ctx.fillRect(sx, sy, sw, sh);
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      ctx.drawImage(planet, sx + sw * 0.5 - planet.width / 2, sy + sh * 0.5 - planet.height / 2);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bursts) { const k = ((t - b.t0) % 3) / 3; if (t < b.t0) continue; glow(ctx, sx + b.x * sw, sy + b.y * sh, (10 + k * 60) * DPR, '255,150,60', (1 - k) * 0.9); }
      ctx.restore(); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(120,200,255,0.6)'; ctx.lineWidth = 2 * DPR; ctx.strokeRect(sx, sy, sw, sh);
      // studio desk + anchor silhouette
      figure(ctx, W * 0.23, H * 0.86, H * 0.55, '#020814');
      ctx.fillStyle = '#06142a'; ctx.fillRect(W * 0.05, H * 0.66, W * 0.38, H * 0.22);
      ctx.fillStyle = 'rgba(78,242,255,0.7)'; ctx.fillRect(W * 0.05, H * 0.66, W * 0.38, 3 * DPR);
      // GNN logo
      ctx.font = `900 ${Math.floor(40 * DPR)}px Orbitron, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText('GNN', W * 0.05, H * 0.14);
      ctx.font = `600 ${Math.floor(15 * DPR)}px Rajdhani, sans-serif`; ctx.fillStyle = '#7dd3ff'; ctx.fillText('GLOBAL NEWS NETWORK · LIVE · 14 MAY 2500', W * 0.05, H * 0.18);
      // breaking news lower third
      const by = H * 0.73;
      ctx.fillStyle = '#c81030'; ctx.fillRect(0, by, W * 0.3, H * 0.07);
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.floor(24 * DPR)}px Orbitron, sans-serif`; ctx.fillText('BREAKING', W * 0.03, by + H * 0.05);
      ctx.fillStyle = 'rgba(4,10,20,0.92)'; ctx.fillRect(W * 0.3, by, W * 0.7, H * 0.07);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.floor(24 * DPR)}px Rajdhani, sans-serif`; ctx.fillText('THE KLIN\'TAR INVASION IS OVER', W * 0.32, by + H * 0.048);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, by + H * 0.07, W, H * 0.04);
      ctx.fillStyle = '#000'; ctx.font = `700 ${Math.floor(16 * DPR)}px Rajdhani, sans-serif`;
      const tick = 'ALL CAPTURED WORLDS LIBERATED  ·  KLIN\'TAR FLEETS DESTROYED  ·  NOVA RETURNS TO EARTH  ·  CELEBRATIONS IN EVERY CITY  ·  ';
      const off2 = (t * 120 * DPR) % (ctx.measureText(tick).width);
      ctx.fillText(tick + tick + tick, -off2, by + H * 0.1);
    },
  };
}

function sceneCelebration() {
  const r = new RNG(99);
  const city = off(W, H, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0a0420'); gr.addColorStop(0.55, '#2a0a3a'); gr.addColorStop(1, '#3a1040');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.drawImage(starsLayer(W, H * 0.5, 61, 200, 0.6), 0, 0);
    for (let layer = 0; layer < 3; layer++) {
      const base = H * (0.62 + layer * 0.08);
      for (let i = 0; i < 26 - layer * 4; i++) {
        const bw = r.range(0.03, 0.08) * W, bh = r.range(0.25, 0.6 - layer * 0.12) * H;
        const x = r.next() * W;
        g.fillStyle = ['#120a24', '#0c061a', '#06030e'][layer]; g.fillRect(x, base - bh, bw, bh + H);
        for (let k = 0; k < bh / (8 * DPR); k++) for (let c = 0; c < bw / (7 * DPR); c++) if (r.next() < 0.22) { g.fillStyle = r.pick(['rgba(255,80,200,0.7)', 'rgba(80,220,255,0.7)', 'rgba(255,210,120,0.6)']); g.fillRect(x + c * 7 * DPR + 2, base - bh + k * 8 * DPR + 3, 3 * DPR, 3 * DPR); }
        if (r.next() < 0.3) { g.fillStyle = r.pick(['#ff2bd6', '#4ef2ff', '#ffd23f']); g.shadowColor = g.fillStyle; g.shadowBlur = 20; g.fillRect(x + bw * 0.1, base - bh * r.range(0.4, 0.9), bw * 0.8, 6 * DPR); g.shadowBlur = 0; }
      }
    }
  });
  const conf = Array.from({ length: 220 }, () => ({ x: r.next(), y: r.next(), v: r.range(0.03, 0.09), c: r.pick(['#ff2bd6', '#4ef2ff', '#ffd23f', '#5dff9b', '#ffffff']), s: r.range(2, 5), w: r.range(1, 4) }));
  const cars = Array.from({ length: 16 }, () => ({ y: r.range(0.12, 0.5), v: r.range(0.05, 0.15) * (r.next() < 0.5 ? 1 : -1), o: r.next(), c: r.pick(['255,80,200', '80,220,255', '255,220,140']) }));
  const crowd = Array.from({ length: 70 }, (_, i) => ({ x: (i + r.next()) / 70, h: r.range(0.16, 0.24), ph: r.next() * 6, arms: r.next() < 0.7 }));
  return {
    dur: 16,
    draw(t) {
      ctx.drawImage(city, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // searchlights
      for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + Math.sin(t * 0.4 + i * 1.7) * 0.5; const x0 = W * (0.15 + i * 0.23); ctx.fillStyle = 'rgba(160,220,255,0.06)'; ctx.beginPath(); ctx.moveTo(x0, H); ctx.lineTo(x0 + Math.cos(a - 0.05) * H * 1.4, H + Math.sin(a - 0.05) * H * 1.4); ctx.lineTo(x0 + Math.cos(a + 0.05) * H * 1.4, H + Math.sin(a + 0.05) * H * 1.4); ctx.closePath(); ctx.fill(); }
      for (const c of cars) { const x = ((c.o + t * c.v) % 1 + 1) % 1 * W; ctx.fillStyle = `rgba(${c.c},0.9)`; ctx.fillRect(x, c.y * H, 26 * DPR * Math.sign(c.v), 2 * DPR); glow(ctx, x, c.y * H, 10 * DPR, c.c, 0.6); }
      ctx.globalCompositeOperation = 'source-over';
      // giant holo billboard
      ctx.save(); ctx.globalAlpha = 0.85 + Math.sin(t * 7) * 0.05;
      ctx.font = `900 ${Math.floor(46 * DPR)}px Orbitron, sans-serif`; ctx.textAlign = 'center';
      ctx.shadowColor = '#4ef2ff'; ctx.shadowBlur = 30; ctx.fillStyle = '#bff8ff'; ctx.fillText('THANK YOU, NOVA', W * 0.5, H * 0.2);
      ctx.font = `700 ${Math.floor(18 * DPR)}px Rajdhani, sans-serif`; ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.fillText('EARTH · YEAR 2500 · VICTORY DAY', W * 0.5, H * 0.25);
      ctx.restore();
      // stage with Nova
      ctx.fillStyle = '#05040a'; ctx.fillRect(W * 0.38, H * 0.78, W * 0.24, H * 0.06);
      ctx.fillStyle = 'rgba(78,242,255,0.8)'; ctx.fillRect(W * 0.38, H * 0.78, W * 0.24, 2 * DPR);
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, W * 0.5, H * 0.66, H * 0.25, '78,242,255', 0.25); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(W * 0.5, H * 0.78); ctx.scale(H * 0.0021, H * 0.0021); drawNovaPortrait(ctx, t); ctx.restore();
      // cheering crowd
      for (const c of crowd) { const jump = Math.max(0, Math.sin(t * 5 + c.ph)) * 6 * DPR; figure(ctx, c.x * W, H + 10 * DPR - jump, H * c.h, '#020108', c.arms && Math.sin(t * 3 + c.ph) > -0.3 ? 1 : 0); }
      // confetti
      for (const c of conf) { const y = ((c.y + t * c.v) % 1) * H; const x = c.x * W + Math.sin(t * 2 + c.y * 20) * 20 * DPR; ctx.fillStyle = c.c; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + c.x * 10); ctx.fillRect(-c.s, -c.w / 2, c.s * 2 * DPR / 1.5, c.w * DPR / 1.5); ctx.restore(); }
    },
  };
}

// ------------------------------------------------------------------ runner
async function runScene(scene, lines, opts = {}) {
  let t = 0, last = performance.now(), running = true;
  const loop = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const s = 1 + t * (opts.zoom ?? 0.012);
    ctx.save(); ctx.setTransform(s, 0, 0, s, -(s - 1) * W * (opts.ox ?? 0.5), -(s - 1) * H * (opts.oy ?? 0.5));
    scene.draw(t);
    ctx.restore();
    // fade in/out
    const fadeIn = clamp(1 - t / 1.0, 0, 1);
    if (fadeIn > 0) { ctx.fillStyle = `rgba(0,0,0,${fadeIn})`; ctx.fillRect(0, 0, W, H); }
    if (opts.fadeOut && opts.fadeOut.v > 0) { ctx.fillStyle = `rgba(0,0,0,${opts.fadeOut.v})`; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const t0 = performance.now();
  for (const l of lines) {
    if (skipFlag) break;
    if (typeof l === 'function') { await l(); continue; }
    const [who, text, extra] = l;
    if (who === 'TEXT') { setText(text); continue; }
    if (who === 'YEAR') { setYear(text); continue; }
    if (who === 'WAIT') { await waitSkippable(text * 1000); continue; }
    setText(who === 'NARRATOR' ? text : `${(CAST[who] || CAST.NARRATOR).label}:  ${text}`);
    await Promise.race([game.voice.say(who, text, { subtitle: false, extraWait: 0.4, minTime: (extra && extra.min) || 0 }), waitSkip()]);
  }
  const elapsed = (performance.now() - t0) / 1000;
  if (!skipFlag && elapsed < (opts.minDur || 0)) await waitSkippable((opts.minDur - elapsed) * 1000);
  // fade to black
  const fo = { v: 0 }; opts.fadeOut = fo;
  for (let i = 0; i <= 12; i++) { fo.v = i / 12; await sleep(35); }
  running = false;
  setText(''); game.ui.clearSubtitle();
}
function waitSkip() { return new Promise((r) => { const iv = setInterval(() => { if (skipFlag) { clearInterval(iv); game.voice.stop(); r(); } }, 50); }); }
async function waitSkippable(ms) { const t0 = performance.now(); while (performance.now() - t0 < ms && !skipFlag) await sleep(50); }

export async function playIntro() {
  const cleanup = setupCanvas();
  game.ui.fadeTo(0, 0.3);
  game.audio.setMusic('title');
  try {
    await runScene(sceneGalaxy(), [['YEAR', 'YEAR 2300'], ['NARRATOR', 'In the year 2300, the Klin\'Tar Empire launched its assault on the civilizations of the Milky Way.'], ['WAIT', 1]], { minDur: 8 });
    if (!skipFlag) await runScene(sceneEmperor(), [['YEAR', ''], ['NARRATOR', 'Under the shadow of their Emperor, they conquered every world that harbored life.'], ['WAIT', 1.5]], { minDur: 8, oy: 0.4 });
    if (!skipFlag) await runScene(sceneDrained(), [['NARRATOR', 'For two hundred years, civilizations were colonized, and their planets were drained to the bone to feed the Empire.'], ['WAIT', 1]], { minDur: 8 });
    if (!skipFlag) await runScene(sceneEarthFleet(), [['YEAR', 'YEAR 2500'], ['NARRATOR', 'And then, the Empire reached Earth.'], ['WAIT', 2]], { minDur: 6, ox: 0.3 });
    if (!skipFlag) await runScene(sceneLab(), [['YEAR', ''], ['NARRATOR', 'But humanity had seen the storm coming. In secret, they created a living weapon: an artificial warrior, built to stand against the Klin\'Tar.'], ['WAIT', 1]], { minDur: 9 });
    if (!skipFlag) await runScene(sceneNova(), [
      ['NARRATOR', 'His name is Nova.'],
      () => { const b = $('.cine-big'); b.querySelector('.a').textContent = 'STAR NOVA'; b.querySelector('.b').textContent = 'THE KLIN\'TAR INVASION'; b.style.opacity = 1; game.audio.levelComplete(); },
      ['WAIT', 4],
    ], { minDur: 7, oy: 0.9, zoom: 0.02 });
  } finally {
    game.voice.stop();
    cleanup();
  }
}

// dev helper: paint one frame of a scene into the cinematic canvas (used for visual checks)
export function debugPaint(name, t = 3) {
  const cleanup = setupCanvas();
  const make = { galaxy: sceneGalaxy, emperor: sceneEmperor, drained: sceneDrained, earth: sceneEarthFleet, lab: sceneLab, nova: sceneNova, news: sceneNews, party: sceneCelebration }[name];
  const s = make();
  s.draw(t);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  cleanup();
  return url;
}

// 3D zoom-out from Earth with the closing titles
async function earthZoomOut() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2e6);
  game.engine.registerCamera(camera);
  const fx = new FX(scene, { scale: 10, lights: 1 });
  const env = new SpaceEnv(scene, SYSTEMS.sol, fx);
  const earth = env.bodyByName('EARTH');
  const sunDir = earth.pos.clone().negate().normalize();
  const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  let t = 0, running = true;
  game.engine.setBloom(1.0, 0.6, 0.8);
  const flow = game.flow;
  flow.cineUpdate = (dt) => {
    if (!running) return;
    t += dt;
    const k = Math.min(1, t / 26);
    const e = 1 - Math.pow(1 - k, 2.2);
    const dist = earth.radius * (1.3 + e * 40);
    const pos = earth.pos.clone().addScaledVector(sunDir, dist * 0.8).addScaledVector(side, dist * 0.5).add(new THREE.Vector3(0, dist * 0.18, 0));
    camera.position.copy(pos);
    camera.lookAt(earth.pos.clone().addScaledVector(side, -earth.radius * 0.3 * (1 - e)));
    env.update(dt, camera); fx.update(dt, camera);
    game.engine.render(scene, camera, dt);
  };
  game.ui.fadeTo(0, 2);
  await waitSkippable(5000);
  const big = $('.cine-big'); big.querySelector('.a').textContent = 'EARTH IS SAFE'; big.querySelector('.b').textContent = ''; big.style.opacity = 1;
  await waitSkippable(4000);
  big.querySelector('.b').textContent = 'MISSION COMPLETED';
  game.audio.levelComplete();
  await waitSkippable(5000);
  const cr = $('.cine-credits');
  cr.innerHTML = 'STAR NOVA — THE KLIN\'TAR INVASION<br>Every star system in this game is real · Data: NASA Exoplanet Archive · NASA Planetary Fact Sheet · NASA Chandra<br>Thank you for playing';
  cr.style.opacity = 1;
  await waitSkippable(9000);
  await game.ui.fadeTo(1, 2.5);
  running = false; flow.cineUpdate = null;
  env.dispose(); fx.dispose();
}

// Nova teleports home: Earth from orbit, the hero floating in the foreground
async function earthArrival() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 2e6);
  game.engine.registerCamera(camera);
  const fx = new FX(scene, { scale: 10, lights: 1 });
  const env = new SpaceEnv(scene, SYSTEMS.sol, fx);
  const earth = env.bodyByName('EARTH');
  const { buildHero, animateRig } = await import('../gfx/models-chars.js');
  const hero = buildHero({ pods: true });
  scene.add(hero.root);
  const sunDir = earth.pos.clone().negate().normalize();
  const side = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const camBase = earth.pos.clone().addScaledVector(sunDir, earth.radius * 2.3).addScaledVector(side, earth.radius * 1.0).add(new THREE.Vector3(0, earth.radius * 0.35, 0));
  const st = { grounded: false, fly: 1, flyFwd: 0, move: 0, boost: 0, weapon: 'fists', guard: false };
  let t = 0, running = true;
  game.engine.setBloom(1.0, 0.6, 0.8);
  const flow = game.flow;
  flow.cineUpdate = (dt) => {
    if (!running) return;
    t += dt;
    const camPos = camBase.clone().addScaledVector(sunDir, t * 0.6);
    camera.position.copy(camPos);
    camera.lookAt(earth.pos.clone().addScaledVector(side, earth.radius * 0.35));
    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    hero.root.position.copy(camPos).addScaledVector(fwd, 4.2).addScaledVector(right, -1.1).addScaledVector(up, -1.6 + Math.sin(t * 0.8) * 0.06);
    hero.root.lookAt(hero.root.position.clone().addScaledVector(fwd, 10));
    animateRig(hero, st, dt);
    env.update(dt, camera); fx.update(dt, camera);
    game.engine.render(scene, camera, dt);
  };
  game.audio.teleport();
  game.ui.flashWhite(1.5, '#dff8ff');
  game.ui.fadeTo(0, 1.2);
  await game.voice.dialogue([['WAIT', 1.5], ['NOVA', 'Home.'], ['HALE', 'Nova...? Is that you? Welcome back. Welcome home.'], ['WAIT', 2]]);
  await game.ui.fadeTo(1, 2);
  running = false; flow.cineUpdate = null;
  env.dispose(); fx.dispose();
}

export async function playEnding() {
  game.audio.setMusic('peace');
  await earthArrival();
  const cleanup = setupCanvas();
  game.ui.fadeTo(0, 0.5);
  game.audio.setMusic('ending');
  try {
    await runScene(sceneNews(), [
      ['ANCHOR', 'Breaking news. The Klin\'Tar invasion is over.'],
      ['ANCHOR', 'Their fleets are destroyed, their bases have fallen, and every captured world is free.'],
      ['ANCHOR', 'Earth Defense Command confirms the victory belongs to one hero: Nova.'],
      ['WAIT', 1],
    ], { minDur: 10 });
    if (!skipFlag) await runScene(sceneCelebration(), [
      () => game.audio.crowdCheer(14),
      ['CITIZEN', 'Nova! Nova! Nova!'],
      ['CHILD', 'Thank you, Nova!'],
      ['HALE', 'Welcome home, Nova. Earth is safe, because of you.'],
      ['NOVA', 'It was never about me. It was about all of them.'],
      ['WAIT', 2],
    ], { minDur: 13, oy: 0.7 });
    skipFlag = false;
    canvas.style.display = 'none';
    $('.cine-text').textContent = '';
    await earthZoomOut();
  } finally {
    game.voice.stop();
    cleanup();
    game.audio.setMusic('title');
  }
}
