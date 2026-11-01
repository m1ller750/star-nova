// GLSL materials: planets, stars, sky, nebulae, black hole, shields, beams, portals, fireballs.
import * as THREE from 'three';

export const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm4(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm6(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float ridged4(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ float n = 1.0 - abs(snoise(p)); s += a * n * n; p = p * 2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; } return s; }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }
// crater field: returns (depth shading, rim)
vec2 craters(vec3 p){
  vec3 ip = floor(p); vec3 fp = fract(p);
  float bowl = 0.0; float rim = 0.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec3 b = vec3(float(i), float(j), float(k));
    vec3 h = hash33(ip + b);
    if (h.z > 0.55) continue;
    vec3 r = b + h - fp;
    float d = length(r);
    float rad = 0.25 + h.x * 0.3;
    float x = d / rad;
    bowl = max(bowl, (1.0 - smoothstep(0.0, 0.85, x)) * (0.6 + h.y * 0.4));
    rim = max(rim, smoothstep(0.75, 0.95, x) * (1.0 - smoothstep(0.95, 1.25, x)));
  }
  return vec2(bowl, rim);
}
`;

const LOGV_PARS = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGV = '#include <logdepthbuf_vertex>\n';
const LOGF_PARS = '#include <logdepthbuf_pars_fragment>\n';
const LOGF = '#include <logdepthbuf_fragment>\n';

const WORLD_VS = LOGV_PARS + /* glsl */`
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUv;
void main(){
  vObj = position; vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
` + LOGV + '}';

// ------------------------------------------------------------------ planet
export function planetMaterial(look, seed, landTex = null) {
  const c = (h, d) => new THREE.Color(h !== undefined && h !== null ? h : d);
  return new THREE.ShaderMaterial({
    extensions: { derivatives: true },
    uniforms: {
      uType: { value: look.type },
      uC1: { value: c(look.c1, 0x888888) }, uC2: { value: c(look.c2, 0x444444) }, uC3: { value: c(look.c3, 0xcccccc) },
      uAtmo: { value: c(look.atmo, 0x000000) }, uAtmoK: { value: look.atmo ? (look.atmoK || 1) : 0 },
      uSeed: { value: seed % 100 }, uTime: { value: 0 }, uCaps: { value: look.caps || 0 }, uStorm: { value: look.storm || 0 }, uLand: { value: look.land || 0 },
      uSunPos: { value: new THREE.Vector3() }, uLandTex: { value: landTex }, uHasLand: { value: landTex ? 1 : 0 }, uDim: { value: 1 }, uRadius: { value: 400 },
    },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform int uType; uniform vec3 uC1, uC2, uC3, uAtmo, uSunPos; uniform float uAtmoK, uSeed, uTime, uCaps, uStorm, uLand, uHasLand, uDim, uRadius;
      vec3 bumpN(vec3 N, vec3 pos, float h){ vec3 dpdx = dFdx(pos), dpdy = dFdy(pos); float dhx = dFdx(h), dhy = dFdy(h); vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx); float det = dot(dpdx, r1); vec3 grad = sign(det) * (dhx * r1 + dhy * r2); return normalize(abs(det) * N - grad); }
      uniform sampler2D uLandTex;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 p = normalize(vObj);
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(uSunPos - vPosW);
        vec3 V = normalize(cameraPosition - vPosW);
        float ndl = dot(N, L);
        vec3 sd = vec3(uSeed * 1.37, uSeed * 0.71, uSeed * 2.13);
        vec3 albedo = uC1; vec3 emis = vec3(0.0); float spec = 0.0; float specPow = 40.0; float hb = 0.0; float bk = 0.0;
        if (uType == 0) { // rocky / desert
          float h = fbm6(p * 2.4 + sd);
          float d = fbm4(p * 9.0 + sd * 1.3);
          albedo = mix(uC2, uC1, smoothstep(-0.35, 0.35, h));
          albedo = mix(albedo, uC3, smoothstep(0.2, 0.65, d) * 0.55);
          float r = 1.0 - abs(snoise(p * 3.2 + sd * 2.0));
          albedo *= mix(1.0, 0.6, smoothstep(0.94, 0.995, r));
          vec2 cr = craters(p * 9.0 + sd);
          albedo *= 1.0 - cr.x * 0.18; albedo += cr.y * 0.05;
          if (uCaps > 0.0) albedo = mix(albedo, vec3(0.93, 0.92, 0.95), smoothstep(0.83, 0.9, abs(p.y) + d * 0.06));
          hb = h * 0.7 + d * 0.25 - cr.x * 0.6 + cr.y * 0.25 - smoothstep(0.94, 0.995, r) * 0.5; bk = 1.0;
        } else if (uType == 1) { // cratered
          float h = fbm4(p * 3.0 + sd);
          albedo = mix(uC2, uC1, smoothstep(-0.4, 0.4, h));
          vec2 c1 = craters(p * 6.0 + sd); vec2 c2 = craters(p * 17.0 + sd * 2.0); vec2 c3 = craters(p * 40.0 + sd * 3.0);
          albedo *= 1.0 - c1.x * 0.35 - c2.x * 0.25 - c3.x * 0.15;
          albedo += (c1.y * 0.18 + c2.y * 0.1 + c3.y * 0.05) * uC3;
          float maria = smoothstep(0.1, 0.35, fbm4(p * 1.5 + sd * 3.0));
          albedo = mix(albedo, albedo * 0.62, maria);
          hb = h * 0.4 - c1.x * 0.8 - c2.x * 0.45 - c3.x * 0.2 + (c1.y + c2.y) * 0.3 - maria * 0.2; bk = 1.2;
        } else if (uType == 2) { // thick clouds (venus-like)
          vec3 q = vec3(fbm4(p * 2.0 + sd), fbm4(p * 2.0 + sd + 5.2), fbm4(p * 2.0 + sd + 1.7));
          float v = fbm6(p * vec3(2.5, 5.0, 2.5) + q * 1.6 + vec3(uTime * 0.004, 0.0, 0.0));
          albedo = mix(uC2, uC1, smoothstep(-0.4, 0.3, v));
          albedo = mix(albedo, uC3, smoothstep(0.15, 0.55, v) * 0.6);
        } else if (uType == 3 || uType == 10) { // gas giant
          float warp = fbm4(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + sd + vec3(uTime * 0.006, 0.0, 0.0));
          float b1 = sin(p.y * 17.0 + warp * 3.2) * 0.5 + 0.5;
          float b2 = sin(p.y * 43.0 + warp * 5.0 + 1.3) * 0.5 + 0.5;
          float turb = fbm4(p * vec3(6.0, 22.0, 6.0) + sd + warp);
          albedo = mix(uC2, uC1, b1);
          albedo = mix(albedo, uC3, b2 * 0.45 + turb * 0.15);
          if (uStorm > 0.5) {
            vec3 sp = normalize(vec3(0.82, -0.33, 0.47));
            float dd = distance(p, sp);
            float sw = snoise(p * 18.0 + vec3(dd * 30.0));
            albedo = mix(albedo, mix(vec3(0.78, 0.36, 0.22), vec3(0.95, 0.6, 0.45), sw * 0.5 + 0.5), (1.0 - smoothstep(0.07, 0.15, dd)) * 0.9);
          }
          if (uType == 10) { // young self-luminous super-jupiter
            float heat = pow(1.0 - b1, 3.0) * (0.6 + turb);
            emis = uC3 * heat * 0.9 + uC1 * 0.12;
          }
          spec = 0.05;
        } else if (uType == 4) { // ice giant
          float w = fbm4(vec3(p.x * 1.5, p.y * 6.0, p.z * 1.5) + sd + vec3(uTime * 0.004, 0.0, 0.0));
          float b = sin(p.y * 9.0 + w * 2.0) * 0.5 + 0.5;
          albedo = mix(uC2, uC1, b * 0.7 + 0.3);
          albedo = mix(albedo, uC3, smoothstep(0.2, 0.6, w) * 0.35);
          if (uStorm > 1.5) { float dd = distance(p, normalize(vec3(0.7, -0.35, 0.6))); albedo = mix(albedo, uC2 * 0.35, (1.0 - smoothstep(0.05, 0.11, dd)) * 0.9); }
          spec = 0.08;
        } else if (uType == 5) { // earth
          float lon = atan(p.z, p.x); float lat = asin(clamp(p.y, -1.0, 1.0));
          vec2 uv = vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5);
          float mask = texture2D(uLandTex, uv).r;
          float n = fbm6(p * 6.0 + sd);
          float land = smoothstep(0.47, 0.53, mask + n * 0.16);
          float alat = abs(p.y);
          vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.02, 0.16, 0.32), smoothstep(0.2, 0.55, mask + n * 0.2));
          float dry = smoothstep(0.15, 0.4, fbm4(p * 4.0 + sd * 2.0) + (1.0 - abs(alat - 0.38) * 3.0) * 0.35);
          vec3 green = mix(vec3(0.05, 0.16, 0.04), vec3(0.16, 0.22, 0.08), fbm4(p * 12.0) * 0.5 + 0.5);
          vec3 desert = vec3(0.55, 0.42, 0.26);
          vec3 lc = mix(green, desert, dry * smoothstep(0.08, 0.5, alat) * (1.0 - smoothstep(0.55, 0.7, alat)));
          lc = mix(lc, vec3(0.32, 0.3, 0.26), smoothstep(0.55, 0.75, alat));
          albedo = mix(ocean, lc, land);
          float ice = smoothstep(0.86, 0.92, alat + n * 0.05);
          albedo = mix(albedo, vec3(0.9, 0.93, 0.97), ice);
          spec = (1.0 - land) * (1.0 - ice) * 0.9; specPow = 60.0;
          float region = smoothstep(0.05, 0.45, fbm4(p * 11.0 + sd));
          float dots = smoothstep(0.7, 0.97, snoise(p * 260.0) * 0.5 + 0.5) + smoothstep(0.85, 0.99, snoise(p * 75.0) * 0.5 + 0.5) * 0.6;
          float city = region * dots * land * (1.0 - ice) * (1.0 - smoothstep(0.7, 0.8, alat));
          emis = vec3(1.0, 0.6, 0.22) * city * 1.1 * (1.0 - smoothstep(-0.25, 0.05, ndl));
        } else if (uType == 6) { // lava world
          float h = fbm4(p * 3.0 + sd);
          albedo = mix(uC1, uC3, smoothstep(-0.2, 0.5, h) * 0.5);
          float cr = 1.0 - abs(snoise(p * 7.0 + sd)); float cr2 = 1.0 - abs(snoise(p * 19.0 + sd * 2.0));
          float glow = smoothstep(0.9, 0.99, cr) + smoothstep(0.93, 0.995, cr2) * 0.6 + smoothstep(0.35, 0.6, -h) * 0.8;
          emis = uC2 * glow * 2.4;
          hb = h * 0.6 - glow * 0.35; bk = 0.9;
          albedo *= 1.0 - glow * 0.5;
        } else if (uType == 7) { // ocean world
          float n = fbm6(p * 3.0 + sd);
          float land = uLand > 0.0 ? smoothstep(0.12, 0.2, n) : smoothstep(0.38, 0.45, n);
          vec3 ocean = mix(uC1 * 0.45, uC1, smoothstep(-0.3, 0.3, n));
          vec3 lc = mix(uC2, uC2 * 1.4 + vec3(0.1, 0.05, 0.0), fbm4(p * 10.0 + sd) * 0.5 + 0.5);
          albedo = mix(ocean, lc, land);
          float cl = smoothstep(0.1, 0.5, fbm4(p * vec3(3.0, 6.0, 3.0) + sd * 2.0 + vec3(uTime * 0.003, 0.0, 0.0)));
          albedo = mix(albedo, uC3, cl * 0.75);
          spec = (1.0 - land) * (1.0 - cl) * 0.8;
          if (uLand > 0.0) {
            float city = smoothstep(0.75, 0.95, snoise(p * 70.0) * 0.5 + 0.5) * land;
            emis = vec3(1.0, 0.55, 0.85) * city * 1.2 * (1.0 - smoothstep(-0.25, 0.05, ndl));
          }
        } else if (uType == 8) { // ice world with lineae
          float n = fbm4(p * 3.0 + sd);
          albedo = mix(uC2, uC1, smoothstep(-0.5, 0.4, n));
          float ln = 1.0 - abs(snoise(p * 5.0 + sd)); float ln2 = 1.0 - abs(snoise(p * 13.0 + sd * 1.7));
          albedo = mix(albedo, uC2 * 0.6, smoothstep(0.95, 0.995, ln) * 0.8 + smoothstep(0.96, 0.995, ln2) * 0.5);
          albedo = mix(albedo, uC3, smoothstep(0.3, 0.7, fbm4(p * 8.0)) * 0.3);
          spec = 0.25; specPow = 30.0;
          hb = n * 0.35 - smoothstep(0.95, 0.995, ln) * 0.4; bk = 0.6;
        } else if (uType == 9) { // jungle homeworld
          float n = fbm6(p * 2.6 + sd);
          float land = smoothstep(0.0, 0.08, n);
          vec3 lc = mix(uC1, uC2, smoothstep(0.0, 0.5, fbm4(p * 8.0 + sd)));
          vec3 oc = mix(uC3 * 0.4, uC3, smoothstep(-0.4, 0.0, n));
          albedo = mix(oc, lc, land);
          float cl = smoothstep(0.15, 0.55, fbm4(p * vec3(3.0, 5.0, 3.0) + sd * 3.0 + vec3(uTime * 0.003, 0.0, 0.0)));
          albedo = mix(albedo, vec3(0.92), cl * 0.7);
          spec = (1.0 - land) * (1.0 - cl) * 0.7;
          float bio = smoothstep(0.7, 0.95, snoise(p * 50.0) * 0.5 + 0.5) * land;
          emis = vec3(0.3, 1.0, 0.7) * bio * 0.8 * (1.0 - smoothstep(-0.2, 0.05, ndl));
        }
        if (bk > 0.0) { float fade = 1.0 - smoothstep(uRadius * 3.0, uRadius * 14.0, distance(cameraPosition, vPosW)); if (fade > 0.0) { N = bumpN(N, vPosW, hb * uRadius * 0.014 * bk * fade); ndl = dot(N, L); } }
        float diff = smoothstep(-0.12, 0.65, ndl);
        vec3 col = albedo * (diff * 1.2 + 0.022) * uDim + albedo * vec3(0.15, 0.22, 0.4) * 0.03 * (1.0 - diff);
        vec3 H = normalize(L + V);
        col += spec * pow(max(dot(N, H), 0.0), specPow) * vec3(1.0, 0.92, 0.8) * step(0.0, ndl) * 1.4;
        col += emis;
        if (uAtmoK > 0.0) {
          float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
          col += uAtmo * fres * uAtmoK * smoothstep(-0.35, 0.55, ndl) * 1.25;
          col = mix(col, col + uAtmo * 0.06 * uAtmoK, diff);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function cloudMaterial(seed = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uSunPos: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSeed: { value: seed } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uSunPos; uniform float uTime, uSeed;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 p = normalize(vObj);
        vec3 q = vec3(fbm4(p * 3.0 + uSeed), fbm4(p * 3.0 + uSeed + 4.3), 0.0);
        float c = fbm6(p * vec3(4.0, 7.0, 4.0) + q * 0.9 + vec3(uTime * 0.01, 0.0, 0.0));
        float a = smoothstep(0.02, 0.45, c) * 0.85;
        vec3 N = normalize(vNormalW); vec3 L = normalize(uSunPos - vPosW);
        float diff = smoothstep(-0.1, 0.6, dot(N, L));
        gl_FragColor = vec4(vec3(1.0) * (diff * 1.5 + 0.01), a * (0.25 + diff * 0.75));
      }`,
    transparent: true, depthWrite: false,
  });
}

