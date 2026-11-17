// entities.js — the things that move: the player's car, traffic, police cruisers, pedestrians
// and the player on foot. They share a few small helpers (lane assignment, lane following,
// point-to-segment distance) but each step is its own short function so the HUD can explain
// what any of them is doing.
import {
  CAR_ACCEL, CAR_BRAKE, CAR_GRIP, CAR_MAX_SPEED, CAR_REVERSE, LANE, VEHICLE_TYPES, WORLD,
} from './config.js';
import { CELL, ROAD } from './config.js';
import { hitsBuilding } from './city.js';

let nextId = 1;

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { x: cx, y: cy, distance: Math.hypot(px - cx, py - cy), t };
}

// The centre of the right-hand lane of an edge, in the driving direction a -> b.
export function laneCenter(a, b, side = 1) {
  if (a.y === b.y) return a.x < b.x ? { x: (a.x + b.x) / 2, y: a.y + LANE * side } : { x: (a.x + b.x) / 2, y: a.y - LANE * side };
  return a.y < b.y ? { x: a.x + LANE * side, y: (a.y + b.y) / 2 } : { x: a.x - LANE * side, y: (a.y + b.y) / 2 };
}

export function headingBetween(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function createVehicle(city, type, x, y, heading, random) {
  const spec = VEHICLE_TYPES[type];
  const from = city.nearestNode(x, y);
  return {
    id: nextId++,
    type,
    x, y, heading, vx: 0, vy: 0,
    spec,
    color: random.pick(spec.colors),
    occupancy: 1,
    road: from.id,
    nextNode: -1,
    laneSide: 1,
    path: [],
    timer: random.range(0, 2),
    hornTimer: 0,
    driver: true,
    stolen: false,
    brakeLights: 0,
    maxSpeed: CAR_MAX_SPEED * spec.speed,
  };
}

export function createTraffic(city, random, count) {
  const list = [];
  const types = ['sedan', 'sedan', 'taxi', 'van', 'coupe', 'sedan', 'taxi', 'coupe'];
  const edges = city.edges;
  for (let index = 0; index < count; index += 1) {
    const edge = random.pick(edges);
    const t = random.range(0.2, 0.8);
    const a = city.nodes[edge.a];
    const b = city.nodes[edge.b];
    const car = createVehicle(city, random.pick(types), a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, headingBetween(a.x, a.y, b.x, b.y), random);
    car.road = edge.a;
    car.nextNode = edge.b;
    car.vx = Math.cos(car.heading) * 40;
    car.vy = Math.sin(car.heading) * 40;
    list.push(car);
  }
  return list;
}

export function createParkedCars(city, random) {
  const list = [];
  const types = ['sedan', 'coupe', 'van', 'sedan', 'coupe', 'taxi'];
  for (const spot of city.parking) {
    if (random.chance(0.3)) continue;
    const building = hitsBuilding(city.buildings, spot.x, spot.y, 12);
    if (building) continue;
    const car = createVehicle(city, random.pick(types), spot.x, spot.y, spot.angle, random);
    car.vx = 0;
    car.vy = 0;
    car.driver = false;
    car.road = city.nearestNode(car.x, car.y).id;
    list.push(car);
  }
  return list;
}

export function createCruiser(city, x, y) {
  // The cruiser paint is fixed, but createVehicle still draws its idle timer from the random
  // source, so the stub has to answer range() as well as pick().
  const fixedRandom = { pick: () => '#e8e8ea', range: (low, high) => (low + high) / 2 };
  const car = createVehicle(city, 'cruiser', x, y, 0, fixedRandom);
  car.driver = true;
  car.siren = false;
  car.road = city.nearestNode(x, y).id;
  car.nextNode = -1;
  return car;
}

export function createPedestrian(city, random, x, y) {
  return {
    id: nextId++,
    x, y,
    heading: random.range(0, Math.PI * 2),
    speed: random.range(15, 23),
    baseSpeed: 0,
    walkPhase: random.range(0, 10),
    coat: random.pick(['#4a5a78', '#7a3f3f', '#3f6b52', '#6b5a3f', '#5a4a6b', '#8a8a8a', '#a0524b', '#2f4f6b']),
    skin: random.pick(['#c99a72', '#8d6246', '#5d4030', '#e0b795', '#a77c5c']),
    hat: random.chance(0.25),
    bag: random.chance(0.3),
    panicked: 0,
    knocked: 0,
    dead: false,
    walkTarget: { x, y },
    idle: random.range(0, 3),
  };
}

export function pedestrianPay(vehicle) {
  return Math.max(1, Math.round(vehicle.occupancy * 0.45));
}

// Traffic keeps to the right lane of a sparse grid, picks a random turn at every junction and
// stops behind whatever is ahead. Blocking the lane for a while earns a horn.
export function stepTraffic(car, dt, city, cars, random) {
  if (!car.driver || car.stolen) return;
  if (car.nextNode === -1) {
    const choice = city.nodes[car.road].next[random.int(0, city.nodes[car.road].next.length - 1)];
    car.nextNode = choice.to;
  }
  const from = city.nodes[car.road];
  const to = city.nodes[car.nextNode];
  const target = laneCenter(from, to, car.laneSide);
  const desired = headingBetween(car.x, car.y, target.x, target.y);
  const atLane = Math.hypot(target.x - car.x, target.y - car.y);
  if (atLane < 3 && car.nextNode !== -1) {
    const options = city.nodes[car.nextNode].next.filter((link) => link.to !== car.road);
    const link = options.length > 0 && random.chance(0.35) ? random.pick(options) : (city.nodes[car.nextNode].next.find((item) => item.to !== car.road) ?? options[0]);
    car.road = car.nextNode;
    car.nextNode = link ? link.to : car.road;
  }
  car.heading = turnToward(car.heading, desired, 4.2 * dt);
  let speed = Math.min(car.maxSpeed * 0.62, 66);
  for (const other of cars) {
    if (other === car || !other.driver || other.stolen) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.heading) + dy * Math.sin(car.heading);
    const side = Math.abs(-dx * Math.sin(car.heading) + dy * Math.cos(car.heading));
    if (ahead > 0 && ahead < 30 && side < 7) speed = Math.min(speed, Math.max(0, (ahead - 15) * 4));
  }
  car.vx = Math.cos(car.heading) * speed;
  car.vy = Math.sin(car.heading) * speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.brakeLights = speed < 10 ? 1 : 0;
  car.x = Math.max(ROAD, Math.min(WORLD - ROAD, car.x));
  car.y = Math.max(ROAD, Math.min(WORLD - ROAD, car.y));
}

