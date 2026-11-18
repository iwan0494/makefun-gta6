// update.js — the body of one game frame at play: the player on foot or in a car, weapons,
// traffic and pedestrians, the police department, the current job, and the camera that follows
// it all. It reads input intent from main.js and writes events; render.js reads the result.
import {
  CELL, DAY_MINUTES, PEDESTRIAN_COUNT, PLAYER_RADIUS, ROAD, VEHICLE_NAMES, WORLD,
} from './config.js';
import { districtAt, hitsBuilding } from './city.js';
import { makeRandom } from './random.js';
import {
  clampToWorld, collideCars, createPedestrian, knockDown, stepPedestrian, stepPlayerCar, stepTraffic,
} from './entities.js';
import { addHeat, clearWanted, CRIMES, stepPolice } from './police.js';
import { MISSIONS } from './story.js';
import { MODE, WEAPONS, currentWeapon, pushMessage } from './game.js';

const TRACER_LIFE = 0.09;

export function missionPoint(cell) {
  return { x: cell.x * CELL, y: cell.y * CELL };
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

export function stepWorld(game, dt, controls) {
  const { state, city, random } = game;
  emitEffects(state, dt);
  for (const message of state.messages) message.age += dt;
  state.messages = state.messages.filter((message) => message.age < message.life);
  state.shotFlash = Math.max(0, state.shotFlash - dt * 4);
  if (state.mode !== MODE.PLAY) return state.events;

  state.time += dt;
  state.clock += (dt * 45) / 60;
  if (state.clock >= DAY_MINUTES) {
    state.clock -= DAY_MINUTES;
    state.day += 1;
  }

  const player = state.player;
  player.cool -= dt;
  const aimAngle = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);

  if (controls.interact) {
    if (state.vehicle) exitVehicle(state);
    else if (state.stealCar) {
      // Cancel steal in progress
      state.stealCar = null;
      state.stealProgress = 0;
    } else {
      const car = nearestVehicle(state, player.x, player.y);
      if (car) {
        if (car.driver && !car.stolen) {
          // Traffic car — instant carjack
          enterVehicle(state, car);
        } else {
          // Parked car — break-in sequence (~1 second)
          state.stealCar = car;
          state.stealProgress = 0;
        }
      }
    }
  }
  if (controls.groundMove) controls.groundMove = false;

  // Advance break-in progress
  if (state.stealCar && !state.vehicle) {
    const d = distance(state.player.x, state.player.y, state.stealCar.x, state.stealCar.y);
    if (d > 48) {
      state.stealCar = null;
      state.stealProgress = 0;
    } else {
      state.stealProgress += dt / 1.0;
      if (state.stealProgress >= 1) {
        enterVehicle(state, state.stealCar);
        state.stealCar = null;
        state.stealProgress = 0;
      }
    }
  }

  if (state.vehicle) stepDrive(game, dt, controls);
  else stepOnFoot(game, dt, controls, aimAngle);

  if (controls.fire) fireWeapon(game, aimAngle);
  if (controls.switchWeapon) {
    state.weaponIndex = (state.weaponIndex + 1) % state.weapons.length;
    game.state.events.push({ type: 'weapon', name: WEAPONS[state.weapons[state.weaponIndex].key].name });
  }

  for (const car of state.traffic) {
    stepTraffic(car, dt, city, state.traffic, random);
    car.x = Math.max(ROAD, Math.min(WORLD - ROAD, car.x));
    car.y = Math.max(ROAD, Math.min(WORLD - ROAD, car.y));
    if (car.hornTimer > 0) car.hornTimer -= dt;
    if (car.honk) {
      car.honk = false;
      state.events.push({ type: 'horn', x: car.x, y: car.y });
    }
  }
  const scare = state.shotFlash > 0 ? { x: player.x, y: player.y, radius: 95 } : null;
  for (const ped of state.peds) {
    stepPedestrian(ped, dt, city, scare);
    if (ped.dead && ped.knocked <= 0) {
      ped.deadTime = (ped.deadTime ?? 0) + dt;
      if (ped.deadTime > 15) respawnPedestrian(game, ped);
    }
  }

  stepJob(game, dt);
  stepPolice(state.police, dt, player, true, (damage, bullet) => onPoliceHit(game, damage, bullet), () => {
    if (state.vehicle && Math.random() < 0.04) state.events.push({ type: 'nearMiss', x: player.x, y: player.y });
  });
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    if (state.mission) failMission(game, 'You went down on the job.');
    state.mode = MODE.DEAD;
    state.events.push({ type: 'wasted' });
  }
  if (state.player.hp < 100 && state.time - (state.lastRegen ?? 0) > 9) {
    state.player.hp = Math.min(100, state.player.hp + dt * 5);
  }
  if (state.player.cash < 0) state.player.cash = 0;
  updateCamera(state, dt, controls, game.clampCamera);
  return state.events;
}

