'use strict';
// Tallow Point — per-frame gameplay update (R4-2, fresh from the R4 spec).
// Moves the player (on foot and behind the wheel), drives traffic along
// the road graph, walks pedestrians on the sidewalks, handles carjacking
// and collisions, and cools the wanted heat. Traffic and pedestrians keep
// moving behind the menu so the city feels alive before START.

// A car's collision circle. Radius 2.0 (not 2.4): a parked car sits 4.4
// units off the road centreline at the kerb, so a car driving the centre
// line clears it (4.4 > 2.0 + 2.0) instead of grinding along it.
const CAR_RADIUS = 2.0;

// Every car in the world: parked (including the player's stolen one) plus
// moving traffic. Pedestrians are not cars and are not in this list.
function allCars(state) {
  return state.parkedCars.concat(state.traffic);
}

// True when a point (plus a margin) sits inside a building footprint.
function collidesBuilding(city, x, z, margin) {
  const block = blockAt(city, x, z);
  if (!block) return false;
  for (const b of block.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + margin
      && Math.abs(z - b.z) < b.d / 2 + margin) return true;
  }
  return false;
}

// Move to (nx, nz); slide along walls by trying x-only, then z-only.
// Returns true when the object moved at all.
function moveWithCollision(city, obj, nx, nz, margin) {
  if (!collidesBuilding(city, nx, nz, margin)) { obj.x = nx; obj.z = nz; return true; }
  if (!collidesBuilding(city, nx, obj.z, margin)) { obj.x = nx; return true; }
  if (!collidesBuilding(city, obj.x, nz, margin)) { obj.z = nz; return true; }
  return false;
}

function clampToCity(city, obj) {
  const m = city.half + 30;
  obj.x = Math.max(-m, Math.min(m, obj.x));
  obj.z = Math.max(-m, Math.min(m, obj.z));
}

// Neighbours of a graph node, by scanning the edge list.
function neighborsOf(city, nodeId) {
  const out = [];
  for (const e of city.edges) {
    if (e.a === nodeId) out.push(e.b);
    else if (e.b === nodeId) out.push(e.a);
  }
  return out;
}

// Turn heading toward a target heading, at most maxTurn radians.
function turnToward(heading, target, maxTurn) {
  let d = target - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxTurn) d = maxTurn;
  if (d < -maxTurn) d = -maxTurn;
  return heading + d;
}

// --- carjacking ---------------------------------------------------------

// Take the nearest parked car within reach. Returns true when it worked.
function stealCar(state) {
  const p = state.player;
  const car = nearestParkedCar(state.parkedCars, p.x, p.z, 4.5);
  if (!car) return false;
  p.onFoot = false;
  p.car = car;
  car.kind = 'player';
  car.taken = true;
  car.speed = 0;
  addHeat(state, CFG.wanted.stealHeat);
  setObjective(state, 'You stole a car — lose the heat, then find your next move.');
  return true;
}

// Step out of the car, back on foot beside it. The car stays parked.
function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = 3.2;
  p.x = car.x + Math.cos(car.heading) * side;
  p.z = car.z - Math.sin(car.heading) * side;
  p.heading = car.heading;
  p.onFoot = true;
  p.car = null;
  car.kind = 'parked';
  car.taken = false;
  car.speed = 0;
}

// Back to the safehouse on foot, healthy, heat cleared. R restarts a life.
// The respawn point is the same searched clear spot as the first spawn,
// never the raw block centre (a shop can stand there).
function respawnPlayer(state) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    car.kind = 'parked'; car.taken = false; car.speed = 0;
    p.car = null;
  }
  const spot = findSpawnPoint(state.city);
  p.x = spot.x;
  p.z = spot.z;
  p.heading = 0;
  p.onFoot = true;
  p.speed = 0;
  p.life = 100;
  state.heat = 0;
  state.stars = 0;
  state.mode = 'playing';
  setObjective(state, 'Back on your feet — your safehouse is in Crater Row.');
}

