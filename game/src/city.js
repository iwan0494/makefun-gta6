// city.js — builds Tallow Point from a seed: a 7 x 7 grid of blocks split into five named
// districts, a coastal strip on the east, a road graph for traffic and police pathfinding,
// parking spots, footpaths for pedestrians and lamp posts along every curb. Nothing here draws.
import { CELL, GRID, ROAD, WORLD } from './config.js';
import { makeRandom, noise } from './random.js';

export const DISTRICTS = [
  { name: 'Kessel Wharf', x0: 5, x1: 6, y0: 4, y1: 6, accent: '#3aa0b8', shops: ['Fish & Net', 'Wharf Pub', 'Dry Dock Deli', 'Saltbox Diner'], blocks: [] },
  { name: 'Northline', x0: 0, x1: 2, y0: 0, y1: 1, accent: '#b8a34a', shops: ['Line Diner', 'Terminal Cafe', 'Hopper Bar', 'Grease Stop'], blocks: [] },
  { name: 'Moraine Heights', x0: 3, x1: 6, y0: 0, y1: 1, accent: '#8f6fb8', shops: ['Highway Pharmacy', 'Bell Rentals', 'Quiet Room', 'Overlook Grill'], blocks: [] },
  { name: 'Crater Row', x0: 0, x1: 2, y0: 2, y1: 3, accent: '#c0603a', shops: ['Sump Pawn', 'Row Barbers', 'Ember Noodle', 'Crater Mart'], blocks: [] },
  { name: 'Sunmere', x0: 3, x1: 6, y0: 2, y1: 3, accent: '#58b46a', shops: ['Mere Cafe', 'Bay Hotel', 'Greenbank', 'Sand Lounge'], blocks: [] },
];

const COMPANY_NAMES = ['Kestrel Trust', 'Halcyon Freight', 'Morrow & Vane', 'Pike Legal', 'Brandt Motors', 'Cinder Media', 'Ostrander Bank', 'Fenn & Sons', 'Bluecrow Mining', 'Wexley Dental'];
const HOUSE_NAMES = ['Carrow', 'Doyle', 'Pinch', 'Osei', 'Varga', 'Mabry', 'Lund', 'Sato', 'Quist', 'Harrow', 'Nkemdi', 'Fisk'];

export const BUILDING_KINDS = [
  { kind: 'tower', weight: 9, floors: [4, 8], shop: false },
  { kind: 'office', weight: 7, floors: [3, 5], shop: false },
  { kind: 'apartment', weight: 6, floors: [3, 4], shop: false },
  { kind: 'shop', weight: 5, floors: [1, 2], shop: true },
  { kind: 'warehouse', weight: 4, floors: [1, 2], shop: false },
  { kind: 'kiosk', weight: 2, floors: [1, 1], shop: true },
  { kind: 'house', weight: 4, floors: [1, 2], shop: false },
];

function weightedKind(random) {
  const total = BUILDING_KINDS.reduce((sum, item) => sum + item.weight, 0);
  let roll = random.range(0, total);
  for (const item of BUILDING_KINDS) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return BUILDING_KINDS[0];
}

export function districtAt(x, y) {
  const cellX = Math.min(GRID - 1, Math.max(0, Math.floor(x / CELL)));
  const cellY = Math.min(GRID - 1, Math.max(0, Math.floor(y / CELL)));
  for (const district of DISTRICTS) {
    if (cellX >= district.x0 && cellX <= district.x1 && cellY >= district.y0 && cellY <= district.y1) return district;
  }
  return DISTRICTS[3];
}

export const RIVER_X = 6 * 150 + 11;
export const RIVER_WIDTH = WORLD - RIVER_X;
export const BRIDGE_ROWS = [2, 4, 6];

