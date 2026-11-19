'use strict';
// Tallow Point — foundation tuning (R4-1, fresh from the R4 spec).
// Every magic number of the city lives here so the other modules stay pure
// data and rendering. Nothing here reads a file or the network.

const CFG = Object.freeze({
  // Deterministic world seed: the same seed always builds the same city.
  seed: 1337,

  city: Object.freeze({
    grid: 7, // 7 x 7 blocks
    block: 36, // side of one block, world units
    road: 12, // road width, world units
    sidewalk: 3, // sidewalk strip beside each road
    // span = grid * block + (grid + 1) * road = 348; city is centred on (0, 0).
    lampEvery: 2, // a street lamp at every 2nd intersection
    treeChance: 0.35, // chance a block grows a street tree
  }),

  // Five named districts. A block's district follows districtAt(row, col):
  // west strip = Kessel Wharf; north rows = Northline / Moraine Heights;
  // middle rows = Crater Row / Sunmere; south rows = Sunmere.
  // style: building character. palette: facade colours. hMin/hMax: storeys
  // are derived from height in world units, not storey counts.
  districts: Object.freeze([
    Object.freeze({
      name: 'Kessel Wharf', style: 'warehouse',
      palette: ['#8a6f4d', '#7d6a58', '#946b4a', '#6f5b45'],
      hMin: 7, hMax: 14, roof: '#4a3f35',
    }),
    Object.freeze({
      name: 'Northline', style: 'office',
      palette: ['#5d7d99', '#6b8aa5', '#4f6d88', '#7a94a8'],
      hMin: 26, hMax: 58, roof: '#2e3d4a',
    }),
    Object.freeze({
      name: 'Moraine Heights', style: 'apartment',
      palette: ['#a8765a', '#9c6f52', '#b0815f', '#8f6650'],
      hMin: 14, hMax: 30, roof: '#5a4636',
    }),
    Object.freeze({
      name: 'Crater Row', style: 'shop',
      palette: ['#b09a6a', '#a8895c', '#c2a878', '#96794f'],
      hMin: 8, hMax: 18, roof: '#4d4438',
    }),
    Object.freeze({
      name: 'Sunmere', style: 'house',
      palette: ['#c9b18c', '#d6c096', '#bfa67e', '#cdb489'],
      hMin: 5, hMax: 10, roof: '#7a5c48',
    }),
  ]),

  time: Object.freeze({
    dayLengthSec: 480, // one full day/night cycle while playing
    startHour: 9.5, // morning light when a new life begins
    dawn: 6, dusk: 18, nightStart: 20, nightEnd: 5,
  }),

  player: Object.freeze({
    walkSpeed: 6, runSpeed: 10, eyeHeight: 1.7,
    startBlock: Object.freeze({ row: 3, col: 3 }), // safehouse, Crater Row
  }),

  car: Object.freeze({
    playerModel: 'coupe',
    accel: 14, brake: 26, maxSpeed: 34, turnRate: 1.9,
    parkedCount: 24, trafficCount: 14,
  }),

  wanted: Object.freeze({
    maxStars: 5,
    stealHeat: 50, // stealing a parked car adds this much heat
    starAt: Object.freeze([0, 45, 90, 140, 200, 280]), // heat per star
    decayPerSec: 1.5, // heat cools while hidden / out of sight
    roadblockAtStar: 3, // roadblocks appear at 3 stars and above
    bustAtStar: 3, // BUSTED when a cruiser reaches the player on foot
  }),

  camera: Object.freeze({
    chaseDist: 13, chaseHeight: 5.2, chaseLook: 4,
    orbitRadius: 240, orbitHeight: 150,
    fov: 60, near: 0.5, far: 1200,
  }),
});

// District lookup for a block (row, col), 0-based, 7 x 7.
function districtAt(row, col) {
  if (col <= 1) return CFG.districts[0]; // Kessel Wharf, west strip
  if (row <= 2) return col <= 4 ? CFG.districts[1] : CFG.districts[2]; // Northline / Moraine Heights
  if (row <= 4) return col <= 4 ? CFG.districts[3] : CFG.districts[4]; // Crater Row / Sunmere
  return CFG.districts[4]; // Sunmere, south rows
}
