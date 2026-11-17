// Tallow Point's entrypoint: copies the static game (game/) and its screenshots/ into the output
// directory and writes dossier.json with the vendored make.fun library. Node 22, standard library
// only, no network: the game is plain ES modules on a canvas, loaded by game/index.html.
// Locally, MAKEFUN_OUTPUT_DIR stands in for /output: MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Plain directory copies, one level at a time, so an existing output is replaced file by file and
// no symlink or odd entry in the source is followed out of the tree.
function copyTree(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copied += copyTree(source, target);
    else if (entry.isFile()) {
      cpSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

// The scorer's caps for this competition: at most 4 screenshots, each at most 256 KiB; game/ with
// at most 993 files and directories and 48 MiB in all. buildDossier refuses a snapshot over them.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const gameDir = join(repo, 'game');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error(`no game/index.html under ${repo}`);
const gameFiles = copyTree(gameDir, join(out, 'game'));

const shotsDir = join(repo, 'screenshots');
const shots = existsSync(shotsDir) ? copyTree(shotsDir, join(out, 'screenshots')) : 0;

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, buildDossier(out, caps));
const dossierBytes = statSync(dossierPath).size;
console.log(`game: ${gameFiles} files, screenshots: ${shots}, dossier.json: ${dossierBytes} bytes -> ${out}`);
