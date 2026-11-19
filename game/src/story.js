'use strict';
// Tallow Point — story missions (R4-3, fresh from the R4 spec).
// Five sequential jobs: steal a car and lose the heat, courier a package
// across town, lift a ledger at the docks, steal a target coupe, and
// survive a three-star escape. One mission is active at a time; finishing
// one pays cash and opens the next. A floating gold marker shows the
// target on the street and on the minimap (via state.objectivePos).

function createStory(state, scene) {
  const city = state.city;
  // Mission targets, picked from the city data itself.
  const sunmere = city.blockCenter(5, 5);
  const wharf = city.blockCenter(1, 0);
  const northline = city.blockCenter(1, 3);
  const home = { x: city.safehouse.x, z: city.safehouse.z };

  const defs = [
    {
      id: 'wheels', name: 'First Wheels', reward: 150,
      brief: 'Steal any parked car, then lose the heat.',
      steps: [
        'Steal any parked car (walk up and press E).',
        'Lose the heat — get back to 0 stars.',
      ],
    },
    {
      id: 'courier', name: 'Courier Run', reward: 200,
      brief: 'Drive the package to Sunmere before the trail goes cold.',
      steps: ['Deliver the package to the Sunmere marker.'],
      target: { x: sunmere.x, z: sunmere.z },
      limitSec: 55,
    },
    {
      id: 'ledger', name: 'Dockside Ledger', reward: 300,
      brief: 'Lift the ledger at Kessel Wharf, then bring it home.',
      steps: [
        'Reach the Kessel Wharf marker and lift the ledger.',
        'Bring the ledger back to the Crater Row safehouse.',
      ],
      target: { x: wharf.x, z: wharf.z },
      home: { x: home.x, z: home.z },
    },
    {
      id: 'hotwheels', name: 'Hot Wheels', reward: 400,
      brief: 'Steal the gold coupe and deliver it to Northline.',
      steps: ['Steal the gold coupe, then drive it to Northline.'],
      target: { x: northline.x, z: northline.z },
    },
    {
      id: 'vaultrun', name: 'The Vault Run', reward: 600,
      brief: 'Three stars on your tail — survive a minute, then get home.',
      steps: ['Survive 60 seconds at 3 stars, then reach the safehouse.'],
      home: { x: home.x, z: home.z },
      surviveSec: 60,
    },
  ];

  const markerGeo = new THREE.OctahedronGeometry(1.3);
  const markerMat = new THREE.MeshLambertMaterial({ color: 0xffd23e });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);

  const story = {
    defs, index: 0, active: null, done: [],
    marker, dirty: true, scene,
  };
  return story;
}

function resetStory(story) {
  story.index = 0;
  story.done = [];
  story.active = null;
  story.marker.visible = false;
  story.dirty = true;
}

// Names for the menu list: done, in progress, locked.
function menuNames(story) {
  return story.defs.map((d, i) => {
    const n = String(i + 1).padStart(2, '0');
    if (story.done.indexOf(d.id) >= 0) return '✓ ' + n + ' — ' + d.name + ' — done';
    if (i === story.index) return '▶ ' + n + ' — ' + d.name + ' — in progress';
    return '· ' + n + ' — ' + d.name + ' — locked';
  });
}

// Begin the next unplayed mission, if any is left.
function startMission(state, story) {
  if (story.index >= story.defs.length) return false;
  const def = story.defs[story.index];
  const active = { def, step: 0, t0: state.time, failed: false, targetCar: null };
  if (def.id === 'courier') active.deadline = state.time + def.limitSec;
  if (def.id === 'hotwheels') {
    // The target is one real parked car: paint it gold so it stands out.
    const car = state.parkedCars[3];
    active.targetCar = car;
    if (car && car.mesh && car.mesh.children.length) {
      car.mesh.children[0].material.color.setHex(0xd8b13c);
    }
  }
  if (def.id === 'vaultrun') addHeat(state, CFG.wanted.starAt[3]);
  story.active = active;
  state.mission = def.id;
  state.missionIndex = story.index;
  setObjective(state, def.steps[0]);
  story.marker.visible = true;
  story.dirty = true;
  return true;
}

