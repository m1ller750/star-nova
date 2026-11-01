// Voice-over with the Web Speech API: every character gets its own voice, pitch and rate.
import { game } from './game.js';
import { sleep } from './util.js';

export const CAST = {
  NARRATOR: { label: 'NARRATOR', color: '#d8e6f2', prefs: ['Google UK English Male', 'Microsoft Ryan Online', 'Microsoft Guy Online', 'Microsoft George', 'Daniel', 'Microsoft David'], pitch: 0.72, rate: 0.9, pick: 0 },
  NOVA: { label: 'NOVA', color: '#4ef2ff', prefs: ['Microsoft Guy Online', 'Microsoft Christopher Online', 'Microsoft Eric Online', 'Microsoft Mark', 'Alex', 'Google US English', 'Microsoft David'], pitch: 0.95, rate: 1.02, pick: 1 },
  HALE: { label: 'ADMIRAL HALE', color: '#ffd36e', prefs: ['Microsoft Aria Online', 'Microsoft Jenny Online', 'Google UK English Female', 'Microsoft Zira', 'Samantha', 'Karen'], pitch: 1.0, rate: 1.0, pick: 2 },
  AI: { label: 'ARIA · SHIP AI', color: '#8fd3ff', prefs: ['Google US English', 'Microsoft Sonia Online', 'Microsoft Zira', 'Samantha', 'Victoria'], pitch: 1.25, rate: 1.08, pick: 3 },
  HOSTAGE: { label: 'KEPLERIAN HOSTAGE', color: '#9dffcb', prefs: ['Google UK English Female', 'Microsoft Zira', 'Microsoft Libby Online', 'Tessa'], pitch: 1.55, rate: 0.95, pick: 4 },
  ELDER: { label: 'ELDER VAEL', color: '#b7ffd9', prefs: ['Google UK English Male', 'Microsoft George', 'Microsoft David', 'Daniel'], pitch: 0.5, rate: 0.82, pick: 5 },
  DEALER: { label: 'ZOBB · ARMS DEALER', color: '#ffb15e', prefs: ['Microsoft Mark', 'Google UK English Male', 'Microsoft David', 'Fred'], pitch: 0.62, rate: 1.15, pick: 6 },
  PRISONER: { label: 'PRISONER', color: '#c9f7ff', prefs: ['Microsoft Zira', 'Google US English', 'Samantha'], pitch: 1.35, rate: 1.05, pick: 7 },
  ALIEN: { label: 'KLIN\'TAR SOLDIER', color: '#ff6b7a', prefs: ['Microsoft David', 'Google UK English Male', 'Fred'], pitch: 0.2, rate: 1.18, pick: 8 },
  BRUTE: { label: 'KLIN\'TAR BRUTE', color: '#ff4d5e', prefs: ['Microsoft Mark', 'Microsoft David', 'Google UK English Male'], pitch: 0.01, rate: 0.85, pick: 9 },
  EXECUTIONER: { label: 'EXECUTIONER', color: '#ff3b4e', prefs: ['Google UK English Male', 'Microsoft David'], pitch: 0.15, rate: 0.8, pick: 10 },
  ELITE: { label: 'SHADOW GUARD', color: '#ff2b6a', prefs: ['Microsoft Guy Online', 'Microsoft David', 'Google UK English Male'], pitch: 0.3, rate: 1.0, pick: 11 },
  BOSS: { label: '???', color: '#ff1a3c', prefs: ['Microsoft Guy Online', 'Google UK English Male', 'Microsoft David', 'Daniel'], pitch: 0.12, rate: 0.84, pick: 12 },
  ANCHOR: { label: 'GNN NEWS · 2500', color: '#7dd3ff', prefs: ['Microsoft Jenny Online', 'Google US English', 'Microsoft Zira', 'Samantha'], pitch: 1.05, rate: 1.06, pick: 13 },
  CITIZEN: { label: 'CITIZEN', color: '#e9e9ff', prefs: ['Google UK English Female', 'Microsoft Zira', 'Google US English'], pitch: 1.2, rate: 1.1, pick: 14 },
  CHILD: { label: 'CHILD', color: '#fff2a8', prefs: ['Google US English', 'Microsoft Zira'], pitch: 1.9, rate: 1.05, pick: 15 },
};