function stepOnFoot(game, dt, controls, aimAngle) {
  const { state, city } = game;
  const player = state.player;
  const run = controls.boost ? 2.05 : 1.02;
  const step = 78 * run * dt;
  let dx = 0;
  let dy = 0;
  if (controls.forward) dy -= 1;
  if (controls.back) dy += 1;
  if (controls.left) dx -= 1;
  if (controls.right) dx += 1;
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    player.x += (dx / length) * step;
    player.y += (dy / length) * step;
    player.heading = Math.atan2(dy, dx);
    player.walkPhase += dt * run * 9;
  }
  const hit = hitsBuilding(city.buildings, player.x, player.y, PLAYER_RADIUS);
  if (hit) {
    const left = player.x + PLAYER_RADIUS - hit.x;
    const right = hit.x + hit.w - (player.x - PLAYER_RADIUS);
    const top = player.y + PLAYER_RADIUS - hit.y;
    const bottom = hit.y + hit.h - (player.y - PLAYER_RADIUS);
    const smallest = Math.min(left, right, top, bottom);
    if (smallest === left) player.x = hit.x - PLAYER_RADIUS;
    else if (smallest === right) player.x = hit.x + hit.w + PLAYER_RADIUS;
    else if (smallest === top) player.y = hit.y - PLAYER_RADIUS;
    else player.y = hit.y + hit.h + PLAYER_RADIUS;
  }
  player.aim = aimAngle;
  clampToWorld(player, ROAD * 0.5);
}

function stepDrive(game, dt, controls) {
  const { state, city } = game;
  const car = state.vehicle;
  const speed = stepPlayerCar(car, dt, controls);
  clampToWorld(car, 14);
  if (hitsBuilding(city.buildings, car.x, car.y, 10)) {
    car.x -= Math.cos(car.heading) * speed * dt * 1.4;
    car.y -= Math.sin(car.heading) * speed * dt * 1.4;
    car.vx *= -0.25;
    car.vy *= -0.25;
    if (Math.abs(speed) > 45) {
      state.events.push({ type: 'crash', x: car.x, y: car.y, strength: Math.abs(speed) });
      state.camera.shake = Math.max(state.camera.shake, Math.min(0.8, Math.abs(speed) / 260));
    }
  }
  const others = state.traffic.concat(state.parked);
  const impulse = collideCars(car, others);
  if (impulse > 60) {
    state.events.push({ type: 'crash', x: car.x, y: car.y, strength: impulse });
    state.camera.shake = Math.max(state.camera.shake, Math.min(0.7, impulse / 300));
  }
  for (const ped of state.peds) {
    if (ped.dead || ped.knocked > 0) continue;
    if (distance(car.x, car.y, ped.x, ped.y) < car.spec.width + 3) {
      knockDown(ped, car.vx * 0.5, car.vy * 0.5);
      addHeat(state.police.wanted, CRIMES.vehicle);
      state.events.push({ type: 'thud', x: ped.x, y: ped.y });
    }
  }
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.heading = car.heading;
  state.speed = speed;
}

function nearestVehicle(state, x, y) {
  let best = null;
  let bestDistance = 34;
  for (const car of state.traffic) {
    if (car.stolen) continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestDistance) {
      best = car;
      bestDistance = d;
    }
  }
  for (const car of state.parked) {
    const d = distance(x, y, car.x, car.y);
    if (d < bestDistance) {
      best = car;
      bestDistance = d;
    }
  }
  return best;
}

