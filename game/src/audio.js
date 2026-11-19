'use strict';
// Tallow Point — local audio (R4-3, fresh from the R4 spec).
// Every sound is synthesized with the Web Audio API: engine hum, crash,
// gunshot, police siren and a quiet bass loop. No audio files, no fetch,
// no network. The context is created lazily on the first user gesture
// (browsers block autoplay) and every method is a no-op until it exists,
// so a missing or suspended context can never crash the game.

function createAudio() {
  const audio = {
    ctx: null, master: null,
    engineOsc: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenT: 0, sirenHigh: false,
    noiseBuf: null,
    musicT: 0, musicStep: 0, musicOn: false,
    muted: false,
  };

  // Build the context and the always-on voices. Safe to call twice.
  audio.init = function init() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      audio.ctx = ctx;
      audio.master = ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(ctx.destination);
      // One second of white noise, reused by crash and gunshot.
      const len = ctx.sampleRate;
      audio.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = audio.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Engine: a sawtooth through a lowpass, pitch follows speed.
      audio.engineOsc = ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineFilter = ctx.createBiquadFilter();
      audio.engineFilter.type = 'lowpass';
      audio.engineFilter.frequency.value = 320;
      audio.engineGain = ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // Siren: a sine that hops between two pitches.
      audio.sirenOsc = ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  };

  // One short tone: a tiny helper for chimes and the busted sting.
  audio.blip = function blip(freq, dur, type, vol, when) {
    if (!audio.ctx || audio.ctx.state !== 'running') return;
    try {
      const t = audio.ctx.currentTime + (when || 0);
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* keep playing */ }
  };

  // A burst of filtered noise: crash thud or gunshot crack.
  audio.burst = function burst(dur, freq, vol) {
    if (!audio.ctx || audio.ctx.state !== 'running' || !audio.noiseBuf) return;
    try {
      const t = audio.ctx.currentTime;
      const src = audio.ctx.createBufferSource();
      src.buffer = audio.noiseBuf;
      const f = audio.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(audio.master);
      src.start(t);
      src.stop(t + dur);
    } catch (e) { /* keep playing */ }
  };

  audio.crash = function crash() {
    audio.burst(0.3, 500, 0.5);
    audio.blip(70, 0.25, 'sine', 0.3, 0);
  };

  audio.shot = function shot() {
    audio.burst(0.09, 2800, 0.35);
    audio.blip(180, 0.08, 'square', 0.12, 0);
  };

  // Two-note chime for a finished job.
  audio.pickup = function pickup() {
    audio.blip(660, 0.12, 'sine', 0.18, 0);
    audio.blip(990, 0.2, 'sine', 0.18, 0.12);
  };

  // Descending sting for BUSTED.
  audio.busted = function busted() {
    audio.blip(392, 0.22, 'triangle', 0.2, 0);
    audio.blip(311, 0.22, 'triangle', 0.2, 0.2);
    audio.blip(233, 0.4, 'triangle', 0.2, 0.4);
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = !!m;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  };

  // Per-frame: engine pitch from speed, siren while wanted, bass loop.
  audio.tick = function tick(state, dt) {
    if (!audio.ctx || audio.ctx.state !== 'running') return;
    const p = state.player;
    const speed = Math.abs(p.speed || 0);
    if (audio.engineOsc && audio.engineGain) {
      audio.engineOsc.frequency.value = 55 + speed * 3.2;
      const target = p.onFoot ? 0 : Math.min(0.09, 0.02 + speed * 0.002);
      audio.engineGain.gain.value += (target - audio.engineGain.gain.value) * Math.min(1, dt * 6);
    }
    if (audio.sirenOsc && audio.sirenGain) {
      const want = state.stars > 0;
      const target = want ? 0.045 : 0;
      audio.sirenGain.gain.value += (target - audio.sirenGain.gain.value) * Math.min(1, dt * 4);
      if (want) {
        audio.sirenT += dt;
        if (audio.sirenT > 0.42) {
          audio.sirenT = 0;
          audio.sirenHigh = !audio.sirenHigh;
          audio.sirenOsc.frequency.value = audio.sirenHigh ? 950 : 700;
        }
      }
    }
    // Bass loop: a slow minor walk, one note per beat, very quiet.
    if (state.mode === 'playing') {
      audio.musicT += dt;
      if (audio.musicT > 0.34) {
        audio.musicT = 0;
        const scale = [110, 110, 130.8, 98, 110, 146.8, 130.8, 98];
        const f = scale[audio.musicStep % scale.length];
        audio.musicStep++;
        audio.blip(f, 0.3, 'triangle', 0.05, 0);
      }
    }
  };

  return audio;
}
