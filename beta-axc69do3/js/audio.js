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
/** Short filtered noise burst (impact / whoosh). */
function noise({ t = 0.35, g = 0.08, f = 900, q = 0.8, sweep = 0 } = {}) {
  try {
    const c = ac();
    const n = Math.max(1, Math.floor(c.sampleRate * t));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f, c.currentTime);
    if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(40, f + sweep), c.currentTime + t);
    const gain = c.createGain(); gain.gain.setValueAtTime(g, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t);
    src.connect(bp); bp.connect(gain); gain.connect(c.destination);
    src.start(); src.stop(c.currentTime + t + 0.02);
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
  milestone: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep({ f, t: i === 3 ? 0.28 : 0.1, g: 0.05, type: 'triangle' }), i * 75)); setTimeout(() => beep({ f: 1568, t: 0.22, g: 0.03, type: 'square', slide: 300 }), 320); },
  // 記録更新！ fanfare (short, a little bigger than the 500PT milestone)
  record: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep({ f, t: i === 6 ? 0.42 : 0.11, g: 0.05, type: 'triangle' }), i * 95)); setTimeout(() => beep({ f: 2093, t: 0.3, g: 0.025, type: 'square', slide: 400 }), 700); },
  // 記録更新！ v2: impact (boom + noise) → rising sweep / ticker ticks / landing chord
  recImpact: () => { beep({ f: 110, t: 0.5, g: 0.09, type: 'sawtooth', slide: -70 }); beep({ f: 55, t: 0.6, g: 0.08, type: 'sine', slide: -20 }); noise({ t: 0.45, g: 0.09, f: 1800, sweep: -1500 }); setTimeout(() => beep({ f: 880, t: 0.35, g: 0.025, type: 'square', slide: 880 }), 120); },
  recTick: () => beep({ f: 1400, t: 0.025, g: 0.018, type: 'square' }),
  recLand: () => { noise({ t: 0.3, g: 0.06, f: 3000, sweep: -2400 }); [523, 659, 784, 1047].forEach((f) => beep({ f, t: 0.7, g: 0.028, type: 'triangle' })); setTimeout(() => [1047, 1319, 1568].forEach((f, i) => setTimeout(() => beep({ f, t: i === 2 ? 0.6 : 0.14, g: 0.035, type: 'triangle' }), i * 110)), 180); setTimeout(() => beep({ f: 2093, t: 0.5, g: 0.02, type: 'square', slide: 300 }), 560); },
  ui: () => beep({ f: 480, t: 0.05, g: 0.03, type: 'triangle' }),
};
