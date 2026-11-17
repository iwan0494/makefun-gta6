// menu.js — the title screen and the menus over it: the wordmark, a short line about the city,
// Continue / New Life / How to Play, a settings row for zoom and sound, and a street-scene
// backdrop that is the game world itself, slowly panning behind the title.
const TITLE = 'TALLOW POINT';
const TAGLINE = 'Five jobs. One pocket of the bay. The stripes are always a street away.';

export function createMenu() {
  const layer = document.createElement('canvas');
  layer.className = 'menu';
  const ctx = layer.getContext('2d');
  let width = 1;
  let height = 1;

  function resize(view) {
    width = view.width;
    height = view.height;
    layer.width = Math.floor(width * view.dpr);
    layer.height = Math.floor(height * view.dpr);
  }

  function buttons(save, hasSave) {
    const w = 330;
    const x = width / 2 - w / 2;
    const items = [
      { id: 'continue', label: hasSave ? 'CONTINUE' : 'TAKE THE FIRST JOB', hint: hasSave ? `saved ${save?.savedAt?.slice(0, 16).replace('T', ' ')}` : 'start a new life in Tallow Point', enabled: true },
      { id: 'new', label: hasSave ? 'NEW LIFE' : 'PRESS ENTER', hint: hasSave ? 'start over from the wharf' : 'WASD to walk, click to aim, E to take a car', enabled: true },
      { id: 'how', label: 'HOW TO PLAY', hint: 'controls, jobs, wanted level, saving', enabled: true },
    ];
    return items.map((item, index) => ({ ...item, x, y: height * 0.6 + index * 64, w, h: 50 }));
  }

  function draw(state, time, option) {
    const dpr = layer.width / width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(6,8,18,0.82)');
    grad.addColorStop(0.55, 'rgba(6,8,18,0.5)');
    grad.addColorStop(1, 'rgba(6,8,18,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Sunset behind the skyline.
    const sun = ctx.createRadialGradient(width * 0.68, height * 0.58, 10, width * 0.68, height * 0.58, height * 0.45);
    sun.addColorStop(0, 'rgba(255,160,80,0.5)');
    sun.addColorStop(0.4, 'rgba(220,90,110,0.2)');
    sun.addColorStop(1, 'rgba(20,20,50,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    // A skyline of blocks, with lit windows, drawn from a fixed pattern so it never flickers.
    for (let index = 0; index < 28; index += 1) {
      const bw = 30 + ((index * 47) % 46);
      const bh = 40 + ((index * 91) % 150);
      const bx = (index * 73) % (width + 60) - 30;
      const by = height * 0.63 - bh;
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,201,74,0.12)';
      for (let wy = by + 8; wy < height * 0.63 - 6; wy += 12) {
        for (let wx = bx + 5; wx < bx + bw - 5; wx += 9) {
          if ((wx * 7 + wy * 13 + index) % 5 === 0) ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
    // A lit street running to the horizon, with cars on it.
    ctx.fillStyle = '#151a28';
    ctx.fillRect(0, height * 0.63, width, height * 0.37);
    ctx.fillStyle = 'rgba(255,220,150,0.18)';
    for (let y = height * 0.66; y < height; y += 34) ctx.fillRect(width * 0.3, y + Math.sin(time + y) * 6, 2, 18);
    for (let car = 0; car < 7; car += 1) {
      const cx = (width * 0.12 + car * 120 + time * (22 + car * 5)) % (width + 80) - 40;
      const cy = height * 0.68 + (car % 3) * 44;
      ctx.fillStyle = ['#c8c2b2', '#f2b52c', '#37506e', '#b8233a'][car % 4];
      ctx.fillRect(cx, cy, 34, 14);
      ctx.fillStyle = 'rgba(255,240,190,0.9)';
      ctx.fillRect(cx + 30, cy + 3, 4, 3);
      ctx.fillStyle = 'rgba(255,60,60,0.7)';
      ctx.fillRect(cx, cy + 3, 3, 3);
    }

    // The wordmark.
    ctx.textAlign = 'center';
    ctx.font = '900 86px "Sora", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,201,74,0.18)';
    ctx.fillText(TITLE, width / 2 + 4, height * 0.3 + 4);
    const mark = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.34);
    mark.addColorStop(0, '#fff3cf');
    mark.addColorStop(0.55, '#ffc94a');
    mark.addColorStop(1, '#ff7a3d');
    ctx.fillStyle = mark;
    ctx.fillText(TITLE, width / 2, height * 0.3);
    ctx.font = '700 14px "Sora", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.fillText('A  M A K E . F U N   O P E N   W O R L D   C R I M E   S T O R Y', width / 2, height * 0.36);
    ctx.font = '500 15px "Sora", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(240,240,235,0.72)';
    ctx.fillText(TAGLINE, width / 2, height * 0.42);

    // The menu options.
    const items = buttons(option.save, option.hasSave);
    items.forEach((item, index) => {
      const active = option.index === index;
      ctx.fillStyle = active ? 'rgba(255,201,74,0.92)' : 'rgba(10,14,24,0.72)';
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.14)';
      ctx.strokeRect(item.x + 0.5, item.y + 0.5, item.w - 1, item.h - 1);
      ctx.textAlign = 'left';
      ctx.font = '800 15px "Sora", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillStyle = active ? '#15161c' : '#f3f0e6';
      ctx.fillText(item.label, item.x + 18, item.y + 21);
      ctx.font = '500 10px "Sora", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillStyle = active ? 'rgba(20,22,30,0.7)' : 'rgba(255,255,255,0.45)';
      ctx.fillText(item.hint, item.x + 18, item.y + 37);
    });
    // Settings row.
    ctx.textAlign = 'center';
    ctx.font = '600 11px "Sora", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Zoom ${option.zoom.toFixed(1)}×   ·   Sound ${option.muted ? 'off' : 'on'}   ·   + / - zoom, K sound, Enter select`, width / 2, height * 0.6 + 224);
    ctx.fillText('A keyboard and mouse city: WASD, mouse aim, click fire. Every job is in the bay.', width / 2, height - 32);
    ctx.textAlign = 'left';
    void state;
  }

  return { canvas: layer, resize, draw, buttons };
}

export function drawHowTo(ctx, width, height) {
  ctx.fillStyle = 'rgba(4,6,12,0.86)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.font = '900 34px "Sora", "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#ffc94a';
  ctx.fillText('HOW TO PLAY', width / 2, 84);
  const rows = [
    ['WASD', 'walk, drive, steer'],
    ['Mouse', 'aim  ·  Left click / Space  fire'],
    ['E', 'get in or out of a car'],
    ['Shift', 'sprint  ·  boost (in a car)'],
    ['Q', 'switch weapon'],
    ['M', 'city map  ·  Esc pause'],
    ['F5 / F9', 'save / load'],
  ];
  ctx.font = '600 15px "Sora", "Trebuchet MS", system-ui, sans-serif';
  rows.forEach(([key, text], index) => {
    const y = 140 + index * 36;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fe6a0';
    ctx.fillText(key, width / 2 - 24, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(240,240,235,0.85)';
    ctx.fillText(text, width / 2 + 6, y);
  });
  ctx.textAlign = 'center';
  ctx.font = '600 12px "Sora", "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Gold rings are jobs. Take one, finish it, take the next. The map remembers.', width / 2, 140 + rows.length * 36 + 26);
  ctx.fillText('Press Esc or Enter to go back.', width / 2, 140 + rows.length * 36 + 52);
  ctx.textAlign = 'left';
}