// The bridge rows draw the water below the road grid, so the district under them is wharf land.
export function buildCity(seed = 'tallow-point') {
  const random = makeRandom(seed);
  const buildings = [];
  const parking = [];
  const blocks = [];

  for (let cellY = 0; cellY < GRID; cellY += 1) {
    for (let cellX = 0; cellX < GRID; cellX += 1) {
      const left = cellX * CELL + ROAD;
      const top = cellY * CELL + ROAD;
      const size = CELL - ROAD;
      const district = districtAt(left + 1, top + 1);
      const parkRow = random.chance(0.15);
      const vertical = cellY % 2 === 1;
      const center = Math.hypot(left + size / 2 - 525, top + size / 2 - 525);
      const kind = parkRow ? 'park' : center < 210 && random.chance(0.55) ? 'bay' : vertical ? 'towers' : random.chance(0.35) ? 'low' : 'row';
      const block = { cellX, cellY, x: left, y: top, size, district: district.name, accent: district.accent, kind };
      blocks.push(block);
      district.blocks.push(block);

      // A back row and a front row; the front one faces the street the player drives on.
      const frontHeight = random.range(26, 44);
      let x = left + 8;
      while (x < left + size - 16) {
        const width = Math.min(random.range(32, 62), left + size - 8 - x);
        if (width < 20) break;
        buildings.push(makeBuilding(random, x, top + 6, width - 3, size - frontHeight - 14, district));
        x += width;
      }
      x = left + 8;
      while (x < left + size - 16) {
        const width = Math.min(random.range(32, 62), left + size - 8 - x);
        if (width < 20) break;
        if (!parkRow) buildings.push(makeBuilding(random, x, top + size - frontHeight - 4, width - 3, frontHeight, district));
        x += width;
      }
      if (parkRow) {
        buildings.push(makeBuilding(random, left + 14, top + size - 30, size - 40, 26, district, true));
        // A pocket park keeps the block's middle open; the renderer draws its lawn and fountain.
      }
      parking.push({ x: left + size * 0.62, y: top + size - 3, angle: Math.PI / 2, spot: 1 });
      parking.push({ x: left + size * 0.3, y: top + size - 3, angle: Math.PI / 2, spot: 2 });
    }
  }

  // Road graph: nodes at every grid intersection.
  const nodes = [];
  for (let gy = 0; gy <= GRID; gy += 1) {
    for (let gx = 0; gx <= GRID; gx += 1) {
      nodes.push({ id: gy * (GRID + 1) + gx, gx, gy, x: gx * CELL + ROAD / 2, y: gy * CELL + ROAD / 2, next: [] });
    }
  }
  const edges = [];
  for (const node of nodes) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const gx = node.gx + dx;
      const gy = node.gy + dy;
      if (gx < 0 || gy < 0 || gx > GRID || gy > GRID) continue;
      const other = nodes[gy * (GRID + 1) + gx];
      const edge = { a: node.id, b: other.id, ax: node.x, ay: node.y, bx: other.x, by: other.y, length: CELL, axis: dx !== 0 ? 'x' : 'y' };
      edges.push(edge);
      const index = edges.length - 1;
      node.next.push({ to: other.id, edge: index, axis: edge.axis, dir: dx !== 0 ? Math.sign(dx) * 2 : Math.sign(dy) * 2 + 1 });
    }
  }

  const lamps = [];
  for (let gy = 0; gy <= GRID; gy += 1) {
    for (let gx = 0; gx <= GRID; gx += 1) {
      lamps.push({ x: gx * CELL + ROAD / 2, y: gy * CELL + ROAD / 2 + 3 });
    }
  }
  for (let cellX = 0; cellX < GRID; cellX += 1) {
    for (let cellY = 0; cellY < GRID; cellY += 1) {
      lamps.push({ x: cellX * CELL + CELL - 4, y: cellY * CELL + ROAD + 12 });
      lamps.push({ x: cellX * CELL + ROAD + 10, y: cellY * CELL + CELL - 4 });
    }
  }

  const coast = { x: WORLD - 1, width: 30 };
  const bounds = { minX: ROAD / 2, maxX: WORLD - ROAD / 2, minY: ROAD / 2, maxY: WORLD - ROAD / 2 };

  function nearestNode(x, y) {
    const gx = Math.round((x - ROAD / 2) / CELL);
    const gy = Math.round((y - ROAD / 2) / CELL);
    const cx = Math.min(GRID, Math.max(0, gx));
    const cy = Math.min(GRID, Math.max(0, gy));
    return nodes[cy * (GRID + 1) + cx];
  }

  // Dijkstra over 64 nodes is cheap enough to run per spawn; police replan every second.
  function route(fromId, toId) {
    const count = nodes.length;
    const distance = new Float64Array(count).fill(Infinity);
    const previous = new Int32Array(count).fill(-1);
    const used = new Uint8Array(count);
    distance[fromId] = 0;
    while (true) {
      let best = -1;
      for (let index = 0; index < count; index += 1) {
        if (!used[index] && (best === -1 || distance[index] < distance[best])) best = index;
      }
      if (best === -1 || distance[best] === Infinity || best === toId) break;
      used[best] = 1;
      for (const link of nodes[best].next) {
        const length = distance[best] + CELL;
        if (length < distance[link.to]) {
          distance[link.to] = length;
          previous[link.to] = best;
        }
      }
    }
    if (distance[toId] === Infinity) return [];
    const path = [];
    let cursor = toId;
    while (cursor !== -1 && cursor !== fromId) {
      path.push(cursor);
      cursor = previous[cursor];
    }
    path.reverse();
    return path;
  }

  function pointAt(nodeId, towardId) {
    const from = nodes[nodeId];
    const to = nodes[towardId];
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, dx: Math.sign(to.x - from.x), dy: Math.sign(to.y - from.y) };
  }

  return { seed, nodes, edges, buildings, blocks, parking, lamps, coast, bounds, route, nearestNode, pointAt };
}

