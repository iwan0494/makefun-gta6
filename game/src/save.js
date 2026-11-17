// save.js — a save is three small JSON objects in localStorage: the player and the garage, the
// job in progress, and what the world looked like (time of day, stolen cars). Reading a save
// that does not parse, or was written by another game, is treated as no save at all.
const KEY = 'tallow-point/save/v1';
const SETTINGS_KEY = 'tallow-point/settings/v1';

export function readSave() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.version !== 1 || typeof save.player?.x !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // private mode and file:// pages can refuse storage; the game still plays
  }
}

export function readSettings() {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return { zoom: 1, muted: false };
    const parsed = JSON.parse(raw);
    return { zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1, muted: Boolean(parsed.muted) };
  } catch {
    return { zoom: 1, muted: false };
  }
}

export function writeSettings(settings) {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // nothing to do without storage
  }
}

// What a save carries: enough to put the player back on the same street with the same stars,
// the same cash and the same job, but not the coordinates of every passing taxi.
export function snapshot(state) {
  const car = state.vehicle ? {
    type: state.vehicle.type, x: state.vehicle.x, y: state.vehicle.y, heading: state.vehicle.heading, color: state.vehicle.color,
  } : null;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    player: { x: state.player.x, y: state.player.y, cash: state.player.cash, health: state.player.health, armor: state.player.armor },
    vehicle: car,
    carryingLedger: Boolean(state.carryingLedger),
    completed: [...state.completed],
    mission: state.mission ? { index: state.missionIndex, stage: state.missionStage, verdict: state.missionVerdict } : null,
    wanted: { heat: state.wanted.heat },
    clock: state.clock,
    stolen: state.traffic?.filter((trafficCar) => trafficCar.stolen).map((trafficCar) => ({ type: trafficCar.type, x: trafficCar.x, y: trafficCar.y, color: trafficCar.color })) ?? [],
    owned: state.owned,
  };
}
