// main.js — opens the page, keeps the save and the menus, runs the fixed-step loop and hands
// state to the renderer and the HUD. `?shot=` sets up a deterministic scene for screenshots:
// shot=city puts the courier in traffic on the northline, shot=chase drives a live chase with
// Vex aboard and the stripes behind, shot=mission shows the follow job with the job card up,
// shot=start leaves a car parked at Sunmere under the title. The query never changes how the
// game plays; it only chooses where the camera opens.
import { createGame, MODE, pushMessage } from './game.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createMenu, drawHowTo } from './menu.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { districtName, enterVehicle, markerPoints, nearestRide, startMission, stepWorld } from './update.js';
import { objectiveText, SHOP_CELL, START_CELL } from './story.js';
import { readSave, readSettings, snapshot, writeSave, writeSettings } from './save.js';
import { addHeat, clearWanted } from './police.js';
import { CELL } from './config.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const hud = createHud();
const menu = createMenu();
const input = createInput(canvas);
const audio = createAudio();

const params = new URLSearchParams(location.search);
const shot = params.get('shot') ?? '';
const seed = params.get('seed') ?? 'tallow-point';
const game = createGame({ seed });
const state = game.state;
const storedSave = readSave();
const settings = readSettings();
state.camera.zoom = settings.zoom;
audio.setMuted(settings.muted);

for (const [element, id] of [[canvas, 'game'], [hud.canvas, 'hud'], [menu.canvas, 'menu']]) {
  element.id = id;
  document.body.appendChild(element);
}

let menuIndex = 0;
let howTo = false;
let menuOpen = true;
const boot = document.getElementById('boot');
if (boot) {
  boot.style.opacity = '0';
  setTimeout(() => boot.remove(), 320);
}
let renderTime = 0;

function layout() {
  renderer.resize();
  hud.resize(renderer.view);
  menu.resize(renderer.view);
}
window.addEventListener('resize', layout);
layout();
renderer.setCity(game.city);

const controls = {
  forward: false, back: false, left: false, right: false, boost: false,
  fire: false, interact: false, switchWeapon: false, aimX: 0, aimY: 0,
};

function worldFromMouse() {
  const view = renderer.view;
  const zoom = state.camera.zoom;
  return {
    x: (input.mouse.x / view.dpr - view.width / 2) / zoom + state.camera.x,
    y: (input.mouse.y / view.dpr - view.height / 2) / zoom + state.camera.y,
  };
}

function readControls() {
  controls.forward = input.isDown('KeyW', 'ArrowUp');
  controls.back = input.isDown('KeyS', 'ArrowDown');
  controls.left = input.isDown('KeyA', 'ArrowLeft');
  controls.right = input.isDown('KeyD', 'ArrowRight');
  controls.boost = input.isDown('ShiftLeft', 'ShiftRight');
  controls.fire = input.mouse.down || input.isDown('Space');
  controls.interact = input.wasPressed('KeyE');
  controls.switchWeapon = input.wasPressed('KeyQ');
  const world = worldFromMouse();
  controls.aimX = world.x;
  controls.aimY = world.y;
}

function saveNow() {
  const ok = writeSave(snapshot(state));
  pushMessage(state, ok ? `Saved at ${new Date().toLocaleTimeString()}` : 'This browser refused to save', ok ? 'money' : 'bad', 3);
}

function applySave(save) {
  if (!save) return false;
  state.player.x = save.player.x;
  state.player.y = save.player.y;
  state.player.cash = save.player.cash ?? 120;
  state.player.hp = save.player.health ?? 100;
  state.player.armor = save.player.armor ?? 0;
  state.clock = save.clock ?? state.clock;
  state.completed = save.completed ?? [];
  clearWanted(state.police.wanted);
  if (save.wanted && save.wanted.heat > 0) addHeat(state.police.wanted, save.wanted.heat);
  if (save.mission) startMission(state, Math.min(4, save.mission.index ?? 0));
  else state.missionIndex = Math.min(4, save.completed.length);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  return true;
}

function loadNow() {
  if (applySave(readSave())) {
    state.mode = MODE.PLAY;
    menuOpen = false;
    pushMessage(state, 'Back on the street. The city kept your money.', 'info', 3);
  } else {
    pushMessage(state, 'No save on this browser yet. Take a job first.', 'bad', 3.4);
  }
}

function newLife() {
  clearWanted(state.police.wanted);
  state.player.x = START_CELL.x * CELL;
  state.player.y = START_CELL.y * CELL;
  state.player.cash = 120;
  state.player.hp = 100;
  state.player.armor = 0;
  state.vehicle = null;
  state.mission = null;
  state.missionIndex = 0;
  state.completed = [];
  state.clock = 21 * 60 + 40;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.mode = MODE.PLAY;
  menuOpen = false;
  pushMessage(state, 'New life, same bay. Della Cask has work on Crater Row.', 'mission', 5);
}

