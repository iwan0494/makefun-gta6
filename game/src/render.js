// render.js — draws the city, every actor and the weather over them, top-down. The world is
// built once into a static layer (ground, roads, markings, buildings with their shadow and
// tall tops) and redrawn each frame only for what moves. Night is a wash of blue, the light of
// buildings and lamps is drawn with additive blending, and an off-screen canvas keeps it cheap.
import {
  CELL, GRID, PALETTE, ROAD, SIDEWALK, WORLD,
} from './config.js';
import { buildDecorations, districtAt } from './city.js';

import { RIVER_X, RIVER_WIDTH, BRIDGE_ROWS } from './city.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let city = null;
  let ground = null;
  let decorations = null;
  let viewWidth = 1;
  let viewHeight = 1;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    viewWidth = canvas.clientWidth || globalThis.innerWidth;
    viewHeight = canvas.clientHeight || globalThis.innerHeight;
    canvas.width = Math.max(1, Math.floor(viewWidth * dpr));
    canvas.height = Math.max(1, Math.floor(viewHeight * dpr));
  }

  function setCity(nextCity) {
    city = nextCity;
    decorations = buildDecorations(nextCity.seed);
    ground = document.createElement('canvas');
    ground.width = WORLD;
    ground.height = WORLD;
    const g = ground.getContext('2d');
    paintGround(g, city);
  }

  function cameraTransform(state) {
    const zoom = state.camera.zoom;
    const scale = dpr * zoom;
    const shake = state.camera.shake;
    const sx = (Math.random() - 0.5) * shake * 16;
    const sy = (Math.random() - 0.5) * shake * 16;
    ctx.setTransform(scale, 0, 0, scale, viewWidth * dpr / 2 - state.camera.x * scale + sx, viewHeight * dpr / 2 - state.camera.y * scale + sy);
    return zoom;
  }

  function screenToWorld(mouse) {
    const zoom = 1;
    return {
      x: (mouse.x / dpr) + (cameraX - viewWidth / 2) * zoom,
      y: (mouse.y / dpr) + (cameraY - viewHeight / 2) * zoom,
    };
  }

  let cameraX = 0;
  let cameraY = 0;

  function draw(game, time) {
    const state = game.state;
    // The base wash covers the whole backing store (viewWidth * dpr device pixels); filling in
    // CSS coordinates under the dpr transform would leave a band of untouched canvas on wide screens.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cameraX = state.camera.x;
    cameraY = state.camera.y;
    const zoom = cameraTransform(state);
    const halfW = viewWidth / (2 * zoom) + 30;
    const halfH = viewHeight / (2 * zoom) + 30;
    const left = Math.max(0, Math.floor(state.camera.x - halfW));
    const top = Math.max(0, Math.floor(state.camera.y - halfH));
    const right = Math.min(WORLD, Math.ceil(state.camera.x + halfW));
    const bottom = Math.min(WORLD, Math.ceil(state.camera.y + halfH));
    ctx.drawImage(ground, left, top, right - left, bottom - top, left, top, right - left, bottom - top);

    drawDecorations(ctx, decorations, left, top, right, bottom, state);
    drawTraffic(ctx, state, left, top, right, bottom, time);
    drawCops(ctx, state, left, top, right, bottom, time);
    drawPeds(ctx, state, left, top, right, bottom, time);
    if (state.vehicle) drawCar(ctx, state.vehicle, state.vehicle.color, true, time);
    else drawPlayer(ctx, state, time);
    drawBullets(ctx, state);
    drawEffects(ctx, state);
    drawMarkers(ctx, state, time);
    drawLighting(ctx, state, left, top, right, bottom, time);
  }

  return { ctx, resize, setCity, draw, screenToWorld, get view() { return { width: viewWidth, height: viewHeight, dpr }; } };
}

function paintGround(g, city) {
  g.fillStyle = '#1b1f27';
  g.fillRect(0, 0, WORLD, WORLD);
  for (const block of city.blocks) paintBlock(g, block, city);
  paintRoads(g);
  paintRiver(g, city);
  for (const b of city.buildings) paintBuilding(g, b);
}

function blockBase(kind, accent) {
  if (typeof accent !== 'string') accent = '#808080';
  if (kind === 'park') return mix('#2f4a37', accent, 0.1);
  if (kind === 'bay') return mix('#3c4452', accent, 0.16);
  if (kind === 'towers') return mix('#3a3f4a', accent, 0.12);
  if (kind === 'low') return mix('#4a4a46', accent, 0.12);
  return mix('#41434c', accent, 0.09);
}