export function turnToward(angle, target, maxTurn) {
  let delta = target - angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, delta));
}

// The player's car: throttle and brake as forward/back speed along the heading, steering that
// needs some speed to bite, and a light lateral grip so the rear can slide out on a fast turn.
export function stepPlayerCar(car, dt, controls) {
  const throttle = controls.forward ? 1 : 0;
  const brake = controls.back ? 1 : 0;
  const steer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  let speed = car.vx * Math.cos(car.heading) + car.vy * Math.sin(car.heading);
  if (throttle) speed += CAR_ACCEL * dt;
  if (brake) speed -= (speed > 0 ? CAR_BRAKE : CAR_REVERSE * 2) * dt;
  if (!throttle && !brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 70 * dt);
  speed = Math.max(-CAR_REVERSE * 1.6, Math.min(car.maxSpeed * (controls.boost ? 1.28 : 1), speed));
  const steeringRate = 2.6 * Math.min(1, Math.abs(speed) / 40) * (speed < 0 ? -1 : 1);
  car.heading += steer * steeringRate * dt;
  const nextX = car.x + Math.cos(car.heading) * speed * dt;
  const nextY = car.y + Math.sin(car.heading) * speed * dt;
  const lateral = -Math.sin(car.heading) * speed;
  car.vx = Math.cos(car.heading) * speed - Math.sin(car.heading) * lateral * 0.04;
  car.vy = Math.sin(car.heading) * speed + Math.cos(car.heading) * lateral * 0.04;
  car.x = nextX;
  car.y = nextY;
  car.speed = speed;
  car.brakeLights = brake ? 1 : 0;
  car.headingLamp = throttle ? 1 : 0;
  return speed;
}

export function clampToWorld(entity, margin = 10) {
  entity.x = Math.max(margin, Math.min(WORLD - margin, entity.x));
  entity.y = Math.max(margin, Math.min(WORLD - margin, entity.y));
}

export function collideCars(car, others) {
  let impulse = 0;
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const reach = (car.spec.length + other.spec.length) * 0.36;
    const distance = Math.hypot(dx, dy);
    if (distance > reach || distance === 0) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = reach - distance;
    car.x -= nx * overlap * 0.5;
    car.y -= ny * overlap * 0.5;
    other.x += nx * overlap * 0.5;
    other.y += ny * overlap * 0.5;
    const relative = Math.hypot(car.vx - other.vx, car.vy - other.vy);
    impulse = Math.max(impulse, relative);
    const push = Math.min(60, relative * 0.45);
    car.vx -= nx * push;
    car.vy -= ny * push;
    other.vx += nx * push * 0.6;
    other.vy += ny * push * 0.6;
    if (other.driver && relative > 70 && other.hornTimer <= 0) {
      other.hornTimer = 1.4;
      other.honk = true;
    }
  }
  return impulse;
}

