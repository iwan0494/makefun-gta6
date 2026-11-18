// police.js — the wanted level from one to five stars. Heat rises with each crime, the stars
// are cut from the heat, officers give chase while it is up, and with no officer in sight the
// heat cools. The department answers in a step: a foot patrol, then a cruiser, then a second
// cruiser, and at the top of the scale a roadblock ahead of you.
import { CELL, COP_CAR_SLOTS, FOOT_COP_SLOTS, LANE, WANTED_DECAY_DELAY, WANTED_DECAY_RATE, WANTED_THRESHOLDS } from './config.js';
import { collideCars, createCruiser, headingBetween, laneCenter, turnToward } from './entities.js';

export const CRIMES = {
  assault: 12,
  police: 34,
  theft: 50,
  gunfire: 10,
  vehicle: 18,
  kill: 40,
};

export function createWanted() {
  return { heat: 0, stars: 0, sinceCrime: 0, chaseTime: 0, seen: false, busted: 0, roadblock: 0 };
}

export function starsFor(heat) {
  let stars = 0;
  while (stars < 5 && heat >= WANTED_THRESHOLDS[stars + 1]) stars += 1;
  return stars;
}

export function addHeat(wanted, amount) {
  wanted.heat = Math.min(600, wanted.heat + amount);
  wanted.sinceCrime = 0;
  wanted.stars = starsFor(wanted.heat);
}

export function clearWanted(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.sinceCrime = 0;
  wanted.busted = 0;
}

export function stepWanted(wanted, dt, seenByPolice, sirenMuted) {
  if (wanted.heat <= 0) {
    wanted.stars = 0;
    return;
  }
  wanted.chaseTime += dt;
  wanted.sinceCrime += dt;
  if (seenByPolice) wanted.sinceCrime = 0;
  if (!seenByPolice && wanted.sinceCrime > WANTED_DECAY_DELAY) {
    wanted.heat = Math.max(0, wanted.heat - WANTED_DECAY_RATE * dt * (sirenMuted ? 1.6 : 1));
  }
  wanted.stars = starsFor(wanted.heat);
}

export function createOfficer(id, x, y, cruiser) {
  return {
    id,
    x, y,
    heading: 0,
    vx: 0, vy: 0,
    hp: 55,
    maxHp: 55,
    cool: 0,
    aim: 0,
    cruiser,
    state: 'move',
    dead: false,
    bodyAngle: 0,
    step: Math.random() * 6,
  };
}

export function createPolice(city, random) {
  const wanted = createWanted();
  const officers = [];
  const cruisers = [];
  const bullets = [];
  for (let index = 0; index < COP_CAR_SLOTS; index += 1) cruisers.push(null);
  for (let index = 0; index < FOOT_COP_SLOTS; index += 1) officers.push(null);
  const nextIds = { officer: 1, cruiser: 1, bullet: 1 };
  return {
    wanted,
    officers,
    cruisers,
    bullets,
    city,
    random,
    nextIds,
    callUp: false,
    blockNextNode: -1,
  };
}

function spawnPointBehind(city, px, py, random, minDistance = 220) {
  const target = city.nearestNode(px, py);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const node = city.nodes[random.int(0, city.nodes.length - 1)];
    const distance = Math.hypot(node.x - px, node.y - py);
    if (distance < minDistance) continue;
    if (node.id === target.id) continue;
    return node;
  }
  return city.nodes[random.int(0, city.nodes.length - 1)];
}

// A route of node ids, recomputed when a car reaches its last node or loses its mind.
function planRoute(city, fromNode, toX, toY) {
  const target = city.nearestNode(toX, toY);
  return { route: city.route(fromNode, target.id), target: target.id };
}