function menuItems() {
  const hasSave = Boolean(storedSave);
  return [
    { id: 'continue', label: hasSave ? 'CONTINUE' : 'START A LIFE', hint: hasSave ? 'pick up the save on this browser' : 'walk out of the Crater Row safehouse' },
    { id: 'new', label: hasSave ? 'NEW LIFE' : 'TAKE THE FIRST JOB', hint: 'reset the wallet and start at the safehouse' },
    { id: 'how', label: 'HOW TO PLAY', hint: 'controls, jobs, wanted level, saving' },
  ];
}

function selectMenu(index) {
  audio.unlock();
  audio.ui();
  const item = menuItems()[index];
  if (!item) return;
  if (item.id === 'how') howTo = true;
  else if (item.id === 'new') newLife();
  else if (!storedSave) newLife();
  else loadNow();
}

function handleGlobalKeys() {
  if (input.wasPressed('KeyK')) {
    audio.unlock();
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    writeSettings(settings);
  }
  if (input.wasPressed('Equal', 'NumpadAdd')) {
    settings.zoom = Math.min(1.45, settings.zoom + 0.1);
    state.camera.zoom = settings.zoom;
    writeSettings(settings);
  }
  if (input.wasPressed('Minus', 'NumpadSubtract')) {
    settings.zoom = Math.max(0.7, settings.zoom - 0.1);
    state.camera.zoom = settings.zoom;
    writeSettings(settings);
  }
  if (menuOpen) {
    if (input.wasPressed('ArrowDown', 'KeyS')) menuIndex = (menuIndex + 1) % 3;
    if (input.wasPressed('ArrowUp', 'KeyW')) menuIndex = (menuIndex + 2) % 3;
    if (input.wasPressed('Enter', 'NumpadEnter')) {
      if (howTo) howTo = false;
      else selectMenu(menuIndex);
    }
    if (input.wasPressed('Escape') && howTo) howTo = false;
    if (input.mouse.clicked) {
      const view = renderer.view;
      menuItems().forEach((item, index) => {
        const box = menu.buttonBox(index);
        const mx = input.mouse.x / view.dpr;
        const my = input.mouse.y / view.dpr;
        if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
          menuIndex = index;
          if (item.id === 'how') howTo = true;
          else selectMenu(index);
        }
      });
    }
    return;
  }
  if (state.mode === MODE.PLAY) {
    if (input.wasPressed('Escape')) {
      state.mode = MODE.PAUSED;
      return;
    }
    if (input.wasPressed('KeyM')) state.mode = MODE.MAP;
    if (input.wasPressed('F5')) saveNow();
    if (input.wasPressed('F9')) loadNow();
    if (input.wasPressed('Digit1')) state.weaponIndex = 0;
    if (input.wasPressed('Digit2')) state.weaponIndex = 1;
    if (input.wasPressed('Digit3')) state.weaponIndex = 2;
    return;
  }
  if (state.mode === MODE.PAUSED) {
    if (input.wasPressed('Escape')) state.mode = MODE.PLAY;
    if (input.wasPressed('KeyM')) state.mode = MODE.MAP;
    if (input.wasPressed('F5')) saveNow();
    if (input.wasPressed('F9')) loadNow();
    if (input.wasPressed('KeyH')) {
      state.mode = MODE.PLAY;
      menuOpen = true;
      howTo = true;
    }
    return;
  }
  if (state.mode === MODE.MAP) {
    if (input.wasPressed('Escape', 'KeyM')) state.mode = MODE.PLAY;
    return;
  }
  if (state.mode === MODE.DEAD || state.mode === MODE.BUSTED) {
    if (input.wasPressed('KeyR')) {
      state.player.hp = 100;
      state.player.armor = 25;
      state.player.x = SHOP_CELL.x * CELL;
      state.player.y = SHOP_CELL.y * CELL;
      state.player.cash = Math.max(0, state.player.cash - 150);
      state.vehicle = null;
      state.camera.x = state.player.x;
      state.camera.y = state.player.y;
      clearWanted(state.police.wanted);
      state.mode = MODE.PLAY;
    }
    if (input.wasPressed('F9')) loadNow();
  }
}