export function nearestRide(state) {
  return nearestVehicle(state, state.player.x, state.player.y);
}

export function enterVehicle(state, vehicle) {
  if (state.vehicle) return;
  const stolen = !vehicle.driver;
  state.vehicle = vehicle;
  vehicle.driver = true;
  vehicle.vx = 0;
  vehicle.vy = 0;
  if (stolen) {
    vehicle.stolen = true;
    addHeat(state.police.wanted, CRIMES.theft);
    state.events.push({ type: 'carStolen', vehicle });
    pushMessage(state, `Stole a ${VEHICLE_NAMES[vehicle.type]?.[0] ?? 'car'}. Keep the paint on it.`, 'info', 3.4);
  } else {
    pushMessage(state, 'Your car. The city is yours.', 'info', 2.6);
  }
}

export function exitVehicle(state) {
  if (!state.vehicle) return;
  const car = state.vehicle;
  car.driver = false;
  const side = car.heading + Math.PI / 2;
  state.player.x = car.x + Math.cos(side) * 15;
  state.player.y = car.y + Math.sin(side) * 15;
  clampToWorld(state.player, 6);
  state.vehicle = null;
  state.speed = 0;
  car.vx *= 0.2;
  car.vy *= 0.2;
}

export function fireWeapon(game, aimAngle) {
  const { state } = game;
  const player = state.player;
  if (state.vehicle || player.cool > 0) return;
  const weapon = currentWeapon(state);
  const entry = state.weapons[state.weaponIndex];
  if (entry.ammo <= 0) {
    player.cool = 0.5;
    state.events.push({ type: 'empty' });
    pushMessage(state, `Out of ${weapon.name.toLowerCase()} rounds.`, 'bad', 2.2);
    return;
  }
  if (Number.isFinite(entry.ammo)) entry.ammo -= 1;
  player.cool = weapon.rate;
  state.shotFlash = 1;
  state.camera.shake = weapon.key === 'shotgun' ? 0.45 : 0.2;
  state.events.push({ type: weapon.key === 'pistol' ? 'shotPistol' : weapon.key === 'shotgun' ? 'shotgun' : 'punch' });
  if (weapon.key === 'fists') {
    for (const officer of state.police.officers) {
      if (!officer || officer.dead) continue;
      if (distance(officer.x, officer.y, player.x + Math.cos(aimAngle) * 10, player.y + Math.sin(aimAngle) * 10) < 17) {
        officer.hp -= weapon.damage;
        addHeat(state.police.wanted, CRIMES.assault);
        state.events.push({ type: 'hitmark', x: officer.x, y: officer.y });
        if (officer.hp <= 0) killOfficer(state, officer);
      }
    }
    return;
  }
  addHeat(state.police.wanted, CRIMES.gunfire);
  const pellets = weapon.pellets ?? 1;
  for (let index = 0; index < pellets; index += 1) {
    const angle = aimAngle + (Math.random() - 0.5) * 2 * weapon.spread;
    traceShot(game, angle, weapon.range, weapon.damage / Math.sqrt(pellets));
  }
}

