// Generated lo-fi techno. A 16-step sequencer scheduled ahead of the audio clock: kick on every
// beat, hats on the offbeats, clap on 2 and 4, a bass line that is re-rolled every four bars
// over a four-chord loop, a chord stab every other bar, and sparse melody blips through a
// dotted-eighth delay. Everything runs into a lo-fi bus: lowpass with a slow wobble, soft
// saturation, and a vinyl crackle bed.
export function createMusic(ctx, destination, { seed = 1 } = {}) {
  let rnd = mulberry(seed);
  const STEPS = 16;
  let bpm = 118;
  const stepDur = () => 60 / bpm / 4;

  // Bus.
  const bus = ctx.createGain();
  bus.gain.value = 0.28;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2600;
  lowpass.Q.value = 0.8;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 45;
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClip(2.2);
  shaper.oversample = '2x';
  bus.connect(highpass).connect(lowpass).connect(shaper).connect(destination);

  // Slow wobble on the lowpass, like a tired tape machine.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.11;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 500;
  lfo.connect(lfoGain).connect(lowpass.frequency);
  lfo.start();

  // Delay send for melody and stabs.
  const delay = ctx.createDelay(1.0);
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 1600;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.5;
  delay.connect(delayTone).connect(fb).connect(delay);
  delay.connect(delayOut).connect(bus);

  // Vinyl crackle bed.
  const crackle = (() => {
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() - 0.5) * 0.02;
      if (Math.random() < 0.0006) d[i] += (Math.random() * 2 - 1) * 0.8;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    src.connect(hp).connect(g).connect(bus);
    return { src, g };
  })();

  // Harmony: A minor loop, chord roots in semitones from A1.
  const ROOT = 55; // A1
  const CHORDS = [
    { root: 0, tones: [0, 3, 7, 10] },   // Am7
    { root: 8, tones: [0, 4, 7, 11] },   // Fmaj7
    { root: 3, tones: [0, 4, 7, 11] },   // Cmaj7
    { root: 10, tones: [0, 4, 7, 10] },  // G7
  ];
  const PENTA = [0, 3, 5, 7, 10, 12, 15];
  const hz = (semi, base = ROOT) => base * Math.pow(2, semi / 12);

  // Patterns. Bass: per step, a semitone offset from the chord root or null for a rest.
  let bass = [];
  let hatAccent = [];
  function rollPatterns() {
    bass = [];
    for (let i = 0; i < STEPS; i++) {
      const on = i % 4 === 0 ? true : i % 2 === 0 ? rnd() < 0.55 : rnd() < 0.3;
      if (!on) { bass.push(null); continue; }
      const r = rnd();
      bass.push(r < 0.55 ? 0 : r < 0.7 ? 12 : r < 0.8 ? 7 : r < 0.9 ? 3 : -2);
    }
    hatAccent = Array.from({ length: STEPS }, () => rnd() < 0.25);
  }
  rollPatterns();

  // Voices.
  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + 0.35);
  }
  function hat(t, open = false, vel = 1) {
    const dur = open ? 0.18 : 0.04;
    const src = noiseSource(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
  }
  function clap(t) {
    for (let i = 0; i < 3; i++) {
      const src = noiseSource(0.12);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      const tt = t + i * 0.012;
      g.gain.setValueAtTime(i === 2 ? 0.45 : 0.25, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 2 ? 0.14 : 0.03));
      src.connect(f).connect(g).connect(bus);
      src.start(tt);
    }
  }
  function bassNote(t, semi, len) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(semi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f).connect(g).connect(bus);
    o.start(t); o.stop(t + len + 0.02);
  }
  function stab(t, chord) {
    for (const tone of chord.tones) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(chord.root + tone + 24);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(500, t + 0.28);
        o.connect(f).connect(g);
        g.connect(bus);
        g.connect(delay);
        o.start(t); o.stop(t + 0.3);
      }
    }
  }
  function blip(t, semi) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(semi + 36);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(bus);
    g.connect(delay);
    o.start(t); o.stop(t + 0.18);
  }
  function noiseSource(dur) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // Scheduler.
  let running = false;
  let timer = null;
  let step = 0;
  let bar = 0;
  let nextTime = 0;
  let energy = 0; // 0..1: more hats and blips on later levels
  const LOOKAHEAD = 0.15;

  function scheduleStep(t) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const sd = stepDur();
    if (step % 4 === 0) kick(t);
    if (step === 4 || step === 12) clap(t);
    if (step % 2 === 1) hat(t, false, hatAccent[step] ? 1 : 0.6);
    if (energy > 0.3 && step % 4 === 2 && rnd() < energy * 0.6) hat(t, false, 0.35);
    if (step === 14 && bar % 2 === 1) hat(t, true, 0.8);
    const b = bass[step];
    if (b !== null) bassNote(t, chord.root + b, sd * (bass[(step + 1) % STEPS] === null ? 1.8 : 0.9));
    if (bar % 2 === 0 && (step === 6 || step === 11)) stab(t, chord);
    if (step % 2 === 0 && rnd() < 0.08 + energy * 0.12) blip(t, chord.root + PENTA[Math.floor(rnd() * PENTA.length)]);
  }

  function tick() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(nextTime);
      nextTime += stepDur();
      step = (step + 1) % STEPS;
      if (step === 0) {
        bar++;
        if (bar % 4 === 0) rollPatterns();
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    delay.delayTime.value = stepDur() * 3;
    nextTime = ctx.currentTime + 0.05;
    step = 0;
    crackle.src.start();
    timer = setInterval(tick, 40);
  }
  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    try { crackle.src.stop(); } catch { /* already stopped */ }
  }
  function setLevel(level) {
    energy = Math.min(1, level / 60);
    bpm = 116 + Math.min(12, level * 0.15);
    delay.delayTime.setTargetAtTime(stepDur() * 3, ctx.currentTime, 0.1);
    rnd = mulberry(seed * 977 + level * 31);
    rollPatterns();
  }
  function setVolume(v) { bus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); }

  return { start, stop, setLevel, setVolume, get running() { return running; } };
}

function softClip(k) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