function makeBuilding(random, x, y, w, h, district, park) {
  const kind = park ? { kind: 'greenhouse', floors: [1, 1], shop: false } : weightedKind(random);
  const floors = random.int(kind.floors[0], kind.floors[1]);
  const shop = kind.shop;
  const name = shop ? random.pick(district.shops) : kind.kind === 'house'
    ? `${random.pick(HOUSE_NAMES)} Residence`
    : `${random.pick(COMPANY_NAMES)} ${kind.kind === 'tower' ? 'Tower' : kind.kind === 'warehouse' ? 'Depot' : 'Building'}`;
  const tint = noise(x, y, floors) * 0.12;
  return {
    x, y, w, h,
    kind: kind.kind,
    floors,
    shop,
    name,
    neon: shop ? random.pick(['#ff5ea8', '#39d2ff', '#ffc94a', '#ff8a3d']) : null,
    body: `hsl(${Math.round(random.range(200, 260) + (kind.kind === 'warehouse' ? 12 : 0))} ${kind.kind === 'house' ? 9 : 11}% ${Math.round(16 + floors * 2.1 + tint * 30)}%)`,
    roof: `hsl(228 12% ${Math.round(12 + floors * 1.4)}%)`,
  };
}

// True when a circle at (x, y) of radius r overlaps any building footprint.
export function hitsBuilding(buildings, x, y, r) {
  for (const building of buildings) {
    if (x + r > building.x && x - r < building.x + building.w && y + r > building.y && y - r < building.y + building.h) return building;
  }
  return null;
}

const TREE_SPOTS = [];
for (let cellX = 0; cellX < GRID; cellX += 1) {
  for (let cellY = 0; cellY < GRID; cellY += 1) {
    TREE_SPOTS.push({ x: cellX * CELL + CELL - 8, y: cellY * CELL + 9 });
    TREE_SPOTS.push({ x: cellX * CELL + 8, y: cellY * CELL + CELL - 9 });
  }
}

// Street furniture the renderer draws on top of the blocks; kept apart from buildings because a
// tree or a planter must never be mistaken for something an actor collides with.
export function buildDecorations(seed = 'tallow-point') {
  const random = makeRandom(`${seed}/decor`);
  const trees = [];
  for (const spot of TREE_SPOTS) {
    if (random.chance(0.55)) trees.push({ x: spot.x + random.range(-2, 2), y: spot.y + random.range(-2, 2), size: random.range(4.5, 7) });
  }
  const parkedSigns = [];
  for (let cellX = 0; cellX < GRID; cellX += 1) {
    for (let cellY = 0; cellY < GRID; cellY += 1) {
      parkedSigns.push({ x: cellX * CELL + CELL * 0.5, y: cellY * CELL + CELL - 18, text: `${random.int(2, 9)}`, angle: 0 });
    }
  }
  const hydrants = [];
  for (const tree of trees) if (random.chance(0.3)) hydrants.push({ x: tree.x + 4, y: tree.y + 4 });
  return { trees, parkedSigns, hydrants };
}
