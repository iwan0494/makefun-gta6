'use strict';
// Tallow Point — boot + main loop (R4-2, fresh from the R4 spec).
// Builds the city, the game state and the HUD, wires the menu, stages the
// four screenshot presets, and runs one requestAnimationFrame loop that
// updates gameplay and renders. The foundation inline loop is gone — this
// file owns the loop now.

(function boot() {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') || '';
  const seed = Number(params.get('seed') || CFG.seed) || CFG.seed;

  const city = buildCity(seed);
  const canvas = document.getElementById('game');
  const renderer = createRenderer(canvas);
  const camera = createCamera();
  const world = buildCityScene(city);

  const state = newGame(city);
  const input = createInput();
  const hud = createHud(city);

  // R4-3 subsystems: police, story, combat, audio, save. They live on the
  // state object so the update loop finds them without a signature change.
  const police = createPolice(state, world.scene);
  const story = createStory(state, world.scene);
  const combat = createCombat(state, world.scene);
  const audio = createAudio();
  const save = createSave(state, story);
  state.police = police;
  state.story = story;
  state.combat = combat;
  state.audio = audio;
  state.save = save;

  // Audio wakes on the first real gesture (browsers block autoplay).
  const wakeAudio = () => audio.init();
  window.addEventListener('keydown', wakeAudio);
  window.addEventListener('mousedown', wakeAudio);

  // Every entity mesh goes into the city scene once, at boot. The loop
  // only moves them; it never adds or removes meshes.
  world.scene.add(state.player.mesh);
  for (const car of state.parkedCars) world.scene.add(car.mesh);
  for (const car of state.traffic) world.scene.add(car.mesh);
  for (const ped of state.pedestrians) world.scene.add(ped.mesh);

  // ---- screenshot presets: staged scenes, hour pinned -------------------
  // Road 3 (x = -24) crossing road 4 (z = 24) is the stage: a straight
  // north-south road where the player, a parked car and traffic all read.
  const STAGE_ROAD = 3;
  const STAGE_Z = 24;

  function roadNode(roadI, z, ahead) {
    const jBelow = Math.max(0, Math.min(
      city.grid,
      Math.floor((z + city.half - city.road / 2) / city.pitch),
    ));
    const jAbove = Math.min(city.grid, jBelow + 1);
    return ahead ? city.nodeId(roadI, jAbove) : city.nodeId(roadI, jBelow);
  }

  // Put the first few traffic cars on one road, heading south, spaced out.
  function stageTrafficOnRoad(zList) {
    const roadX = city.roadAt(STAGE_ROAD);
    for (let i = 0; i < zList.length && i < state.traffic.length; i++) {
      const car = state.traffic[i];
      car.x = roadX;
      car.z = zList[i];
      car.heading = 0;
      car.node = roadNode(STAGE_ROAD, car.z, false);
      car.target = roadNode(STAGE_ROAD, car.z, true);
      car.speed = car.cruise;
    }
  }

  // Player on foot on the road, a parked car at the kerb beside them.
  function stageOnFoot() {
    const roadX = city.roadAt(STAGE_ROAD);
    state.player.x = roadX;
    state.player.z = STAGE_Z;
    state.player.heading = 0;
    state.player.onFoot = true;
    const kerb = state.parkedCars[0];
    kerb.x = roadX + 4.6;
    kerb.z = STAGE_Z + 6;
    kerb.heading = 0;
    kerb.kind = 'parked';
    kerb.taken = false;
    stageTrafficOnRoad([STAGE_Z + 30, STAGE_Z + 60, STAGE_Z - 30]);
  }

  // Player behind the wheel: park a car on the road, walk up, steal it.
  function stageDriving() {
    const roadX = city.roadAt(STAGE_ROAD);
    const kerb = state.parkedCars[0];
    kerb.x = roadX;
    kerb.z = STAGE_Z + 2;
    kerb.heading = 0;
    kerb.kind = 'parked';
    kerb.taken = false;
    state.player.x = roadX + 2;
    state.player.z = STAGE_Z + 2;
    state.player.heading = 0;
    state.player.onFoot = true;
    stealCar(state);
    stageTrafficOnRoad([STAGE_Z + 32, STAGE_Z + 62, STAGE_Z - 28]);
  }

  const presets = {
    start: { hour: 10, mode: 'orbit', az: -0.6, el: 0.62, radius: 300 },
    city: { hour: 13, mode: 'street', stage: stageOnFoot },
    chase: { hour: 18, mode: 'street', stage: stageDriving },
    police: { hour: 22, mode: 'street', stage: stageDriving, stars: 3 },
  };
  const preset = presets[shot] || null;
  if (preset) {
    state.hour = preset.hour;
    if (preset.stage) preset.stage();
    if (preset.stars) addHeat(state, CFG.wanted.starAt[preset.stars]);
    state.mode = 'playing';
    if (shot === 'police') stageChase(state, police);
  }

  // ---- menu ---------------------------------------------------------------
  function startLife(clear) {
    if (clear) {
      save.wipe();
      resetGame(state);
      resetStory(story);
      resetPolice(police);
    } else {
      save.load();
      state.mode = 'playing';
    }
    menu.hide();
  }
  const menu = createMenu(state, { onStart: startLife });
  menu.setMissions(menuNames(story));
  if (preset) menu.hide();

  // Autosave while playing; the menu buttons own the rest of the flow.
  setInterval(() => { if (state.mode === 'playing') save.save(); }, 10000);
  window.addEventListener('pagehide', () => save.save());

  // ---- debug hook: capture scripts and later sessions stage scenes here ---
  window.__TALLOW_DEBUG = {
    city, world, camera, renderer, preset: shot || null,
    state,
    setTimeOfDay(hour) { state.hour = hour; setTimeOfDay(world, hour); },
    setWanted(stars) {
      state.heat = stars > 0 ? CFG.wanted.starAt[stars] : 0;
      state.stars = stars;
      // Same 4-second grace addHeat() gives, or the heat decays below the
      // star threshold before the first cruiser can even spawn.
      state.lastCrimeAt = state.time;
    },
    setClock(hour) { state.hour = hour; },
    drawMinimap() { hud.update(state); },
    // Walk the player up to the nearest parked car (real path, for tests).
    teleportNearCar() {
      const car = nearestParkedCar(
        state.parkedCars, state.player.x, state.player.z, 500,
      );
      if (!car) return null;
      state.player.x = car.x + 2;
      state.player.z = car.z + 2;
      state.player.onFoot = true;
      state.player.car = null;
      return car.id;
    },
    // Press E through the real keyboard path, like a player would.
    stealNow() {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    },
    startGame() { startLife(false); },
    // ---- R4-3 debug hooks ------------------------------------------------
    police, story, combat, audio, save,
    startMission(i) {
      story.index = Math.max(0, Math.min(story.defs.length - 1, i));
      story.active = null;
      startMission(state, story);
      return story.active ? story.active.def.id : null;
    },
    missionState() {
      return {
        index: story.index,
        active: story.active ? story.active.def.id : null,
        step: story.active ? story.active.step : -1,
        done: story.done.slice(),
        cash: state.cash,
        objective: state.objective,
      };
    },
    policeState() {
      return {
        stars: state.stars,
        heat: Math.round(state.heat),
        cruisers: police.cruisers.map((c) => ({
          id: c.id,
          x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10,
          dist: Math.round(Math.hypot(c.x - state.player.x, c.z - state.player.z) * 10) / 10,
          hp: c.hp, disabledT: Math.round(c.disabledT * 10) / 10,
        })),
        roadblocks: police.roadblocks.length,
        heli: !!police.heliActive,
        mode: state.mode,
      };
    },
    // Put a cruiser right next to the on-foot player at 3 stars: BUSTED
    // follows within ~1.2 game-seconds.
    bustNow() {
      state.heat = CFG.wanted.starAt[3];
      state.stars = 3;
      state.lastCrimeAt = state.time; // grace, or stars decay before the bust lands
      if (!state.player.onFoot) exitCar(state);
      let c = police.cruisers[0];
      if (!c) c = spawnCruiser(state, police);
      c.x = state.player.x + 2;
      c.z = state.player.z + 2;
      c.speed = 0;
      c.mesh.group.position.set(c.x, 0, c.z);
      // Re-anchor the chase to the node it now stands on.
      c.node = nearestNode(city, c.x, c.z).id;
      c.target = c.node;
      c.path = [];
      c.pathI = 0;
      return true;
    },
    dieNow() { damagePlayer(state, 9999); return state.mode; },
    shootNow() {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    },
    meleeNow() {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    },
    // Park a pedestrian right in front of the player for combat tests.
    placePedAhead() {
      const ped = state.pedestrians[0];
      ped.x = state.player.x + Math.sin(state.player.heading) * 1.5;
      ped.z = state.player.z + Math.cos(state.player.heading) * 1.5;
      ped.life = 100;
      ped.state = 'walk';
      ped.mesh.visible = true;
      return { x: ped.x, z: ped.z, life: ped.life };
    },
    saveNow() { return save.save(); },
    audioState() {
      return {
        hasCtx: !!audio.ctx,
        ctxState: audio.ctx ? audio.ctx.state : 'none',
      };
    },
  };

  // ---- main loop -----------------------------------------------------------
  let last = performance.now();
  let orbitAz = -0.6;
  let lastHourPainted = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateGame(state, input, dt);
    if (preset) state.hour = preset.hour; // staged hour stays pinned
    // The story refreshes the menu list whenever a job completes/fails.
    if (story.dirty) {
      menu.setMissions(menuNames(story));
      story.dirty = false;
    }
    if (Math.abs(state.hour - lastHourPainted) > 0.02) {
      setTimeOfDay(world, state.hour);
      lastHourPainted = state.hour;
    }
    if (preset && preset.mode === 'orbit') {
      // Cover shot: fixed high orbit over the whole city.
      updateOrbitCamera(camera, { x: 0, z: 0 }, preset.az, preset.el, preset.radius);
    } else if (state.mode === 'menu' && !preset) {
      orbitAz += dt * 0.05;
      updateOrbitCamera(camera, { x: 0, z: 0 }, orbitAz, 0.55, 300);
    } else {
      updateChaseCamera(camera, state.player, dt);
      clampCamera(camera, city.half);
    }
    hud.update(state);
    renderer.render(world.scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
