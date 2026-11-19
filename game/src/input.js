'use strict';
// Tallow Point — keyboard + mouse input (R4-2, fresh from the R4 spec).
// Tracks held keys and edge-triggered presses (E steal, R respawn, Space)
// so the game loop reads one clean snapshot per frame. No DOM is touched
// here; the loop decides what each axis means (walk, steer, turn).

function createInput() {
  const held = {};
  const justPressed = {};
  let mouseDX = 0;
  let dragging = false;
  let lastX = 0;

  function onKeyDown(e) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown'
      || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
    }
    if (!e.repeat) justPressed[e.code] = true;
    held[e.code] = true;
  }
  function onKeyUp(e) { held[e.code] = false; }
  function onMouseDown(e) { dragging = true; lastX = e.clientX; }
  function onMouseMove(e) {
    if (!dragging) return;
    mouseDX += e.clientX - lastX;
    lastX = e.clientX;
  }
  function onMouseUp() { dragging = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    // Snapshot for this frame: axes plus one-shot actions.
    read() {
      const forward = (held.KeyW || held.ArrowUp ? 1 : 0)
        - (held.KeyS || held.ArrowDown ? 1 : 0);
      const strafe = (held.KeyD ? 1 : 0) - (held.KeyA ? 1 : 0);
      const turn = (held.ArrowLeft ? 1 : 0) - (held.ArrowRight ? 1 : 0);
      return {
        forward, strafe, turn,
        run: !!(held.ShiftLeft || held.ShiftRight),
        steal: !!justPressed.KeyE,
        respawn: !!justPressed.KeyR,
        shoot: !!justPressed.Space,
        melee: !!justPressed.KeyF,
      };
    },
    // Mouse drag accumulated since the last frame (pixels, + = right).
    takeMouseDX() {
      const dx = mouseDX;
      mouseDX = 0;
      return dx;
    },
    // Clear edge-triggered presses after the frame consumed them.
    endFrame() {
      for (const k in justPressed) delete justPressed[k];
    },
    // Test helper: feed a press through the same path a real key uses.
    press(code) {
      justPressed[code] = true;
      held[code] = true;
    },
    release(code) { held[code] = false; },
  };
}
