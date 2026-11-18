// hud.js — the heads-up display over the world: the star row, cash, health and armour bars, the
// weapon with its rounds, the clock, the district you are in, the job card, the objective line
// and the canvas minimap with its blips. The overlay only reads state; it never changes it.
import { CELL, GRID, PALETTE, ROAD, WANTED_THRESHOLDS, WORLD } from './config.js';
import { DISTRICTS } from './city.js';

const MINIMAP = { width: 210, height: 158 };

export function createHud() {
  const layer = document.createElement('canvas');
  layer.className = 'hud';
  const ctx = layer.getContext('2d');
  let width = 1;
  let height = 1;

  function resize(view) {
    width = view.width;
    height = view.height;
    layer.width = Math.floor(width * view.dpr);
    layer.height = Math.floor(height * view.dpr);
  }

  const font = (size, weight = 600) => `${weight} ${size}px "Sora", "Trebuchet MS", system-ui, sans-serif`;

  function draw(state, extra) {
    const dpr = layer.width / width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    drawTopLeft(state);
    drawTopRight(state);
    drawWeapon(state);
    drawJob(state, extra);
    drawMinimap(state, extra);
    drawMessages(state);
    drawPrompts(state, extra);
    if (extra.mode === 'paused') drawPause(state);
    if (extra.mode === 'dead') drawEnd('WASTED', '#c53a3a', 'Roll back to the last save or load a new life.');
    if (extra.mode === 'busted') drawEnd('BUSTED', '#3e6fd6', 'The Bay PD took the job out of your hands.');
    void WANTED_THRESHOLDS;
  }

  function plate(x, y, w, h) {
    ctx.fillStyle = 'rgba(9,12,20,0.62)';
    ctx.beginPath();
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - 6);
    ctx.lineTo(x + w - 6, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function star(cx, cy, radius, filled) {
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const r = point % 2 === 0 ? radius : radius * 0.45;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? PALETTE.gold : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = filled ? 'rgba(255,240,190,0.7)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function drawTopLeft(state) {
    plate(14, 14, 296, 86);
    const stars = state.police.wanted.stars;
    for (let index = 0; index < 5; index += 1) star(36 + index * 26, 34, 13, index < stars);
    if (stars > 0) {
      const heat = Math.min(1, (state.police.wanted.heat % WANTED_THRESHOLDS[Math.min(5, stars + 1)] || 1) / WANTED_THRESHOLDS[Math.min(5, stars + 1)]);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(24, 47, 118, 3);
      ctx.fillStyle = stars >= 4 ? '#ff5b4b' : PALETTE.gold;
      ctx.fillRect(24, 47, 118 * heat, 3);
      ctx.font = font(9, 700);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(stars >= 4 ? 'ALL UNITS' : 'HEAT', 148, 49);
    }
    ctx.font = font(22, 800);
    ctx.fillStyle = '#8fe6a0';
    ctx.fillText(`$${Math.floor(state.player.cash).toLocaleString('en-US')}`, 24, 66);
    const bar = (x, y, value, color, label) => {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, y, 82, 6);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 82 * Math.max(0, Math.min(1, value)), 6);
      ctx.font = font(8, 700);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(label, x + 86, y + 3.5);
    };
    bar(24, 86, state.player.hp / 100, '#6fe08a', 'LIFE');
    bar(178, 86, state.player.armor / 100, '#5aa8ff', 'ARMOR');
  }

  function drawTopRight(state) {
    plate(width - 258, 14, 244, 64);
    const minutes = Math.floor(state.clock);
    const clockText = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    ctx.font = font(24, 800);
    ctx.fillStyle = PALETTE.white;
    ctx.textAlign = 'right';
    ctx.fillText(clockText, width - 26, 38);
    ctx.font = font(9, 700);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`DAY ${state.day}  ·  TALLOW POINT`, width - 26, 60);
    ctx.textAlign = 'left';
  }

  function drawWeapon(state) {
    const entry = state.weapons[state.weaponIndex];
    const info = { fists: 'FISTS', pistol: 'PISTOL', shotgun: 'SHOTGUN' }[entry.key];
    plate(width - 196, height - 104, 182, 54);
    ctx.font = font(13, 800);
    ctx.fillStyle = PALETTE.white;
    ctx.textAlign = 'right';
    ctx.fillText(info, width - 26, height - 82);
    ctx.font = font(11, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(entry.key === 'fists' ? 'melee  ·  Q to switch' : `${entry.ammo} rounds  ·  Q to switch`, width - 26, height - 64);
    ctx.textAlign = 'left';
  }

  function drawJob(state, extra) {
    const line = extra.objective ?? '';
    plate(14, height - 128, Math.min(width * 0.52, 560), 76);
    ctx.font = font(10, 800);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(state.mission ? `JOB ${state.mission.number} · ${state.mission.title.toUpperCase()}` : 'FREELANCE', 30, height - 106);
    ctx.font = font(14, 600);
    ctx.fillStyle = PALETTE.white;
    wrap(line, 30, height - 84, Math.min(width * 0.52, 560) - 30, 18);
    if (state.carryingLedger || state.carryingCrate || state.passenger) {
      ctx.fillStyle = PALETTE.neon;
      ctx.font = font(9, 800);
      ctx.fillText(state.carryingLedger ? 'LEDGER' : state.carryingCrate ? 'CASH CRATE' : 'VEX ON BOARD', 30, height - 58);
    }
  }

  function wrap(text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(' ');
    let current = '';
    let lineY = y;
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && current) {
        ctx.fillText(current, x, lineY);
        current = word;
        lineY += lineHeight;
      } else {
        current = next;
      }
    }
    if (current) ctx.fillText(current, x, lineY);
  }

  function drawMessages(state) {
    let y = 112;
    for (const message of state.messages) {
      const fade = Math.min(1, (message.life - message.age) / 0.6);
      const alpha = Math.max(0, fade);
      ctx.globalAlpha = alpha;
      ctx.font = font(12, message.tone === 'info' ? 600 : 800);
      const color = message.tone === 'money' ? '#8fe6a0' : message.tone === 'bad' ? '#ff6b5b' : message.tone === 'mission' ? PALETTE.gold : 'rgba(240,240,235,0.92)';
      ctx.fillStyle = 'rgba(9,12,20,0.55)';
      const textWidth = Math.min(width - 80, ctx.measureText(message.text).width + 22);
      ctx.fillRect(20, y - 10, textWidth, 20);
      ctx.fillStyle = color;
      ctx.fillText(message.text, 30, y);
      ctx.globalAlpha = 1;
      y += 24;
    }
  }

  function drawPrompts(state, extra) {
    if (!extra.prompt) return;
    ctx.font = font(12, 800);
    const text = extra.prompt;
    const w = ctx.measureText(text).width + 26;
    ctx.fillStyle = 'rgba(255,201,74,0.92)';
    ctx.fillRect(width / 2 - w / 2, height - 168, w, 24);
    ctx.fillStyle = '#15161c';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height - 156);
    ctx.textAlign = 'left';
    // Steal progress bar
    if (extra.stealProgress && extra.stealProgress > 0) {
      const barW = 220;
      const barH = 12;
      const x = width / 2 - barW / 2;
      const y = height - 136;
      // Background
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, barW, barH);
      // Progress
      const progress = Math.min(1, extra.stealProgress);
      ctx.fillStyle = '#ffc94a';
      ctx.fillRect(x, y, barW * progress, barH);
      // Percentage text
      ctx.font = font(9, 600);
      ctx.fillStyle = '#15161c';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(progress * 100) + '%', x + barW / 2, y + barH - 4);
      ctx.textAlign = 'left';
    }
  }

  function drawMinimap(state, extra) {
    const w = MINIMAP.width;
    const h = MINIMAP.height;
    const x = width - w - 18;
    const y = height - h - 120;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(7,10,18,0.82)';
    ctx.fillRect(-4, -4, w + 8, h + 8);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const zoom = 0.42;
    const focus = state.vehicle ?? state.player;
    ctx.fillStyle = 'rgba(40,46,58,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2 - focus.x * zoom, h / 2 - focus.y * zoom);
    ctx.scale(zoom, zoom);
    // Blocks and roads as a stylised map.
    for (const block of extra.blocks ?? []) {
      ctx.fillStyle = 'rgba(62,70,86,1)';
      ctx.fillRect(block.x, block.y, block.size, block.size);
    }
    ctx.fillStyle = 'rgba(20,24,32,1)';
    for (let index = 0; index <= GRID; index += 1) {
      ctx.fillRect(index * CELL - ROAD / 2, 0, ROAD, WORLD);
      ctx.fillRect(0, index * CELL - ROAD / 2, WORLD, ROAD);
    }
    ctx.fillStyle = 'rgba(23,48,72,1)';
    ctx.fillRect(WORLD - 8, 0, 8, WORLD);
    for (const marker of extra.markers ?? []) {
      ctx.fillStyle = marker.kind === 'job' ? PALETTE.gold : PALETTE.neon;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (state.tailTarget) {
      ctx.fillStyle = '#5aa8ff';
      ctx.beginPath();
      ctx.arc(state.tailTarget.x, state.tailTarget.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cruiser of state.police.cruisers) {
      if (!cruiser) continue;
      ctx.fillStyle = Math.floor(state.time * 8) % 2 === 0 ? '#ff4b4b' : '#4b7bff';
      ctx.fillRect(cruiser.x - 5, cruiser.y - 5, 10, 10);
    }
    for (const officer of state.police.officers) {
      if (!officer || officer.dead || officer.guard) continue;
      ctx.fillStyle = '#7ea8ff';
      ctx.beginPath();
      ctx.arc(officer.x, officer.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.white;
    const px = focus.x;
    const py = focus.y;
    const heading = state.vehicle ? state.vehicle.heading : state.player.aim;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.font = font(9, 800);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const district = extra.district ?? DISTRICTS[0].name;
    ctx.fillText(district.toUpperCase(), x + 6, y - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('N', x + w - 6, y + 12);
    ctx.textAlign = 'left';
  }

  function drawPause(state) {
    ctx.fillStyle = 'rgba(4,6,12,0.62)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.font = font(42, 900);
    ctx.fillStyle = PALETTE.white;
    ctx.fillText('PAUSED', width / 2, height / 2 - 30);
    ctx.font = font(12, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Esc to resume  ·  M for the map  ·  F5 to save  ·  F9 to load', width / 2, height / 2 + 14);
    ctx.textAlign = 'left';
    void state;
  }

  function drawEnd(title, color, sub) {
    ctx.fillStyle = 'rgba(4,6,12,0.55)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.font = font(54, 900);
    ctx.fillStyle = color;
    ctx.fillText(title, width / 2, height / 2 - 40);
    ctx.font = font(13, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(sub, width / 2, height / 2 + 6);
    ctx.font = font(12, 800);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('R  respawn at the safehouse  ·  F9  load save', width / 2, height / 2 + 44);
    ctx.textAlign = 'left';
  }

  return { canvas: layer, resize, draw, get size() { return { width, height }; } };
}
