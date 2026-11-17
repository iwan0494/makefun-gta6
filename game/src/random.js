// random.js — a small seeded generator (mulberry32) so a saved game reloads the same city,
// the same names on the same doors and the same traffic colours.
export function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeRandom(seed) {
  let state = (typeof seed === 'string' ? hashString(seed) : Math.floor(seed)) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low, high) => low + next() * (high - low),
    int: (low, high) => Math.floor(low + next() * (high - low + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  };
}

// A per-entity noise channel: stable across frames for wobble, walk cycles and decals.
export function noise(x, y, salt = 0) {
  let value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  value -= Math.floor(value);
  return value;
}
