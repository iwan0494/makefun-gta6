'use strict';
// Tallow Point — police & wanted system (R4-3, fresh from the R4 spec).
// Cruisers chase the player along the road graph (BFS pathfinding),
// roadblocks appear at 3+ stars, BUSTED catches the player on foot at
// 3+ stars, and a police helicopter circles at 4-5 stars. The module owns
// its own meshes and adds/removes them from the scene itself; the game
// loop only calls updatePolice(state, dt) once per frame.

// Breadth-first path over the road graph. Returns an array of node ids
// from `fromId` to `toId` (inclusive), or null when unreachable.
function findPath(city, fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = {};
  prev[fromId] = -1;
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of neighborsOf(city, cur)) {
      if (prev[nb] !== undefined) continue;
      prev[nb] = cur;
      if (nb === toId) {
        const path = [toId];
        let at = toId;
        while (prev[at] !== -1) { at = prev[at]; path.unshift(at); }
        return path;
      }
      queue.push(nb);
    }
  }
  return null;
}

// A police cruiser: black body, white doors, a roof light bar that
// flashes red/blue. Distinct from a civilian car on purpose.
function createCruiserMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.9, 4.4),
    new THREE.MeshLambertMaterial({ color: 0x14181d }),
  );
  body.position.y = 0.65;
  g.add(body);
  const doors = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 0.55, 2.0),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  );
  doors.position.set(0, 0.72, 0.1);
  g.add(doors);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.7, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.4, -0.2);
  g.add(cabin);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 }); // Unlit: a flashing bar must read at night, when Lambert goes dark.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), barMat);
  bar.position.set(0, 1.9, -0.2);
  g.add(bar);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  for (const s of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(s[0], 0.42, s[1]);
    g.add(w);
  }
  return { group: g, barMat };
}

// A roadblock: two cruisers parked nose-to-tail across the road plus
// striped barrier boards between them.
function createRoadblockMesh() {
  const g = new THREE.Group();
  const a = createCruiserMesh();
  a.group.position.set(-2.4, 0, 0);
  a.group.rotation.y = Math.PI / 2;
  g.add(a.group);
  const b = createCruiserMesh();
  b.group.position.set(2.4, 0, 0);
  b.group.rotation.y = Math.PI / 2;
  g.add(b.group);
  const stripe = new THREE.MeshBasicMaterial({ color: 0xff5533 }); // Unlit: the orange boards must read at night.
  for (const x of [-4.6, 4.6]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 3.4), stripe);
    board.position.set(x, 0.7, 0);
    g.add(board);
  }
  return g;
}

// The helicopter: dark body, tail boom, a spinning rotor bar and a pale
// spotlight cone pointing at the ground.
function createHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 4.6),
    new THREE.MeshLambertMaterial({ color: 0x1a2027 }),
  );
  body.position.y = 0;
  g.add(body);
  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 4.0),
    new THREE.MeshLambertMaterial({ color: 0x1a2027 }),
  );
  boom.position.set(0, 0.3, -4.0);
  g.add(boom);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x333333 }),
  );
  rotor.position.y = 1.0;
  g.add(rotor);
  const coneMat = new THREE.MeshLambertMaterial({
    color: 0xfff6c0, transparent: true, opacity: 0.16,
  });
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(9, 38, 12, 1, true), coneMat,
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -20;
  g.add(cone);
  return { group: g, rotor };
}

function createPolice(state, scene) {
  const police = {
    scene,
    cruisers: [],
    roadblocks: [],
    heli: null, heliActive: false,
    bustT: 0, spawnT: 0, ramT: 0,
    nextId: 0,
  };
  return police;
}

function removePoliceMeshes(police) {
  for (const c of police.cruisers) police.scene.remove(c.mesh.group);
  for (const r of police.roadblocks) police.scene.remove(r.mesh);
  if (police.heli) police.scene.remove(police.heli.mesh.group);
  police.cruisers = [];
  police.roadblocks = [];
  police.heli = null;
  police.heliActive = false;
  police.bustT = 0;
}

function resetPolice(police) {
  removePoliceMeshes(police);
  police.spawnT = 0;
  police.ramT = 0;
  police.nextId = 0;
}

// Spawn one cruiser on a road node some distance from the player.
function spawnCruiser(state, police) {
  const city = state.city;
  const p = state.player;
  const rng = state.rng;
  let node = null;
  for (let tries = 0; tries < 12; tries++) {
    const cand = rng.pick(city.nodes);
    const d = Math.hypot(cand.x - p.x, cand.z - p.z);
    if (d > 45 && d < 110) { node = cand; break; }
  }
  if (!node) node = nearestNode(city, p.x + 60, p.z);
  const built = createCruiserMesh();
  built.group.position.set(node.x, 0, node.z);
  police.scene.add(built.group);
  const cruiser = {
    id: 'cruiser-' + (police.nextId++),
    kind: 'cruiser',
    x: node.x, z: node.z, heading: 0, speed: 0,
    node: node.id, target: node.id,
    path: [], pathI: 0, playerNode: -1,
    hp: 100, disabledT: 0, flashT: 0,
    mesh: built,
  };
  police.cruisers.push(cruiser);
  return cruiser;
}