export function atmosphereMaterial(color, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSunPos: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uK: { value: strength }, uThick: { value: 0.45 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + /* glsl */`
      uniform vec3 uColor, uSunPos, uCenter; uniform float uK, uThick;
      varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 N = normalize(vNormalW); vec3 V = normalize(cameraPosition - vPosW);
        float t = clamp(-dot(N, V) / uThick, 0.0, 1.0);
        float glow = pow(t, 2.2);
        vec3 L = normalize(uSunPos - uCenter);
        float sun = smoothstep(-0.45, 0.7, dot(normalize(vPosW - uCenter), L));
        gl_FragColor = vec4(uColor * glow * uK * (0.08 + sun * 1.1), 1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function ringMaterial(color, inner, outer, faint = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uInner: { value: inner }, uOuter: { value: outer }, uSunPos: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 1 }, uFaint: { value: faint ? 1 : 0 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uColor, uSunPos, uCenter; uniform float uInner, uOuter, uR, uFaint;
      varying vec3 vObj; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        float r = length(vObj.xy);
        float t = (r - uInner) / (uOuter - uInner);
        if (t < 0.0 || t > 1.0) discard;
        float bands = 0.55 + 0.45 * sin(t * 90.0 + snoise(vec3(t * 30.0, 0.0, 1.0)) * 3.0);
        float gap = 1.0 - smoothstep(0.0, 0.02, abs(t - 0.62)) * 0.85;
        float a = bands * gap * smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.92, 1.0, t)) * (uFaint > 0.5 ? 0.25 : 0.8);
        // planet shadow on the ring
        vec3 L = normalize(uSunPos - uCenter);
        vec3 rel = vPosW - uCenter;
        float along = dot(rel, -L);
        float perp = length(rel + L * along);
        float shadow = (along > 0.0 && perp < uR) ? 0.15 : 1.0;
        vec3 c = uColor * (0.9 + 0.3 * bands) * shadow;
        gl_FragColor = vec4(c * 1.2, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ stars
export function starMaterial(color, intensity = 3.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uI: { value: intensity } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uColor; uniform float uTime, uI;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 p = normalize(vObj);
        float n = fbm4(p * 5.0 + vec3(uTime * 0.03, 0.0, uTime * 0.02));
        float g = snoise(p * 40.0 + vec3(0.0, uTime * 0.15, 0.0)) * 0.5 + 0.5;
        float spots = smoothstep(0.55, 0.7, fbm4(p * 3.0 + vec3(uTime * 0.01))) * 0.5;
        vec3 N = normalize(vNormalW); vec3 V = normalize(cameraPosition - vPosW);
        float mu = max(dot(N, V), 0.0);
        vec3 c = uColor * (1.2 + n * 0.55 + g * 0.35 - spots);
        c *= 0.45 + 0.55 * pow(mu, 0.45);
        c = mix(c, vec3(1.0, 0.95, 0.85) * dot(uColor, vec3(0.33)), 0.15);
        gl_FragColor = vec4(c * uI, 1.0);
      }`,
  });
}