function playEvents() {
  for (const item of state.events) {
    switch (item.type) {
      case 'shotPistol': audio.shoot(); break;
      case 'shotgun': audio.shotgun(); break;
      case 'punch': audio.punch(); break;
      case 'hurt': audio.hurt(); break;
      case 'crash':
        audio.crash();
        state.camera.shake = Math.max(state.camera.shake, Math.min(0.9, (item.strength ?? 40) / 240));
        break;
      case 'thud': audio.punch(); break;
      case 'carStolen': audio.pickup(); break;
      case 'pickup': audio.pickup(); break;
      case 'weapon': audio.ui(); break;
      case 'missionDone': audio.missionDone(); state.camera.shake = 0.15; break;
      case 'missionFail':
      case 'wasted':
      case 'busted': audio.fail(); break;
      case 'carExplode':
        audio.shotgun();
        state.effects.push({ kind: 'explosion', x: item.x, y: item.y, life: 0.9, max: 0.9 });
        state.camera.shake = 1;
        break;
      case 'blood':
        state.effects.push({ kind: 'blood', x: item.x, y: item.y, life: 6, max: 6, seed: Math.random() * 3 });
        break;
      case 'spark':
        state.effects.push({ kind: 'spark', x: item.x, y: item.y, life: 2.2, max: 2.2 });
        break;
      default:
        break;
    }
  }
}

function hudExtras() {
  const markers = markerPoints(state);
  state.markers = markers;
  let prompt = '';
  if (state.mode === MODE.PLAY && state.stealCar) {
    prompt = 'Breaking in\u2026';
  } else if (state.mode === MODE.PLAY && !state.vehicle) {
    const ride = nearestRide(state);
    if (ride) prompt = ride.driver && !ride.stolen ? 'E  Carjack' : 'E  Steal car';
  } else if (state.mode === MODE.PLAY && state.vehicle) {
    prompt = 'E  get out';
  }
  return {
    mode: state.mode,
    markers,
    district: districtName(state),
    blocks: game.city.blocks,
    objective: objectiveText(state.mission, state),
    prompt,
    stealProgress: state.stealProgress,
  };
}