// Place a roadblock on the road ahead of the player, across the lane.
function placeRoadblock(state, police) {
  const city = state.city;
  const p = state.player;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const ax = p.x + fx * 55;
  const az = p.z + fz * 55;
  const node = nearestNode(city, ax, az);
  const mesh = createRoadblockMesh();
  mesh.position.set(node.x, 0, node.z);
  mesh.rotation.y = Math.atan2(fx, fz) + Math.PI / 2;
  police.scene.add(mesh);
  police.roadblocks.push({
    x: node.x, z: node.z, heading: p.heading, mesh, hit: false,
  });
}

// Stage a chase for the police screenshot preset: two cruisers closing
// in behind the player and a roadblock on the road ahead.
function stageChase(state, police) {
  const city = state.city;
  const p = state.player;
  for (let i = 0; i < 2; i++) {
    const c = spawnCruiser(state, police);
    const behind = 26 + i * 14;
    c.x = p.x - Math.sin(p.heading) * behind;
    c.z = p.z - Math.cos(p.heading) * behind;
    c.heading = p.heading;
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
    // The teleport moved it off its spawn node: re-anchor the chase to
    // the node it actually stands on, or it would drive back to spawn.
    c.node = nearestNode(city, c.x, c.z).id;
    c.target = c.node;
    c.path = [];
    c.pathI = 0;
  }
  // One more cruiser, head-on: the chase camera looks forward, so the two
  // behind the player never enter the frame. A cruiser closing in from the
  // front is the one the police screenshot actually shows.
  const headOn = spawnCruiser(state, police);
  const aheadGap = 22;
  headOn.x = p.x + Math.sin(p.heading) * aheadGap;
  headOn.z = p.z + Math.cos(p.heading) * aheadGap;
  headOn.heading = p.heading + Math.PI;
  headOn.mesh.group.position.set(headOn.x, 0, headOn.z);
  headOn.mesh.group.rotation.y = headOn.heading;
  headOn.node = nearestNode(city, headOn.x, headOn.z).id;
  headOn.target = headOn.node;
  headOn.path = [];
  headOn.pathI = 0;
  placeRoadblock(state, police);
}