// Each block has a character: a pocket park with paths and a fountain, a bay block with a
// ship in a dry dock, a tower core with a lit plaza, low houses with driveways, or a row of
// mixed shops. The pavement ring is drawn on every block so the actor paths read as sidewalks.
function paintBlock(g, block, city) {
  const { x, y, size, kind } = block;
  const district = block.district ?? { accent: block.accent ?? '#808080' };
  g.fillStyle = blockBase(kind, district.accent);
  g.fillRect(x, y, size, size);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let line = 6; line < size; line += 11) g.fillRect(x + 3, y + line, size - 6, 1);
  g.fillStyle = '#5b6070';
  g.fillRect(x, y, size, SIDEWALK);
  g.fillRect(x, y + size - SIDEWALK, size, SIDEWALK);
  g.fillRect(x, y, SIDEWALK, size);
  g.fillRect(x + size - SIDEWALK, y, SIDEWALK, size);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(x, y + SIDEWALK - 1, size, 1);
  g.fillRect(x, y + size - SIDEWALK, size, 1);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(x + SIDEWALK * 0.5, y + SIDEWALK * 0.5, size - SIDEWALK, 1);
  if (kind === 'park') {
    g.fillStyle = '#2d5c3e';
    g.fillRect(x + 12, y + 12, size - 24, size - 24);
    g.strokeStyle = '#9a8f78';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + 12, y + size * 0.5);
    g.lineTo(x + size - 12, y + size * 0.5);
    g.moveTo(x + size * 0.5, y + 12);
    g.lineTo(x + size * 0.5, y + size - 12);
    g.stroke();
    g.fillStyle = '#3f6f8e';
    g.beginPath();
    g.arc(x + size * 0.5, y + size * 0.5, 11, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c9c2ad';
    g.lineWidth = 1.4;
    g.stroke();
  } else if (kind === 'bay') {
    // A dry dock with a hull under repair, lift cranes and a stack of containers.
    g.fillStyle = '#23384a';
    g.fillRect(x + 16, y + 24, size * 0.52, size - 62);
    g.fillStyle = '#7a3a2e';
    g.beginPath();
    g.moveTo(x + 24, y + 34);
    g.lineTo(x + 24 + size * 0.44, y + 34);
    g.lineTo(x + 24 + size * 0.36, y + size - 46);
    g.lineTo(x + 30, y + size - 46);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x + 30, y + 50, size * 0.4, 4);
    g.fillRect(x + 32, y + 66, size * 0.36, 3);
    g.strokeStyle = '#d7a63c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x + size * 0.72, y + 22);
    g.lineTo(x + size * 0.72, y + size - 26);
    g.lineTo(x + size * 0.44, y + size - 40);
    g.stroke();
    const crates = ['#c05a2e', '#2e6ea8', '#c9a53a', '#4d8a5a'];
    for (let index = 0; index < 6; index += 1) {
      g.fillStyle = crates[index % crates.length];
      g.fillRect(x + size * 0.74 + (index % 2) * 12, y + size * 0.3 + Math.floor(index / 2) * 11, 10, 9);
    }
  } else if (kind === 'towers') {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(x + size * 0.32, y + size * 0.32, size * 0.36, size * 0.36);
    g.strokeStyle = 'rgba(255,201,74,0.3)';
    g.lineWidth = 1;
    g.strokeRect(x + size * 0.36, y + size * 0.36, size * 0.28, size * 0.28);
  } else if (kind === 'low') {
    g.fillStyle = '#575b4c';
    g.fillRect(x + 14, y + 14, size - 28, size - 28);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let index = 0; index < 4; index += 1) g.fillRect(x + 16 + index * (size / 4.4), y + size - 12, 8, 6);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + 10, y + 10, size - 20, 2);
  }
  void city;
}

