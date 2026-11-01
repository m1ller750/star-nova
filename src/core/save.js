// Checkpoints: finishing a level saves progress; dying restarts the current level.
const KEY = 'nova_klintar_save_v1';

export const save = {
  data: { reached: 1, completed: [], finished: false },
  load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.reached) this.data = { reached: d.reached, completed: d.completed || [], finished: !!d.finished }; } catch (e) { /* storage blocked */ }
    return this.data;
  },
  store() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  complete(level) {
    if (!this.data.completed.includes(level)) this.data.completed.push(level);
    this.data.completed.sort((a, b) => a - b);
    this.data.reached = Math.max(this.data.reached, Math.min(5, level + 1));
    if (level === 5) this.data.finished = true;
    this.store();
  },
  reset() { this.data = { reached: 1, completed: [], finished: false }; this.store(); },
};