// camera-facing billboard (shared vertex shader). size via uniform uSize (world units)
const BILL_VS = LOGV_PARS + /* glsl */`
uniform float uSize; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
` + LOGV + '}';

export function coronaMaterial(color, size, intensity = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uTime: { value: 0 }, uI: { value: intensity } },
    vertexShader: BILL_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uColor; uniform float uTime, uI; varying vec2 vUv;
      void main(){
        ` + LOGF + /* glsl */`
        vec2 c = vUv - 0.5; float r = length(c) * 2.0;
        float ang = atan(c.y, c.x);
        float rays = snoise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 0.08)) * 0.5 + 0.5;
        rays = pow(rays, 3.0);
        float core = exp(-r * 8.5) * 1.5;
        float halo = exp(-r * 4.0) * 0.22;
        float streak = exp(-r * 2.6) * rays * 0.22;
        float a = (core + halo + streak) * (1.0 - smoothstep(0.85, 1.0, r));
        gl_FragColor = vec4(uColor * a * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ------------------------------------------------------------------ sky
export function skyMaterial(sky) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBand: { value: new THREE.Color(sky.band) }, uCore: { value: new THREE.Color(sky.core) },
      uNeb1: { value: new THREE.Color(sky.neb1) }, uNeb2: { value: new THREE.Color(sky.neb2) },
      uSeed: { value: sky.seed || 1 }, uGalN: { value: new THREE.Vector3(0.25, 0.92, 0.3).normalize() }, uCoreDir: { value: new THREE.Vector3(0.8, -0.1, -0.6).normalize() },
      uDark: { value: 0 }, uRed: { value: 0 },
    },
    vertexShader: LOGV_PARS + /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp;
      ` + LOGV + '}',
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uBand, uCore, uNeb1, uNeb2, uGalN, uCoreDir; uniform float uSeed, uDark, uRed;
      varying vec3 vDir;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 d = normalize(vDir);
        float lat = dot(d, uGalN);
        float band = exp(-pow(lat / 0.2, 2.0));
        float wide = exp(-pow(lat / 0.45, 2.0));
        vec3 sp = d * 3.0 + uSeed;
        float n = fbm4(sp);
        float n2 = fbm4(d * 8.0 + uSeed * 2.0);
        vec3 col = uBand * band * (0.3 + 0.55 * smoothstep(-0.3, 0.6, n)) * 0.22;
        col += uBand * wide * 0.035;
        float core = pow(max(dot(d, uCoreDir), 0.0), 5.0);
        col += uCore * core * (band * 0.75 + wide * 0.15);
        float dust = smoothstep(0.0, 0.45, n2) * smoothstep(0.32, 0.0, abs(lat)) ;
        col *= 1.0 - dust * 0.75;
        float neb = smoothstep(0.1, 0.75, fbm4(d * 1.4 + uSeed * 3.0));
        float neb2 = smoothstep(0.2, 0.85, fbm4(d * 2.2 - uSeed));
        col += uNeb1 * neb * 0.05 + uNeb2 * neb2 * 0.035;
        float fine = fbm3(d * 22.0 + uSeed) * 0.5 + 0.5;
        col += uBand * band * fine * fine * 0.05;
        col = mix(col, col * vec3(1.4, 0.25, 0.25) + vec3(0.02, 0.0, 0.0), uRed);
        col *= (1.0 - uDark);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
}

export function starfieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uDark: { value: 0 } },
    vertexShader: LOGV_PARS + /* glsl */`
      attribute float aSize; attribute vec3 aColor; attribute float aPhase;
      uniform float uTime, uScale; varying vec3 vColor; varying float vTw;
      void main(){
        vColor = aColor;
        vTw = 0.75 + 0.25 * sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 30.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale;
      ` + LOGV + '}',
    fragmentShader: LOGF_PARS + /* glsl */`
      uniform float uDark; varying vec3 vColor; varying float vTw;
      void main(){
        ` + LOGF + /* glsl */`
        vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
        float a = exp(-r * r * 5.0) + exp(-r * 18.0) * 0.6;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a * vTw * (1.0 - uDark), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function nebulaMaterial(color1, color2, size, seed = 1, opacity = 0.32) {
  return new THREE.ShaderMaterial({
    uniforms: { uC1: { value: new THREE.Color(color1) }, uC2: { value: new THREE.Color(color2) }, uSize: { value: size }, uSeed: { value: seed }, uTime: { value: 0 }, uOpacity: { value: opacity }, uFadeNear: { value: size * 0.35 } },
    vertexShader: LOGV_PARS + /* glsl */`
      uniform float uSize; varying vec2 vUv; varying float vDist;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vDist = -mv.z;
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      ` + LOGV + '}',
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uC1, uC2; uniform float uSeed, uTime, uOpacity, uFadeNear; varying vec2 vUv; varying float vDist;
      void main(){
        ` + LOGF + /* glsl */`
        vec2 c = vUv - 0.5; float r = length(c) * 2.0;
        vec3 p = vec3(c * 2.6, uSeed) + vec3(0.0, 0.0, uTime * 0.01);
        float n = fbm4(p + fbm3(p * 1.7) * 0.8);
        float n2 = fbm4(p * 2.3 + 7.0);
        float a = smoothstep(-0.25, 0.55, n) * (1.0 - smoothstep(0.35, 1.0, r));
        a *= smoothstep(uFadeNear * 0.3, uFadeNear, vDist);
        vec3 col = mix(uC1, uC2, smoothstep(-0.3, 0.5, n2));
        col += vec3(1.0) * pow(max(n, 0.0), 3.0) * 0.4;
        gl_FragColor = vec4(col * a * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ------------------------------------------------------------------ black hole
export function accretionMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uCamDir: { value: new THREE.Vector3(0, 0, 1) } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform float uTime, uInner, uOuter; uniform vec3 uCamDir;
      varying vec3 vObj; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        float r = length(vObj.xy);
        float t = (r - uInner) / (uOuter - uInner);
        if (t < 0.0 || t > 1.0) discard;
        float ang = atan(vObj.y, vObj.x);
        float spin = uTime * (0.9 / (0.15 + t));
        float n = fbm4(vec3(cos(ang - spin) * (2.0 + t * 6.0), sin(ang - spin) * (2.0 + t * 6.0), t * 9.0));
        float streak = fbm3(vec3(t * 40.0, cos(ang - spin * 1.3) * 2.0, sin(ang - spin * 1.3) * 2.0));
        float dens = smoothstep(-0.4, 0.5, n) * (0.6 + 0.4 * streak);
        vec3 hot = vec3(1.0, 0.95, 0.85); vec3 warm = vec3(1.0, 0.55, 0.18); vec3 cool = vec3(0.7, 0.15, 0.05);
        vec3 col = mix(hot, warm, smoothstep(0.0, 0.35, t));
        col = mix(col, cool, smoothstep(0.35, 1.0, t));
        // relativistic beaming: approaching side brighter
        vec3 tang = normalize(vec3(-sin(ang), cos(ang), 0.0));
        float beam = 1.0 + 0.75 * dot(tang, normalize(uCamDir));
        float a = clamp(dens * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.75, 1.0, t)), 0.0, 1.0);
        gl_FragColor = vec4(col * a * a * clamp(beam, 0.0, 2.0) * (5.0 - t * 3.5), 1.0);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

export function lensMaterial(bgTexture) {
  return new THREE.ShaderMaterial({
    uniforms: { uBg: { value: bgTexture }, uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uHorizon: { value: 0.05 }, uSize: { value: 1 }, uTime: { value: 0 } },
    vertexShader: BILL_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + /* glsl */`
      uniform sampler2D uBg; uniform vec2 uRes, uCenter; uniform float uHorizon, uTime; varying vec2 vUv;
      void main(){
        ` + LOGF + /* glsl */`
        vec2 sc = gl_FragCoord.xy / uRes;
        float aspect = uRes.x / uRes.y;
        vec2 d = sc - uCenter; d.x *= aspect;
        float r = length(d);
        float rE = uHorizon * 2.6;
        float rs = r - rE * rE / max(r, 1e-4);
        vec2 src = normalize(d) * rs; src.x /= aspect;
        vec2 uv = uCenter + src;
        vec3 col = texture2D(uBg, uv).rgb;
        float ring = exp(-pow((r - uHorizon * 1.5) / (uHorizon * 0.12), 2.0));
        col += vec3(1.0, 0.75, 0.45) * ring * 2.5;
        float shadow = smoothstep(uHorizon * 1.02, uHorizon * 0.95, r);
        col = mix(col, vec3(0.0), shadow);
        float bl = length(vUv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.75, 1.0, bl);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
}

export function jetMaterial(color = 0x8ab8ff) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 V = normalize(cameraPosition - vPosW);
        float f = abs(dot(normalize(vNormalW), V));
        float n = snoise(vec3(vUv.x * 6.0, vUv.y * 20.0 - uTime * 3.0, 1.0)) * 0.5 + 0.5;
        float a = pow(f, 1.5) * (1.0 - vUv.y) * (0.5 + n * 0.8) * smoothstep(0.0, 0.03, vUv.y);
        gl_FragColor = vec4(uColor * clamp(a, 0.0, 2.0) * 0.9, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ fx materials
export function shieldMaterial(color = 0x4ef2ff) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uHit: { value: 0 }, uHitDir: { value: new THREE.Vector3(0, 0, 1) }, uOpacity: { value: 1 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + /* glsl */`
      uniform vec3 uColor, uHitDir; uniform float uTime, uHit, uOpacity;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 N = normalize(vNormalW); vec3 V = normalize(cameraPosition - vPosW);
        float fres = pow(1.0 - abs(dot(N, V)), 2.5);
        vec3 p = normalize(vObj);
        vec3 g = abs(fract(p * 9.0 + uTime * 0.05) - 0.5);
        float hex = smoothstep(0.42, 0.48, max(max(g.x, g.y), g.z));
        float hit = uHit * exp(-pow(distance(p, normalize(uHitDir)) * 2.2, 2.0)) * 3.0;
        float a = fres * 0.9 + hex * 0.12 + hit;
        gl_FragColor = vec4(uColor * a * 1.6 * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function beamMaterial(color = 0x9fe8ff) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + /* glsl */`
      uniform vec3 uColor; uniform float uTime, uOpacity; varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 V = normalize(cameraPosition - vPosW);
        float f = abs(dot(normalize(vNormalW), V));
        float rings = pow(fract(vUv.y * 14.0 + uTime * 0.9), 8.0);
        float a = (0.18 + 0.35 * pow(1.0 - f, 2.0) + rings * 0.3) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        gl_FragColor = vec4(uColor * a * 1.5 * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function portalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform float uTime, uOpen; varying vec2 vUv;
      void main(){
        ` + LOGF + /* glsl */`
        vec2 c = vUv - 0.5; float r = length(c) * 2.0; float ang = atan(c.y, c.x);
        float sw = ang + r * 5.0 - uTime * 2.2;
        float n = fbm4(vec3(cos(sw) * 2.0, sin(sw) * 2.0, r * 3.0 - uTime * 0.6));
        float edge = smoothstep(uOpen, uOpen - 0.12, r);
        vec3 a = vec3(0.45, 0.2, 1.0), b = vec3(0.2, 0.95, 1.0);
        vec3 col = mix(a, b, smoothstep(-0.3, 0.5, n));
        float rim = exp(-pow((r - uOpen * 0.92) / 0.05, 2.0)) * 3.0;
        float inner = smoothstep(0.55, 0.0, r) * 1.5;
        float alpha = edge * (0.55 + 0.45 * n);
        gl_FragColor = vec4(col * (alpha * 1.8 + rim + inner * vec3(1.0)), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function fireballMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAge: { value: 0 }, uSeed: { value: Math.random() * 100 } },
    vertexShader: LOGV_PARS + NOISE + /* glsl */`
      uniform float uTime, uSeed, uAge; varying float vN; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        float n = fbm3(position * 2.2 + uSeed + uTime * 0.6);
        vN = n;
        vec3 p = position * (1.0 + n * 0.35);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(p, 1.0); vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      ` + LOGV + '}',
    fragmentShader: LOGF_PARS + /* glsl */`
      uniform float uAge; varying float vN; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        float t = clamp(uAge, 0.0, 1.0);
        float heat = clamp(vN * 0.8 + 0.6 - t * 0.9, 0.0, 1.0);
        vec3 col = mix(vec3(0.08, 0.03, 0.02), vec3(1.0, 0.35, 0.05), smoothstep(0.1, 0.5, heat));
        col = mix(col, vec3(1.0, 0.9, 0.6), smoothstep(0.55, 0.95, heat));
        vec3 V = normalize(cameraPosition - vPosW);
        float f = abs(dot(normalize(vNormalW), V));
        float a = (1.0 - t) * (0.4 + 0.6 * f);
        gl_FragColor = vec4(col * (1.0 + heat * 5.0) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function flameMaterial(color = 0x4ef2ff) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + /* glsl */`
      uniform vec3 uColor; uniform float uTime, uPower; varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 V = normalize(cameraPosition - vPosW);
        float f = abs(dot(normalize(vNormalW), V));
        float flick = 0.85 + 0.15 * sin(uTime * 60.0 + vUv.y * 30.0);
        float a = pow(f, 1.2) * pow(vUv.y, 1.6) * flick * uPower;
        vec3 col = mix(uColor, vec3(1.0), pow(vUv.y, 6.0));
        gl_FragColor = vec4(col * a * 1.7, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ground sky dome
export function groundSkyMaterial(opts) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(opts.top) }, uHorizon: { value: new THREE.Color(opts.horizon) }, uBottom: { value: new THREE.Color(opts.bottom || opts.horizon) },
      uSunDir: { value: (opts.sunDir || new THREE.Vector3(0.3, 0.5, -0.8)).clone().normalize() }, uSunColor: { value: new THREE.Color(opts.sunColor || 0xffffff) },
      uSunSize: { value: opts.sunSize || 0.03 }, uStars: { value: opts.stars || 0 }, uTime: { value: 0 }, uClouds: { value: opts.clouds || 0 }, uCloudColor: { value: new THREE.Color(opts.cloudColor || 0xffffff) },
      uAurora: { value: opts.aurora || 0 }, uDark: { value: 0 },
    },
    vertexShader: LOGV_PARS + /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      ` + LOGV + '}',
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloudColor; uniform float uSunSize, uStars, uTime, uClouds, uAurora, uDark;
      varying vec3 vDir;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.7, h), 0.7));
        col = mix(col, uBottom, smoothstep(0.0, -0.25, h));
        float sd = dot(d, normalize(uSunDir));
        float ss = uSunSize * 0.08;
        float sun = smoothstep(1.0 - ss, 1.0 - ss * 0.6, sd);
        col += uSunColor * sun * 6.0;
        col += uSunColor * pow(max(sd, 0.0), 14.0) * 0.22 + uSunColor * pow(max(sd, 0.0), 260.0) * 0.7;
        if (uStars > 0.0) {
          vec3 q = floor(d * 380.0);
          float s = step(0.9965, hash13(q)) * smoothstep(0.0, 0.3, h);
          col += vec3(s) * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + hash13(q + 1.0) * 30.0));
        }
        if (uClouds > 0.0 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.12);
          float c = fbm4(vec3(uv * 1.3 + uTime * 0.01, 0.5));
          float cm = smoothstep(0.0, 0.5, c) * smoothstep(0.0, 0.25, h) * uClouds;
          col = mix(col, uCloudColor * (0.6 + 0.6 * max(sd, 0.0)), cm * 0.8);
        }
        if (uAurora > 0.0 && h > 0.05) {
          float a = snoise(vec3(d.x * 3.0, d.z * 3.0 + uTime * 0.1, uTime * 0.05));
          float band = exp(-pow((h - 0.45 - a * 0.12) / 0.07, 2.0));
          col += mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 0.2, 1.0), smoothstep(-0.5, 0.5, a)) * band * uAurora * 0.8;
        }
        col *= (1.0 - uDark);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

// lava / energy surface for ground mode
export function lavaMaterial(color = 0xff5a1a) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: WORLD_VS,
    fragmentShader: '#include <common>\n' + LOGF_PARS + NOISE + /* glsl */`
      uniform float uTime; uniform vec3 uColor; varying vec3 vPosW;
      void main(){
        ` + LOGF + /* glsl */`
        vec3 p = vPosW * 0.05;
        float n = fbm4(vec3(p.x, p.z, uTime * 0.08));
        float cr = 1.0 - abs(snoise(vec3(p.x * 2.0, p.z * 2.0, uTime * 0.05)));
        vec3 col = mix(uColor * 0.4, uColor * 2.5, smoothstep(-0.2, 0.6, n));
        col = mix(col, vec3(0.08, 0.03, 0.02), smoothstep(0.7, 0.95, 1.0 - cr) * 0.8);
        gl_FragColor = vec4(col * 1.6, 1.0);
      }`,
  });
}
