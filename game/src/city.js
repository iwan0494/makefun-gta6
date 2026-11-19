'use strict';
// Tallow Point — city data, pure and deterministic (R4-1, fresh from spec).
// buildCity(seed) returns the whole city as plain data: 49 blocks in 5
// districts, a road graph (intersections + edges), sidewalks, street lamps,
// parking spots and the Crater Row safehouse. No rendering here, no DOM,
// no network — the renderer and the gameplay modules read this data only.
//
// Coordinates: x grows east (columns), z grows south (rows), the city is
// centred on (0, 0). One "pitch" is block + road; roads run on the grid
// lines between blocks and around the rim, so there are grid + 1 = 8 roads
// each way and 8 x 8 = 64 intersections.

function buildCity(seed) {
  const rng = RNG(seed);
  const grid = CFG.city.grid;
  const block = CFG.city.block;
  const road = CFG.city.road;
  const pitch = block + road;
  const span = grid * block + (grid + 1) * road;
  const half = span / 2;

  // Road centreline coordinate for road index i (0..grid).
  function roadAt(i) { return -half + road / 2 + i * pitch; }
  // Centre of block (row, col).
  function blockCenter(row, col) {
    return {
      x: -half + road + col * pitch + block / 2,
      z: -half + road + row * pitch + block / 2,
    };
  }

  // ---- blocks: one building cluster per block, shaped by its district ----
  const blocks = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const district = districtAt(row, col);
      const centre = blockCenter(row, col);
      const buildings = [];
      const count = district.style === 'warehouse' ? 2
        : district.style === 'office' ? 1
        : district.style === 'house' ? 3
        : 2;
      for (let b = 0; b < count; b++) {
        const w = rng.range(block * 0.28, block * 0.62);
        const d = rng.range(block * 0.28, block * 0.62);
        const maxOff = block / 2 - Math.max(w, d) / 2 - 2;
        buildings.push({
          x: centre.x + rng.range(-maxOff, maxOff),
          z: centre.z + rng.range(-maxOff, maxOff),
          w, d,
          h: rng.range(district.hMin, district.hMax),
          color: rng.pick(district.palette),
          roof: district.roof,
          // A taller slab on office towers so the skyline reads at a glance.
          tower: district.style === 'office' && rng.chance(0.5),
        });
      }
      blocks.push({
        row, col, district: district.name, style: district.style,
        x: centre.x, z: centre.z, size: block, buildings,
        tree: rng.chance(CFG.city.treeChance),
      });
    }
  }

  // ---- road graph: 64 intersection nodes, edges along every road ----
  const nodes = [];
  for (let j = 0; j <= grid; j++) {
    for (let i = 0; i <= grid; i++) {
      nodes.push({ id: j * (grid + 1) + i, i, j, x: roadAt(i), z: roadAt(j) });
    }
  }
  function nodeId(i, j) { return j * (grid + 1) + i; }
  const edges = [];
  for (let j = 0; j <= grid; j++) {
    for (let i = 0; i < grid; i++) {
      edges.push({ a: nodeId(i, j), b: nodeId(i + 1, j), horizontal: true });
    }
  }
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j < grid; j++) {
      edges.push({ a: nodeId(i, j), b: nodeId(i, j + 1), horizontal: false });
    }
  }

  // ---- sidewalks: one strip on each side of every road ----
  const sidewalks = [];
  const sw = CFG.city.sidewalk;
  for (let i = 0; i <= grid; i++) {
    const c = roadAt(i);
    sidewalks.push({ x: c - road / 2 - sw / 2, z: 0, w: sw, d: span, along: 'z' });
    sidewalks.push({ x: c + road / 2 + sw / 2, z: 0, w: sw, d: span, along: 'z' });
    sidewalks.push({ x: 0, z: c - road / 2 - sw / 2, w: span, d: sw, along: 'x' });
    sidewalks.push({ x: 0, z: c + road / 2 + sw / 2, w: span, d: sw, along: 'x' });
  }

  // ---- street lamps at every 2nd intersection, on the road corner ----
  const lamps = [];
  for (let j = 0; j <= grid; j += CFG.city.lampEvery) {
    for (let i = 0; i <= grid; i += CFG.city.lampEvery) {
      lamps.push({ x: roadAt(i) + road / 2 + 1.5, z: roadAt(j) + road / 2 + 1.5 });
    }
  }

  // ---- parking spots: bays along a few road edges, angled to the kerb ----
  const parking = [];
  const parkEdges = rng.shuffle(edges).slice(0, CFG.car.parkedCount);
  for (const edge of parkEdges) {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const t = rng.range(0.25, 0.75);
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const side = rng.chance(0.5) ? 1 : -1;
    parking.push({
      x: px + (edge.horizontal ? 0 : side * (road / 2 - 1.6)),
      z: pz + (edge.horizontal ? side * (road / 2 - 1.6) : 0),
      angle: edge.horizontal ? 0 : Math.PI / 2,
      taken: false,
    });
  }

  // ---- safehouse: the player's first home, Crater Row, block (3, 3) ----
  const safeBlock = blocks.find(
    (b) => b.row === CFG.player.startBlock.row && b.col === CFG.player.startBlock.col,
  );
  const safehouse = {
    block: safeBlock.row + ',' + safeBlock.col,
    district: safeBlock.district,
    x: safeBlock.x, z: safeBlock.z,
  };

  return {
    seed, grid, block, road, pitch, span, half,
    blocks, nodes, edges, sidewalks, lamps, parking, safehouse,
    roadAt, blockCenter, nodeId,
  };
}

// Nearest intersection node to a world point (for driving / chasing).
function nearestNode(city, x, z) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const node of city.nodes) {
    const dx = node.x - x;
    const dz = node.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = node; }
  }
  return best;
}

// Which block contains a world point, or null outside the city.
function blockAt(city, x, z) {
  const local = x + city.half - city.road;
  const col = Math.floor(local / city.pitch);
  const localZ = z + city.half - city.road;
  const row = Math.floor(localZ / city.pitch);
  if (row < 0 || row >= city.grid || col < 0 || col >= city.grid) return null;
  return city.blocks[row * city.grid + col];
}
