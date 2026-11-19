'use strict';
// Tallow Point — HUD + minimap (R4-2, fresh from the R4 spec).
// Reads the game state every frame and paints the DOM + the 2D minimap.
// No game logic lives here — this module only displays. District colours
// on the map come straight from CFG (first palette colour per district).

const MAP_COLORS = {};
for (const d of CFG.districts) MAP_COLORS[d.name] = d.palette[0];

function createHud(city) {
  const cashEl = document.getElementById('cash');
  const lifeEl = document.getElementById('life-fill');
  const armorEl = document.getElementById('armor-fill');
  const clockEl = document.getElementById('clock');
  const wantedEl = document.getElementById('wanted');
  const objEl = document.getElementById('hud-objective');
  const mapCanvas = document.getElementById('minimap');
  const map = mapCanvas.getContext('2d');
  const size = mapCanvas.width;

  // Full-screen BUSTED / DEAD cards, built here so index.html needs no
  // new elements. They sit above the canvas until R brings the player back.
  function makeOverlay(id, title, sub) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'hidden';
    el.style.cssText = 'position:fixed;inset:0;z-index:8;display:flex;'
      + 'flex-direction:column;align-items:center;justify-content:center;gap:10px;'
      + 'color:#fff;text-align:center;background:rgba(20,4,8,.72);';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:64px;font-weight:700;letter-spacing:8px;';
    const s = document.createElement('div');
    s.textContent = sub;
    s.style.cssText = 'font-size:20px;';
    el.appendChild(h);
    el.appendChild(s);
    document.body.appendChild(el);
    return el;
  }
  const bustedEl = makeOverlay('overlay-busted', 'BUSTED', 'The police caught you — press R to get back on your feet.');
  const deadEl = makeOverlay('overlay-dead', 'DEAD', 'Your life ran out — press R to start over at the safehouse.');

  function setClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    clockEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function setWanted(stars) {
    wantedEl.textContent = stars > 0 ? '★'.repeat(stars) : '';
  }

  function drawMinimap(state) {
    const scale = size / (city.span + 40);
    const toMap = (x, z) => [(x + city.half + 20) * scale, (z + city.half + 20) * scale];
    map.clearRect(0, 0, size, size);
    // District blocks.
    for (const block of city.blocks) {
      const px = (block.x - block.size / 2 + city.half + 20) * scale;
      const py = (block.z - block.size / 2 + city.half + 20) * scale;
      map.fillStyle = MAP_COLORS[block.district] || '#888888';
      map.fillRect(px, py, block.size * scale, block.size * scale);
    }
    // Roads as dark lines on the grid lines.
    map.strokeStyle = '#20242a';
    map.lineWidth = 1;
    for (let i = 0; i <= city.grid; i++) {
      const c = city.roadAt(i);
      const a = toMap(c, -city.half - 20);
      const b = toMap(c, city.half + 20);
      map.beginPath(); map.moveTo(a[0], a[1]); map.lineTo(b[0], b[1]); map.stroke();
      const d = toMap(-city.half - 20, c);
      const e = toMap(city.half + 20, c);
      map.beginPath(); map.moveTo(d[0], d[1]); map.lineTo(e[0], e[1]); map.stroke();
    }
    // Safehouse marker.
    const s = toMap(city.safehouse.x, city.safehouse.z);
    map.fillStyle = '#2e8b8b';
    map.fillRect(s[0] - 4, s[1] - 4, 8, 8);
    // Objective point, when a mission marks one.
    if (state.objectivePos) {
      const o = toMap(state.objectivePos.x, state.objectivePos.z);
      map.fillStyle = '#ffd23e';
      map.beginPath(); map.arc(o[0], o[1], 5, 0, Math.PI * 2); map.fill();
      map.strokeStyle = '#000000'; map.stroke();
    }
    // Parked cars: grey dots. The player's stolen car: gold.
    for (const car of state.parkedCars) {
      const q = toMap(car.x, car.z);
      map.fillStyle = car.kind === 'player' ? '#ffd23e' : '#9aa0a6';
      map.fillRect(q[0] - 2, q[1] - 2, 4, 4);
    }
    // Moving traffic: white dots.
    for (const car of state.traffic) {
      const q = toMap(car.x, car.z);
      map.fillStyle = '#ffffff';
      map.fillRect(q[0] - 2, q[1] - 2, 4, 4);
    }
    // Police: cruisers blue, roadblocks red squares, helicopter yellow.
    if (state.police) {
      for (const c of state.police.cruisers) {
        const q = toMap(c.x, c.z);
        map.fillStyle = c.disabledT > 0 ? '#777777' : '#4aa3ff';
        map.fillRect(q[0] - 3, q[1] - 3, 6, 6);
      }
      for (const r of state.police.roadblocks) {
        const q = toMap(r.x, r.z);
        map.fillStyle = '#ff4444';
        map.fillRect(q[0] - 4, q[1] - 4, 8, 8);
      }
      if (state.police.heli) {
        const q = toMap(state.police.heli.x, state.police.heli.z);
        map.strokeStyle = '#ffd23e';
        map.lineWidth = 2;
        map.beginPath(); map.arc(q[0], q[1], 7, 0, Math.PI * 2); map.stroke();
      }
    }
    // Player triangle, big enough to read at a glance.
    const p = toMap(state.player.x, state.player.z);
    map.fillStyle = '#ffffff';
    map.beginPath();
    map.moveTo(p[0], p[1] - 8);
    map.lineTo(p[0] + 6, p[1] + 6);
    map.lineTo(p[0] - 6, p[1] + 6);
    map.closePath(); map.fill();
    map.strokeStyle = '#000000'; map.stroke();
  }

  return {
    update(state) {
      cashEl.textContent = String(state.cash);
      lifeEl.style.width = Math.max(0, state.life) + '%';
      armorEl.style.width = Math.max(0, state.armor) + '%';
      setClock(state.hour);
      setWanted(state.stars);
      if (objEl.textContent !== state.objective) objEl.textContent = state.objective;
      bustedEl.classList.toggle('hidden', state.mode !== 'busted');
      deadEl.classList.toggle('hidden', state.mode !== 'dead');
      drawMinimap(state);
    },
    setClock, setWanted, drawMinimap,
  };
}