function completeMission(state, story) {
  const active = story.active;
  const def = active.def;
  state.cash += def.reward;
  story.done.push(def.id);
  story.index++;
  story.active = null;
  state.mission = null;
  state.missionIndex = story.index;
  story.marker.visible = false;
  story.dirty = true;
  if (story.index >= story.defs.length) {
    setObjective(state, 'All five jobs done — Tallow Point is yours. ($' + def.reward + ' banked)');
  } else {
    setObjective(state, 'Job done — $' + def.reward + ' banked. Next: ' + story.defs[story.index].name + '.');
  }
  if (state.audio) state.audio.pickup();
}

// A failed run restarts the same mission, not the whole story.
function failMission(state, story, reason) {
  const def = story.active.def;
  story.active = null;
  setObjective(state, reason + ' — try again: ' + def.name + '.');
  story.dirty = true;
  startMission(state, story);
}

function near(x1, z1, x2, z2, r) {
  return Math.hypot(x1 - x2, z1 - z2) < r;
}

function updateStory(state, dt) {
  const story = state.story;
  if (!story) return;
  if (!story.active) {
    if (story.index < story.defs.length && state.mode === 'playing') {
      startMission(state, story);
    }
    return;
  }
  const active = story.active;
  const def = active.def;
  const p = state.player;

  // The Vault Run restarts when the player gets busted mid-escape.
  if (def.id === 'vaultrun' && state.mode === 'busted') active.failed = true;
  if (active.failed && state.mode === 'playing') {
    active.failed = false;
    active.t0 = state.time;
    addHeat(state, CFG.wanted.starAt[3]);
    setObjective(state, def.steps[0]);
  }

  // Marker follows the active target (or the gold coupe itself).
  const m = story.marker;
  if (def.id === 'hotwheels' && active.targetCar) {
    m.position.set(active.targetCar.x, 3 + Math.sin(state.time * 3) * 0.5, active.targetCar.z);
  } else if (def.target) {
    const at = def.id === 'ledger' && active.step === 1 ? def.home : def.target;
    m.position.set(at.x, 3 + Math.sin(state.time * 3) * 0.5, at.z);
  } else if (def.home) {
    m.position.set(def.home.x, 3 + Math.sin(state.time * 3) * 0.5, def.home.z);
  }
  m.rotation.y += dt * 1.5;
  if (def.id === 'courier' || def.id === 'ledger' || def.id === 'hotwheels') {
    const at = def.id === 'ledger' && active.step === 1 ? def.home : def.target;
    state.objectivePos = { x: at.x, z: at.z };
  } else {
    state.objectivePos = null;
  }

  switch (def.id) {
    case 'wheels': {
      if (active.step === 0 && !p.onFoot && p.car) {
        active.step = 1;
        setObjective(state, def.steps[1]);
      } else if (active.step === 1 && state.stars === 0) {
        completeMission(state, story);
      }
      break;
    }
    case 'courier': {
      if (near(p.x, p.z, def.target.x, def.target.z, 8)) {
        completeMission(state, story);
      } else if (state.time > active.deadline) {
        failMission(state, story, 'Too slow — the package is late');
      }
      break;
    }
    case 'ledger': {
      if (active.step === 0 && near(p.x, p.z, def.target.x, def.target.z, 8)) {
        active.step = 1;
        setObjective(state, def.steps[1]);
      } else if (active.step === 1 && near(p.x, p.z, def.home.x, def.home.z, 10)) {
        completeMission(state, story);
      }
      break;
    }
    case 'hotwheels': {
      if (p.car === active.targetCar
        && near(p.x, p.z, def.target.x, def.target.z, 8)) {
        completeMission(state, story);
      }
      break;
    }
    case 'vaultrun': {
      if (state.mode === 'playing'
        && state.time - active.t0 >= def.surviveSec
        && near(p.x, p.z, def.home.x, def.home.z, 10)) {
        completeMission(state, story);
      }
      break;
    }
    default:
      break;
  }
}
