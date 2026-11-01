import { game } from './core/game.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { Voice } from './core/voice.js';
import { UI } from './core/ui.js';
import { save } from './core/save.js';
import { Flow } from './flow.js';

function boot() {
  try { Object.assign(game.settings, JSON.parse(localStorage.getItem('nova_settings') || '{}')); } catch (e) { /* ignore */ }
  const canvas = document.getElementById('game');
  game.engine = new Engine(canvas);
  if (game.settings.quality !== 'high') game.engine.setQuality(game.settings.quality);
  game.input = new Input(canvas);
  game.audio = new AudioSys();
  game.voice = new Voice();
  game.ui = new UI();
  game.save = save; save.load();
  game.flow = new Flow();
  game.flow.title();

  let last = performance.now();
  let acc = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    acc += dt; frames++;
    if (acc > 1) { game.fps = frames / acc; acc = 0; frames = 0; }
    try {
      game.flow.update(dt);
    } catch (e) {
      console.error(e);
      if (!game._errShown) { game._errShown = true; const el = document.getElementById('boot-err'); if (el) el.textContent = String(e && e.stack || e); }
    }
    game.input.endFrame();
  }
  requestAnimationFrame(frame);
  const b = document.getElementById('boot');
  b.style.opacity = 0; b.style.pointerEvents = 'none';
  setTimeout(() => { b.style.display = 'none'; }, 900);
  window.__game = game;
}

boot();