function traceShot(game, angle, range, damage) {
  const { state } = game;
  const startX = state.player.x;
  const startY = state.player.y;
  let best = null;
  let bestT = 1;
  const consider = (target, radius) => {
    if (!target || target.dead) return;
    const dx = target.x - startX;
    const dy = target.y - startY;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along <= 4 || along > range) return;
    const side = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (side > radius) return;
    const t = along / range;
    if (t < bestT) {
      bestT = t;
      best = target;
    }
  };
  for (const officer of state.police.officers) consider(officer, 7);
  for (const ped of state.peds) consider(ped, 6);
  for (const car of state.traffic) consider(car, car.spec.width + 1);
  for (const car of state.parked) consider(car, car.spec.width + 1);
  for (const car of state.police.cruisers) consider(car, 8);

  if (best && best.route) {
    knockDown(best, Math.cos(angle) * 90, Math.sin(angle) * 90);
    addHeat(state.police.wanted, CRIMES.kill);
    state.events.push({ type: 'blood', x: best.x, y: best.y });
  } else if (best && best.spec) {
    best.hp = (best.hp ?? 90) - damage;
    if (best.driver) best.driver = false;
    state.events.push({ type: 'spark', x: best.x, y: best.y });
  } else if (best) {
    best.hp -= damage;
    state.events.push({ type: 'hitmark', x: best.x, y: best.y });
    if (best.hp <= 0) {
      best.dead = true;
      addHeat(state.police.wanted, best.guard ? 4 : CRIMES.kill * 1.4);
      if (best.guard && state.guardsLeft > 0) state.guardsLeft -= 1;
      state.events.push({ type: 'blood', x: best.x, y: best.y });
    } else {
      addHeat(state.police.wanted, CRIMES.police);
    }
  }
  state.effects.push({
    kind: 'tracer',
    x1: startX, y1: startY,
    x2: startX + Math.cos(angle) * range * bestT,
    y2: startY + Math.sin(angle) * range * bestT,
    life: TRACER_LIFE,
    max: TRACER_LIFE,
  });
}

export function killOfficer(state, officer) {
  officer.dead = true;
  officer.deadTime = 0;
  addHeat(state.police.wanted, CRIMES.kill);
  state.events.push({ type: 'blood', x: officer.x, y: officer.y });
}

function onPoliceHit(game, damage) {
  const { state } = game;
  const player = state.player;
  if (state.vehicle) {
    state.vehicle.health = (state.vehicle.health ?? 100) - damage;
    if (state.vehicle.health <= 0) {
      state.events.push({ type: 'carExplode', x: state.vehicle.x, y: state.vehicle.y });
      exitVehicle(state);
      player.hp -= 25;
      state.camera.shake = 1;
    }
    return;
  }
  const absorbed = Math.min(player.armor, damage * 0.6);
  player.armor -= absorbed;
  player.hp -= damage - absorbed;
  state.events.push({ type: 'hurt' });
  state.camera.shake = Math.max(state.camera.shake, 0.3);
}

function respawnPedestrian(game, ped) {
  const { city, routes, random } = game;
  const node = city.nodes[random.int(0, city.nodes.length - 1)];
  const fresh = createPedestrian(city, random, node.x + random.range(-24, 24), node.y + random.range(-24, 24));
  fresh.route = routes[node.id];
  fresh.routeIndex = 0;
  fresh.walkTarget = fresh.route[0];
  Object.assign(ped, fresh, { id: ped.id });
}

function emitEffects(state, dt) {
  for (const effect of state.effects) {
    effect.life -= dt;
    if (effect.vx !== undefined) {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vy += (effect.gravity ?? 0) * dt;
    }
  }
  state.effects = state.effects.filter((effect) => effect.life > 0);
}

function updateCamera(state, dt, controls, clampCamera) {
  const inCar = Boolean(state.vehicle);
  const target = state.vehicle ?? state.player;
  const aimAngle = Math.atan2(controls.aimY - state.player.y, controls.aimX - state.player.x);
  const heading = inCar ? state.vehicle.heading : aimAngle;
  const lead = inCar ? 0.34 : 0.16;
  const wantX = target.x + Math.cos(heading) * 150 * lead;
  const wantY = target.y + Math.sin(heading) * 150 * lead;
  const follow = Math.min(1, dt * 5.2);
  state.camera.x += (wantX - state.camera.x) * follow;
  state.camera.y += (wantY - state.camera.y) * follow;
  if (clampCamera) clampCamera(state.camera);
  state.camera.shake = Math.max(0, state.camera.shake - dt * 2.2);
}

// ---- jobs ---------------------------------------------------------------------------------

