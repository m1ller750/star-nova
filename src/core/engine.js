import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { game } from './game.js';
import { damp, rand } from './util.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uAberr: { value: 0 },
    uVignette: { value: 0.55 },
    uDark: { value: 0 },
    uWarp: { value: 0 },
    uGrain: { value: 0.025 },
    uHeat: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uSat: { value: 1.08 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uDamage, uFlash, uAberr, uVignette, uDark, uWarp, uGrain, uHeat, uTintAmt, uSat;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      if (uHeat > 0.001) uv += vec2(sin(uv.y * 70.0 + uTime * 11.0), cos(uv.x * 60.0 + uTime * 9.0)) * 0.0022 * uHeat;
      vec3 col;
      if (uWarp > 0.001) {
        vec3 acc = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 12; i++) {
          float f = float(i) / 11.0;
          float sc = 1.0 - f * 0.42 * uWarp;
          float w = 1.0 - f * 0.6;
          vec2 suv = 0.5 + c * sc;
          acc.r += texture2D(tDiffuse, suv + c * 0.012 * uWarp).r * w;
          acc.g += texture2D(tDiffuse, suv).g * w;
          acc.b += texture2D(tDiffuse, suv - c * 0.012 * uWarp).b * w;
          tot += w;
        }
        col = acc / tot;
      } else {
        float ab = 0.0012 + uAberr * 0.014;
        col.r = texture2D(tDiffuse, uv + c * ab).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * ab).b;
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      float r = length(c * vec2(uAspect, 1.0));
      float vig = smoothstep(1.05, 0.28, r);
      col *= mix(1.0, vig, uVignette);
      float edge = smoothstep(0.25, 0.85, r);
      col = mix(col, vec3(0.45, 0.0, 0.02) + col * 0.35, clamp(uDamage, 0.0, 1.0) * edge);
      col += uHeat * vec3(0.35, 0.09, 0.0) * edge;
      col = mix(col, col * uTint, uTintAmt);
      col *= (1.0 - uDark);
      col += uFlashColor * uFlash;
      col += (hash(uv * 1024.0 + fract(uTime) * 37.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true, stencil: false });
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isWebGL2 ? 4 : 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    // kills NaN / Inf pixels before bloom so they cannot spread into black blocks
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); bool ok = (c.r < 6.0e4 && c.r > -1.0) && (c.g < 6.0e4 && c.g > -1.0) && (c.b < 6.0e4 && c.b > -1.0); gl_FragColor = ok ? vec4(min(c.rgb, vec3(800.0)), 1.0) : vec4(0.0, 0.0, 0.0, 1.0); }',
    }));
    // volumetric light shafts from the star / sun (screen-space radial scattering)
    this.rays = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 }, uDensity: { value: 0.85 }, uDecay: { value: 0.95 }, uWeight: { value: 0.02 }, uThreshold: { value: 1.6 }, uTint: { value: new THREE.Color(1, 0.92, 0.8) }, uAspect: { value: 1.7 }, uMaskR: { value: 0.16 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength, uDensity, uDecay, uWeight, uThreshold, uAspect, uMaskR; uniform vec3 uTint;
        varying vec2 vUv;
        void main(){
          vec3 base = texture2D(tDiffuse, vUv).rgb;
          if (uStrength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
          vec2 delta = (vUv - uSun) * uDensity / 36.0;
          vec2 uv = vUv; float illum = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 36; i++) {
            uv -= delta;
            vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
            float l = max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - uThreshold, 0.0);
            float m = 1.0 - smoothstep(uMaskR * 0.35, uMaskR, length((uv - uSun) * vec2(uAspect, 1.0)));
            acc += min(s * l, vec3(6.0)) * illum * m;
            illum *= uDecay;
          }
          gl_FragColor = vec4(base + acc * uWeight * uStrength * uTint, 1.0);
        }`,
    });
    this.composer.addPass(this.rays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms;

    this.shakeAmp = 0; this.shakeTime = 0; this.shakeFreq = 30;
    this.fx = { damage: 0, flash: 0, aberr: 0 };
    this.cameras = new Set();
    this.preRender = null; // optional hook(renderer, scene, camera) e.g. black hole lensing background pass
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  registerCamera(cam) { this.cameras.add(cam); cam.aspect = window.innerWidth / window.innerHeight; cam.updateProjectionMatrix(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
    if (this.rays) this.rays.uniforms.uAspect.value = w / h;
    for (const c of this.cameras) { c.aspect = w / h; c.updateProjectionMatrix(); }
  }

  setQuality(q) {
    this.pixelRatio = q === 'low' ? 0.75 : q === 'medium' ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  // world position of the light source (or null to switch the shafts off)
  setSunRays(worldPos, camera, strength = 1, color = null, threshold = 1.2) {
    const u = this.rays.uniforms;
    if (!worldPos || game.settings.quality === 'low') { u.uStrength.value = 0; return; }
    const v = worldPos.clone().project(camera);
    const behind = worldPos.clone().applyMatrix4(camera.matrixWorldInverse).z > 0;
    if (behind) { u.uStrength.value = 0; return; }
    u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    u.uStrength.value = strength * Math.max(0, Math.min(1, 1.6 - off));
    u.uThreshold.value = threshold;
    if (color) u.uTint.value.copy(color);
  }

  setBloom(strength, radius = 0.55, threshold = 0.82) {
    this.bloom.strength = strength; this.bloom.radius = radius; this.bloom.threshold = threshold;
  }

  shake(amount, duration = 0.4) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }
  damageFlash(a = 0.6) { this.fx.damage = Math.min(1, this.fx.damage + a); this.fx.aberr = Math.min(1, this.fx.aberr + a * 0.8); }
  flash(a = 1, color = 0xffffff) { this.fx.flash = Math.max(this.fx.flash, a); this.u.uFlashColor.value.set(color); }

  render(scene, camera, dt) {
    game.time += dt;
    const u = this.u;
    u.uTime.value = game.time;
    this.fx.damage = damp(this.fx.damage, 0, 2.2, dt);
    this.fx.flash = damp(this.fx.flash, 0, 3.0, dt);
    this.fx.aberr = damp(this.fx.aberr, 0, 3.0, dt);
    u.uDamage.value = this.fx.damage;
    u.uFlash.value = this.fx.flash;
    u.uAberr.value = this.fx.aberr;

    // camera shake (applied temporarily)
    let ox = 0, oy = 0, oz = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeTime * 3);
      ox = (Math.random() - 0.5) * a * 0.02; oy = (Math.random() - 0.5) * a * 0.02; oz = (Math.random() - 0.5) * a * 0.012;
      camera.rotateX(ox); camera.rotateY(oy); camera.rotateZ(oz);
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.preRender) this.preRender(this.renderer, scene, camera);
    this.composer.render(dt);
    if (ox || oy || oz) { camera.rotateZ(-oz); camera.rotateY(-oy); camera.rotateX(-ox); }
  }
}

export { rand };
