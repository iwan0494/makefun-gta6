'use strict';
// Tallow Point — save slot (R4-3, fresh from the R4 spec).
// One save object owns the whole round-trip: the base snapshot from
// game.js (cash, clock, position, mission index) plus the story progress
// (which jobs are done). NEW LIFE wipes both keys. Everything is guarded
// — a corrupt or private-mode slot never throws into the game loop.

const STORY_SAVE_KEY = 'tallow-point-story';

function createSave(state, story) {
  return {
    // Write both keys; returns true only when both landed.
    save() {
      let ok = saveGame(state);
      try {
        const storyData = {
          missionIndex: story ? story.index : 0,
          done: story ? story.done.slice() : [],
          savedAt: Date.now(),
        };
        localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(storyData));
      } catch (e) { ok = false; }
      return ok;
    },
    // Read both keys and apply them onto the live state; false = no save.
    load() {
      const data = loadGame();
      if (!data) return false;
      applySave(state, data);
      try {
        const raw = localStorage.getItem(STORY_SAVE_KEY);
        if (raw && story) {
          const sd = JSON.parse(raw);
          if (typeof sd.missionIndex === 'number') story.index = sd.missionIndex;
          if (Array.isArray(sd.done)) story.done = sd.done.slice();
          story.active = null;
          story.dirty = true;
        }
      } catch (e) { /* story progress stays fresh */ }
      return true;
    },
    // NEW LIFE: wipe the base snapshot and the story progress together.
    wipe() {
      clearSave();
      try { localStorage.removeItem(STORY_SAVE_KEY); } catch (e) { /* ignore */ }
    },
    // True when a base snapshot exists (the story key is optional).
    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },
  };
}
