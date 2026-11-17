// input.js — keyboard and mouse state in a form the game loop can poll. Held keys are a set,
// presses since the last frame are a queue (so a mission trigger that runs between two frames
// still sees them), and the mouse reports screen position and whether a button is down.
const BLOCKED = new Set(['Tab', 'F1', 'F3', 'F5', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, wheel: 0, over: false };

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code;
    if (BLOCKED.has(code) || /^(Key[A-Z]|Digit\d)$/.test(code)) event.preventDefault();
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function clear() {
    held.clear();
    pressed.clear();
    mouse.down = false;
    mouse.clicked = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    mouse.over = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    mouse.wheel += Math.sign(event.deltaY);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    pressed,
    mouse,
    isDown: (...codes) => codes.some((code) => held.has(code)),
    wasPressed: (...codes) => codes.some((code) => pressed.has(code)),
    consume: () => {
      pressed.clear();
      mouse.clicked = false;
      mouse.wheel = 0;
    },
  };
}
