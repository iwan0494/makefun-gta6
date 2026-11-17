// audio.js — every sound is synthesised with WebAudio: no audio file is loaded, so the game
// works offline from its own files. The context is created on the first key press or click,
// as browsers require, and a missing WebAudio support simply means a silent game.
export function createAudio() {
  let context = null;
  let master = null;
  let engine = null;
  let sirenA = null;
  let sirenB = null;
  let sirenGain = null;
  let musicTimer = null;
  let beat = 0;
  let enabled = true;

  const now = () => context.currentTime;

  function ensure() {
    if (!enabled) return null;
    if (!context) {
      const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctor) return null;
      try {
        context = new Ctor();
        master = context.createGain();
        master.gain.value = 0.32;
        master.connect(context.destination);
      } catch {
        enabled = false;
        return null;
      }
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function tone({ frequency = 440, end = frequency, type = 'sine', duration = 0.12, volume = 0.3, delay = 0 }) {
    const ctx = ensure();
    if (!ctx) return;
    const start = now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (end !== frequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function noiseBurst({ duration = 0.18, volume = 0.4, cutoff = 1800 }) {
    const ctx = ensure();
    if (!ctx) return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frames) ** 2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  // The engine is one oscillator whose pitch and volume follow the car the player drives.
  function startEngine() {
    const ctx = ensure();
    if (!ctx || engine) return;
    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 48;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    engine.connect(filter).connect(gain).connect(master);
    engine.start();
    engine.gain = gain;
    engine.filter = filter;
  }

  function stopEngine() {
    if (!engine) return;
    try {
      engine.stop();
    } catch {
      // already stopped
    }
    engine = null;
  }

  function setEngine(speedRatio, active) {
    if (!active) {
      if (engine) engine.gain.gain.setTargetAtTime(0.0001, now(), 0.08);
      return;
    }
    startEngine();
    if (!engine) return;
    const pitch = 46 + Math.abs(speedRatio) * 120;
    engine.frequency.setTargetAtTime(pitch, now(), 0.07);
    engine.filter.frequency.setTargetAtTime(280 + Math.abs(speedRatio) * 700, now(), 0.1);
    engine.gain.gain.setTargetAtTime(0.11 + Math.abs(speedRatio) * 0.1, now(), 0.1);
  }

  function setSiren(intensity) {
    const ctx = ensure();
    if (!ctx) return;
    if (intensity <= 0) {
      if (sirenGain) sirenGain.gain.setTargetAtTime(0.0001, now(), 0.2);
      return;
    }
    if (!sirenGain) {
      sirenA = ctx.createOscillator();
      sirenB = ctx.createOscillator();
      sirenA.type = 'square';
      sirenB.type = 'square';
      sirenA.frequency.value = 690;
      sirenB.frequency.value = 910;
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 0.55;
      const wobbleGain = ctx.createGain();
      wobbleGain.gain.value = 220;
      wobble.connect(wobbleGain);
      wobbleGain.connect(sirenA.frequency);
      wobbleGain.connect(sirenB.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0001;
      sirenA.connect(filter);
      sirenB.connect(filter);
      filter.connect(sirenGain).connect(master);
      sirenA.start();
      sirenB.start();
      wobble.start();
    }
    sirenGain.gain.setTargetAtTime(0.03 * Math.min(1, intensity), now(), 0.15);
  }

  // A slow four-bar loop on two oscillators, quiet under the city.
  function startMusic() {
    const ctx = ensure();
    if (!ctx || musicTimer) return;
    const bass = [55, 55, 73.42, 65.41, 55, 82.41, 73.42, 61.74];
    const lead = [440, 523.25, 493.88, 392, 440, 349.23, 392, 329.63];
    musicTimer = setInterval(() => {
      if (!context || context.state !== 'running') return;
      const root = bass[beat % bass.length];
      tone({ frequency: root, end: root, type: 'triangle', duration: 0.42, volume: 0.09 });
      if (beat % 2 === 0) tone({ frequency: lead[(beat >> 1) % lead.length], type: 'sine', duration: 0.2, volume: 0.045 });
      if (beat % 4 === 2) noiseBurst({ duration: 0.06, volume: 0.05, cutoff: 4200 });
      beat += 1;
    }, 330);
  }

  return {
    unlock: () => ensure(),
    shoot: () => {
      tone({ frequency: 180, end: 55, type: 'square', duration: 0.09, volume: 0.26 });
      noiseBurst({ duration: 0.12, volume: 0.32, cutoff: 2600 });
    },
    shotgun: () => {
      noiseBurst({ duration: 0.34, volume: 0.5, cutoff: 1300 });
      tone({ frequency: 90, end: 38, type: 'sawtooth', duration: 0.28, volume: 0.3 });
    },
    punch: () => noiseBurst({ duration: 0.09, volume: 0.3, cutoff: 900 }),
    hurt: () => tone({ frequency: 220, end: 130, type: 'sawtooth', duration: 0.16, volume: 0.16 }),
    pickup: () => {
      tone({ frequency: 660, type: 'triangle', duration: 0.1, volume: 0.18 });
      tone({ frequency: 990, type: 'triangle', duration: 0.12, volume: 0.16, delay: 0.08 });
    },
    cash: () => {
      tone({ frequency: 880, type: 'square', duration: 0.06, volume: 0.12 });
      tone({ frequency: 1320, type: 'square', duration: 0.09, volume: 0.1, delay: 0.06 });
    },
    siren: setSiren,
    engine: setEngine,
    ui: () => tone({ frequency: 520, type: 'square', duration: 0.045, volume: 0.1 }),
    fail: () => tone({ frequency: 300, end: 90, type: 'triangle', duration: 0.5, volume: 0.2 }),
    missionDone: () => {
      tone({ frequency: 523, duration: 0.12, volume: 0.2 });
      tone({ frequency: 659, duration: 0.12, volume: 0.2, delay: 0.11 });
      tone({ frequency: 784, duration: 0.2, volume: 0.2, delay: 0.22 });
    },
    crash: () => {
      noiseBurst({ duration: 0.2, volume: 0.3, cutoff: 700 });
      tone({ frequency: 70, end: 40, type: 'square', duration: 0.14, volume: 0.18 });
    },
    music: startMusic,
    setMuted: (muted) => {
      enabled = !muted;
      if (muted && context) {
        try {
          context.suspend();
        } catch {
          // a suspended context is silent already
        }
      }
      if (!muted && context) context.resume();
    },
    stop: () => {
      stopEngine();
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      setSiren(0);
    },
  };
}
