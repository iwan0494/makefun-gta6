'use strict';
// Tallow Point — combat (R4-3, fresh from the R4 spec).
// Fists (F) up close and a pistol (Space) at range. Shots are hitscan
// inside a narrow cone ahead of the player; a yellow tracer shows the
// line of fire for a blink. Pedestrians go down and get back up elsewhere,
// cruisers can be disabled for a while, and hurting anyone raises the
// heat. The player takes damage through armor first, then life — at zero
// life the screen goes DEAD and R starts a new life at the safehouse.

// Damage the player: armor soaks half of every hit first.
function damagePlayer(state, amount) {
  const p = state.player;
  if (state.mode !== 'playing') return;
  let rest = amount;
  if (p.armor > 0) {
    const soaked = Math.min(p.armor, rest / 2);
    p.armor -= soaked;
    rest -= soaked;
  }
  p.life = Math.max(0, p.life - rest);
  state.life = p.life;
  state.armor = p.armor;
  if (p.life <= 0) {
    state.mode = 'dead';
    state.deadAt = state.time;
    setObjective(state, 'DEAD — press R to start over at the safehouse.');
  }
}

function createCombat(state, scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe14d }));
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  return {
    scene, tracer, tracerT: 0, cooldown: 0,
  };
}

function updateCombat(state, dt) {
  const combat = state.combat;
  if (!combat) return;
  if (combat.cooldown > 0) combat.cooldown -= dt;
  if (combat.tracerT > 0) {
    combat.tracerT -= dt;
    if (combat.tracerT <= 0) combat.tracer.visible = false;
  }
  // Downed pedestrians get back up on a fresh stretch of sidewalk.
  for (const ped of state.pedestrians) {
    if (ped.state !== 'down') continue;
    ped.downT -= dt;
    if (ped.downT <= 0) {
      const walk = state.rng.pick(state.city.sidewalks);
      ped.x = walk.along === 'z' ? walk.x : state.rng.range(-state.city.half, state.city.half);
      ped.z = walk.along === 'x' ? walk.z : state.rng.range(-state.city.half, state.city.half);
      ped.life = 100;
      ped.state = 'walk';
      ped.fleeT = 0;
      ped.mesh.visible = true;
    }
  }
}

// Nearest shootable thing inside a narrow cone ahead of the player.
function aimTarget(state, maxDist) {
  const p = state.player;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  let best = null;
  let bestD = maxDist;
  const consider = (x, z, obj) => {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) return;
    const along = (dx * fx + dz * fz) / d;
    if (along < 0.97) return; // outside the ~14 degree cone
    bestD = d;
    best = obj;
  };
  for (const ped of state.pedestrians) {
    if (ped.state === 'down') continue;
    consider(ped.x, ped.z, { type: 'ped', obj: ped, dist: bestD });
  }
  if (state.police) {
    for (const c of state.police.cruisers) {
      if (c.disabledT > 0) continue;
      consider(c.x, c.z, { type: 'cruiser', obj: c, dist: bestD });
    }
  }
  return best;
}

function showTracer(combat, fromX, fromZ, toX, toZ) {
  const pos = combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, fromX, 1.4, fromZ);
  pos.setXYZ(1, toX, 1.2, toZ);
  pos.needsUpdate = true;
  combat.tracer.visible = true;
  combat.tracerT = 0.09;
}

// Pistol: one hitscan shot ahead, 34 damage, raises the heat.
function shoot(state) {
  const combat = state.combat;
  if (!combat || combat.cooldown > 0 || state.mode !== 'playing') return false;
  combat.cooldown = 0.35;
  const p = state.player;
  const hit = aimTarget(state, 32);
  const ex = p.x + Math.sin(p.heading) * 30;
  const ez = p.z + Math.cos(p.heading) * 30;
  if (hit) {
    showTracer(combat, p.x, p.z, hit.obj.x, hit.obj.z);
    if (hit.type === 'ped') {
      const ped = hit.obj;
      ped.life = (ped.life === undefined ? 100 : ped.life) - 34;
      ped.heading = Math.atan2(ped.x - p.x, ped.z - p.z);
      ped.fleeT = 1.2;
      ped.state = 'flee';
      if (ped.life <= 0) {
        ped.state = 'down';
        ped.downT = 8;
        ped.mesh.visible = false;
      }
      addHeat(state, 4);
    } else {
      const c = hit.obj;
      c.hp -= 34;
      addHeat(state, 8);
      if (c.hp <= 0) {
        c.hp = 100;
        c.disabledT = 10;
        c.speed = 0;
      }
    }
  } else {
    showTracer(combat, p.x, p.z, ex, ez);
    addHeat(state, 2);
  }
  if (state.audio) state.audio.shot();
  return true;
}

// Fists: only on foot, only what is right in front of the player.
function melee(state) {
  const combat = state.combat;
  if (!combat || combat.cooldown > 0 || state.mode !== 'playing') return false;
  const p = state.player;
  if (!p.onFoot) return false;
  combat.cooldown = 0.4;
  const hit = aimTarget(state, 2.4);
  if (!hit) return false;
  if (hit.type === 'ped') {
    const ped = hit.obj;
    ped.life = (ped.life === undefined ? 100 : ped.life) - 25;
    const dx = ped.x - p.x;
    const dz = ped.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    ped.x += (dx / d) * 2;
    ped.z += (dz / d) * 2;
    ped.heading = Math.atan2(ped.x - p.x, ped.z - p.z);
    ped.fleeT = 1.5;
    ped.state = 'flee';
    if (ped.life <= 0) {
      ped.state = 'down';
      ped.downT = 8;
      ped.mesh.visible = false;
    }
  } else {
    const c = hit.obj;
    c.hp -= 15;
    if (c.hp <= 0) {
      c.hp = 100;
      c.disabledT = 8;
      c.speed = 0;
    }
  }
  addHeat(state, 2);
  if (state.audio) state.audio.shot();
  return true;
}
