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
- `public/agents/Outcome.js` — end-of-level copy, shared with the Omarchy panel.
- `tools/render.js` — draws the game to a PNG from Node, no browser; `tools/shoot.js`
  is the command that uses it (`npm run shot`).
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
- Every level ends over a hole: `placeBottomPit` rolls none, a shaft on the dead
  ground behind the colony, or a crossing on the route between the landing and
  the exit — and a crossing level may get both. Four of the seven biomes flood
  theirs (`pitLiquid`), and `Palette.poolTint` picks the matching colours from
  the same level number, which is how two files that cannot call each other stay
  in step. A crossing is only survivable because of the rule in `edgeAhead` that
  goes with it: a bottomless drop with ground on the far side gets bricks, and
  the blocker is kept for the drop that has no far side at all.
- The colony is the other half of that, and it is **not** deterministic: traits
  and the individual whims inside them are drawn from `w.colonySeed`, which is
  random per playthrough. Same ground, different fifteen. Anything that needs a
  repeatable run passes the seed back in — `generate(level, attempt, seed)` — and
  `w.colonySeed` is kept on the world so a run worth seeing again can be.
- A colony is a **cast**, not a uniform draw. `traitBag` picks `CAST_SIZE` of
  `TRAIT_DISTINCT`, fills `COMMON_SHARE` of the ranks from `TRAIT_COMMON`, and
  deals the result one per release. Two or three agents therefore share each
  oddity, which is what makes it read as a personality rather than a one-off —
  and adding a trait widens the range of colonies instead of making every
  existing trait rarer, which is what the old flat pool did.
- A new trait earns its place with a **rule**, not a new set of numbers. The
  numeric dials are nearly saturated; another row that only permutes
  `turnLimit`/`bridgeAt`/`digBias` is a relabelling of a trait that exists.
  `reserve`, `herd` and `wary` are what the last three brought with them, and
  `pace` is the one dial that shows while an agent is merely walking — every
  other one is invisible until it meets an obstacle.
- The whims in `spawn()` take **one `traitRng()` draw each**. They were once
  derived from a single number, which tied them together: `contrary` forced
  `bridgeBias` negative, so half the combinations could not occur.
- Biomes are picked by level number, so a new one goes on the **end** of
  `BIOMES` — inserting re-skins every level above it. `Palette.js` derives the
  same index with its own copy of the rule (`(level - 1) % 8` in `poolTint` and
  `biomeTint`) and has to be changed in the same commit; the two files cannot
  call each other. Note that `rock` is mixed from the theme foreground and is
  **not** tinted — a biome skin built mostly out of `ROCK` comes out the same
  grey everywhere, which is what happened to the Factory on the first attempt.
- Animated scenery cannot live in `drawDecor`. That runs inside `drawTerrain`,
  which only repaints on `terrainVersion`, so a cog painted there never turns.
  `drawMachines` is called from `drawActors` instead — the per-tick pass every
  host already calls, so no host needs a new entry point.
- **Events** are the other half of what a level does: see the block above
  `stepEvents`. A hazard is placed at generation and runs on a timer; an event
  changes the level's premise while it is being played. They are a table over
  five mechanisms, and a new one should be a row, not a function. Two rules
  they must keep: eligibility comes from the level seed and firing from the
  colony stream, so a level stays itself while a retry stays fresh; and nothing
  may touch the ground near the exit or the hatch (`eventSafeX`), because past
  that line a change of premise stops being drama and starts being a level that
  cannot be finished.
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
  and can make a level unwinnable); the pit is cut after the exit and its seal
  wall are placed, because a crossing is positioned relative to both; decor is
  placed after everything.

- **The last corridor's floor is the bottom of every chasm above it.** Chasms,
  gaps and cliffs on the corridor above are cut down to exactly that floor, and
  that floor is what makes them survivable — an agent that walks into one is
  taking a shortcut. `placeBottomPit` cuts through it, so a crossing may only go
  where the roof over it is intact (`solid(w, x, floorY - CORR_H - 1)`), or it
  turns an ordinary drop three floors up into a fall out of the world. Level 1
  demonstrated this by losing its entire colony to a chasm it had walked into
  happily for two hundred levels; across the catalogue it was 32 points of home.

- **A fractional `x` reads as solid.** `at()` indexes a `Uint8Array`, and a
  non-integer index returns `undefined`, which is not `EMPTY`, so it is solid.
  `landingAhead()` was called with `ag.x` — a position, almost never a whole
  number — and therefore answered "nothing on the far side" essentially always,
  which silently switched off three separate build rules. Anything taking a
  coordinate from an agent rather than from a loop should floor it at the door.

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

The game itself has no pass mark — every agent counts and the page moves on
either way — so `cleared` is measured against `CLEAR_SHARE`, a fixed fraction of
the colony defined in `simcheck.js`. It sits at the average of the per-level
goal that used to live on the world, so older baselines stay comparable, and
being fixed it keeps its own noise out of the comparison.

Baseline at the time of writing, 200 levels: **94% of levels cleared, 78% of
agents home, 45s per attempt, no hangs**. Two things moved it since the colony
rework's 95% / 82% / 43s, and only one of them is a gameplay change: adding the
Factory re-assigns which level number is which biome, so a fixed sweep now
covers a different mix. Events themselves are close to free — measured on the
same 240 levels with `stepEvents` stubbed out, overall home was 84% either way.
Measure a change against a sweep with events both on and off before concluding
one of them did something. Played the way the page plays it — a fresh
random colony on every attempt — the same sweep lands within a point or two of
that across repeats, so the colony being random costs the game nothing and the
retry gets a genuinely different try.

`spread` is the one that watches the personalities rather than the levels: over
60 levels with 8 colonies each, the number who get home varies by about 4 on
average, and on about a third of levels the colony is the difference between
clearing and not. That last figure was half when `cleared` was measured against
a goal the level rolled for itself; a fixed bar removed that roll's variance,
and the spread in agents home — the figure that actually measures the colony —
is unchanged at 4. Per biome nothing is now an outlier — 93–100% cleared and 75–85% home
across all seven, where Cavern used to sit at 87/73.

The bottom pit is the one thing worth breaking those numbers down by, and
`tools/` has no command for it: generate a level, look at `w.pits`, and bucket
the result by whether anything in it is `crossing`. Levels with no pit run at
about 87% home, ones with a shaft at 81%, ones with a crossing at 80%. A change
that opens a gap between those three has changed how the colony handles a hole
in the floor, whatever else it was meant to do.

Looks are checked by rendering, not by reading code — and from a terminal the
browser is the wrong place to do it from. Use:

```bash
npm run shot level 8          # one level, as the page draws it
npm run shot crop 8           # a close crop, for texture rather than layout
npm run shot biomes           # one of each biome, stacked
npm run shot themes 8         # one level in every theme
```

`tools/render.js` rasterises `Draw.js` straight to a PNG with no browser and no
dependencies: the core files only call `fillRect` and a few no-ops, so a
recording canvas plus zlib is the whole of it. It runs the same code the page
runs. Shots land in `shots/`, which is not committed, and every command pins
the colony seed — so two runs produce identical files and a diff between them
is a real change. Text is skipped and gradients collapse to their middle stop.

The Factory is the worked example of why this matters. It shipped noisy —
seventeen identical cogs at random heights, a dashed roller line on every
floor, blank surfaces underneath — and none of that was visible from the code,
where each piece looked reasonable on its own. One render made the cause
obvious. Contact sheets are still the way to check a set of things against each
other: every hazard in all three phases, or every special, side by side. That
is how eight dangers were found sharing one graphic, and how the snake was
found to look like a mounted gun.

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