export function blockAgainstBuildings(entity, buildings, radius) {
  const hit = hitsBuilding(buildings, entity.x, entity.y, radius);
  if (!hit) return false;
  const left = Math.abs(entity.x + radius - hit.x);
  const right = Math.abs(hit.x + hit.w - (entity.x - radius));
  const top = Math.abs(entity.y + radius - hit.y);
  const bottom = Math.abs(hit.y + hit.h - (entity.y - radius));
  const smallest = Math.min(left, right, top, bottom);
  if (smallest === left) entity.x = hit.x - radius;
  else if (smallest === right) entity.x = hit.x + hit.w + radius;
  else if (smallest === top) entity.y = hit.y - radius;
  else entity.y = hit.y + hit.h + radius;
  entity.vx = (entity.vx ?? 0) * -0.2;
  entity.vy = (entity.vy ?? 0) * -0.2;
  return true;
}

// Pedestrians walk a loop of pavement nodes around one junction, pause on corners, and scatter
// when a gun goes off or a car comes straight at them.
export function createSidewalkRoute(city) {
  const loops = [];
  for (const node of city.nodes) {
    loops.push([
      { x: node.x + LANE, y: node.y + LANE + 4 },
      { x: node.x + 34, y: node.y + LANE + 6 },
      { x: node.x + LANE + 6, y: node.y + 34 },
      { x: node.x - LANE - 4, y: node.y + LANE + 4 },
      { x: node.x - 34, y: node.y - LANE - 4 },
      { x: node.x - LANE - 6, y: node.y - 34 },
      { x: node.x + LANE + 4, y: node.y - LANE - 4 },
      { x: node.x + 34, y: node.y - LANE - 4 },
    ]);
  }
  return loops;
}

export function stepPedestrian(ped, dt, city, scare) {
  if (ped.dead) return;
  const pace = ped.panicked > 0 ? 15 : 7.5;
  ped.walkPhase += dt * pace * (ped.speed / 20);
  if (ped.knocked > 0) {
    ped.knocked -= dt;
    ped.x += ped.knockVX * dt;
    ped.y += ped.knockVY * dt;
    ped.knockVX *= 0.94;
    ped.knockVY *= 0.94;
    clampToWorld(ped, 4);
    return;
  }
  if (ped.panicked > 0) ped.panicked -= dt;
  let speed = ped.panicked > 0 ? 64 : 20;
  if (ped.idle > 0) {
    ped.idle -= dt;
    speed = 0;
  }
  const route = ped.route;
  if (!route || route.length === 0) return;
  const target = ped.panicked > 0 ? ped.fleeTarget : route[ped.routeIndex % route.length];
  const dx = target.x - ped.x;
  const dy = target.y - ped.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 6) {
    if (ped.panicked > 0) {
      ped.fleeTarget = { x: ped.x + (Math.random() - 0.5) * 120, y: ped.y + (Math.random() - 0.5) * 120 };
    } else {
      ped.routeIndex = (ped.routeIndex + 1) % route.length;
      if (Math.random() < 0.18) ped.idle = 1 + Math.random() * 2.5;
    }
  }
  if (speed > 0 && distance > 0.01) {
    ped.heading = turnToward(ped.heading, Math.atan2(dy, dx), 7 * dt);
    ped.x += Math.cos(ped.heading) * speed * dt;
    ped.y += Math.sin(ped.heading) * speed * dt;
  }
  if (scare && Math.hypot(ped.x - scare.x, ped.y - scare.y) < scare.radius && ped.panicked <= 0) {
    ped.panicked = 3;
    ped.fleeTarget = { x: ped.x + (ped.x - scare.x) * 2.5, y: ped.y + (ped.y - scare.y) * 2.5 };
    ped.idle = 0;
  }
  clampToWorld(ped, ROAD * 0.6);
}

export function knockDown(ped, vx, vy) {
  ped.knocked = 1.6;
  ped.knockVX = vx * 1.4;
  ped.knockVY = vy * 1.4;
  ped.dead = true;
}

export function roadTint(x, y, city) {
  const gx = Math.floor(x / CELL);
  const gy = Math.floor(y / CELL);
  if (gx < 0 || gy < 0 || gx >= city.nodes.length || Math.abs(x - gx * CELL) < ROAD / 2 || Math.abs(y - gy * CELL) < ROAD / 2) return true;
  return false;
}

// The traffic car's road cursor moves along the edge it is on; when it crosses the far node it
// turns onto a random one of that node's other edges (never a U-turn), and on every step it
// aims at the centre of its lane so it hugs the right side of the street.
export function advanceTrafficRoad(car, city, random, dt) {
  const edge = city.edges[car.edge];
  if (!edge) return;
  const node = city.nodes[edge.b];
  const distance = Math.hypot(node.x - car.x, node.y - car.y);
  if (distance < 4.5) {
    const choices = node.next.filter((link) => link.to !== edge.a);
    const link = choices.length > 0 ? random.pick(choices) : node.next[0];
    if (!car.held) car.edge = link.edge;
    else car.edge = city.edges.indexOf(edge);
    car.edgeTimer = 0;
  }
  car.edgeTimer = (car.edgeTimer ?? 0) + dt;
}