// Chase update: spawn/despawn by wanted level, drive cruisers along BFS
// paths toward the player's node, ram the player, catch them on foot.
function updatePolice(state, dt) {
  const police = state.police;
  if (!police) return;
  const city = state.city;
  const p = state.player;

  // Wanted level decides the fleet: one cruiser per star, up to four.
  const want = Math.min(state.stars, 4);
  police.spawnT -= dt;
  if (police.cruisers.length < want && police.spawnT <= 0) {
    spawnCruiser(state, police);
    police.spawnT = 1.5;
  }
  if (police.cruisers.length > want) {
    // Heat cooled off: the furthest cruiser gives up and drives away.
    let worst = police.cruisers[0];
    let worstD = -1;
    for (const c of police.cruisers) {
      const d = dist2(c.x, c.z, p.x, p.z);
      if (d > worstD) { worstD = d; worst = c; }
    }
    police.scene.remove(worst.mesh.group);
    police.cruisers.splice(police.cruisers.indexOf(worst), 1);
  }

  // Roadblocks at 3+ stars, one at a time, ahead of the player.
  if (state.stars >= CFG.wanted.roadblockAtStar && police.roadblocks.length === 0) {
    placeRoadblock(state, police);
  }
  if (state.stars < CFG.wanted.roadblockAtStar && police.roadblocks.length > 0) {
    for (const r of police.roadblocks) police.scene.remove(r.mesh);
    police.roadblocks = [];
  }
  // Smashing through a roadblock: hard crash, damage, more heat.
  for (const r of police.roadblocks) {
    if (r.hit) continue;
    const d = Math.hypot(p.x - r.x, p.z - r.z);
    if (d < 5 && !p.onFoot && Math.abs(p.speed) > 5) {
      r.hit = true;
      police.scene.remove(r.mesh);
      police.roadblocks.splice(police.roadblocks.indexOf(r), 1);
      if (p.car) p.car.speed *= -0.3;
      damagePlayer(state, 12);
      addHeat(state, 10);
      if (state.audio) state.audio.crash();
      setObjective(state, 'You smashed a roadblock — the heat is on you now.');
      break;
    }
  }

  // Helicopter at 4-5 stars: circles overhead, keeps the player spotted.
  if (state.stars >= 4 && !police.heli) {
    const built = createHeliMesh();
    built.group.position.set(p.x, 42, p.z - 10);
    police.scene.add(built.group);
    police.heli = { mesh: built, x: p.x, z: p.z };
    police.heliActive = true;
  }
  if (state.stars < 4 && police.heli) {
    police.scene.remove(police.heli.mesh.group);
    police.heli = null;
    police.heliActive = false;
  }
  if (police.heli) {
    const h = police.heli;
    h.x += (p.x - h.x) * Math.min(1, dt * 0.7);
    h.z += (p.z - h.z) * Math.min(1, dt * 0.7);
    h.mesh.group.position.set(h.x, 42 + Math.sin(state.time * 0.8) * 1.5, h.z);
    h.mesh.rotor.rotation.y += dt * 9;
    h.mesh.group.rotation.y += dt * 0.25;
  }

  // Speeding past the law: flooring it near a cruiser adds heat.
  if (!p.onFoot && Math.abs(p.speed) > 25) {
    for (const c of police.cruisers) {
      if (dist2(c.x, c.z, p.x, p.z) < 30 * 30) { addHeat(state, 3 * dt); break; }
    }
  }

  // Drive the cruisers: re-path toward the player's node, follow it.
  // A path is recomputed only when the player moved to another node or
  // the old path ran out — and it starts from the node the cruiser is
  // already driving toward. Re-pathing from the nearest node every 1.5
  // seconds made cruisers turn back toward the node they just left and
  // ping-pong around the midpoint forever (measured: 0.4 u/s).
  const playerNode = nearestNode(city, p.x, p.z).id;
  for (const c of police.cruisers) {
    if (c.disabledT > 0) continue;
    if (c.path.length === 0 || c.pathI >= c.path.length || c.playerNode !== playerNode) {
      const path = findPath(city, c.target, playerNode);
      if (path && path.length > 0) {
        c.path = path;
        c.pathI = 0;
        c.playerNode = playerNode;
      }
    }
  }
  for (const c of police.cruisers) {
    // Flashing light bar.
    c.flashT += dt;
    const on = Math.floor(c.flashT * 4) % 2 === 0;
    c.mesh.barMat.color.setHex(on ? 0xff2222 : 0x2266ff);
    if (c.disabledT > 0) {
      c.disabledT -= dt;
      c.speed = 0;
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.heading;
      continue;
    }
    // Arrest: at 3+ stars a cruiser that reaches the player on foot stops
    // and parks next to them instead of driving past — that is what lets
    // the BUSTED timer below run down instead of resetting every pass.
    const arresting = p.onFoot && state.stars >= CFG.wanted.bustAtStar
      && Math.hypot(c.x - p.x, c.z - p.z) < 6;
    if (arresting) {
      c.speed = 0;
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.heading;
      continue;
    }
    const cruise = 12 + state.stars * 2.5;
    let tx = p.x;
    let tz = p.z;
    if (c.path.length > 1 && c.pathI < c.path.length) {
      const node = city.nodes[c.path[c.pathI]];
      tx = node.x; tz = node.z;
      if (Math.hypot(tx - c.x, tz - c.z) < 3) {
        c.node = c.path[c.pathI];
        c.pathI++;
        if (c.pathI < c.path.length) {
          const next = city.nodes[c.path[c.pathI]];
          tx = next.x; tz = next.z;
          c.target = c.path[c.pathI];
        } else {
          c.target = playerNode;
        }
      }
    }
    const wantHeading = Math.atan2(tx - c.x, tz - c.z);
    c.heading = turnToward(c.heading, wantHeading, 2.2 * dt);
    c.speed += (cruise - c.speed) * Math.min(1, dt * 1.5);
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
  }

  // Ramming the player on foot hurts; the cruiser slows for the hit.
  // A cruiser parked to make an arrest does not ram — it waits.
  police.ramT -= dt;
  for (const c of police.cruisers) {
    if (c.disabledT > 0) continue;
    if (p.onFoot && state.stars >= CFG.wanted.bustAtStar
      && Math.hypot(c.x - p.x, c.z - p.z) < 6) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < 3.2 && police.ramT <= 0) {
      police.ramT = 0.6;
      c.speed *= 0.4;
      if (p.onFoot) damagePlayer(state, 8);
      else if (p.car) { p.car.speed *= 0.7; damagePlayer(state, 4); }
    }
  }

  // BUSTED: 3+ stars, on foot, a cruiser right on top of the player.
  if (state.stars >= CFG.wanted.bustAtStar && p.onFoot && state.mode === 'playing') {
    let near = false;
    for (const c of police.cruisers) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 4.5) { near = true; break; }
    }
    if (near) {
      police.bustT += dt;
      if (police.bustT >= 1.2) {
        police.bustT = 0;
        state.mode = 'busted';
        state.bustedAt = state.time;
        setObjective(state, 'BUSTED — press R to get back on your feet.');
        if (state.audio) state.audio.busted();
      }
    } else {
      police.bustT = 0;
    }
  } else {
    police.bustT = 0;
  }
}