function paintRoads(g) {
  g.fillStyle = PALETTE.road;
  for (let index = 0; index <= GRID; index += 1) {
    const p = index * CELL;
    g.fillRect(p - ROAD / 2, 0, ROAD, WORLD);
    g.fillRect(0, p - ROAD / 2, WORLD, ROAD);
  }
  g.lineWidth = 2;
  for (let index = 0; index <= GRID; index += 1) {
    const p = index * CELL;
    for (let cell = 0; cell < GRID; cell += 1) {
      const a = cell * CELL + ROAD / 2 + 4;
      const b2 = (cell + 1) * CELL - ROAD / 2 - 4;
      g.strokeStyle = PALETTE.curb;
      g.beginPath();
      g.moveTo(p - ROAD / 2, a);
      g.lineTo(p - ROAD / 2, b2);
      g.moveTo(p + ROAD / 2, a);
      g.lineTo(p + ROAD / 2, b2);
      g.moveTo(a, p - ROAD / 2);
      g.lineTo(b2, p - ROAD / 2);
      g.moveTo(a, p + ROAD / 2);
      g.lineTo(b2, p + ROAD / 2);
      g.stroke();
      g.strokeStyle = PALETTE.lane;
      g.setLineDash([7, 9]);
      g.beginPath();
      g.moveTo(p, a);
      g.lineTo(p, b2);
      g.moveTo(a, p);
      g.lineTo(b2, p);
      g.stroke();
      g.setLineDash([]);
    }
  }
  g.fillStyle = 'rgba(235,230,210,0.2)';
  for (let gy = 0; gy <= GRID; gy += 1) {
    for (let gx = 0; gx <= GRID; gx += 1) {
      const x = gx * CELL;
      const y = gy * CELL;
      for (let stripe = -ROAD / 2 + 3; stripe < ROAD / 2 - 2; stripe += 6) {
        g.fillRect(x + stripe, y - ROAD / 2 - 9, 3, 7);
        g.fillRect(x + stripe, y + ROAD / 2 + 2, 3, 7);
        g.fillRect(x - ROAD / 2 - 9, y + stripe, 7, 3);
        g.fillRect(x + ROAD / 2 + 2, y + stripe, 7, 3);
      }
    }
  }
}

// The bay runs down the east side of the map: water, a quay wall, and the piers on the wharf.
function paintRiver(g, city) {
  const left = RIVER_X;
  g.fillStyle = '#2a303b';
  g.fillRect(left - 6, 0, 6, WORLD);
  const water = g.createLinearGradient(left, 0, WORLD, 0);
  water.addColorStop(0, '#173a52');
  water.addColorStop(1, '#0f2838');
  g.fillStyle = water;
  g.fillRect(left, 0, WORLD - left, WORLD);
  g.strokeStyle = 'rgba(120,190,220,0.16)';
  g.lineWidth = 1;
  for (let y = 8; y < WORLD; y += 17) {
    g.beginPath();
    g.moveTo(left + 8 + ((y * 7) % 30), y);
    g.lineTo(left + 52 + ((y * 13) % 60), y);
    g.stroke();
  }
  // Docks: plank quays that reach into the water at the wharf rows.
  for (const row of [4, 5, 6]) {
    const baseY = row * CELL + 22;
    g.fillStyle = '#4a4032';
    g.fillRect(left, baseY, 96, 22);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = left + 4; x < left + 92; x += 8) g.fillRect(x, baseY, 1, 22);
    g.fillStyle = '#2f3a44';
    for (let x = left + 8; x < left + 92; x += 22) g.fillRect(x, baseY + 20, 6, 6);
  }
  for (const bridge of BRIDGE_ROWS) {
    g.fillStyle = '#4d5260';
    g.fillRect(left - 4, bridge * CELL - ROAD / 2 + 2, WORLD - left + 4, ROAD - 4);
    g.fillStyle = PALETTE.lane;
    g.fillRect(left, bridge * CELL, WORLD - left, 1);
  }
}

