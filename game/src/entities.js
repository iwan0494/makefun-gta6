'use strict';
// Tallow Point — entities (R4-2, fresh from the R4 spec).
// The living things of the city: the player on foot, parked and moving
// cars, and pedestrians. Factories return plain data objects; each one
// carries a THREE mesh that the game loop positions every frame.
// Heading convention: heading 0 faces +z (south), PI/2 faces +x (east),
// forward = (sin h, cos h), right = (-cos h, sin h).

const CAR_COLORS = [
  0xc23b2e, 0x2e6fc2, 0xd8b13c, 0x3a9e5f,
  0x7a4a9e, 0xd8d8d8, 0x22262a, 0xb0662a,
];

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Heading that looks from (x1, z1) toward (x2, z2).
function headingTo(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, z2 - z1);
}

// A low-poly car: body, dark cabin, four wheels. Length runs along +z
// when rotation.y is 0, so mesh.rotation.y = heading points it forward.
function createCarMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.9, 4.4),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.65;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.75, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.45, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const spots = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  for (const s of spots) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(s[0], 0.42, s[1]);
    g.add(w);
  }
  return g;
}

// A walker: legs, torso, head. About 1.8 units tall.
function createPedMesh(color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.75, 0.32),
    new THREE.MeshLambertMaterial({ color }),
  );
  torso.position.y = 1.05;
  g.add(torso);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
  );
  legs.position.y = 0.35;
  g.add(legs);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.65;
  g.add(head);
  return g;
}

// True when a point (plus a margin) sits clear of every building in its
// block. The spawn search and the movement code both need this test.
function clearOfBuildings(city, x, z, margin) {
  const block = blockAt(city, x, z);
  if (!block) return true;
  for (const b of block.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + margin
      && Math.abs(z - b.z) < b.d / 2 + margin) return false;
  }
  return true;
}

// A clear spot to stand near the safehouse: the safehouse block can grow
// a shop right over its centre, so the point is searched outward in rings
// until it stands clear of every building. Deterministic (fixed order).
// Used for the first spawn, respawns and NEW LIFE resets alike.
function findSpawnPoint(city) {
  if (clearOfBuildings(city, city.safehouse.x, city.safehouse.z, 1.5)) {
    return { x: city.safehouse.x, z: city.safehouse.z };
  }
  for (let r = 3; r <= 24; r += 3) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const nx = city.safehouse.x + Math.cos(ang) * r;
      const nz = city.safehouse.z + Math.sin(ang) * r;
      if (clearOfBuildings(city, nx, nz, 1.5)) return { x: nx, z: nz };
    }
  }
  return { x: city.safehouse.x, z: city.safehouse.z };
}

// The player starts on foot at the Crater Row safehouse (clear spot).
function makePlayer(city) {
  const spot = findSpawnPoint(city);
  const mesh = createPedMesh(0xe8e8e8);
  mesh.position.set(spot.x, 0, spot.z);
  return {
    kind: 'player',
    x: spot.x, z: spot.z,
    heading: 0, speed: 0,
    onFoot: true, car: null,
    life: 100, armor: 0,
    mesh,
  };
}

// One parked car per parking bay from the city data. A parked car lies
// along its kerb: a bay on a horizontal road faces east, on a vertical
// road it faces south.
function makeParkedCars(city, rng) {
  const cars = [];
  for (let i = 0; i < city.parking.length; i++) {
    const spot = city.parking[i];
    const color = rng.pick(CAR_COLORS);
    const mesh = createCarMesh(color);
    const heading = spot.angle === 0 ? Math.PI / 2 : 0;
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = heading;
    cars.push({
      id: 'parked-' + i, kind: 'parked',
      x: spot.x, z: spot.z, heading, speed: 0,
      color, taken: false, spot, mesh,
    });
  }
  return cars;
}

// Traffic cars live on the road graph: each one drives from its current
// node toward a target node, then picks a new target at the intersection.
function makeTrafficCars(city, rng) {
  const cars = [];
  for (let i = 0; i < CFG.car.trafficCount; i++) {
    const edge = rng.pick(city.edges);
    const from = city.nodes[edge.a];
    const to = city.nodes[edge.b];
    const t = rng.range(0.15, 0.85);
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const color = rng.pick(CAR_COLORS);
    const mesh = createCarMesh(color);
    const heading = headingTo(from.x, from.z, to.x, to.z);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    cars.push({
      id: 'traffic-' + i, kind: 'traffic',
      node: edge.a, target: edge.b,
      x, z, heading,
      speed: rng.range(7, 13), cruise: rng.range(8, 14),
      color, mesh, stopped: false,
    });
  }
  return cars;
}

// Pedestrians stroll on the sidewalk strips. Each one keeps the strip it
// walks so it can pick a new target along the same line.
function makePedestrians(city, rng, count) {
  const peds = [];
  const n = count || 18;
  for (let i = 0; i < n; i++) {
    const walk = rng.pick(city.sidewalks);
    const x = walk.along === 'z' ? walk.x : rng.range(-city.half, city.half);
    const z = walk.along === 'x' ? walk.z : rng.range(-city.half, city.half);
    const color = rng.pick([
      0xc23b2e, 0x2e6fc2, 0xd8b13c, 0x3a9e5f, 0x7a4a9e, 0xd8d8d8,
    ]);
    const mesh = createPedMesh(color);
    mesh.position.set(x, 0, z);
    const heading = rng.range(0, Math.PI * 2);
    peds.push({
      id: 'ped-' + i, x, z, heading,
      speed: rng.range(1.1, 2.0), color, mesh,
      walk, target: { x, z }, state: 'walk', fleeT: 0,
    });
  }
  return peds;
}

// Nearest parked, untaken car within maxDist of a point, or null.
function nearestParkedCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of cars) {
    if (car.kind !== 'parked' || car.taken) continue;
    const d = dist2(car.x, car.z, x, z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