export class Voice {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.assigned = {};
    this.queue = Promise.resolve();
    this.busy = false;
    this.token = 0;
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices().filter((v) => /^en/i.test(v.lang)); this.assigned = {}; };
      load();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', load); else this.synth.onvoiceschanged = load;
    }
  }

  voiceFor(id) {
    if (this.assigned[id] !== undefined) return this.assigned[id];
    const c = CAST[id] || CAST.NARRATOR;
    let v = null;
    for (const p of c.prefs) { v = this.voices.find((x) => x.name.includes(p)); if (v) break; }
    if (!v && this.voices.length) v = this.voices[c.pick % this.voices.length];
    this.assigned[id] = v || null;
    return v || null;
  }

  // speak one line, show subtitles. Resolves when finished (or after a reading-time fallback).
  say(id, text, { subtitle = true, minTime = 0, interrupt = false, extraWait = 0.25, label = null } = {}) {
    const c = CAST[id] || CAST.NARRATOR;
    const shownLabel = label || c.label;
    const myToken = interrupt ? ++this.token : this.token;
    if (interrupt && this.synth) this.synth.cancel();
    return new Promise((resolve) => {
      let done = false;
      const words = text.split(/\s+/).length;
      const readTime = Math.max(1.6, words / 2.6 + 0.6) / (c.rate || 1);
      const finish = () => {
        if (done) return; done = true;
        setTimeout(() => { if (subtitle && this.token === myToken) game.ui.clearSubtitle(); resolve(); }, extraWait * 1000);
      };
      if (subtitle) game.ui.subtitle(shownLabel, text, c.color);
      this.busy = true;
      const t0 = performance.now();
      let fallback = setTimeout(finish, (readTime + 1.5) * 1000);
      if (this.synth && game.settings.voice > 0) {
        try {
          const u = new SpeechSynthesisUtterance(text);
          const v = this.voiceFor(id);
          if (v) u.voice = v;
          u.lang = (v && v.lang) || 'en-US';
          u.pitch = c.pitch; u.rate = c.rate; u.volume = Math.min(1, game.settings.voice * game.settings.volume * 1.15);
          u.onend = () => {
            const el = (performance.now() - t0) / 1000;
            clearTimeout(fallback);
            if (el < 0.4) { fallback = setTimeout(finish, Math.max(readTime, minTime) * 1000); return; }
            if (el < minTime) setTimeout(finish, (minTime - el) * 1000); else finish();
          };
          u.onerror = () => { clearTimeout(fallback); fallback = setTimeout(finish, Math.max(readTime, minTime) * 1000); };
          this.synth.speak(u);
          // Chrome bug: long utterances can stall; keep it alive
          const keep = setInterval(() => { if (done) { clearInterval(keep); return; } if (this.synth.paused) this.synth.resume(); }, 2000);
        } catch (e) { clearTimeout(fallback); fallback = setTimeout(finish, readTime * 1000); }
      } else {
        clearTimeout(fallback); fallback = setTimeout(finish, Math.max(readTime, minTime) * 1000);
      }
    }).then(() => { this.busy = false; });
  }

  // run a list of [speaker, text] lines in order; returns a promise. Lines queue behind each other.
  dialogue(lines, opts = {}) {
    const run = async () => {
      const tok = this.token;
      for (const l of lines) {
        if (this.token !== tok) return;
        if (typeof l === 'function') { await l(); continue; }
        const [id, text, o] = l;
        if (id === 'WAIT') { await sleep(text * 1000); continue; }
        await this.say(id, text, { ...opts, ...(o || {}) });
      }
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  // short combat line: skipped if something else is talking
  bark(id, text, chance = 1) {
    if (Math.random() > chance) return;
    if (this.busy || (this.synth && this.synth.speaking)) return;
    if (game.audio && id === 'ALIEN') game.audio.growl('alien');
    if (game.audio && id === 'BRUTE') game.audio.growl('brute');
    this.say(id, text, { extraWait: 0.1 });
  }

  stop() {
    this.token++;
    if (this.synth) this.synth.cancel();
    this.queue = Promise.resolve();
    this.busy = false;
    if (game.ui) game.ui.clearSubtitle();
  }
  pause() { if (this.synth) this.synth.pause(); }
  resume() { if (this.synth) this.synth.resume(); }
}
