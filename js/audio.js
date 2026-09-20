/** Tiny WebAudio SFX (no external assets) */
let ctx;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function beep({ f = 440, t = 0.08, type = 'square', g = 0.04, slide = 0 } = {}) {
  try {
    const c = ac();
    const o = c.createOscillator();
    const gain = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(f + slide, c.currentTime + t);
    gain.gain.setValueAtTime(g, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t);
    o.connect(gain); gain.connect(c.destination);
    o.start(); o.stop(c.currentTime + t + 0.02);
  } catch (_) {}
}
export const sfx = {
  shot: () => beep({ f: 660, t: 0.04, g: 0.025, type: 'square' }),
  hit: () => beep({ f: 220, t: 0.06, g: 0.04, type: 'sawtooth', slide: -80 }),
  explode: () => beep({ f: 120, t: 0.18, g: 0.05, type: 'sawtooth', slide: -90 }),
  pickup: () => beep({ f: 520, t: 0.1, g: 0.04, type: 'triangle', slide: 200 }),
  power: () => beep({ f: 360, t: 0.16, g: 0.045, type: 'square', slide: 280 }),
  win: () => { beep({ f: 523, t: 0.12, g: 0.05, type: 'triangle' }); setTimeout(() => beep({ f: 659, t: 0.12, g: 0.05, type: 'triangle' }), 100); setTimeout(() => beep({ f: 784, t: 0.2, g: 0.05, type: 'triangle' }), 200); },
  lose: () => beep({ f: 300, t: 0.25, g: 0.05, type: 'sawtooth', slide: -160 }),
  ui: () => beep({ f: 480, t: 0.05, g: 0.03, type: 'triangle' }),
};
