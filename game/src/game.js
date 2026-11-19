'use strict';
// Tallow Point — central game state (R4-2, fresh from the R4 spec).
// One plain object holds everything the loop needs: money, clock, heat,
// the player, the cars, the pedestrians and the current objective.
// Save/load live here too (localStorage only, no network).
// The state object is created once at boot and mutated in place afterwards
// (reset/applySave) so the meshes already in the scene stay valid.

const SAVE_KEY = 'tallow-point-save';

// Stars from heat: thresholds live in CFG.wanted.starAt, index 1..5.
function starsFromHeat(heat) {
  let stars = 0;
  for (let i = 1; i <= CFG.wanted.maxStars; i++) {
    if (heat >= CFG.wanted.starAt[i]) stars = i;
  }
  return stars;
}

function newGame(city) {
  const rng = RNG(CFG.seed + 101); // gameplay shuffle, separate from the city build
  const player = makePlayer(city);
  return {
    city, mode: 'menu',
    cash: 250, hour: CFG.time.startHour, heat: 0, stars: 0,
    life: 100, armor: 0,
    objective: 'Welcome to Tallow Point — explore the city. Your safehouse is in Crater Row.',
    objectivePos: null,
    mission: null, missionIndex: 0, missionsDone: [],
    police: null, story: null, combat: null, audio: null, save: null,
    bustedAt: -100, deadAt: -100,
    player,
    parkedCars: makeParkedCars(city, rng),
    traffic: makeTrafficCars(city, rng),
    pedestrians: makePedestrians(city, rng, 18),
    time: 0, lastCrimeAt: -100,
    rng,
  };
}

// Fresh life, in place: money, clock, health and heat reset, the player
// returns to the safehouse on foot, any stolen car becomes parked again.
function resetGame(state) {
  if (state.player.car) {
    const car = state.player.car;
    car.kind = 'parked'; car.taken = false; car.speed = 0;
    state.player.car = null;
  }
  state.mode = 'playing';
  state.cash = 250;
  state.hour = CFG.time.startHour;
  state.heat = 0; state.stars = 0;
  state.life = 100; state.armor = 0;
  state.mission = null; state.missionIndex = 0; state.missionsDone = [];
  state.bustedAt = -100; state.deadAt = -100;
  state.objective = 'Welcome to Tallow Point — explore the city. Your safehouse is in Crater Row.';
  state.objectivePos = null;
  const spot = findSpawnPoint(state.city);
  state.player.x = spot.x;
  state.player.z = spot.z;
  state.player.heading = 0;
  state.player.speed = 0;
  state.player.onFoot = true;
  state.player.life = 100; state.player.armor = 0;
  state.time = 0; state.lastCrimeAt = -100;
}

// Heat from a crime; the star count follows immediately.
function addHeat(state, amount) {
  state.heat = Math.min(400, state.heat + amount);
  state.stars = starsFromHeat(state.heat);
  state.lastCrimeAt = state.time;
}

// Heat cools off once the player has kept quiet for a few seconds.
function updateWanted(state, dt) {
  if (state.heat > 0 && state.time - state.lastCrimeAt > 4) {
    state.heat = Math.max(0, state.heat - CFG.wanted.decayPerSec * dt);
    state.stars = starsFromHeat(state.heat);
  }
}

function setObjective(state, text, pos) {
  state.objective = text;
  state.objectivePos = pos || null;
}

function saveGame(state) {
  try {
    const data = {
      cash: state.cash, hour: state.hour,
      x: state.player.x, z: state.player.z, heading: state.player.heading,
      missionIndex: state.missionIndex, stars: state.stars,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

// Load returns plain data (or null), never a state: the boot code applies
// it onto the one live state object.
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.x !== 'number') return null;
    return data;
  } catch (e) { return null; }
}

function applySave(state, data) {
  state.cash = data.cash;
  state.hour = data.hour;
  state.player.x = data.x;
  state.player.z = data.z;
  state.player.heading = data.heading || 0;
  state.missionIndex = data.missionIndex || 0;
  state.stars = data.stars || 0;
  state.heat = state.stars > 0 ? CFG.wanted.starAt[state.stars] : 0;
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
}
