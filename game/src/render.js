// render.js — 3D view of Tallow Point (3D-2: city detail + traffic/peds 3D).
// three.js (vendored) extrudes the 7x7 grid into a city of boxes with district variety,
// lane markings, sidewalks, a shoreline, and distinct meshes for traffic/peds/police.
import * as THREE from 'three';
import { CELL, GRID, ROAD, WORLD } from './config.js';
import { RIVER_X, districtAt } from './city.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let viewWidth = 1;
  let viewHeight = 1;
  let dpr = 1;

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

  const UNIT = new THREE.BoxGeometry(1, 1, 1);

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

  // District accent colors (hex) for building variety.
  const DISTRICT_COLORS = {
    'Kessel Wharf': { body: 0x2a4a5a, roof: 0x1a2a34, neon: 0x3aa0b8 },
    'Northline': { body: 0x4a4230, roof: 0x2a2418, neon: 0xb8a34a },
    'Moraine Heights': { body: 0x3a2f4a, roof: 0x221a30, neon: 0x8f6fb8 },
    'Crater Row': { body: 0x4a2f28, roof: 0x2a1814, neon: 0xc0603a },
    'Sunmere': { body: 0x2f4a32, roof: 0x1a2a1e, neon: 0x58b46a },
  };

  function hashN(x, y) { return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1; }

  function buildScene(city) {
    for (const child of staticGroup.children.slice()) staticGroup.remove(child);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ color: 0x1c202b, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD / 2, 0, WORLD / 2);
    staticGroup.add(ground);

    const waterW = Math.max(1, WORLD - RIVER_X);
    // shoreline sand strip
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(14, WORLD), new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 }));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(RIVER_X - 7, 0.2, WORLD / 2);
    staticGroup.add(shore);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(waterW, WORLD), new THREE.MeshStandardMaterial({ color: 0x123048, roughness: 0.55, metalness: 0.25 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(RIVER_X + waterW / 2, 0.35, WORLD / 2);
    staticGroup.add(water);

    // Block pads (sidewalk/lots)
    for (const block of city.blocks) {
      const park = block.kind === 'park';
      const pad = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: park ? 0x2f4a37 : 0x343843, roughness: 1 }));
      pad.scale.set(block.size, 1.2, block.size);
      pad.position.set(block.x + block.size / 2, 0.6, block.y + block.size / 2);
      staticGroup.add(pad);
    }

    // Roads with sidewalks
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x15180f, roughness: 1 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x454b58, roughness: 1 });
    const laneMat = new THREE.MeshStandardMaterial({ color: 0xd8c878, roughness: 1 });
    for (let index = 0; index <= GRID; index += 1) {
      const p = index * CELL;
      // road strip
      const across = new THREE.Mesh(UNIT, roadMat);
      across.scale.set(WORLD, 0.4, ROAD);
      across.position.set(WORLD / 2, 1.3, p);
      staticGroup.add(across);
      const down = new THREE.Mesh(UNIT, roadMat);
      down.scale.set(ROAD, 0.4, WORLD);
      down.position.set(p, 1.3, WORLD / 2);
      staticGroup.add(down);
      // sidewalks along both sides
      for (const side of [-1, 1]) {
        const swA = new THREE.Mesh(UNIT, sidewalkMat);
        swA.scale.set(WORLD, 0.5, 6);
        swA.position.set(WORLD / 2, 1.0, p + (ROAD / 2 + 3) * side);
        staticGroup.add(swA);
        const swB = new THREE.Mesh(UNIT, sidewalkMat);
        swB.scale.set(6, 0.5, WORLD);
        swB.position.set(p + (ROAD / 2 + 3) * side, 1.0, WORLD / 2);
        staticGroup.add(swB);
      }
      // lane markings (dashed) along center of road
      for (let k = 0; k < GRID; k += 1) {
        const lm = new THREE.Mesh(UNIT, laneMat);
        lm.scale.set(18, 0.5, 2);
        lm.position.set(k * CELL + CELL / 2, 1.6, p);
        staticGroup.add(lm);
        const lm2 = new THREE.Mesh(UNIT, laneMat);
        lm2.scale.set(2, 0.5, 18);
        lm2.position.set(p, 1.6, k * CELL + CELL / 2);
        staticGroup.add(lm2);
      }
    }

    // Buildings with district variety
    for (const b of city.buildings) {
      const dist = districtAt(b.x, b.y);
      const dc = DISTRICT_COLORS[dist.name] || { body: 0x3a3a44, roof: 0x222228, neon: 0x39d2ff };
      const jitter = 0.85 + hashN(b.x, b.y) * 0.3;
      const height = (9 + (b.floors || 1) * 11) * jitter;
      const body = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: dc.body, roughness: 0.9, metalness: 0.05 }));
      body.scale.set(b.w, height, b.h);
      body.position.set(b.x + b.w / 2, height / 2 + 1.4, b.y + b.h / 2);
      staticGroup.add(body);

      const roof = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: dc.roof, roughness: 1 }));
      roof.scale.set(b.w * 0.98, 2, b.h * 0.98);
      roof.position.set(b.x + b.w / 2, height + 2.4, b.y + b.h / 2);
      staticGroup.add(roof);

      if (b.neon) {
        const neon = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: b.neon, emissive: new THREE.Color(b.neon), emissiveIntensity: 1.5, roughness: 0.5 }));
        neon.scale.set(Math.max(2, b.w * 0.9), 1.4, 1.4);
        neon.position.set(b.x + b.w / 2, 4.4, b.y + b.h - 1);
        staticGroup.add(neon);
      }
    }

    sceneBuilt = true;
  }

  // Actor pools
  const carPool = [];
  const pedPool = [];

  function carMesh(index) {
    while (carPool.length <= index) {
      const group = new THREE.Group();
      // body
      const body = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.75, metalness: 0.1 }));
      body.scale.set(1, 0.5, 0.55);
      body.position.y = 0.35;
      group.add(body);
      // cabin
      const cabin = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6, metalness: 0.2 }));
      cabin.scale.set(0.55, 0.35, 0.5);
      cabin.position.set(0, 0.7, 0);
      group.add(cabin);
      actorGroup.add(group);
      carPool.push(group);
    }
    return carPool[index];
  }

  function pedMesh(index) {
    while (pedPool.length <= index) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }));
      body.scale.set(0.35, 0.7, 0.3);
      body.position.y = 0.35;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd0a070, roughness: 0.9 }));
      head.position.y = 0.85;
      group.add(head);
      actorGroup.add(group);
      pedPool.push(group);
    }
    return pedPool[index];
  }

  const playerMesh = new THREE.Group();
  {
    const body = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0xe8b46a, roughness: 0.85 }));
    body.scale.set(0.5, 0.7, 0.5);
    body.position.y = 0.35;
    playerMesh.add(body);
    const coat = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0x2b3142, roughness: 0.9 }));
    coat.scale.set(0.55, 0.4, 0.55);
    coat.position.y = 0.4;
    playerMesh.add(coat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf0c58f, roughness: 0.9 }));
    head.position.y = 0.85;
    playerMesh.add(head);
  }
  actorGroup.add(playerMesh);

  function placeCar(mesh, car, color, isPolice) {
    const spec = car.spec ?? { length: 26, width: 12.4 };
    const sx = spec.length / 26;
    const sz = spec.width / 12.4;
    mesh.visible = true;
    mesh.position.set(car.x, 1.4, car.y);
    mesh.rotation.y = -(car.heading || 0);
    mesh.scale.set(sx, 1, sz);
    // color body (first child)
    const body = mesh.children[0];
    const cabin = mesh.children[1];
    body.scale.set(1, 0.5, 0.55);
    body.position.y = 0.35;
    cabin.scale.set(0.55, 0.35, 0.5);
    cabin.position.y = 0.7;
    body.material.color.set(color ?? '#cccccc');
    // Type-specific shape cues (coupe lower/sportier, van taller/boxier, taxi light)
    switch (car.type) {
      case 'van':
        cabin.scale.set(0.68, 0.62, 0.6);
        cabin.position.y = 0.88;
        body.scale.y = 0.68;
        break;
      case 'coupe':
        cabin.scale.set(0.42, 0.26, 0.44);
        cabin.position.y = 0.64;
        body.scale.y = 0.34;
        break;
      case 'taxi':
        break;
      default:
        break;
    }
    // Remove any prior taxi light then re-add for taxis only
    let lightChild = mesh.children.find((c) => c.userData && c.userData.taxiLight);
    while (lightChild) { mesh.remove(lightChild); lightChild = mesh.children.find((c) => c.userData && c.userData.taxiLight); }
    if (car.type === 'taxi') {
      const taxiLight = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffcc00), emissiveIntensity: 2 }));
      taxiLight.scale.set(0.18, 0.1, 0.32);
      taxiLight.position.set(0, 0.92, 0);
      taxiLight.userData = { taxiLight: true };
      mesh.add(taxiLight);
    }
    if (isPolice) {
      // light bar
      let lightChild2 = mesh.children.find((c) => c.userData && c.userData.policeLight);
      while (lightChild2) { mesh.remove(lightChild2); lightChild2 = mesh.children.find((c) => c.userData && c.userData.policeLight); }
      const bar = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: new THREE.Color(0xff3333), emissiveIntensity: 2 }));
      bar.scale.set(0.4, 0.15, 0.15);
      bar.position.set(0, 0.6, 0);
      bar.userData = { policeLight: true };
      mesh.add(bar);
    }
  }

  function updateActors(state) {
    let carIndex = 0;
    for (const car of state.traffic) {
      if (car === state.vehicle) continue;
      const isPolice = car.type === 'cruiser';
      placeCar(carMesh(carIndex), car, car.color, isPolice);
      carIndex += 1;
    }
    for (const car of state.parked) {
      if (car === state.vehicle) continue;
      placeCar(carMesh(carIndex), car, car.color, false);
      carIndex += 1;
    }
    for (const cruiser of state.police.cruisers) {
      if (!cruiser) continue;
      placeCar(carMesh(carIndex), cruiser, '#e9eaee', true);
      carIndex += 1;
    }
    if (state.vehicle) {
      placeCar(carMesh(carIndex), state.vehicle, state.vehicle.color, state.vehicle.type === 'cruiser');
      carIndex += 1;
    }
    for (let index = carIndex; index < carPool.length; index += 1) carPool[index].visible = false;

    let pedIndex = 0;
    for (const ped of state.peds) {
      const mesh = pedMesh(pedIndex);
      mesh.visible = true;
      mesh.position.set(ped.x, 0, ped.y);
      mesh.rotation.y = -(ped.heading || 0);
      const body = mesh.children[0];
      body.material.color.set(ped.coat || '#888888');
      pedIndex += 1;
    }
    for (const officer of state.police.officers) {
      if (!officer) continue;
      const mesh = pedMesh(pedIndex);
      mesh.visible = true;
      mesh.position.set(officer.x, 0, officer.y);
      mesh.rotation.y = -(officer.heading || 0);
      const body = mesh.children[0];
      body.material.color.set(officer.guard ? '#5d6b55' : '#283a6e');
      pedIndex += 1;
    }
    for (let index = pedIndex; index < pedPool.length; index += 1) pedPool[index].visible = false;

    const inCar = Boolean(state.vehicle);
    playerMesh.visible = !inCar;
    if (!inCar) {
      playerMesh.position.set(state.player.x, 0, state.player.y);
      playerMesh.rotation.y = -(state.player.heading || 0);
    }
  }

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
    camera.position.x += (Math.random() - 0.5) * shake * 6;
    camera.position.y += (Math.random() - 0.5) * shake * 2;
    const targetX = focus.x + Math.cos(heading) * lookAhead;
    const targetZ = focus.y + Math.sin(heading) * lookAhead;
    camera.lookAt(targetX, 9, targetZ);
  }

  function draw(game, time) {
    const state = game.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sceneBuilt) return;
    updateActors(state);
    updateChaseCamera(state, time);
    renderer.render(scene, camera);
  }

  function cameraMargin(viewW, viewH, zoom) {
    return { halfW: viewW / (2 * zoom) + 30, halfH: viewH / (2 * zoom) + 30 };
  }
  function clampCamera(camera2d, viewW = viewWidth, viewH = viewHeight) {
    const zoom = camera2d.zoom || 1;
    const { halfW, halfH } = cameraMargin(viewW, viewH, zoom);
    camera2d.x = Math.max(Math.min(WORLD / 2, halfW), Math.min(Math.max(WORLD / 2, WORLD - halfW), camera2d.x));
    camera2d.y = Math.max(Math.min(Math.max(WORLD / 2, WORLD - halfH), halfH), camera2d.y);
  }

  function screenToWorld() { return { x: lastFocus.x, y: lastFocus.y }; }

  return { ctx, resize, setCity: buildScene, draw, screenToWorld, clampCamera, get view() { return { width: viewWidth, height: viewHeight, dpr }; } };
}
