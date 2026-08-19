# Repository Guide

## Project

Oh No! More Agents is a framework-free, Lemmings-style browser game hosted on
Cloudflare Workers. Static game files live in `public/`; the Worker and global
rescue-counter API live in `src/`; D1 schema changes live in `migrations/`.

The production site is `https://oh-no-more-agents.com`.

## Important files

- `public/index.html` — standalone game page and surrounding UI.
- `public/agents/Sim.js` — simulation, agents, levels, skills, enemies, and hazards.
- `public/agents/Draw.js` — Canvas rendering and animation.
- `public/agents/Palette.js` — biome and visual palettes.
- `public/agents/web.js` — browser integration, controls, audio, and rescue reporting.
- `src/worker.js` — Worker routes and D1 access.
- `src/counter.js` — validation, JSON responses, and counter rate-limit helpers.
- `migrations/` — ordered production database migrations; never rewrite a migration
  that may already have been applied.
- `public/_headers` — cache lifetimes for the assets Workers serves.
- `wrangler.jsonc` — Worker bindings and production custom-domain routes.

## Working conventions

- Keep the game dependency-free and runnable as plain browser JavaScript.
- Script URLs in `index.html` carry a `?v=<content hash>` so the JS can be cached
  forever. After editing a file under `public/agents/`, run `npm run stamp` and
  commit the re-stamped page with the code; `npm run check` fails on a stale
  stamp. The soundtrack has no stamp and is cached just as hard, so a replacement
  track gets a new number instead of overwriting an existing file.
- Preserve deterministic seeded level generation. A level number should produce
  the same playable layout on every run unless a change intentionally updates it.
- The colony is the other half of that, and it is **not** deterministic: traits
  and the individual whims inside them are drawn from `w.colonySeed`, which is
  random per playthrough. Same ground, different fifteen. Anything that needs a
  repeatable run passes the seed back in — `generate(level, attempt, seed)` — and
  `w.colonySeed` is kept on the world so a run worth seeing again can be.
- Keep simulation behavior in `Sim.js` and rendering-only behavior in `Draw.js`.
- Match the existing pixel-art look, biome palettes, humor, and agent puns.
- Test gameplay changes on the reported level and on nearby/random levels. Watch
  for trapped agents, repeated turning, unreachable exits, overlaps, and loops.
- Treat the rescue total as a community gimmick, not a secure leaderboard.
  Counter submissions must remain bounded, rate-limited, and idempotent.
- Never commit secrets or Wrangler credentials. `RATE_LIMIT_SALT` is a Cloudflare
  Worker secret.
- Do not edit generated Wrangler state under `.wrangler/` or dependencies under
  `node_modules/`.

## Validation

Install dependencies with `npm install`, then run the complete check before
committing:

```bash
npm run check
```

That covers syntax, the core-file self-containment guard, the cache-busting
stamps, and the unit tests.
It does **not** cover gameplay — see below.

For gameplay work, also run the game locally with:

```bash
npm run db:local
npm run dev
```

An agent working in this repo should **not** use that one. `npm run dev` is the
human's server on port 8787, and taking it over — or killing it to free the port
— interrupts whatever is being watched in a browser window. Use

```bash
npm run dev:agent     # the same server, port 8788
```

and leave 8787 alone. Two `wrangler dev --local` instances coexist happily; the
local D1 file is shared, which the rescue counter does not mind.

Use `npm run deploy` only when a production deployment is explicitly requested.
Apply new production migrations with `npm run db:remote` before deploying code
that depends on them.

## Related copies

This game originated in the `jonh.no` website, which no longer carries a copy:
this repository is the game's home, and the one remaining sibling is the
`oh-no-more-agents` Omarchy plugin. Do not silently edit that sibling project
from this repository. If a gameplay fix should be shared, call out that the
plugin needs synchronization and update it only when the task includes that
scope.

## What breaks quietly

These are the failures that have actually happened here. None of them produced
an error message at the time.

- **The three core files must never call each other.** `npm run check` enforces
  this now via `tools/check-core-refs.js`, which also catches the mirror-image
  failure of the same name being declared in two of them. `Sim.js`, `Draw.js` and
  `Palette.js` carry no imports, which is what lets the identical files run both
  in a browser and inside the Omarchy plugin's QML engine. In a browser they
  land in one global scope, so a call across files resolves and looks correct;
  in QML each `.js` is its own scope and the same call throws a `ReferenceError`
  at runtime. `Draw.js` calling `Sim.js`'s `specialSpec()` drew **no agents at
  all** in the plugin, on every level that had a special, while the web version
  was flawless. Anything one file needs from another travels on the world
  object — see `w.k` for the geometry constants and `w.specialSpec`.

- **`node --check` passes a file with a missing function.** `npm run check` is
  syntax and unit tests; it cannot see that a refactor deleted `biomeSkin()`,
  which it once did, killing the whole simulation on the first `generate()`.
  Run `tools/simcheck.js` for anything that touches the sim.

- **Generation order is load-bearing.** In `generate()`: obstacles are cut
  before floors are roughened (roughening first leaves raised dirt hanging
  across a chasm as a free bridge — Jungle lost 16 points of clear rate to it);
  `biomeSkin` runs last in `fillEarth` (before the grit pass, the grit frays
  every hull panel back into rock); the bottomless drop goes on the **last**
  corridor only (from any higher one its shaft punches through the floors below
  and can make a level unwinnable); decor is placed after everything.