// --- player ---------------------------------------------------------------

function updateOnFoot(state, keys, dt) {
  const p = state.player;
  const city = state.city;
  // Arrows turn; dragging the mouse right turns right.
  p.heading += keys.turn * 2.4 * dt - keys.mouseDX * 0.004;
  const speed = keys.run ? CFG.player.runSpeed : CFG.player.walkSpeed;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const rx = -Math.cos(p.heading);
  const rz = Math.sin(p.heading);
  const mx = fx * keys.forward + rx * keys.strafe;
  const mz = fz * keys.forward + rz * keys.strafe;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    const step = speed * dt;
    moveWithCollision(city, p, p.x + (mx / len) * step, p.z + (mz / len) * step, 1.0);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  clampToCity(city, p);
}

function updateDriving(state, keys, dt) {
  const p = state.player;
  const car = p.car;
  const city = state.city;
  const maxSpeed = CFG.car.maxSpeed;
  if (keys.forward > 0) {
    car.speed += CFG.car.accel * dt;
  } else if (keys.forward < 0) {
    if (car.speed > 0.5) car.speed -= CFG.car.brake * dt;
    else car.speed -= CFG.car.accel * 0.6 * dt; // reverse
  } else {
    car.speed *= Math.max(0, 1 - 0.8 * dt); // coast drag
  }
  car.speed = Math.max(-9, Math.min(maxSpeed, car.speed));
  // Steering scales with speed and flips when reversing, like a real car.
  car.heading -= keys.strafe * CFG.car.turnRate * dt * (car.speed / maxSpeed);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const moved = moveWithCollision(
    city, car,
    car.x + fx * car.speed * dt, car.z + fz * car.speed * dt, 2.2,
  );
  if (!moved && Math.abs(car.speed) > 6) {
    car.speed *= -0.25; // hard hit: bounce back, take a knock
    p.life = Math.max(0, p.life - 4);
    state.life = p.life;
    if (state.audio) state.audio.crash();
    addHeat(state, 2);
  } else if (!moved) {
    car.speed *= 0.4;
  }
  clampToCity(city, car);
  p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = car.speed;
  // Bumps against other cars: shove apart, lose speed, make some heat.
  for (const other of allCars(state)) {
    if (other === car) continue;
    const d2 = dist2(car.x, car.z, other.x, other.z);
    const minD = CAR_RADIUS * 2;
    if (d2 < minD * minD) {
      const d = Math.sqrt(d2) || 0.01;
      const push = (minD - d) / 2;
      const ux = (car.x - other.x) / d;
      const uz = (car.z - other.z) / d;
      car.x += ux * push;
      car.z += uz * push;
      if (other.kind === 'traffic') {
        other.x -= ux * push;
        other.z -= uz * push;
        other.speed *= 0.5;
      }
      if (Math.abs(car.speed) > 8) addHeat(state, 2);
      car.speed *= 0.85;
    }
  }
}

// --- traffic --------------------------------------------------------------

function updateTraffic(state, dt) {
  const city = state.city;
  for (const car of state.traffic) {
    const target = city.nodes[car.target];
    // Right-hand traffic: steer for a point 2.5 units to the car's right
    // of the node, so oncoming cars pass each other instead of meeting
    // head-on on the centre line and deadlocking nose-to-nose forever.
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    const dx = target.x + rx * 2.5 - car.x;
    const dz = target.z + rz * 2.5 - car.z;
    const d = Math.hypot(target.x - car.x, target.z - car.z);
    car.heading = turnToward(car.heading, Math.atan2(dx, dz), 1.8 * dt);
    // A car ahead in the same lane: ease off instead of rear-ending it.
    // Only cars actually in the lane count — a parked car at the kerb
    // (4.4 units to the side) must not stop traffic on the centre line.
    // Parked cars are skipped outright: they never move, so waiting for
    // one is a permanent stop, and they sit off the driving lane anyway.
    let ahead = false;
    for (const other of allCars(state)) {
      if (other === car || other.kind === 'parked') continue;
      const ox = other.x - car.x;
      const oz = other.z - car.z;
      const along = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
      const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
      if (along > 0 && along < 9 && side < 3.2) { ahead = true; break; }
    }
    const want = ahead ? 0 : car.cruise;
    car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
    if (car.speed < 0.05) car.speed = 0;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (d < 2.5) {
      const options = neighborsOf(city, car.target).filter((n) => n !== car.node);
      const next = options.length
        ? state.rng.pick(options)
        : car.node;
      car.node = car.target;
      car.target = next;
    }
  }
}

