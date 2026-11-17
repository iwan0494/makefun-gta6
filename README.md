# Tallow Point

[![make.fun entry](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/iwan0494/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/iwan0494/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01)

Tallow Point is an original top-down open-world crime game for the browser, built for the
[make.fun GTA6 bounty](https://make.fun/bounty/gta6-01). You drive and walk around a night-time bay
city of five districts — Kessel Wharf, Northline, Moraine Heights, Crater Row and Sunmere — steal
cars, take jobs, draw a wanted level and outrun the stripes. Everything in it (city, districts,
shops, names, story, art and sound) is written for this game.

## Play

```
node serve.ts            # serves game/ on http://localhost:8080
```

Then open <http://localhost:8080>. The game is static files under `game/` (plain ES modules on a
canvas, no library, no build step, no network request).

## Controls

- `W` / `A` / `S` / `D` or the arrow keys: walk or drive; `Shift` to sprint
- Mouse: aim; left mouse button: fire; `Q` / `E`: cycle weapons
- `F`: enter or leave a car, interact; `Tab`: map; `Esc`: pause and save; `+` / `-`: zoom
- `?shot=start|city|chase|mission&seed=1` opens a deterministic scene used for the screenshots

## Enter it

`node main.ts` copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes
`dossier.json` with the vendored make.fun library. `shots.json` lists the screenshot scenes.

## Screenshots

`screenshots/1-start.png` (title and first job), `2-city.png` (city and traffic), `3-chase.png`
(wanted level, cruisers behind), `4-mission.png` (job card, HUD and minimap).

## License

MIT — see [LICENSE](LICENSE).