- **Dirt, rock and ore are one material to everything that decides.** Solidity
  asks only whether a cell is empty; every skill asks only whether it is steel.
  That is what makes strata, biome skins and hull plating free. `simcheck inert`
  proves it and should stay passing.

- **The corridor gap is constrained, not chosen.** The handoff at the end of a
  corridor is a drop of exactly one gap, and a drop past `SAFE_FALL` kills — so
  more floors have to pack closer rather than reach deeper.

- **Changing how much RNG a generation step consumes reshuffles every level.**
  Levels are a pure function of their number, so adding a single `rng()` call
  early changes the entire catalogue. Before/after clear rates across such a
  change are not like-for-like; isolate by disabling the new behaviour rather
  than by comparing to yesterday's number.

## Checking gameplay changes

```bash
npm run sim play      # 200 levels, the way the page plays them
npm run sim biomes    # the same, broken down per biome
npm run sim inert     # materials must not affect behaviour
npm run sim gravity   # planted things must fall when their floor goes
npm run sim spread    # the same level played by several different colonies
```

Every one of these pins the colony seed, using the formula the colony was
derived from before it became per-playthrough — so these numbers are repeatable
and still comparable with the baselines below. A run that varies between
invocations means something else has picked up entropy.

`play` is the one to watch. A change that improves the look should leave it
roughly alone; a change that moves it several points has done something to the
gameplay, intended or not. `hangs` must stay at zero.

Baseline at the time of writing, 200 levels: **94% of levels reach target, 80%
of agents home, 46s per attempt, no hangs.** Played the way the page now plays
it — a fresh random colony on every attempt — the same sweep lands within a
point or two of that across repeats, so the colony being random costs the game
nothing and the retry gets a genuinely different try.

`spread` is the one that watches the personalities rather than the levels: over
40 levels with 8 colonies each, the number who get home varies by about 4 on
average, and on a quarter of levels the colony is the difference between
clearing and not. Per biome, Cavern is still the
outlier at 87% cleared and 73% home against 90–100% everywhere else — worth
looking at, and a good example of what `biomes` is for.

Looks are checked by rendering, not by reading code. The most efficient way is a
contact sheet: a throwaway page that draws every hazard in all three phases, or
every special, side by side. That is how eight dangers were found sharing one
graphic, and how the snake was found to look like a mounted gun.

## Checking the page itself, headlessly

Gameplay is checked by `npm run sim`, but layout, controls and anything
involving the browser's own APIs have to be checked in a browser. There may not
be one to drive: no display, no Chrome extension connected. Chromium's remote
debugging protocol needs neither, and no dependencies either — Node has a global
`WebSocket`, so a throwaway script is enough:

```bash
chromium --headless=new --remote-debugging-port=9222 \
         --window-size=1920,1200 --screen-info='{1920x1200}' \
         --user-data-dir=/tmp/probe-$$ --hide-scrollbars http://127.0.0.1:8788/
```

Then `GET http://127.0.0.1:9222/json` for the page target, open its
`webSocketDebuggerUrl`, and send CDP commands: `Runtime.evaluate` to read the
DOM back as JSON, `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent` to
drive it, `Page.captureScreenshot` to look at it. `clip` with `scale: 2` on a
screenshot crops to one element and doubles it, which is how to read an 11px
label instead of squinting at a full page.

Four things that wasted time and will again:

- **`--screen-info` is not optional when fullscreen is involved.** Headless
  reports a 600px-tall screen regardless of `--window-size`, so a fullscreen
  element gets a 600px viewport and every scale calculation comes out wrong.
  The fullscreen board looked broken for exactly this reason, and was not.
- **A fullscreen request needs a user gesture.** A dispatched key or mouse event
  is one; `Runtime.evaluate` is not, unless called with `userGesture: true`.
- **A fresh `--user-data-dir` per run.** A reused profile can leave the target
  list empty and the script waiting for a page that never appears.
- **Measure, don't eyeball.** Compare bounding boxes — a screenshot will not
  tell you that two rows are eight pixels out of alignment, and
  `getBoundingClientRect()` will.

Kill the browser when finished. It is headless, so nothing on screen says it is
still running.

## Sibling copies, and one real hazard

This repo is the source of truth. `Sim.js`, `Draw.js` and `Palette.js` are meant
to be byte-identical in the Omarchy plugin copy at
`~/.config/omarchy/plugins/jhgundersen.oh-no-more-agents/` and in the `jonh.no`
site copy:

```bash
npm run sync:check    # report drift, change nothing
npm run sync          # push the three core files out to whichever exist
```

`web.js` is deliberately **not** synced. Each copy has its own host integration
— this one reports to the rescue counter, the plugin has `Panel.qml` instead —
and that is the seam where they are allowed to differ.

**Do not write into that directory while the screen is locked.** The Omarchy
lock screen is not a separate program — it is a quickshell plugin, so quickshell
*is* the lockscreen app. Copying a file in makes the shell hot-reload, and a
hot-reload while a session lock is held destroys the lock surface: Hyprland
reports that the lockscreen app died and the machine is unusable until someone
runs `hyprctl eval 'hl.clear_crashed_lockscreen()'` from another tty. Afterwards
check `omarchy shell lock status` — it can be left believing it is locked, in
which case the screen silently stops locking at all until the shell is
restarted.

The plugin copy can be tested headlessly, which is the only way to see QML
runtime errors without a display:

```bash
QT_ASSUME_STDERR_HAS_CONSOLE=1 QT_QPA_PLATFORM=offscreen qml6 main.qml
```

## Conventions

- No `Co-Authored-By` or similar trailers in commit messages.
- Commit freely; **do not push unless asked**.
