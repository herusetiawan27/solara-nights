// Synthesized sound: no audio files, everything is WebAudio oscillators and noise.
// Engine hum, sirens, gunshots, pickups, UI clicks and a low-key bassline.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { ctx = null; }
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.2, filterFreq = 1200) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }

  const api = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() { muted = !muted; if (engineGain) engineGain.gain.value = muted ? 0 : 0.05; return muted; },
    isMuted() { return muted; },
    click() { tone(660, 0.07, 'square', 0.08); },
    pickup() { tone(523, 0.12, 'sine', 0.15); setTimeout(() => tone(784, 0.18, 'sine', 0.15), 90); },
    cash() { tone(880, 0.1, 'triangle', 0.15); setTimeout(() => tone(1174, 0.2, 'triangle', 0.15), 100); },
    gunshot() { noise(0.14, 0.3, 3000); tone(180, 0.1, 'square', 0.12, 60); },
    hit() { tone(220, 0.08, 'sawtooth', 0.1, 110); },
    siren() { tone(700, 0.4, 'sine', 0.05, 950); setTimeout(() => tone(950, 0.4, 'sine', 0.05, 700), 400); },
    busted() { tone(392, 0.3, 'sawtooth', 0.12); setTimeout(() => tone(311, 0.3, 'sawtooth', 0.12), 300); setTimeout(() => tone(233, 0.6, 'sawtooth', 0.12), 600); },
    engine(on, rpm = 0.5) {
      if (!ctx || muted) return;
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineGain.gain.value = 0.04;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 400;
        engineOsc.connect(f).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      if (engineOsc) {
        engineOsc.frequency.value = 50 + rpm * 90;
        if (engineGain) engineGain.gain.value = on ? 0.05 : 0;
      }
    },
    startMusic() {
      if (!ctx || musicTimer) return;
      // A moody bassline: Am – F – C – G, one bar a second, plus a hat tick.
      const roots = [55, 43.65, 65.41, 49];
      let bar = 0;
      musicTimer = setInterval(() => {
        if (muted || !ctx) return;
        const root = roots[bar % 4];
        for (let i = 0; i < 4; i++) {
          setTimeout(() => tone(root * (i === 3 ? 1.5 : 1), 0.22, 'triangle', 0.12), i * 250);
          setTimeout(() => noise(0.03, 0.04, 6000), i * 250 + 125);
        }
        bar++;
      }, 1000);
    },
    stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
  };
  return api;
}
