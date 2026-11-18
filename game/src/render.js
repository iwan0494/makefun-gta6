// render.js — the 3D view of Tallow Point. three.js (vendored under game/vendor/three.min.js,
// resolved through the page's single import map) extrudes the same 7 x 7 block grid the 2D game
// always used into a city of boxes: the ground and streets are flat, every building footprint in
// city.buildings becomes a tall box, the bay becomes a plane of water, and the player, the
// traffic, the cruisers and the pedestrians are simple shapes. A chase camera trails the focus
// from behind and above. None of the game logic changes here: this module only READS the state
// that update.js/city.js/police.js produce and draws it.
//
// The #game canvas stays a 2D canvas so that main.js's full-map screen (drawMap, which paints
// through renderer.ctx) and the HUD keep working unchanged; in play it is a transparent overlay
// sitting on top of the WebGL canvas, and each frame it is cleared so the 3D scene shows through.
import * as THREE from 'three';
import {
  CELL, GRID, ROAD, WORLD,
} from './config.js';
import { RIVER_X } from './city.js';

// World coordinates are 2D: x to the right, y "down" the map. In three.js we keep x as x and map
// the world's y onto the scene's z (the floor is the XZ plane), with y up. A heading angle h in
// the 2D game points along (cos h, sin h) on (x, y); in the scene that is (cos h, sin h) on
// (x, z), so a mesh's local +X axis is turned by rotation.y = -h to face "forward".

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let viewWidth = 1;
  let viewHeight = 1;
  let dpr = 1;

  // The 3D scene lives on its own WebGL canvas. Insert it just before the #game overlay so it
  // sits underneath it; pointer events go to #game (which covers the whole viewport).
  const glCanvas = document.createElement('canvas');
  glCanvas.id = 'game-3d';
  glCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none;';
  if (canvas.parentNode) canvas.parentNode.insertBefore(glCanvas, canvas);
  else document.body.appendChild(glCanvas);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0a0d18, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d18);
  scene.fog = new THREE.Fog(0x0a0d18, 640, 1500);

  const camera = new THREE.PerspectiveCamera(58, 1, 1, 4000);
  camera.position.set(WORLD / 2, 260, WORLD / 2 + 220);
  camera.lookAt(WORLD / 2, 0, WORLD / 2);

  // Night city lighting: a cool sky/ground ambient, a soft fill and one warm "moon" key light.
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x0a0d18, 0.9));
  scene.add(new THREE.AmbientLight(0x8899bb, 0.65));
  const moon = new THREE.DirectionalLight(0xffe8c0, 1.15);
  moon.position.set(WORLD * 0.32, 950, WORLD * 0.18);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0x4a6fa8, 0.5);
  fill.position.set(WORLD * 0.82, 420, WORLD * 0.9);
  scene.add(fill);

  const staticGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  scene.add(staticGroup);
  scene.add(actorGroup);

  // One shared unit cube for every box in the scene; each mesh scales it to size.
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  const sharedBox = (material) => new THREE.Mesh(UNIT, material);

  let sceneBuilt = false;

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    viewWidth = canvas.clientWidth || globalThis.innerWidth;
    viewHeight = canvas.clientHeight || globalThis.innerHeight;
    canvas.width = Math.max(1, Math.floor(viewWidth * dpr));
    canvas.height = Math.max(1, Math.floor(viewHeight * dpr));
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewWidth, viewHeight, false);
    camera.aspect = Math.max(0.1, viewWidth / Math.max(1, viewHeight));
    camera.updateProjectionMatrix();
  }

  // Extrude the 2D city into 3D once. Streets stay flat (the ground plane is the road colour and
  // the blocks are pads on top of it), buildings rise by their floor count, the bay fills the
  // east strip, and shop fronts get a small glowing strip.
  function buildScene(city) {
    for (const child of staticGroup.children.slice()) staticGroup.remove(child);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshStandardMaterial({ color: 0x1c202b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD / 2, 0, WORLD / 2);
    staticGroup.add(ground);

    const waterW = Math.max(1, WORLD - RIVER_X);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(waterW, WORLD),
      new THREE.MeshStandardMaterial({ color: 0x123048, roughness: 0.55, metalness: 0.25 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(RIVER_X + waterW / 2, 0.35, WORLD / 2);
    staticGroup.add(water);

    // Block pads: the sidewalk / lot / park surface of every cell, one slab each.
    for (const block of city.blocks) {
      const park = block.kind === 'park';
      const pad = sharedBox(new THREE.MeshStandardMaterial({ color: park ? 0x2f4a37 : 0x343843, roughness: 1 }));
      pad.scale.set(block.size, 1.2, block.size);
      pad.position.set(block.x + block.size / 2, 0.6, block.y + block.size / 2);
      staticGroup.add(pad);
    }

    // Roads: the grid lines between blocks, drawn as thin dark strips so the layout reads from
    // the chase camera. The ground plane already supplies the base colour, these add the lanes.
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x15180f, roughness: 1 });
    for (let index = 0; index <= GRID; index += 1) {
      const p = index * CELL;
      const across = sharedBox(roadMat);
      across.scale.set(WORLD, 0.4, ROAD);
      across.position.set(WORLD / 2, 1.3, p);
      staticGroup.add(across);
      const down = sharedBox(roadMat);
      down.scale.set(ROAD, 0.4, WORLD);
      down.position.set(p, 1.3, WORLD / 2);
      staticGroup.add(down);
    }

    // Buildings: footprint box sized by floor count, a slightly inset roof cap, and a neon strip
    // for the shops so the street level glows at night.
    for (const b of city.buildings) {
      const height = 9 + (b.floors || 1) * 11;
      const body = sharedBox(new THREE.MeshStandardMaterial({ color: b.body, roughness: 0.9, metalness: 0.05 }));
      body.scale.set(b.w, height, b.h);
      body.position.set(b.x + b.w / 2, height / 2 + 1.4, b.y + b.h / 2);
      staticGroup.add(body);

      const roof = sharedBox(new THREE.MeshStandardMaterial({ color: b.roof, roughness: 1 }));
      roof.scale.set(b.w * 0.98, 2, b.h * 0.98);
      roof.position.set(b.x + b.w / 2, height + 2.4, b.y + b.h / 2);
      staticGroup.add(roof);

      if (b.neon) {
        const neon = sharedBox(new THREE.MeshStandardMaterial({
          color: b.neon, emissive: new THREE.Color(b.neon), emissiveIntensity: 1.5, roughness: 0.5,
        }));
        neon.scale.set(Math.max(2, b.w * 0.9), 1.4, 1.4);
        neon.position.set(b.x + b.w / 2, 4.4, b.y + b.h - 1);
        staticGroup.add(neon);
      }
    }

    sceneBuilt = true;
  }

  // Reusable actor meshes. Pools grow on demand and any slot not used this frame is hidden, so
  // nothing is allocated per frame once the pools reach the game's steady population.
  const carPool = [];
  const pedPool = [];

  function carMesh(index) {
    while (carPool.length <= index) {
      const mesh = sharedBox(new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.75, metalness: 0.1 }));
      actorGroup.add(mesh);
      carPool.push(mesh);
    }
    return carPool[index];
  }

  function pedMesh(index) {
    while (pedPool.length <= index) {
      const mesh = sharedBox(new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }));
      actorGroup.add(mesh);
      pedPool.push(mesh);
    }
    return pedPool[index];
  }

  // The player on foot: a gold body and a head, kept distinct so they never blend into traffic.
  const playerMesh = new THREE.Group();
  {
    const body = sharedBox(new THREE.MeshStandardMaterial({ color: 0xe8b46a, roughness: 0.85 }));
    body.scale.set(6, 10, 6);
    body.position.y = 5;
    playerMesh.add(body);
    const coat = sharedBox(new THREE.MeshStandardMaterial({ color: 0x2b3142, roughness: 0.9 }));
    coat.scale.set(6.4, 4, 6.4);
    coat.position.y = 6;
    playerMesh.add(coat);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(3.1, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xf0c58f, roughness: 0.9 }),
    );
    head.position.y = 12.4;
    playerMesh.add(head);
  }
  actorGroup.add(playerMesh);

  function placeCar(mesh, car, color) {
    const spec = car.spec ?? { length: 26, width: 12.4 };
    const height = 10;
    mesh.visible = true;
    mesh.position.set(car.x, height / 2 + 1.4, car.y);
    mesh.rotation.y = -(car.heading || 0);
    mesh.scale.set(spec.length, height, spec.width);
    mesh.material.color.set(color ?? '#cccccc');
  }

  function updateActors(state) {
    let carIndex = 0;
    for (const car of state.traffic) {
      if (car === state.vehicle) continue;
      placeCar(carMesh(carIndex), car, car.color);
      carIndex += 1;
    }
    for (const car of state.parked) {
      if (car === state.vehicle) continue;
      placeCar(carMesh(carIndex), car, car.color);
      carIndex += 1;
    }
    for (const cruiser of state.police.cruisers) {
      if (!cruiser) continue;
      placeCar(carMesh(carIndex), cruiser, '#e9eaee');
      carIndex += 1;
    }
    if (state.vehicle) {
      placeCar(carMesh(carIndex), state.vehicle, state.vehicle.color);
      carIndex += 1;
    }
    for (let index = carIndex; index < carPool.length; index += 1) carPool[index].visible = false;

    let pedIndex = 0;
    for (const ped of state.peds) {
      const mesh = pedMesh(pedIndex);
      mesh.visible = true;
      mesh.position.set(ped.x, 5.6, ped.y);
      mesh.rotation.y = -(ped.heading || 0);
      mesh.scale.set(4, 9, 4);
      mesh.material.color.set(ped.coat || '#888888');
      pedIndex += 1;
    }
    for (const officer of state.police.officers) {
      if (!officer) continue;
      const mesh = pedMesh(pedIndex);
      mesh.visible = true;
      mesh.position.set(officer.x, 5.6, officer.y);
      mesh.rotation.y = -(officer.heading || 0);
      mesh.scale.set(4.4, 9.5, 4.4);
      mesh.material.color.set(officer.guard ? '#5d6b55' : '#283a6e');
      pedIndex += 1;
    }
    for (let index = pedIndex; index < pedPool.length; index += 1) pedPool[index].visible = false;

    const inCar = Boolean(state.vehicle);
    playerMesh.visible = !inCar;
    if (!inCar) {
      playerMesh.position.set(state.player.x, 1.2, state.player.y);
      playerMesh.rotation.y = -(state.player.heading || 0);
    }
  }

  // Chase camera: sit behind and above whatever the player is driving or walking, look slightly
  // past them, ease toward the target each frame and stop at the edge of the world.
  let lastTime = -1;
  let lastFocus = { x: WORLD / 2, y: WORLD / 2 };
  function updateChaseCamera(state, time) {
    const dt = lastTime < 0 ? 0.016 : Math.min(0.05, Math.max(0.001, time - lastTime));
    lastTime = time;

    const focus = state.vehicle ?? state.player;
    lastFocus = focus;
    const heading = state.vehicle ? state.vehicle.heading : (state.player.heading ?? 0);
    const dist = state.vehicle ? 235 : 168;
    const height = state.vehicle ? 145 : 122;
    const lookAhead = state.vehicle ? 55 : 26;

    let camX = focus.x - Math.cos(heading) * dist;
    let camZ = focus.y - Math.sin(heading) * dist;
    camX = Math.max(75, Math.min(WORLD - 75, camX));
    camZ = Math.max(75, Math.min(WORLD - 75, camZ));

    const ease = Math.min(1, dt * 6);
    camera.position.x += (camX - camera.position.x) * ease;
    camera.position.y += (height - camera.position.y) * ease;
    camera.position.z += (camZ - camera.position.z) * ease;

    const shake = Math.max(0, Math.min(1, state.camera.shake || 0));
    const sx = (Math.random() - 0.5) * shake * 6;
    const sy = (Math.random() - 0.5) * shake * 4;
    camera.position.x += sx;
    camera.position.y += sy * 0.5;

    const targetX = focus.x + Math.cos(heading) * lookAhead;
    const targetZ = focus.y + Math.sin(heading) * lookAhead;
    camera.lookAt(targetX, 9, targetZ);
  }

  function draw(game, time) {
    const state = game.state;
    // Clear the 2D overlay so the WebGL scene underneath is visible in play; the map screen
    // (drawMap) repaints this canvas afterwards when the player opens the map.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sceneBuilt) return;
    updateActors(state);
    updateChaseCamera(state, time);
    renderer.render(scene, camera);
  }

  // Kept for update.js (game.clampCamera): clamps the 2D camera point to the world so the map
  // focus never leaves the city. The 3D camera clamps itself in updateChaseCamera.
  function cameraMargin(viewW, viewH, zoom) {
    return { halfW: viewW / (2 * zoom) + 30, halfH: viewH / (2 * zoom) + 30 };
  }
  function clampCamera(camera2d, viewW = viewWidth, viewH = viewHeight) {
    const zoom = camera2d.zoom || 1;
    const { halfW, halfH } = cameraMargin(viewW, viewH, zoom);
    camera2d.x = Math.max(Math.min(WORLD / 2, halfW), Math.min(Math.max(WORLD / 2, WORLD - halfW), camera2d.x));
    camera2d.y = Math.max(Math.min(WORLD / 2, halfH), Math.min(Math.max(WORLD / 2, WORLD - halfH), camera2d.y));
  }

  // Unused by main.js (it derives aim from renderer.view), kept for interface parity.
  function screenToWorld() {
    return { x: lastFocus.x, y: lastFocus.y };
  }

  return {
    ctx,
    resize,
    setCity: buildScene,
    draw,
    screenToWorld,
    clampCamera,
    get view() { return { width: viewWidth, height: viewHeight, dpr }; },
  };
}
