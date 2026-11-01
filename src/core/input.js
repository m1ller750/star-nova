import { game } from './game.js';

const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyF', 'Slash', 'Quote', 'Backspace']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.releasedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0 };
    this.locked = false;
    this.wantLock = false;
    this.onUnlock = null;
    this.lastTap = {};
    this.doubleTaps = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (BLOCK.has(e.code)) e.preventDefault(); return; }
      if (BLOCK.has(e.code) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
      const now = performance.now();
      if (this.lastTap[e.code] && now - this.lastTap[e.code] < 280) this.doubleTaps.add(e.code);
      this.lastTap[e.code] = now;
      this.keys.add(e.code); this.pressedKeys.add(e.code);
      if (game.audio) game.audio.resume();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.releasedKeys.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      // ignore huge spikes some browsers produce right after lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (game.audio) game.audio.resume();
      if (this.wantLock && !this.locked) { this.lock(); }
      this.mouse.down[e.button] = true; this.mouse.pressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { if (this.mouse.down[e.button]) this.mouse.released[e.button] = true; this.mouse.down[e.button] = false; });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => { try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => {}); } catch (e) { /* ignore */ } });
    } catch (e) { /* pointer lock unavailable: movementX still works */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedKeys.has(code); }
  released(code) { return this.releasedKeys.has(code); }
  doubleTap(code) { return this.doubleTaps.has(code); }
  mouseDown(b = 0) { return this.mouse.down[b]; }
  mousePressed(b = 0) { return this.mouse.pressed[b]; }
  mouseReleased(b = 0) { return this.mouse.released[b]; }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  endFrame() {
    this.pressedKeys.clear(); this.releasedKeys.clear(); this.doubleTaps.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.pressed = [false, false, false]; this.mouse.released = [false, false, false];
  }
  clear() { this.keys.clear(); this.mouse.down = [false, false, false]; this.endFrame(); }
}