function steerAlong(route, city, x, y, heading, speed, dt) {
  if (route.length === 0) return { x, y, heading, done: true };
  const nextId = route[0];
  const node = city.nodes[nextId];
  const distance = Math.hypot(node.x - x, node.y - y);
  if (distance < CELL * 0.55) route.shift();
  const aim = route.length > 0 ? laneCenter(node, city.nodes[route[0]], 1) : { x: node.x, y: node.y };
  const wantedHeading = headingBetween(x, y, aim.x, aim.y);
  const next = turnToward(heading, wantedHeading, 5.2 * dt);
  const brake = Math.abs(turnToward(heading, wantedHeading, 10)) > 0.7 ? 0.55 : 1;
  return {
    x: x + Math.cos(next) * speed * brake * dt,
    y: y + Math.sin(next) * speed * brake * dt,
    heading: next,
    done: false,
  };
}

export function spawnFootOfficer(police, x, y) {
  const index = police.officers.indexOf(null);
  if (index === -1) return null;
  const officer = createOfficer(police.nextIds.officer++, x, y, null);
  police.officers[index] = officer;
  index === -1;
  return { officer, slot: index };
}

export function spawnCruiser(police, x, y) {
  const index = police.cruisers.indexOf(null);
  if (index === -1) return null;
  const cruiser = createCruiser(police.city, x, y);
  cruiser.id = police.nextIds.cruiser++;
  cruiser.route = [];
  cruiser.replan = 0;
  police.cruisers[index] = cruiser;
  return { cruiser, slot: index };
}

export function shootAt(police, shooter, target, speed = 420, damage = 10) {
  const angle = Math.atan2(target.y - shooter.y, target.x - shooter.x) + (Math.random() - 0.5) * 0.16;
  police.bullets.push({
    id: police.nextIds.bullet++,
    x: shooter.x + Math.cos(angle) * 12,
    y: shooter.y + Math.sin(angle) * 12,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.7,
    friendly: shooter.friendly === true,
    damage,
  });
}

export function aimAtMurder(police, shooter, target) {
  const angle = Math.atan2(target.y - shooter.y, target.x - shooter.x) + (Math.random() - 0.5) * 0.24;
  police.bullets.push({
    id: police.nextIds.bullet++,
    x: shooter.x + Math.cos(angle) * 12,
    y: shooter.y + Math.sin(angle) * 12,
    vx: Math.cos(angle) * 470,
    vy: Math.sin(angle) * 470,
    life: 0.6,
    friendly: true,
    damage: 9,
  });
}

export function nearestOfficerDistance(police, x, y) {
  let best = Infinity;
  for (const officer of police.officers) {
    if (!officer || officer.dead) continue;
    best = Math.min(best, Math.hypot(officer.x - x, officer.y - y));
  }
  for (const cruiser of police.cruisers) {
    if (!cruiser) continue;
    best = Math.min(best, Math.hypot(cruiser.x - x, cruiser.y - y));
  }
  return best;
}

