// game.js — the state of one life in Tallow Point and the small helpers that change it: the
// player, the car they drive, the city they live in, the traffic, the police, the job and the
// messages on screen. update.js moves all of it; render.js and hud.js only read it.
import {
  CELL, DAY_MINUTES, PEDESTRIAN_COUNT, START_TIME, TRAFFIC_COUNT,
} from './config.js';
import { buildCity } from './city.js';
import { makeRandom } from './random.js';
import { createParkedCars, createPedestrian, createSidewalkRoute, createTraffic } from './entities.js';
import { clearWanted, createPolice } from './police.js';
import { MISSIONS } from './story.js';

export const MODE = { MENU: 'menu', PLAY: 'play', PAUSED: 'paused', MAP: 'map', DEAD: 'dead', BUSTED: 'busted' };

export const WEAPONS = {
  fists: { name: 'Fists', ammo: Infinity, rate: 0.42, range: 18, damage: 18, spread: 0 },
  pistol: { name: 'Pistol', ammo: 12, rate: 0.3, range: 340, damage: 26, spread: 0.045 },
  shotgun: { name: 'Shotgun', ammo: 6, rate: 0.9, range: 180, damage: 48, spread: 0.18, pellets: 4 },
};

export const START_CELL = { x: 1.7, y: 1.45 };

// A life begins at the Crater Row safehouse with a pistol, nine rounds and $120.
export function createGame(options = {}) {
  const seed = options.seed ?? 'tallow-point';
  const random = makeRandom(`${seed}/life`);
  const city = buildCity(seed);
  const routes = createSidewalkRoute(city);
  const state = {
    mode: MODE.MENU,
    clock: START_TIME,
    day: 1,
    time: 0,
    player: {
      x: START_CELL.x * CELL,
      y: START_CELL.y * CELL,
      heading: 0,
      hp: 100,
      armor: 0,
      cash: 120,
      cool: 0,
      walkPhase: 0,
      aim: 0,
    },
    speed: 0,
    vehicle: null,
    traffic: createTraffic(city, random, TRAFFIC_COUNT),
    parked: createParkedCars(city, random),
    peds: [],
    police: createPolice(city, random),
    mission: null,
    missionIndex: 0,
    missionVerdict: null,
    lastCompleted: '',
    lastFailure: '',
    completed: [],
    carryingLedger: false,
    carryingCrate: false,
    passenger: false,
    tailTarget: null,
    tailLost: false,
    tailTimer: 0,
    guardsLeft: 0,
    weapons: [
      { key: 'fists', ammo: Infinity },
      { key: 'pistol', ammo: 9 },
      { key: 'shotgun', ammo: 4 },
    ],
    weaponIndex: 0,
    camera: { x: START_CELL.x * CELL, y: START_CELL.y * CELL, zoom: 1, shake: 0 },
    messages: [],
    shotFlash: 0,
    events: [],
    effects: [],
    markers: [],
    stealCar: null,
    stealProgress: 0,
  };
  for (let index = 0; index < PEDESTRIAN_COUNT; index += 1) {
    const node = city.nodes[random.int(0, city.nodes.length - 1)];
    const ped = createPedestrian(city, random, node.x + random.range(-24, 24), node.y + random.range(-24, 24));
    ped.route = routes[node.id];
    ped.routeIndex = random.int(0, ped.route.length - 1);
    ped.walkTarget = ped.route[ped.routeIndex];
    state.peds.push(ped);
  }
  return { city, state, random, seed, routes };
}

export function currentWeapon(state) {
  const entry = state.weapons[state.weaponIndex];
  return { ...WEAPONS[entry.key], key: entry.key, ammo: entry.ammo };
}

export function pushMessage(state, text, tone = 'info', seconds = 3.6) {
  state.messages.unshift({ text, tone, life: seconds, age: 0 });
  if (state.messages.length > 4) state.messages.length = 4;
}

export function setNextJob(state, index) {
  state.missionIndex = Math.max(0, Math.min(MISSIONS.length - 1, index));
}

export function resetWanted(state) {
  clearWanted(state.police.wanted);
  state.police.officers.length = 0;
  for (let index = 0; index < state.police.cruisers.length; index += 1) state.police.cruisers[index] = null;
  state.police.bullets.length = 0;
}

export { DAY_MINUTES };