// --- pedestrians ----------------------------------------------------------

function updatePedestrians(state, dt) {
  const city = state.city;
  for (const ped of state.pedestrians) {
    if (ped.state === 'down') continue; // downed by combat: combat owns the recovery
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      ped.x += Math.sin(ped.heading) * 3.6 * dt;
      ped.z += Math.cos(ped.heading) * 3.6 * dt;
      clampToCity(city, ped);
      continue;
    }
    let threat = null;
    for (const car of allCars(state)) {
      const d = Math.hypot(car.x - ped.x, car.z - ped.z);
      if (d < 7 && Math.abs(car.speed) > 3) { threat = car; break; }
    }
    if (threat) {
      // A car is bearing down: run away from it, off the road.
      ped.heading = Math.atan2(ped.x - threat.x, ped.z - threat.z);
      ped.fleeT = 0.9;
      ped.state = 'flee';
      continue;
    }
    ped.state = 'walk';
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      // Reached the stroll target: pick a new one along the same strip.
      const w = ped.walk;
      if (w.along === 'z') {
        ped.target = { x: w.x, z: state.rng.range(-city.half, city.half) };
      } else {
        ped.target = { x: state.rng.range(-city.half, city.half), z: w.z };
      }
      continue;
    }
    ped.heading = turnToward(ped.heading, Math.atan2(dx, dz), 3 * dt);
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
    clampToCity(city, ped);
  }
}

// --- mesh sync ------------------------------------------------------------

function syncMeshes(state) {
  const p = state.player;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  p.mesh.visible = p.onFoot;
  for (const car of state.parkedCars) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
  for (const car of state.traffic) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
  for (const ped of state.pedestrians) {
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

// --- top-level update -------------------------------------------------------

function updateGame(state, input, dt) {
  state.time += dt;
  state.hour += (dt / CFG.time.dayLengthSec) * 24;
  if (state.hour >= 24) state.hour -= 24;
  updateWanted(state, dt);
  // A police helicopter overhead keeps the player spotted: no cooling off.
  if (state.police && state.police.heliActive) state.lastCrimeAt = state.time;
  const keys = input.read();
  keys.mouseDX = input.takeMouseDX();
  // Keep the HUD life bar honest: the player object owns the real numbers.
  state.life = state.player.life;
  state.armor = state.player.armor;
  if (state.mode === 'busted' || state.mode === 'dead') {
    if (keys.respawn) respawnPlayer(state);
  } else if (state.mode === 'playing') {
    if (keys.respawn) respawnPlayer(state);
    if (keys.steal) {
      if (state.player.onFoot) stealCar(state);
      else exitCar(state);
    }
    if (keys.shoot && state.combat) shoot(state);
    if (keys.melee && state.combat) melee(state);
    if (state.player.onFoot) updateOnFoot(state, keys, dt);
    else updateDriving(state, keys, dt);
    if (state.player.life <= 0) state.mode = 'dead';
  }
  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  if (state.police) updatePolice(state, dt);
  if (state.story) updateStory(state, dt);
  if (state.combat) updateCombat(state, dt);
  if (state.audio) state.audio.tick(state, dt);
  syncMeshes(state);
  input.endFrame();
}
