// Tallow Point — entrypoint (R4-1, fresh from the R4 spec).
// Node 22, standard library only. Copies game/ and screenshots/ from beside
// this file into the output directory and writes dossier.json with the
// vendored make.fun library, so the judge reads the game exactly as built.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer caps the whole /output at 1000 entries and 64 MiB, and the
// dossier text at 160 KiB; these caps mirror the gate so a local build
// refuses exactly what the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
// Start from a clean slate so a stale file from an older build can never
// leak into the dossier.
rmSync(join(outDir, 'game'), { recursive: true, force: true });
rmSync(join(outDir, 'screenshots'), { recursive: true, force: true });
rmSync(join(outDir, 'dossier.json'), { force: true });

copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('wrote ' + join(outDir, 'dossier.json') + ' (' + dossier.length + ' bytes)');
