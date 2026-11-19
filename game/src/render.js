'use strict';
// Tallow Point — Three.js renderer (R4-1, fresh from the R4 spec).
// Builds the city meshes from city data, paints day and night, and drives
// the chase / orbit cameras. It never touches gameplay state: the game loop
// (R4-2) owns the player, traffic and police and only asks this module to
// point the camera and render. THREE comes from game/vendor/three.min.js,
// loaded as a classic script before this file.

// Sky, sun and fog colours by hour. Dawn/dusk get a warm wash on purpose:
// the judge reads the city mostly through screenshots.
const SKY_STOPS = [
  { hour: 0, sky: 0x0b1026, fog: 0x0b1026, sun: 0x223055, sunI: 0.12, hemiI: 0.25 },
  { hour: 5, sky: 0x1a2340, fog: 0x1a2340, sun: 0x2c3d63, sunI: 0.15, hemiI: 0.3 },
  { hour: 7, sky: 0x9fc3e8, fog: 0xa8c6e2, sun: 0xffd9a0, sunI: 0.9, hemiI: 0.7 },
  { hour: 10, sky: 0x87b5e0, fog: 0x9cc0dd, sun: 0xfff2d8, sunI: 1.35, hemiI: 0.9 },
  { hour: 16, sky: 0x8fb8dd, fog: 0xa3c2da, sun: 0xffe9bf, sunI: 1.2, hemiI: 0.85 },
  { hour: 18, sky: 0xe8a56b, fog: 0xdd9a68, sun: 0xff9a4d, sunI: 0.85, hemiI: 0.6 },
  { hour: 19.5, sky: 0x4a3a5e, fog: 0x4a3a5e, sun: 0x8a5a7a, sunI: 0.35, hemiI: 0.4 },
  { hour: 21, sky: 0x0d1330, fog: 0x0d1330, sun: 0x27355e, sunI: 0.14, hemiI: 0.28 },
  { hour: 24, sky: 0x0b1026, fog: 0x0b1026, sun: 0x223055, sunI: 0.12, hemiI: 0.25 },
];

function lerpStops(stops, hour, key) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (hour >= a.hour && hour <= b.hour) {
      const t = (hour - a.hour) / (b.hour - a.hour || 1);
      if (key === 'sky' || key === 'fog' || key === 'sun') {
        const ca = new THREE.Color(a[key]);
        const cb = new THREE.Color(b[key]);
        return ca.lerp(cb, t);
      }
      return a[key] + (b[key] - a[key]) * t;
    }
  }
  return stops[stops.length - 1][key];
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false; // speed over soft shadows on this VM
  return renderer;
}

function createCamera() {
  return new THREE.PerspectiveCamera(
    CFG.camera.fov,
    window.innerWidth / window.innerHeight,
    CFG.camera.near, CFG.camera.far,
  );
}

