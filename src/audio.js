import { createMusic } from './music.js';

// Web Audio synth. No samples. The context is created on the first user gesture (browser
// autoplay rules) and every sound is a short oscillator/noise envelope. The generated music
// (music.js) starts with the context and runs under the same master gain, so mute covers it.
export const AUDIO_LEVELS = { off: 0, low: 0.35, normal: 1 };

export function createAudio({ music: musicLevel = 'low', sfx: sfxLevel = 'normal', muted = false } = {}) {
  let isMuted = muted; // master mute (M key): silences everything, channel levels are kept
  const MASTER_GAIN = 0.5;
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let music = null;
  let pendingLevel = 1;
  let ducked = false;
  const MUSIC_GAIN = 0.28;
  const factor = (level) => AUDIO_LEVELS[level] ?? 1;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = factor(sfxLevel);
    sfxBus.connect(master);
    music = createMusic(ctx, master);
    music.setLevel(pendingLevel);
    applyMusicVolume();
    music.start();
    return true;
  }
  // Unlock on the first gesture.
  const unlock = () => { ensure(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  function applyMusicVolume() {
    if (music) music.setVolume(MUSIC_GAIN * factor(musicLevel) * (ducked ? 0.4 : 1));
  }
  function setMusicLevel(level) { musicLevel = level; applyMusicVolume(); }
  function setMuted(m) {
    isMuted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
  }
  function setSfxLevel(level) {
    sfxLevel = level;
    if (sfxBus) sfxBus.gain.setTargetAtTime(factor(level), ctx.currentTime, 0.02);
  }

  // Basic voice: oscillator with an amplitude envelope and optional pitch glide.
  function tone({ type = 'sine', freq = 440, to = null, dur = 0.15, gain = 0.4, attack = 0.005, delay = 0 }) {
    if (!ctx || factor(sfxLevel) === 0) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.3, freq = 400, delay = 0 }) {
    if (!ctx || factor(sfxLevel) === 0) return;
    const t0 = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0);
  }

  const api = {
    setMusicLevel,
    setSfxLevel,
    setMuted,
    get muted() { return isMuted; },
    get levels() { return { music: musicLevel, sfx: sfxLevel }; },
    // Music follows the level: a little faster and busier as levels climb.
    setLevel(level) { pendingLevel = level; if (music) music.setLevel(level); },
    // Menus and pauses duck the music; play brings it back.
    duck(on) { ducked = on; applyMusicVolume(); },
    // Swallow: a plop whose pitch drops with size. Slight random detune keeps runs lively.
    plop(tier) {
      const base = { S: 640, M: 420, L: 260 }[tier] || 420;
      const f = base * (0.95 + Math.random() * 0.1);
      tone({ type: 'sine', freq: f * 1.6, to: f * 0.7, dur: 0.14, gain: 0.35 });
      tone({ type: 'triangle', freq: f * 0.5, dur: 0.08, gain: 0.12 });
    },
    bomb() {
      noise({ dur: 0.35, gain: 0.5, freq: 250 });
      tone({ type: 'sawtooth', freq: 140, to: 50, dur: 0.4, gain: 0.35 });
    },
    grow() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.22, gain: 0.25, delay: i * 0.06 }));
    },
    tick() { tone({ type: 'square', freq: 1200, dur: 0.04, gain: 0.08 }); },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.3, gain: 0.28, delay: i * 0.1 }));
      tone({ type: 'sine', freq: 1568, dur: 0.6, gain: 0.2, delay: 0.5 });
    },
    lose() {
      tone({ type: 'sawtooth', freq: 220, to: 110, dur: 0.6, gain: 0.3 });
      tone({ type: 'square', freq: 165, to: 82, dur: 0.6, gain: 0.15, delay: 0.05 });
    },
    lost() { tone({ type: 'sine', freq: 300, to: 120, dur: 0.25, gain: 0.12 }); },
    ready() { tone({ type: 'triangle', freq: 440, dur: 0.18, gain: 0.25 }); },
    go() { tone({ type: 'triangle', freq: 660, dur: 0.28, gain: 0.3 }); tone({ type: 'sine', freq: 1320, dur: 0.2, gain: 0.1 }); },
  };
  return api;
}
