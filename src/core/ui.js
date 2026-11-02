import * as THREE from 'three';
import { game } from './game.js';
import { clamp, fmtTime } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const _v = new THREE.Vector3();

// Star Nova emblem: a nova burst inside a HUD ring, crossed by a gold orbit with one small world on it
export const LOGO_SVG = `<svg class="sn-logo" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Star Nova logo">
  <defs>
    <radialGradient id="sn-core"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#bff9ff"/><stop offset="1" stop-color="#4ef2ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sn-star" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#4ef2ff"/></linearGradient>
    <linearGradient id="sn-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ef2ff"/><stop offset="1" stop-color="#2a6bff"/></linearGradient>
  </defs>
  <circle cx="100" cy="100" r="88" fill="#06101e" fill-opacity="0.6" stroke="url(#sn-ring)" stroke-width="4"/>
  <circle cx="100" cy="100" r="76" fill="none" stroke="#4ef2ff" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="4 7"/>
  <ellipse cx="100" cy="100" rx="96" ry="30" fill="none" stroke="#ffb43c" stroke-width="3.5" transform="rotate(-24 100 100)"/>
  <circle cx="100" cy="100" r="48" fill="url(#sn-core)"/>
  <path d="M100 20 C104 82 118 96 180 100 C118 104 104 118 100 180 C96 118 82 104 20 100 C82 96 96 82 100 20 Z" fill="url(#sn-star)"/>
  <path d="M100 58 C102 92 108 98 142 100 C108 102 102 108 100 142 C98 108 92 102 58 100 C92 98 98 92 100 58 Z" fill="#ffffff" opacity="0.85" transform="rotate(45 100 100)"/>
  <circle cx="159" cy="52.5" r="8" fill="#ffb43c"/>
</svg>`;