function drawMap() {
  const { ctx } = renderer;
  const view = renderer.view;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = 'rgba(5,8,14,0.94)';
  ctx.fillRect(0, 0, view.width, view.height);
  const size = Math.min(view.width, view.height) * 0.76;
  const scale = size / (7 * CELL);
  const originX = view.width / 2 - size / 2;
  const originY = view.height / 2 - size / 2 + 10;
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);
  for (const block of game.city.blocks) {
    ctx.fillStyle = 'rgba(52,58,72,1)';
    ctx.fillRect(block.x, block.y, block.size, block.size);
  }
  for (const building of game.city.buildings) {
    ctx.fillStyle = 'rgba(72,80,98,1)';
    ctx.fillRect(building.x, building.y, building.w, building.h);
  }
  ctx.fillStyle = 'rgba(14,18,26,1)';
  for (let index = 0; index <= 7; index += 1) {
    ctx.fillRect(index * CELL - 12, 0, 24, 7 * CELL);
    ctx.fillRect(0, index * CELL - 12, 7 * CELL, 24);
  }
  ctx.restore();
  ctx.textAlign = 'center';
  for (const marker of markerPoints(state)) {
    ctx.fillStyle = marker.kind === 'job' ? '#ffc94a' : '#39d2ff';
    ctx.beginPath();
    ctx.arc(originX + marker.x * scale, originY + marker.y * scale, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 11px "Sora", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(marker.label, originX + marker.x * scale, originY + marker.y * scale - 12);
  }
  const focus = state.vehicle ?? state.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(originX + focus.x * scale, originY + focus.y * scale, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '900 24px "Sora", system-ui, sans-serif';
  ctx.fillStyle = '#ffc94a';
  ctx.fillText('TALLOW POINT', view.width / 2, 52);
  ctx.font = '600 12px "Sora", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('M or Esc to close  ·  gold: next job  ·  cyan: objective', view.width / 2, view.height - 28);
  ctx.textAlign = 'left';
}

function setupShot(name) {
  state.mode = MODE.PLAY;
  menuOpen = false;
  if (name === 'city') {
    state.clock = 21 * 60 + 5;
    state.player.x = CELL * 1.5 + 12;
    state.player.y = CELL * 2.45;
    const sedan = state.parked.find((car) => car.type === 'coupe') ?? state.parked[0];
    if (sedan) {
      enterVehicle(state, sedan);
      sedan.heading = 0;
    }
    state.missionIndex = 1;
    addHeat(state.police.wanted, 30);
    pushMessage(state, 'Northline, 21:05. Traffic never sleeps in this bay.', 'info', 7);
  } else if (name === 'chase') {
    state.clock = 22 * 60 + 10;
    state.player.x = CELL * 3.35;
    state.player.y = CELL * 3.35;
    const coupe = state.parked.find((car) => car.type === 'coupe') ?? state.parked[0];
    if (coupe) {
      enterVehicle(state, coupe);
      coupe.heading = -0.55;
    }
    startMission(state, 3);
    state.passenger = true;
    if (state.vehicle) state.vehicle.occupancy = 2;
    addHeat(state.police.wanted, 240);
    pushMessage(state, 'Vex is in. The stripes heard.', 'mission', 7);
  } else if (name === 'mission') {
    state.clock = 20 * 60 + 50;
    state.player.x = CELL * 3.2;
    state.player.y = CELL * 3.62;
    startMission(state, 1);
    state.weaponIndex = 1;
    state.player.aim = 0.12;
    pushMessage(state, 'Silent Partner: keep the cruiser in sight.', 'mission', 7);
    for (let index = 0; index < 5; index += 1) {
      state.police.officers.push({
        id: 900 + index, x: CELL * 3.05 + index * 13, y: CELL * 3.3, heading: 0, hp: 55, cool: index * 0.4, aim: 0.6,
        guard: false, dead: false, step: index, cruiser: null,
      });
    }
  } else if (name === 'start') {
    clearWanted(state.police.wanted);
    state.clock = 21 * 60 + 20;
    state.player.x = CELL * 3.62 + 8;
    state.player.y = CELL * 2.58;
    const taxi = state.traffic.find((car) => car.type === 'taxi') ?? state.parked[0];
    if (taxi) {
      enterVehicle(state, taxi);
      taxi.x = state.player.x + 20;
      taxi.y = state.player.y + 6;
      taxi.heading = Math.PI / 2;
    }
    menuOpen = true;
    menuIndex = 0;
    state.mode = MODE.PLAY;
  } else if (name === 'steal') {
    clearWanted(state.police.wanted);
    state.clock = 21 * 60 + 30;
    const van = state.parked.find((c) => c.type === 'van') ?? state.parked[0];
    if (van) {
      state.player.x = van.x - 16;
      state.player.y = van.y + 8;
      state.player.heading = 0;
      state.stealCar = van;
      state.stealProgress = 0.55;
    }
    state.mode = MODE.PLAY;
    menuOpen = false;
    pushMessage(state, 'Parked van — E to break in.', 'info', 6);
  }
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  renderer.clampCamera(state.camera);
}

game.clampCamera = (camera) => renderer.clampCamera(camera);

setupShot(shot);
if (shot === 'city' || shot === 'chase') {
  const idle = { forward: false, back: false, left: false, right: false, fire: false, interact: false, aimX: 0, aimY: 0 };
  for (let index = 0; index < 90; index += 1) {
    idle.aimX = state.player.x + 120;
    idle.aimY = state.player.y + 20;
    stepWorld(game, 1 / 60, idle);
  }
  state.events.length = 0;
}

let accumulator = 0;
let last = performance.now();
let sirenTimer = 0;
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderTime += raw;
  handleGlobalKeys();
  readControls();
  if (!menuOpen && state.mode === MODE.PLAY) {
    accumulator += raw;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 4) {
      stepWorld(game, 1 / 60, controls);
      accumulator -= 1 / 60;
      steps += 1;
    }
    playEvents();
    sirenTimer -= raw;
    if (sirenTimer <= 0) {
      sirenTimer = 0.2;
      updateSiren();
    }
  } else {
    input.consume();
  }
  const extras = hudExtras();
  renderer.draw(game, renderTime);
  if (state.mode === MODE.MAP) {
    drawMap();
  } else {
    hud.draw(state, extras);
  }
  if (state.mode === MODE.MAP) hud.canvas.style.display = 'none';
  else hud.canvas.style.display = '';
  if (menuOpen) {
    menu.canvas.style.display = '';
    menu.draw(state, renderTime, { index: menuIndex, zoom: settings.zoom, muted: settings.muted });
    if (howTo) drawHowTo(menu.ctx, renderer.view.width, renderer.view.height);
  } else {
    menu.canvas.style.display = 'none';
  }
  audio.engine(state.vehicle ? Math.abs(state.speed ?? 0) / 200 : 0, Boolean(state.vehicle) && state.mode === MODE.PLAY && !menuOpen);
  requestAnimationFrame(frame);
}

function updateSiren() {
  const police = state.police;
  const focus = state.vehicle ?? state.player;
  let nearest = Infinity;
  for (const cruiser of police.cruisers) {
    if (!cruiser) continue;
    nearest = Math.min(nearest, Math.hypot(cruiser.x - focus.x, cruiser.y - focus.y));
  }
  const loud = police.wanted.stars > 0 && nearest < 460 ? 1 - nearest / 560 : 0;
  audio.siren(Math.max(0, loud));
}

audio.music();
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
state.events.length = 0;
requestAnimationFrame(frame);
