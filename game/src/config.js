// config.js — the constants every other module shares. A camera looks down on one street
// block at a time, so the units are easy to draw: one unit is one screen pixel at zoom 1.
// The city is a grid of 7 x 7 road cells; each cell is one block with a street on its left
// and top edge, which tiles into a road network without any special-case code.
export const CELL = 150;
export const GRID = 7;
export const WORLD = CELL * GRID;
export const ROAD = 24;
export const LANE = 8;
export const SIDEWALK = 6;

export const START_TIME = 21 * 60 + 40;
export const DAY_MINUTES = 24 * 60;

export const PLAYER_RADIUS = 5.5;
export const CAR_HALF_LENGTH = 13;
export const CAR_HALF_WIDTH = 6.2;
export const CAR_MAX_SPEED = 205;
export const CAR_ACCEL = 150;
export const CAR_BRAKE = 320;
export const CAR_REVERSE = 80;
export const CAR_GRIP = 3.4;

export const WANTED_THRESHOLDS = [0, 45, 110, 200, 320, 460];
export const WANTED_DECAY_DELAY = 22;
export const WANTED_DECAY_RATE = 7;

export const PEDESTRIAN_COUNT = 68;
export const TRAFFIC_COUNT = 18;
export const COP_CAR_SLOTS = 4;
export const FOOT_COP_SLOTS = 3;

export const PALETTE = {
  night: '#0a0d18',
  road: '#1c202b',
  roadEdge: '#2b3140',
  lane: 'rgba(226,214,160,0.42)',
  curb: '#3a3f4b',
  sidewalk: '#454b58',
  grass: '#1f3a2e',
  concrete: '#2f3441',
  water: '#123048',
  gold: '#ffc94a',
  neon: '#39d2ff',
  pink: '#ff5ea8',
  red: '#ff4b4b',
  blue: '#5aa8ff',
  white: '#f3f0e6',
  ink: '#0c0e14',
};

export const VEHICLE_TYPES = {
  sedan: { length: 26, width: 12.4, speed: 1.0, mass: 1.0, colors: ['#c8c2b2', '#7d8794', '#37506e', '#6d2d2d', '#2c2c30', '#4f6b46'] },
  taxi: { length: 27, width: 12.6, speed: 1.02, mass: 1.0, colors: ['#f2b52c', '#f2b52c'] },
  van: { length: 32, width: 13.6, speed: 0.82, mass: 1.35, colors: ['#d9d4c4', '#8a5a33', '#334a5c'] },
  coupe: { length: 24, width: 12.0, speed: 1.22, mass: 0.85, colors: ['#b8233a', '#1a1a22', '#3d7bd6', '#d9d9d9'] },
  cruiser: { length: 27, width: 12.8, speed: 1.18, mass: 1.2, colors: ['#e8e8ea'] },
  bike: { length: 14, width: 5.6, speed: 1.28, mass: 0.5, colors: ['#22252d', '#7c1f2c'] },
};

export const VEHICLE_NAMES = {
  sedan: ['Marlin 4', 'Vela GT', 'Ponto Sedan', 'Norwin'],
  taxi: ['Dune Cab'],
  van: ['Hauler LX', 'Ridge Van'],
  coupe: ['Ferro S', 'Kite Coupe', 'Vesper RS'],
  cruiser: ['Guardian 220'],
  bike: ['Rook 125'],
};

export const BARBER_HAT_TIPS = [
  'Tip: hold W longer than you think — full throttle is how you outrun the stripes.',
  'Tip: walk into any parked car (E) and the city is yours.',
  'Tip: losing the cops for 22 seconds cools the stars down.',
  'Tip: a shotgun blast at close range ends most arguments.',
];
