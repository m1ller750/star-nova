// Global game context shared by every module (filled in by main.js at boot).
export const game = {
  engine: null,
  input: null,
  audio: null,
  voice: null,
  ui: null,
  save: null,
  flow: null,
  mode: null,        // active mode: SpaceMode | GroundMode | null
  space: null,       // SpaceMode of the current level (kept alive while on a planet)
  ground: null,      // active GroundMode
  level: 1,
  levelDef: null,
  state: null,       // per-level mission state
  paused: false,
  inMenu: true,
  time: 0,
  settings: { sens: 1, volume: 0.85, music: 0.55, voice: 1, quality: 'high', fov: 70 },
};

const listeners = {};
export function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => off(evt, fn); }
export function off(evt, fn) { const l = listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
export function emit(evt, ...args) { const l = listeners[evt]; if (l) for (const fn of [...l]) fn(...args); }
export function clearListeners() { for (const k of Object.keys(listeners)) delete listeners[k]; }