export function startMission(state, index) {
  const mission = MISSIONS[index];
  if (!mission) return;
  state.mission = mission;
  state.missionIndex = index;
  state.missionStage = 0;
  state.missionVerdict = null;
  state.tailLost = false;
  state.tailTarget = null;
  state.tailTimer = 0;
  state.guardsLeft = 0;
  state.carryingLedger = false;
  state.carryingCrate = false;
  state.passenger = false;
  if (mission.kind === 'raid') {
    state.guardsLeft = mission.spawn.count;
    state.police.officers.length = 0;
    for (let index2 = 0; index2 < mission.spawn.count; index2 += 1) {
      const angle = (index2 / mission.spawn.count) * Math.PI * 2;
      state.police.officers.push({
        id: 1000 + index2, x: mission.spawn.x + Math.cos(angle) * 26, y: mission.spawn.y + Math.sin(angle) * 26,
        heading: angle, hp: 60, cool: 0, aim: angle, guard: true, dead: false, step: 0, cruiser: null,
      });
    }
  }
  if (mission.kind === 'tail') {
    const node = state.police.city.nearestNode(mission.goal.x * 150 - 160, mission.goal.y * 150 - 60);
    state.tailTarget = { x: node.x, y: node.y, heading: 0 };
  }
  pushMessage(state, `JOB ${mission.number}: ${mission.title}`, 'mission', 4.5);
  pushMessage(state, mission.brief, 'info', 7);
  state.events.push({ type: 'missionStart', mission });
}

export function completeMission(state) {
  const mission = state.mission;
  if (!mission) return;
  state.player.cash += mission.money;
  state.completed.push(mission.id);
  state.mission = null;
  state.missionVerdict = 'pass';
  state.lastCompleted = mission.title;
  state.missionIndex = Math.min(MISSIONS.length - 1, state.missionIndex + 1);
  clearWanted(state.police.wanted);
  state.carryingLedger = false;
  state.carryingCrate = false;
  state.passenger = false;
  pushMessage(state, `Job done: ${mission.title}  +$${mission.money}`, 'money', 5);
  state.events.push({ type: 'missionDone', title: mission.title });
}

export function failMission(state, reason) {
  if (!state.mission) return;
  const mission = state.mission;
  state.mission = null;
  state.missionVerdict = 'fail';
  state.lastFailure = reason;
  pushMessage(state, `Job failed: ${mission.title}. ${reason}`, 'bad', 6);
  state.carryingLedger = false;
  state.carryingCrate = false;
  state.passenger = false;
  state.guardsLeft = 0;
  state.events.push({ type: 'missionFail', title: mission.title, reason });
}