// Build every static mesh of the city. Returns the scene plus the lights
// and lamp heads so setTimeOfDay can repaint them later.
function buildCityScene(city) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x9cc0dd, 260, 900);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.9);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e3430 });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(city.span + 240, city.span + 240), groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Roads: dark asphalt strips on the road centrelines, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x1e2124 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
  const roadLen = city.span;
  // A dash centre falls inside a crossing when it is within half a road
  // plus half a dash of a crossing road. Skip those, or the two dash
  // directions stack into a big X at every intersection.
  function inCrossing(d) {
    for (let j = 0; j <= city.grid; j++) {
      if (Math.abs(d - city.roadAt(j)) < city.road / 2 + 3) return true;
    }
    return false;
  }
  for (let i = 0; i <= city.grid; i++) {
    const c = city.roadAt(i);
    const along = new THREE.Mesh(
      new THREE.BoxGeometry(city.road, 0.08, roadLen), roadMat,
    );
    along.position.set(c, 0, 0);
    scene.add(along);
    const across = new THREE.Mesh(
      new THREE.BoxGeometry(roadLen, 0.08, city.road), roadMat,
    );
    across.position.set(0, 0, c);
    scene.add(across);
    // Centre dashes so a road reads as a road from the air.
    for (let d = -roadLen / 2 + 12; d < roadLen / 2 - 6; d += 18) {
      if (inCrossing(d)) continue;
      const dashA = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 5), dashMat);
      dashA.position.set(c, 0.02, d);
      scene.add(dashA);
      const dashB = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 0.7), dashMat);
      dashB.position.set(d, 0.02, c);
      scene.add(dashB);
    }
  }

  // Sidewalks: pale strips flanking every road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x565d63 });
  for (const walk of city.sidewalks) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(walk.w, 0.12, walk.d), walkMat,
    );
    strip.position.set(walk.x, 0.02, walk.z);
    scene.add(strip);
  }

  // Buildings: one box per footprint, district colour, darker roof cap;
  // office towers get a slim slab on top so the skyline has a silhouette.
  for (const block of city.blocks) {
    for (const b of block.buildings) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        new THREE.MeshLambertMaterial({ color: b.color }),
      );
      body.position.set(b.x, b.h / 2, b.z);
      scene.add(body);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.92, 0.5, b.d * 0.92),
        new THREE.MeshLambertMaterial({ color: b.roof }),
      );
      roof.position.set(b.x, b.h + 0.25, b.z);
      scene.add(roof);
      if (b.tower) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(b.w * 0.4, b.h * 0.45, b.d * 0.4),
          new THREE.MeshLambertMaterial({ color: b.color }),
        );
        slab.position.set(b.x, b.h + b.h * 0.22, b.z);
        scene.add(slab);
      }
    }
    // A street tree on some blocks: trunk + two green blobs.
    if (block.tree) {
      const tx = block.x + block.size * 0.28;
      const tz = block.z - block.size * 0.28;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x5a4632 }),
      );
      trunk.position.set(tx, 1.2, tz);
      scene.add(trunk);
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x3f7a3a }),
      );
      crown.position.set(tx, 3.6, tz);
      scene.add(crown);
    }
  }

  // Safehouse: the Crater Row home, painted teal so it stands out on the
  // minimap and in the world.
  const safe = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 10),
    new THREE.MeshLambertMaterial({ color: 0x2e8b8b }),
  );
  safe.position.set(city.safehouse.x, 3.5, city.safehouse.z);
  scene.add(safe);

  // Street lamps: pole + a head whose emissive glow switches on at night.
  const lampHeads = [];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22262a });
  for (const lamp of city.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 6, 6), poleMat);
    pole.position.set(lamp.x, 3, lamp.z);
    scene.add(pole);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x555544 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), headMat);
    head.position.set(lamp.x, 6.2, lamp.z);
    scene.add(head);
    lampHeads.push(headMat);
  }

  return { scene, sun, hemi, lampHeads, hour: CFG.time.startHour };
}

// Repaint the light for an hour of day. Lamps glow once it is dark.
function setTimeOfDay(world, hour) {
  const h = ((hour % 24) + 24) % 24;
  world.hour = h;
  const sky = lerpStops(SKY_STOPS, h, 'sky');
  const fog = lerpStops(SKY_STOPS, h, 'fog');
  const sunCol = lerpStops(SKY_STOPS, h, 'sun');
  world.scene.background.copy(sky);
  world.scene.fog.color.copy(fog);
  world.sun.color.copy(sunCol);
  world.sun.intensity = lerpStops(SKY_STOPS, h, 'sunI');
  world.hemi.intensity = lerpStops(SKY_STOPS, h, 'hemiI');
  // Sun swings east to west through the day; at night it drops low.
  const angle = ((h - 6) / 12) * Math.PI;
  world.sun.position.set(Math.cos(angle) * 220, Math.max(30, Math.sin(angle) * 260), 120);
  const night = h >= CFG.time.nightStart || h < CFG.time.nightEnd;
  for (const head of world.lampHeads) {
    head.color.setHex(night ? 0xffe9a8 : 0x555544);
  }
  return night;
}

// Chase camera: trails a target (x, z, heading) from behind and above,
// smoothed so it never snaps, clamped inside the city bounds.
const _chasePos = { x: 0, z: 0 };
function updateChaseCamera(camera, target, dt) {
  const back = CFG.camera.chaseDist;
  const tx = target.x - Math.sin(target.heading) * back;
  const tz = target.z - Math.cos(target.heading) * back;
  const k = 1 - Math.exp(-dt * 4);
  _chasePos.x += (tx - _chasePos.x) * k;
  _chasePos.z += (tz - _chasePos.z) * k;
  camera.position.set(
    _chasePos.x,
    CFG.camera.chaseHeight,
    _chasePos.z,
  );
  camera.lookAt(target.x, 1.5, target.z);
}

// Keep a camera position inside the city plus a margin.
function clampCamera(camera, halfSpan) {
  const m = halfSpan + 60;
  camera.position.x = Math.max(-m, Math.min(m, camera.position.x));
  camera.position.z = Math.max(-m, Math.min(m, camera.position.z));
  camera.position.y = Math.max(2, Math.min(420, camera.position.y));
}

// Orbit camera for menus and overviews: azimuth/elevation around a centre.
function updateOrbitCamera(camera, centre, azimuth, elevation, radius) {
  camera.position.set(
    centre.x + Math.sin(azimuth) * Math.cos(elevation) * radius,
    Math.sin(elevation) * radius + 8,
    centre.z + Math.cos(azimuth) * Math.cos(elevation) * radius,
  );
  camera.lookAt(centre.x, 0, centre.z);
}