// Buildings: a drop shadow away from the light, the footprint, a roof with vents, tall ones
// with a second rim, and a lit shopfront on the street side.
function paintBuilding(g, b) {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(b.x + 4, b.y + 5, b.w, b.h);
  g.fillStyle = b.body;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(b.x, b.y, b.w, 2);
  g.fillStyle = b.roof;
  g.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(b.x + 3, b.y + 3, b.w - 6, 1);
  if (b.kind === 'greenhouse') {
    g.fillStyle = 'rgba(70,140,90,0.35)';
    g.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    g.strokeStyle = 'rgba(180,230,200,0.25)';
    g.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    return;
  }
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  for (let floor = 1; floor < b.floors; floor += 1) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(b.x + 4, b.y + 4 + ((b.h - 8) / b.floors) * floor, b.w - 8, 1);
  }
  if (b.kind === 'tower' || b.kind === 'office') {
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.2, Math.max(8, b.w * 0.2), Math.max(6, b.h * 0.16));
    g.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.55, Math.max(8, b.w * 0.2), Math.max(6, b.h * 0.2));
    g.fillStyle = 'rgba(255,180,90,0.55)';
    g.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.6, 2, 2);
  }
  if (b.shop) {
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(b.x + 4, b.y + b.h - 9, b.w - 8, 5);
    g.fillStyle = b.neon;
    g.globalAlpha = 0.8;
    g.fillRect(b.x + 5, b.y + b.h - 4, b.w - 10, 2.4);
    g.globalAlpha = 1;
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${gg},${bl})`;
}

function visible(x, y, left, top, right, bottom, margin = 30) {
  return x > left - margin && x < right + margin && y > top - margin && y < bottom + margin;
}

function drawDecorations(ctx, deco, left, top, right, bottom) {
  for (const tree of deco.trees) {
    if (!visible(tree.x, tree.y, left, top, right, bottom)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(tree.x + 2, tree.y + 3, tree.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c5a3f';
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e7a52';
    ctx.beginPath();
    ctx.arc(tree.x - tree.size * 0.25, tree.y - tree.size * 0.25, tree.size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const hydrant of deco.hydrants) {
    if (!visible(hydrant.x, hydrant.y, left, top, right, bottom)) continue;
    ctx.fillStyle = '#a83232';
    ctx.fillRect(hydrant.x - 1.5, hydrant.y - 1.5, 3, 3);
  }
}

function drawPedShape(ctx, ped) {
  const bob = Math.sin(ped.walkPhase) * 1.1;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.heading + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, 4.4, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.knocked > 0 || ped.dead) {
    ctx.rotate(Math.PI / 2);
    ctx.globalAlpha = Math.max(0.35, Math.min(1, ped.knocked * 1.5 || 0.6));
  }
  ctx.fillStyle = ped.coat;
  ctx.beginPath();
  ctx.ellipse(0, bob * 0.3, 3.5, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -3.4, 2.1, 0, Math.PI * 2);
  ctx.fill();
  if (ped.hat) {
    ctx.fillStyle = '#1b1d24';
    ctx.fillRect(-2.4, -5.4, 4.8, 2.2);
  }
  if (ped.bag) {
    ctx.fillStyle = '#4b3a2a';
    ctx.fillRect(3, -1, 2.2, 3);
  }
  ctx.restore();
}

function drawPeds(ctx, state, left, top, right, bottom) {
  for (const ped of state.peds) {
    if (!visible(ped.x, ped.y, left, top, right, bottom)) continue;
    drawPedShape(ctx, ped);
    if (ped.dead && ped.knocked <= 0) {
      ctx.fillStyle = 'rgba(120,20,24,0.35)';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCar(ctx, car, color, isPlayer, time) {
  const spec = car.spec ?? { length: 26, width: 12.4 };
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(-spec.length / 2 + 2.5, -spec.width / 2 + 3, spec.length, spec.width);
  ctx.fillStyle = color;
  roundRect(ctx, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 3);
  ctx.fill();
  // A lighter stripe along the middle and a dark cabin.
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillRect(-spec.length / 2 + 3, -spec.width / 2 + 2, spec.length - 6, 1.2);
  ctx.fillStyle = 'rgba(16,22,32,0.92)';
  roundRect(ctx, -spec.length * 0.16, -spec.width / 2 + 1.6, spec.length * 0.42, spec.width - 3.2, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,190,230,0.28)';
  ctx.fillRect(-spec.length * 0.12, -spec.width / 2 + 2.2, spec.length * 0.34, 1.4);
  // Wheels.
  ctx.fillStyle = '#0d0f13';
  for (const side of [-1, 1]) {
    ctx.fillRect(-spec.length * 0.32, side * spec.width / 2 - 1.4, 4.5, 2.8);
    ctx.fillRect(spec.length * 0.18, side * spec.width / 2 - 1.4, 4.5, 2.8);
  }
  // Headlights and tail lights.
  const braking = car.brakeLights > 0;
  ctx.fillStyle = isPlayer ? '#fff4c2' : '#ffe9a3';
  ctx.fillRect(spec.length / 2 - 1.4, -spec.width / 2 + 1.4, 1.6, 2.2);
  ctx.fillRect(spec.length / 2 - 1.4, spec.width / 2 - 3.6, 1.6, 2.2);
  ctx.fillStyle = braking ? '#ff2a2a' : 'rgba(200,30,30,0.85)';
  ctx.fillRect(-spec.length / 2, -spec.width / 2 + 1.4, 1.3, 2.2);
  ctx.fillRect(-spec.length / 2, spec.width / 2 - 3.6, 1.3, 2.2);
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,201,74,0.45)';
    ctx.lineWidth = 0.8;
    roundRect(ctx, -spec.length / 2 - 1, -spec.width / 2 - 1, spec.length + 2, spec.width + 2, 4);
    ctx.stroke();
  }
  if (car.type === 'cruiser') {
    const flash = Math.floor(time * 8) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b3b' : '#2c5dff';
    ctx.fillRect(-3, -spec.width / 2 + 1, 5, 2.2);
    ctx.fillStyle = flash ? '#2c5dff' : '#ff3b3b';
    ctx.fillRect(-3, spec.width / 2 - 3.2, 5, 2.2);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#ffe9a3';
    ctx.fillRect(-2, -1.6, 4, 3.2);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTraffic(ctx, state, left, top, right, bottom) {
  for (const car of state.traffic) {
    if (!visible(car.x, car.y, left, top, right, bottom)) continue;
    if (state.vehicle === car) continue;
    drawCar(ctx, car, car.color, false, state.time);
  }
  for (const car of state.parked) {
    if (!visible(car.x, car.y, left, top, right, bottom)) continue;
    if (state.vehicle === car) continue;
    drawCar(ctx, car, car.color, false, state.time);
  }
}

function drawCops(ctx, state, left, top, right, bottom, time) {
  for (const cruiser of state.police.cruisers) {
    if (!cruiser || !visible(cruiser.x, cruiser.y, left, top, right, bottom)) continue;
    drawCar(ctx, cruiser, '#e9eaee', false, time);
    ctx.save();
    ctx.translate(cruiser.x, cruiser.y);
    ctx.rotate(cruiser.heading);
    ctx.fillStyle = 'rgba(30,80,220,0.9)';
    ctx.fillRect(-13, -4, 6, 8);
    ctx.restore();
  }
  for (const officer of state.police.officers) {
    if (!officer || !visible(officer.x, officer.y, left, top, right, bottom)) continue;
    ctx.save();
    ctx.translate(officer.x, officer.y);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 4.4, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (officer.dead) {
      ctx.rotate(officer.aim ?? 0);
      ctx.globalAlpha = 0.7;
    }
    ctx.fillStyle = officer.guard ? '#5d6b55' : '#283a6e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.8, 4.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = officer.guard ? '#a9442a' : '#d7dce6';
    ctx.fillRect(-1, -5.2, 2, 2.4);
    if (!officer.dead) {
      ctx.strokeStyle = '#1a1d26';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
    }
    ctx.restore();
    if (!officer.dead && !officer.guard) {
      const alert = officer.cool < 0.35;
      ctx.fillStyle = alert ? '#ff6b5b' : 'rgba(255,201,74,0.7)';
      ctx.beginPath();
      ctx.arc(officer.x, officer.y - 10, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlayer(ctx, state, time) {
  const player = state.player;
  const weapon = state.weapons[state.weaponIndex].key;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2.2, 4.6, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.aim + Math.PI / 2);
  ctx.fillStyle = '#e8b46a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.8, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b3142';
  ctx.beginPath();
  ctx.ellipse(0, 1.4, 3.2, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0c58f';
  ctx.beginPath();
  ctx.arc(0, -3.2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(-2.2, -5.2, 4.4, 1.4);
  if (weapon !== 'fists') {
    ctx.fillStyle = weapon === 'shotgun' ? '#6b4a2e' : '#22262e';
    ctx.fillRect(1.5, -9, weapon === 'shotgun' ? 2 : 1.8, 9);
  }
  ctx.restore();
  // A small aim reticle line so a screenshot shows which way the courier is pointing.
  if (state.shotFlash > 0) {
    ctx.fillStyle = `rgba(255,220,140,${state.shotFlash * 0.8})`;
    ctx.beginPath();
    ctx.arc(player.x + Math.cos(player.aim) * 12, player.y + Math.sin(player.aim) * 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  void time;
}

function drawBullets(ctx, state) {
  for (const bullet of state.police.bullets) {
    const tailX = bullet.x - bullet.vx * 0.02;
    const tailY = bullet.y - bullet.vy * 0.02;
    ctx.strokeStyle = bullet.friendly ? 'rgba(255,190,110,0.9)' : 'rgba(255,120,90,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
  }
}

function drawEffects(ctx, state) {
  for (const effect of state.effects) {
    const alpha = Math.max(0, effect.life / (effect.max ?? 1));
    if (effect.kind === 'tracer') {
      ctx.strokeStyle = `rgba(255,236,170,${alpha})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(effect.x1, effect.y1);
      ctx.lineTo(effect.x2, effect.y2);
      ctx.stroke();
    } else if (effect.kind === 'spark') {
      ctx.fillStyle = `rgba(255,200,90,${alpha})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 4 * alpha + 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === 'blood') {
      ctx.fillStyle = `rgba(140,25,30,${alpha * 0.8})`;
      ctx.beginPath();
      ctx.ellipse(effect.x, effect.y, 7 * (1 - alpha) + 2, 5 * (1 - alpha) + 1.5, effect.seed ?? 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === 'smoke') {
      ctx.fillStyle = `rgba(70,74,82,${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 10 + (1 - alpha) * 24, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === 'explosion') {
      const radius = 20 + (1 - alpha) * 46;
      ctx.fillStyle = `rgba(255,150,40,${alpha * 0.65})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,235,180,${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMarkers(ctx, state, time) {
  const markers = state.markers ?? [];
  for (const marker of markers) {
    const pulse = 0.6 + Math.sin(time * 4) * 0.25;
    ctx.strokeStyle = marker.kind === 'job' ? `rgba(255,201,74,${pulse})` : `rgba(90,220,255,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 16 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 30 + Math.sin(time * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = marker.kind === 'job' ? 'rgba(255,201,74,0.9)' : 'rgba(90,220,255,0.9)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.tailTarget) {
    ctx.strokeStyle = 'rgba(90,168,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.tailTarget.x, state.tailTarget.y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Night: tint the whole world blue, then punch light pools back in with 'lighter'.
function drawLighting(ctx, state, left, top, right, bottom, time) {
  const hour = state.clock / 60;
  const night = hour > 19.5 || hour < 6.2 ? 1 : hour > 18.5 ? (hour - 18.5) : hour < 7 ? (7 - hour) : 0;
  if (night <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(8,10,26,${0.42 * night})`;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of state.city?.lamps ?? []) {
    if (!visible(lamp.x, lamp.y, left, top, right, bottom, 40)) continue;
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 52);
    glow.addColorStop(0, `rgba(255,208,120,${0.34 * night})`);
    glow.addColorStop(0.5, `rgba(255,180,90,${0.12 * night})`);
    glow.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lamp.x - 52, lamp.y - 52, 104, 104);
  }
  for (const building of state.cityBuildings ?? []) {
    if (!building.neon) continue;
    if (building.x > right + 60 || building.x + building.w < left - 60 || building.y > bottom + 60 || building.y + building.h < top - 60) continue;
    ctx.fillStyle = building.neon;
    ctx.globalAlpha = 0.32 * night * (0.8 + Math.sin(time * 2 + building.x) * 0.2);
    ctx.fillRect(building.x + 4, building.y + building.h - 6, building.w - 8, 4);
    ctx.globalAlpha = 1;
  }
  // Headlight cones for the moving traffic and the player's car.
  const cars = [];
  if (state.vehicle) cars.push(state.vehicle);
  for (const car of state.traffic) if (!car.stolen) cars.push(car);
  for (const car of state.police.cruisers) if (car) cars.push(car);
  for (const car of cars) {
    if (!visible(car.x, car.y, left, top, right, bottom, 140)) continue;
    const length = state.vehicle === car ? 120 : 76;
    const cone = ctx.createRadialGradient(car.x, car.y, 6, car.x, car.y, length);
    cone.addColorStop(0, `rgba(255,236,180,${0.26 * night})`);
    cone.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.arc(0, 0, length, -0.38, 0.38);
    ctx.closePath();
    ctx.fillStyle = cone;
    ctx.fill();
    ctx.restore();
  }
  for (const police of state.police.cruisers) {
    if (!police) continue;
    const flash = Math.floor(time * 8) % 2 === 0;
    const color = flash ? '255,50,60' : '50,90,255';
    ctx.fillStyle = `rgba(${color},${0.25 * night})`;
    ctx.beginPath();
    ctx.arc(police.x, police.y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