function stepJob(game, dt) {
  const { state, city } = game;
  const here = state.vehicle ?? state.player;
  if (!state.mission) {
    const next = MISSIONS[state.missionIndex];
    if (!next) return;
    const point = missionPoint(next.start);
    if (distance(here.x, here.y, point.x, point.y) < 32) startMission(state, state.missionIndex);
    return;
  }
  const mission = state.mission;
  const goal = missionPoint(mission.goal);
  switch (mission.kind) {
    case 'carry': {
      if (!state.carryingLedger && distance(here.x, here.y, goal.x, goal.y) < 34) {
        state.carryingLedger = true;
        state.events.push({ type: 'pickup', label: 'Ledger' });
        pushMessage(state, 'Got the ledger. Della wants it back on Crater Row.', 'money', 4);
      }
      if (state.carryingLedger) {
        const home = missionPoint(MISSIONS[0].start);
        if (distance(here.x, here.y, home.x, home.y) < 36) completeMission(state);
      }
      break;
    }
    case 'tail': {
      const tail = state.tailTarget;
      state.tailTimer += dt;
      if (tail) {
        const from = city.nearestNode(tail.x, tail.y);
        const to = city.nearestNode(goal.x, goal.y);
        const route = city.route(from.id, to.id);
        const next = route.length > 0 ? city.nodes[route[0]] : city.nodes[to.id];
        const angle = Math.atan2(next.y - tail.y, next.x - tail.x);
        const speed = 84;
        tail.x += Math.cos(angle) * speed * dt;
        tail.y += Math.sin(angle) * speed * dt;
        tail.heading = angle;
        if (distance(tail.x, tail.y, goal.x, goal.y) < 26) completeMission(state);
        const gap = distance(here.x, here.y, tail.x, tail.y);
        if (gap > 300) state.tailLost = true;
        if (state.tailLost && gap > 380) failMission(state, 'You lost the cruiser.');
      }
      break;
    }
    case 'raid': {
      if (state.guardsLeft <= 0 && !state.carryingLedger && distance(here.x, here.y, goal.x, goal.y) < 30) {
        state.carryingLedger = true;
        state.events.push({ type: 'pickup', label: 'Case' });
        pushMessage(state, 'Ledger copy in hand. Vex is waiting in Sunmere.', 'money', 4);
      }
      if (state.carryingLedger) {
        const drop = missionPoint({ x: 3.4, y: 3.5 });
        if (distance(here.x, here.y, drop.x, drop.y) < 34) completeMission(state);
      }
      break;
    }
    case 'escort': {
      if (!state.passenger && state.vehicle && distance(state.vehicle.x, state.vehicle.y, goal.x, goal.y) < 40) {
        state.passenger = true;
        state.vehicle.occupancy = 2;
        pushMessage(state, 'Vex is in. The stripes heard. Go.', 'mission', 5);
        addHeat(state.police.wanted, 150);
      }
      if (state.passenger) {
        if (!state.vehicle) failMission(state, 'You left the car with Vex in it.');
        else {
          const home = missionPoint(mission.goal);
          if (distance(state.vehicle.x, state.vehicle.y, home.x, home.y) < 36) completeMission(state);
        }
      }
      break;
    }
    case 'heist': {
      if (!state.carryingCrate && distance(here.x, here.y, goal.x, goal.y) < 36) {
        state.carryingCrate = true;
        state.events.push({ type: 'pickup', label: 'Crate' });
        pushMessage(state, 'Crate in the boot. The bank called it in.', 'money', 4);
        addHeat(state.police.wanted, 180);
      }
      if (state.carryingCrate) {
        const homeStart = missionPoint(MISSIONS[4].start);
        if (distance(here.x, here.y, homeStart.x, homeStart.y) < 38) completeMission(state);
      }
      break;
    }
    default:
      break;
  }
  if (state.player.hp <= 0) failMission(state, 'You went down on the job.');
}

// World-space markers the renderer draws as gold arrows and the minimap as blips.
export function markerPoints(state) {
  const markers = [];
  if (state.mission) {
    const mission = state.mission;
    if (mission.kind === 'carry' && state.carryingLedger) {
      const home = missionPoint(MISSIONS[0].start);
      markers.push({ x: home.x, y: home.y, kind: 'goal', label: 'Della' });
    } else if (mission.kind === 'raid' && state.carryingLedger) {
      const drop = missionPoint({ x: 3.4, y: 3.5 });
      markers.push({ x: drop.x, y: drop.y, kind: 'goal', label: 'Vex' });
    } else if (mission.kind === 'heist' && state.carryingCrate) {
      const home = missionPoint(MISSIONS[4].start);
      markers.push({ x: home.x, y: home.y, kind: 'goal', label: 'Kitchen' });
    } else {
      const goal = missionPoint(mission.goal);
      markers.push({ x: goal.x, y: goal.y, kind: 'goal', label: mission.title });
    }
  } else {
    const next = MISSIONS[state.missionIndex];
    if (next) {
      const start = missionPoint(next.start);
      markers.push({ x: start.x, y: start.y, kind: 'job', label: next.title });
    }
  }
  return markers;
}

export function districtName(state) {
  const here = state.vehicle ?? state.player;
  return districtAt(here.x, here.y).name;
}

export function respawnPedestrians(game) {
  const { city, routes, random, state } = game;
  state.peds.length = 0;
  for (let index = 0; index < PEDESTRIAN_COUNT; index += 1) {
    const node = city.nodes[random.int(0, city.nodes.length - 1)];
    const ped = createPedestrian(city, random, node.x + random.range(-24, 24), node.y + random.range(-24, 24));
    ped.route = routes[node.id];
    ped.routeIndex = 0;
    ped.walkTarget = ped.route[0];
    state.peds.push(ped);
  }
}

export { PLAYER_RADIUS };
