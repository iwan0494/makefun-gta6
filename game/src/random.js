'use strict';
// Tallow Point — seeded random numbers (R4-1, fresh from the R4 spec).
// One small deterministic generator so the city, traffic and pedestrians
// are identical for a given seed, and a fresh shuffle never repeats a run.

// mulberry32: tiny, fast, good enough for procedural placement.
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turn any short string into a 32-bit seed (FNV-1a).
function seedFromString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A small helper object around one generator, so call sites read cleanly.
function RNG(seed) {
  const next = makeRng(seed);
  return {
    next,
    // Float in [min, max).
    range(min, max) { return min + next() * (max - min); },
    // Integer in [min, max] inclusive.
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    // True with probability p (0..1).
    chance(p) { return next() < p; },
    // One element of an array, uniformly.
    pick(list) { return list[Math.floor(next() * list.length)]; },
    // Fisher-Yates shuffle, returns a new array.
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    },
  };
}