// Advance the department one step: keep the wanted level's patrol strength, drive the cruisers,
// walk and shoot the officers, move the bullets. `player` is the game's player object; hits
// return a summary so game.js decides what they mean.
export function stepPolice(police, dt, player, active, onHit, onGrounded) {
  const wanted = police.wanted;
  const city = police.city;
  const px = player.x;
  const py = player.y;
  const stars = wanted.stars;
  stepWanted(wanted, dt, active && nearestOfficerDistance(police, px, py) < 210, false);

  const cruisersWanted = stars >= 2 ? Math.min(COP_CAR_SLOTS, stars - 1) : 0;
  const officersWanted = stars >= 1 ? Math.min(FOOT_COP_SLOTS, stars) : 0;

  let cruisersAlive = police.cruisers.filter(Boolean).length;
  if (cruisersAlive < cruisersWanted && police.wanted.stars > 0) {
    const spot = spawnPointBehind(city, px, py, police.random, 200 + police.random.range(0, 160));
    if (spawnCruiser(police, spot.x, spot.y)) cruisersAlive += 1;
  }
  let officersAlive = police.officers.filter((officer) => officer && !officer.dead).length;
  if (officersAlive < officersWanted) {
    // Foot patrols appear near the player once the department knows a street to look on.
    const angle = police.random.range(0, Math.PI * 2);
    const distance = 150 + police.random.range(0, 90);
    const x = Math.max(CELL / 2, Math.min(city.bounds.maxX, px + Math.cos(angle) * distance));
    const y = Math.max(CELL / 2, Math.min(city.bounds.maxY, py + Math.sin(angle) * distance));
    if (spawnFootOfficer(police, x, y)) officersAlive += 1;
  }
  if (police.wanted.stars === 0) {
    for (let index = 0; index < police.cruisers.length; index += 1) {
      const cruiser = police.cruisers[index];
      if (cruiser) cruiser.fade = (cruiser.fade ?? 0) + dt;
      if (cruiser && cruiser.fade > 3) police.cruisers[index] = null;
    }
    for (let index = 0; index < police.officers.length; index += 1) {
      const officer = police.officers[index];
      if (officer) police.officers[index] = null;
    }
    police.bullets.length = 0;
    return;
  }

  for (let index = 0; index < police.cruisers.length; index += 1) {
    const cruiser = police.cruisers[index];
    if (!cruiser) continue;
    cruiser.fade = 0;
    cruiser.replan -= dt;
    const playerDistance = Math.hypot(px - cruiser.x, py - cruiser.y);
    if (cruiser.replan <= 0 || cruiser.route.length === 0) {
      const from = city.nearestNode(cruiser.x, cruiser.y);
      const plan = planRoute(city, from.id, px, py);
      cruiser.route = plan.route;
      cruiser.replan = 1.2;
    }
    const speed = 108 + stars * 13;
    const movement = steerAlong(cruiser.route, city, cruiser.x, cruiser.y, cruiser.heading, speed, dt);
    cruiser.x = movement.x;
    cruiser.y = movement.y;
    cruiser.heading = movement.heading;
    cruiser.vx = Math.cos(cruiser.heading) * speed;
    cruiser.vy = Math.sin(cruiser.heading) * speed;
    cruiser.siren = true;
    cruiser.brakeLights = 0;
    if (playerDistance < 34) {
      // A cruiser alongside a car on foot brings its officers out.
      const officer = createOfficer(police.nextIds.officer++, cruiser.x + 12, cruiser.y + 10, cruiser);
      police.officers.push(officer);
      const trimmed = police.officers.length > FOOT_COP_SLOTS * 2 + 2 ? police.officers.splice(0, 1) : [];
      trimmed.length;
      cruiser.speed = 0;
      cruiser.stopTimer = 2;
    }
    if (onGrounded && playerDistance < 3) onGrounded();
  }
  for (const cruiser of police.cruisers) if (cruiser && cruiser.stopTimer > 0) cruiser.stopTimer -= dt;

  for (let index = 0; index < police.officers.length; index += 1) {
    const officer = police.officers[index];
    if (!officer) continue;
    if (officer.dead) {
      officer.deadTimer = (officer.deadTimer ?? 0) + dt;
      if (officer.deadTimer > 9) police.officers[index] = null;
      continue;
    }
    const dx = px - officer.x;
    const dy = py - officer.y;
    const distance = Math.hypot(dx, dy);
    officer.aim = Math.atan2(dy, dx);
    officer.step += dt * (distance > 60 ? 10 : 2);
    officer.cool -= dt;
    if (distance > 38) {
      const speed = 66;
      officer.x += (dx / distance) * speed * dt;
      officer.y += (dy / distance) * speed * dt;
      officer.heading = officer.aim;
    }
    if (distance < 230 && officer.cool <= 0 && active) {
      officer.cool = 1.25 + Math.random() * 0.9;
      aimAtMurder(police, officer, player);
    }
  }

  for (let index = police.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = police.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let remove = bullet.life <= 0;
    if (!remove && Math.abs(bullet.x - px) < 8 && Math.abs(bullet.y - py) < 8) {
      remove = true;
      if (bullet.friendly) onHit(bullet.damage, bullet);
    }
    if (!remove) {
      for (const cruiser of police.cruisers) {
        if (cruiser && Math.abs(cruiser.x - bullet.x) < 12 && Math.abs(cruiser.y - bullet.y) < 12) {
          remove = true;
          break;
        }
      }
    }
    if (remove) police.bullets.splice(index, 1);
  }
  void collideCars;
  void LANE;
}