export class UI {
  constructor() {
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="markers"></div>
        <div id="hud-level"></div>
        <div id="hud-obj"></div>
        <div id="hud-hint" style="opacity:0"></div>
        <div id="hud-timer" class="hidden"><div class="lbl"></div><div class="val"></div></div>
        <div id="hud-boss" class="hidden"><div class="name"></div><div class="bar"><div class="fill"></div></div></div>
        <div id="sight-scope" class="hidden"><div id="scope"><div class="scope-info"></div></div></div>
        <div id="reddot" class="hidden"></div>
        <div id="ironsight" class="hidden"></div>
        <div id="crosshair" class="ship">
          <div class="ch ring"></div><div class="ch dot"></div>
          <div class="tick" style="left:-22px;top:-1px;width:10px;height:2px"></div>
          <div class="tick" style="left:12px;top:-1px;width:10px;height:2px"></div>
          <div class="tick" style="left:-1px;top:-22px;width:2px;height:10px"></div>
          <div class="tick" style="left:-1px;top:12px;width:2px;height:10px"></div>
        </div>
        <div id="hitmarker"></div>
        <div id="flightcursor" class="hidden"></div>
        <div id="nosemark" class="hidden"></div>
        <div id="dmgdirs"></div>
        <div id="hud-bars"></div>
        <div id="hud-weapons"></div>
        <div id="prompt" class="hidden"></div>
        <div id="holdring" class="hidden"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="163.4" stroke-dashoffset="163.4"/></svg></div>
        <div id="actions"></div>
        <div id="toast"></div>
        <div id="vignette-red"></div>
      </div>
      <div id="center-text" style="opacity:0"><div class="ct-title"></div><div class="ct-sub"></div></div>
      <div id="subtitle" style="opacity:0"><div class="sp"></div><div class="tx"></div></div>
      <div id="cine-ui" class="hidden"></div>
      <div id="title-screen" class="hidden menu"></div>
      <div id="overlay-host"></div>
      <div id="fade"></div>
      <div id="flash"></div>
      <div id="loading" class="hidden"><div class="l-title">ENGAGING</div><div class="l-sub"></div></div>
    `;
    this.hud = $('#hud');
    this.markersEl = $('#markers');
    this.markerPool = new Map();
    this.sig = {};
    this.hintTimer = null;
    this.centerTimer = null;
    this.actions = [];
    this.overlayStack = [];
    window.addEventListener('keydown', (e) => this._actionKey(e));
  }

  showHUD(on) { this.hud.classList.toggle('hidden', !on); if (!on) { this.clearMarkers(); } }

  // ------------------------------------------------------------- static HUD pieces
  setLevel(n, sys, sub = '') {
    const html = `LEVEL ${n} <span class="sys">${sys}</span>${sub ? `<span class="dist">${sub}</span>` : ''}`;
    if (this.sig.level !== html) { $('#hud-level').innerHTML = html; this.sig.level = html; }
  }
  setObjectives(list) {
    const html = list.map((o) => `<div class="obj ${o.done ? 'done' : ''} ${o.red ? 'red' : ''}">${o.text}</div>`).join('');
    if (this.sig.obj !== html) { $('#hud-obj').innerHTML = html; this.sig.obj = html; }
  }
  hint(text, seconds = 0) {
    const el = $('#hud-hint');
    clearTimeout(this.hintTimer);
    if (!text) { el.style.opacity = 0; this.sig.hint = ''; return; }
    if (this.sig.hint !== text) { el.innerHTML = text; this.sig.hint = text; }
    el.style.opacity = 1;
    if (seconds > 0) this.hintTimer = setTimeout(() => { el.style.opacity = 0; this.sig.hint = ''; }, seconds * 1000);
  }
  timer(seconds, label = 'DETONATION') {
    const el = $('#hud-timer');
    if (seconds === null || seconds === undefined) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('urgent', seconds < 30);
    const html = `<div class="lbl">${label}</div><div class="val">${fmtTime(seconds)}</div>`;
    if (this.sig.timer !== html) { el.innerHTML = html; this.sig.timer = html; }
  }
  boss(name, frac) {
    const el = $('#hud-boss');
    if (!name) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (this.sig.boss !== name) { el.querySelector('.name').textContent = name; this.sig.boss = name; }
    el.querySelector('.fill').style.width = `${clamp(frac, 0, 1) * 100}%`;
  }
  setBars(b) {
    const row = (cls, label, v, max, txt) => `<div class="bar-row ${cls}"><div class="lbl"><span>${label}</span><b>${txt ?? Math.ceil(v)}</b></div><div class="bar"><div class="fill" style="width:${clamp(v / max, 0, 1) * 100}%"></div></div></div>`;
    let html = '';
    if (b.danger !== undefined && b.danger !== null) html += row(`danger`, b.dangerLabel || 'GRAVITY WELL', b.danger, 100, `${Math.round(b.danger)}%`);
    if (b.heat !== undefined && b.heat !== null) html += row(`heat ${b.heat > 70 ? 'crit' : ''}`, 'HULL TEMPERATURE', b.heat, 100, `${Math.round(b.heat)}%`);
    if (b.boost) html += row('boost', b.boostLabel || 'BOOST', b.boost[0], b.boost[1], b.boostInf ? '∞' : undefined);
    if (b.shield) html += row('shield', b.shieldOn ? 'SHIELD · ACTIVE' : 'SHIELD', b.shield[0], b.shield[1]);
    if (b.hp) html += row(`hp ${b.hp[0] / b.hp[1] < 0.3 ? 'low' : ''}`, b.hpLabel || 'HULL', b.hp[0], b.hp[1]);
    if (this.sig.bars !== html) { $('#hud-bars').innerHTML = html; this.sig.bars = html; }
    const low = b.hp ? b.hp[0] / b.hp[1] : 1;
    $('#vignette-red').style.opacity = low < 0.3 ? (0.3 - low) * 3 * (0.75 + 0.25 * Math.sin(performance.now() / 160)) : 0;
  }
  setWeapons(html) { if (this.sig.wpn !== html) { $('#hud-weapons').innerHTML = html; this.sig.wpn = html; } }

  crosshair(type = 'ship') { const el = $('#crosshair'); if (this.sig.ch !== type) { el.className = type; this.sig.ch = type; } }
  hitmarker(kill = false) {
    const el = $('#hitmarker');
    el.classList.toggle('kill', kill);
    el.style.opacity = 1;
    clearTimeout(this._hmT); this._hmT = setTimeout(() => (el.style.opacity = 0), kill ? 260 : 120);
    if (game.audio) game.audio.hitMarker(kill);
  }
  flightCursor(x, y) {
    const el = $('#flightcursor');
    if (x === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  noseMark(x, y) {
    const el = $('#nosemark');
    if (x === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  sight(type, info = '') {
    $('#sight-scope').classList.toggle('hidden', type !== 'scope');
    $('#reddot').classList.toggle('hidden', type !== 'reddot');
    $('#ironsight').classList.toggle('hidden', type !== 'iron');
    if (type === 'scope') { const i = $('#scope .scope-info'); if (i.innerHTML !== info) i.innerHTML = info; }
    if (type) this.crosshair('none');
  }
  damageDir(angle) {
    const el = document.createElement('div');
    el.className = 'dmgdir';
    el.style.transform = `rotate(${angle}rad) translateY(-150px)`;
    $('#dmgdirs').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  prompt(text, key = 'E', warn = false) {
    const el = $('#prompt');
    if (!text) { el.classList.add('hidden'); this.sig.prompt = ''; return; }
    const html = `${key ? `<span class="key">${key}</span>` : ''}${text}`;
    if (this.sig.prompt !== html + warn) { el.innerHTML = html; el.classList.toggle('warn', !!warn); this.sig.prompt = html + warn; }
    el.classList.remove('hidden');
  }
  hold(p) {
    const el = $('#holdring');
    if (p === null || p === undefined) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.querySelector('.fg').setAttribute('stroke-dashoffset', String(163.4 * (1 - clamp(p, 0, 1))));
  }

  // clickable action buttons (also triggered by their key)
  setActions(list) {
    const sig = list.map((a) => a.id + a.label + a.key).join('|');
    this.actions = list;
    if (this.sig.actions === sig) return;
    this.sig.actions = sig;
    const host = $('#actions');
    host.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.big ? ' big' : '');
      b.innerHTML = `${a.label}${a.key ? `<span class="key">${a.keyLabel || a.key.replace('Key', '').replace('Digit', '')}</span>` : ''}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (game.audio) game.audio.ui(); a.onClick(); });
      host.appendChild(b);
    }
  }
  _actionKey(e) {
    if (game.paused || !this.actions.length) return;
    for (const a of this.actions) if (a.key && e.code === a.key && !e.repeat) { if (game.audio) game.audio.ui(); a.onClick(); break; }
  }

  center(title, sub = '', seconds = 3, cls = '') {
    const el = $('#center-text');
    clearTimeout(this.centerTimer);
    el.className = cls;
    el.querySelector('.ct-title').innerHTML = title;
    el.querySelector('.ct-sub').innerHTML = sub;
    el.style.opacity = 1;
    if (seconds > 0) this.centerTimer = setTimeout(() => (el.style.opacity = 0), seconds * 1000);
  }
  clearCenter() { $('#center-text').style.opacity = 0; }

  toast(title, sub = '') {
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    $('#toast').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = 0; }, 3600);
    setTimeout(() => el.remove(), 4300);
  }

  subtitle(speaker, text, color = '#4ef2ff') {
    const el = $('#subtitle');
    el.querySelector('.sp').textContent = speaker;
    el.querySelector('.sp').style.color = color;
    el.querySelector('.tx').textContent = text;
    el.style.borderLeftColor = color;
    el.style.opacity = 1;
  }
  clearSubtitle() { $('#subtitle').style.opacity = 0; }

  fadeTo(opacity, seconds = 1) {
    const el = $('#fade');
    el.style.transitionDuration = seconds + 's';
    // force style flush so the transition always runs
    void el.offsetWidth;
    el.style.opacity = opacity;
    return new Promise((r) => setTimeout(r, seconds * 1000 + 30));
  }
  flashWhite(seconds = 0.8, color = '#fff') {
    const el = $('#flash');
    el.style.background = color;
    el.style.transition = 'none'; el.style.opacity = 1; void el.offsetWidth;
    el.style.transition = `opacity ${seconds}s ease-out`; el.style.opacity = 0;
  }
  loading(text) {
    const el = $('#loading');
    if (!text) { el.classList.add('hidden'); return; }
    el.querySelector('.l-sub').textContent = text;
    el.classList.remove('hidden');
  }

  // ------------------------------------------------------------- world markers
  clearMarkers() { for (const el of this.markerPool.values()) el.style.display = 'none'; }
  setMarkers(list, camera) {
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    for (const m of list) {
      seen.add(m.id);
      let el = this.markerPool.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<div class="mk-icon"></div><div class="mk-label"></div><div class="mk-sub"></div><div class="mk-dist"></div>';
        this.markersEl.appendChild(el);
        this.markerPool.set(m.id, el);
      }
      _v.copy(m.pos).applyMatrix4(inv);
      const behind = _v.z > 0;
      const dist = m.pos.distanceTo(camera.position);
      if (m.maxDist && dist > m.maxDist) { el.style.display = 'none'; continue; }
      _v.copy(m.pos).project(camera);
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const margin = 46;
      const off = behind || x < margin || x > W - margin || y < margin || y > H - margin;
      if (off && !m.edge) { el.style.display = 'none'; continue; }
      let edge = false, rot = 0;
      if (off) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
        const s = Math.min((W / 2 - margin) / Math.abs(dx || 1e-6), (H / 2 - margin) / Math.abs(dy || 1e-6));
        x = W / 2 + dx * s; y = H / 2 + dy * s;
        edge = true; rot = Math.atan2(dy, dx) + Math.PI / 2;
      }
      const kind = m.kind || 'objective';
      const cls = `mk ${kind}${m.cls ? ' ' + m.cls : ''}${edge ? ' edge' : ''}`;
      if (el.className !== cls) el.className = cls;
      el.style.display = 'block';
      el.style.color = m.color || '#ffd23f';
      el.style.left = x + 'px'; el.style.top = y + 'px';
      if (edge) el.style.setProperty('--rot', rot + 'rad');
      const op = m.opacity !== undefined ? m.opacity : 1;
      el.style.opacity = op;
      const icon = el.children[0], lab = el.children[1], sub = el.children[2], dd = el.children[3];
      const bare = kind === 'enemy' || kind === 'lock' || kind === 'comet';
      const iconTxt = bare ? '' : (m.icon || '');
      if (icon.textContent !== iconTxt) icon.textContent = iconTxt;
      // keep the HUD clean: enemies are bare icons, off-screen markers are bare arrows
      const quiet = edge || bare;
      const lt = quiet ? '' : (m.label || '');
      if (lab.textContent !== lt) lab.textContent = lt;
      if (sub.textContent !== '') sub.textContent = '';
      const dt = !quiet && m.showDist ? (dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`) : '';
      if (dd.textContent !== dt) dd.textContent = dt;
    }
    for (const [id, el] of this.markerPool) if (!seen.has(id)) el.style.display = 'none';
  }

  // ------------------------------------------------------------- overlays / menus
  overlay(html, cls = '') {
    const host = $('#overlay-host');
    const el = document.createElement('div');
    el.className = 'overlay menu ' + cls;
    el.innerHTML = html;
    host.appendChild(el);
    el.querySelectorAll('.btn').forEach((b) => b.addEventListener('mouseenter', () => game.audio && game.audio.ui('hover')));
    return el;
  }
  closeOverlays() { $('#overlay-host').innerHTML = ''; }

  showTitle({ canContinue, continueLevel, onNew, onContinue, onLevels, onControls, onData, onSettings }) {
    const el = $('#title-screen');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="t-kicker">EARTH DEFENSE INITIATIVE · YEAR 2500</div>
      <div class="t-brand">${LOGO_SVG}<div><div class="t-title">STAR NOVA</div><div class="t-sub">THE KLIN'TAR INVASION</div></div></div>
      <div class="t-menu">
        ${canContinue ? `<button class="btn" data-a="cont">CONTINUE · LEVEL ${continueLevel}</button>` : ''}
        <button class="btn" data-a="new">NEW GAME</button>
        <button class="btn" data-a="levels">SELECT LEVEL</button>
        <button class="btn" data-a="controls">CONTROLS</button>
        <button class="btn" data-a="settings">SETTINGS</button>
        <button class="btn" data-a="data">NASA DATA SOURCES</button>
      </div>
      <div class="t-foot">Every star, planet and black hole comes from <b>NASA open data</b>: NASA Exoplanet Archive · Planetary Fact Sheet · Chandra.<br>Best with headphones · Chrome / Edge</div>`;
    const map = { cont: onContinue, new: onNew, levels: onLevels, controls: onControls, data: onData, settings: onSettings };
    el.querySelectorAll('.btn').forEach((b) => {
      b.addEventListener('mouseenter', () => game.audio && game.audio.ui('hover'));
      b.addEventListener('click', () => { game.audio && game.audio.resume(); game.audio && game.audio.ui(); map[b.dataset.a] && map[b.dataset.a](); });
    });
  }
  hideTitle() { $('#title-screen').classList.add('hidden'); }

  showControls(onClose) {
    const el = this.overlay(`<div class="panel"><h2>CONTROLS</h2><div class="controls-grid">
      <h3>STARSHIP</h3>
      <div class="k">MOUSE</div><div>Aim — the ship turns toward your crosshair</div>
      <div class="k">W / S</div><div>Throttle up / brake</div>
      <div class="k">A / D</div><div>Roll</div>
      <div class="k">SHIFT</div><div>Afterburner boost</div>
      <div class="k">LMB</div><div>Cannons (infinite ammo) — hits charge rockets</div>
      <div class="k">RMB</div><div>Fire homing rocket (1 kills a fighter, 2 kill a cruiser)</div>
      <div class="k">Q</div><div>Energy shield (level 2+)</div>
      <div class="k">F (hold)</div><div>Ship laser (level 3+)</div>
      <div class="k">X</div><div>Eject / fly as Nova (level 3+)</div>
      <div class="k">E</div><div>Land on planet / board ship</div>
      <h3>NOVA ON FOOT / IN FLIGHT</h3>
      <div class="k">WASD</div><div>Move · SHIFT sprint / super-boost</div>
      <div class="k">SPACE</div><div>Jump · press again in the air to fly (level 3+) · ascend</div>
      <div class="k">C</div><div>Crouch (stealth) · descend while flying</div>
      <div class="k">1 2 3 4 5</div><div>Fists · Knife · Sword · Rifle · Sniper</div>
      <div class="k">LMB / RMB</div><div>Attack · Aim down sights</div>
      <div class="k">Z</div><div>Rifle: switch iron sight / long-range red dot</div>
      <div class="k">F</div><div>Quick melee · silent takedown from behind</div>
      <div class="k">R</div><div>Back missiles (level 3+)</div>
      <div class="k">Q (hold)</div><div>Eye lasers (level 4+)</div>
      <div class="k">G</div><div>Smoke grenade</div>
      <div class="k">X</div><div>Leap to nearest moving target (level 5)</div>
      <div class="k">E (hold)</div><div>Interact · free hostages · plant bomb</div>
      <div class="k">V</div><div>First / third person</div>
      <div class="k">ESC / P</div><div>Pause</div>
    </div><div class="menu-col" style="margin-top:24px"><button class="btn" data-a="close">BACK</button></div></div>`);
    el.querySelector('[data-a=close]').addEventListener('click', () => { el.remove(); onClose && onClose(); });
  }

  showData(systems, onClose) {
    const rows = systems.map((s) => `<p><b style="color:#fff">${s.name}</b> — ${s.sourceText}</p>`).join('');
    const el = this.overlay(`<div class="panel" style="max-width:860px"><h2>NASA OPEN DATA</h2><div class="data-list">
      <p>All celestial bodies are real. Sizes and distances are compressed so the systems are playable, but their order, relative size, temperature and colour follow the published values.</p>
      ${rows}
      <p>Archive: <a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener">NASA Exoplanet Archive (pscomppars table)</a> · <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noopener">NASA Planetary Fact Sheet</a> · <a href="https://chandra.harvard.edu/photo/2021/cygx1/" target="_blank" rel="noopener">NASA Chandra — Cygnus X-1</a>. Comets are the only fictional objects.</p>
    </div><div class="menu-col" style="margin-top:20px"><button class="btn" data-a="close">BACK</button></div></div>`);
    el.querySelector('[data-a=close]').addEventListener('click', () => { el.remove(); onClose && onClose(); });
  }

  showSettings(onClose) {
    const s = game.settings;
    const el = this.overlay(`<div class="panel"><h2>SETTINGS</h2>
      <div class="settings-row"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"></div>
      <div class="settings-row"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></div>
      <div class="settings-row"><span>Voices</span><input type="range" min="0" max="1" step="0.05" value="${s.voice}" data-k="voice"></div>
      <div class="settings-row"><span>Mouse sensitivity</span><input type="range" min="0.2" max="2.5" step="0.05" value="${s.sens}" data-k="sens"></div>
      <div class="settings-row"><span>Graphics quality</span><select data-k="quality" class="interactive" style="font-family:var(--title);background:#071626;color:#fff;border:1px solid var(--border);padding:6px">
        <option value="high" ${s.quality === 'high' ? 'selected' : ''}>HIGH</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>MEDIUM</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>LOW</option></select></div>
      <div class="menu-col" style="margin-top:24px"><button class="btn" data-a="close">BACK</button></div></div>`);
    el.querySelectorAll('input,select').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k; const v = k === 'quality' ? inp.value : parseFloat(inp.value);
      game.settings[k] = v;
      if (k === 'volume') game.audio.setVolume(v);
      if (k === 'music') game.audio.setMusicVolume(v);
      if (k === 'quality') game.engine.setQuality(v);
      try { localStorage.setItem('nova_settings', JSON.stringify(game.settings)); } catch (e) { /* ignore */ }
    }));
    el.querySelector('[data-a=close]').addEventListener('click', () => { el.remove(); onClose && onClose(); });
  }

  // every level is open, so the whole campaign can be reviewed in any order
  showLevelSelect({ current = 0, onPick, onClose }) {
    const levels = [
      [1, 'SOLAR SYSTEM', 'Dogfights over Earth · liberate Mercury, Venus and Mars · beware the Sun'],
      [2, 'KEPLER-90', 'Energy shield · the colonizer ring · stealth hostage rescue · 5:00 fusion charge'],
      [3, 'TRAPPIST-1', 'Ship laser · EVA flight · three fortresses · stop the public execution'],
      [4, 'CYGNUS X-1', 'The black-hole trap · eject in time · eye lasers · the portal'],
      [5, 'HR 8799', 'Titan punch · ride comets into dreadnoughts · the final boss'],
    ];
    const el = this.overlay(`<div class="panel levels"><h2>SELECT LEVEL</h2><div class="levels-grid">
      ${levels.map(([n, name, desc]) => `<button class="btn lvl-card${n === current ? ' current' : ''}" data-l="${n}"><span class="n">LEVEL ${n}${n === current ? ' · NOW' : ''}</span><span class="s">${name}</span><span class="d">${desc}</span></button>`).join('')}
      </div><div class="menu-col"><button class="btn" data-a="back">BACK</button></div></div>`);
    el.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { game.audio.ui(); el.remove(); onPick(parseInt(b.dataset.l, 10)); }));
    el.querySelector('[data-a=back]').addEventListener('click', () => { game.audio.ui('back'); el.remove(); onClose && onClose(); });
    return el;
  }

  showPause({ level, onResume, onRestart, onLevel, onQuit }) {
    this.closeOverlays();
    const el = this.overlay(`<div class="panel"><h2>PAUSED</h2><div class="menu-col">
      <button class="btn" data-a="resume">CONTINUE</button>
      <button class="btn" data-a="restart">RESTART THIS LEVEL</button>
      <button class="btn" data-a="levels">SELECT LEVEL</button>
      <button class="btn" data-a="controls">CONTROLS</button>
      <button class="btn" data-a="settings">SETTINGS</button>
      <button class="btn danger" data-a="quit">QUIT TO TITLE</button>
    </div></div>`, 'pause');
    const act = {
      resume: onResume,
      restart: onRestart,
      levels: () => { el.style.display = 'none'; this.showLevelSelect({ current: level, onPick: onLevel, onClose: () => (el.style.display = '') }); },
      controls: () => { el.style.display = 'none'; this.showControls(() => (el.style.display = '')); },
      settings: () => { el.style.display = 'none'; this.showSettings(() => (el.style.display = '')); },
      quit: onQuit,
    };
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { game.audio.ui(); act[b.dataset.a] && act[b.dataset.a](); }));
  }

  showDeath(title, sub, btnLabel, onClick) {
    this.closeOverlays();
    const el = this.overlay(`<div id="death"><div class="d-title">${title}</div><div class="d-sub">${sub}</div><button class="btn" data-a="go">${btnLabel}</button></div>`, 'death');
    el.style.background = 'transparent'; el.style.backdropFilter = 'none';
    el.querySelector('[data-a=go]').addEventListener('click', () => { game.audio.ui(); el.remove(); onClick(); });
  }

  choice(title, text, options) {
    return new Promise((resolve) => {
      game.input.unlock();
      const el = this.overlay(`<div id="choice"><div class="panel"><h2>${title}</h2>${text ? `<p style="text-align:center">${text}</p>` : ''}<div class="menu-col">
        ${options.map((o, i) => `<button class="btn" data-i="${i}" ${o.disabled ? 'disabled' : ''}>${o.label}</button>`).join('')}
      </div></div></div>`);
      el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { game.audio.ui(); el.remove(); resolve(parseInt(b.dataset.i, 10)); }));
    });
  }
}
