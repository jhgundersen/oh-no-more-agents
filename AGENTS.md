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
  the exit — and a crossing level may get both. The Skyscraper is the exception
  and it is allowed to be: its hole is the pair of hoistways that run past every
  storey, so `placeTowerPit` rolls only the crossing and never the shaft, which
  on that biome would open at a lift door. Five of the nine biomes flood
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
  same index with its own copy of the rule (`(level - 1) % 9` in `poolTint` and
  `biomeTint`) and has to be changed in the same commit; the two files cannot
  call each other. Note that `rock` is mixed from the theme foreground and is
  **not** tinted — a biome skin built mostly out of `ROCK` comes out the same
  grey everywhere, which is what happened to the Factory on the first attempt.
- **The Skyscraper is the one biome with a mechanism rather than a skin**, and
  the rules it needs are gathered in the block above `cutHoistway`. Two shafts
  run the full height of the board, one at each end, with a door onto every
  storey and a car in each; the floors are STEEL slabs and nothing removes
  ground on a tower, so the cars are the only handoff. Because the corridors
  alternate their walking direction, the shaft an agent walks *toward* is always
  the far one from the shaft it arrived by, and that is the whole level: cross
  the floor, ring, ride a storey, cross the next one the other way.
- **A car is called; it does not patrol.** `liftDispatch` parks it at the floor
  it last served and nothing moves it again until `liftWanted` says somebody is
  at a door — the two cars used to sweep the full height of the board all level,
  which was most of what the eye saw on this biome. `L.parked` counts as docked,
  so a car standing at your floor is one you step straight into, and `Draw.js`
  reads the same flag to leave that floor's doors open: one lit door per shaft
  saying where the car is, and a shut pair everywhere else. The speed came with
  it. Answering from rest at the old 0.42 left a third of the queue giving up
  on the lift (`LIFT_PATIENCE`) and going to look for a wall to climb, which
  cost four points of home; at 0.60 the tower is better off than it was
  patrolling, and the cars still travel a quarter of the distance.
- **A tower is also the one level shape that can be played upside down.** A drop
  is one-way, which is why every other level in this game ends below where it
  started; a car is not, so `w.ascending` puts the hatch in the lobby ceiling
  and the door on the top floor on half of them. `w.exitCorridor` is what the
  rest of generation reads — obstacle density, the mission, the bottom pit — so
  nothing else has to know which way up the level is. `liftRouted()` is the
  other half: every rule that answers "the way home is above me" with a climber
  or a staircase stands down on a tower, because the answer there is a machine
  at the end of the floor and a climber spent on the partition in front of you
  is a climber spent on nothing.
- A tower's toolbar is the same size as everybody else's and a different shape.
  Its diggers and miners are unreachable — `canDescendHere` never says yes
  through a slab — so that allowance is moved into basher, climber and builder
  at generation. Do not simply *add* skills: measured, more tools made the tower
  worse, because the extra builds cost more clock than the obstacles did.
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
- **A bridge stops at the far side; a staircase does not.** `startBuild` records
  which one this is (`buildSpan`: a lip has nothing solid beside it) and
  `bridgeLanded` ends a bridge once the ground ahead has come back up to the
  floor it set out from. Measure it against the starting floor rather than
  against a depth — a staircase gains height as it goes, so the deck finishes
  above the far side and any fixed depth either never matches or stops the
  bridge in a dip. It used to run its full twelve regardless: 713 bricks a
  sweep laid onto ground that was already solid, and the raised causeway they
  made was a ramp for the queue behind to climb for nothing.
- **A blocked builder cuts narrower steps before it gives up** — one cell
  across and a row up, instead of two across and a row every third. A normal
  step needs eighteen cells of floor to climb one corridor and an agent wedged
  in a slot has three. There is no width test: the wide step is tried first
  every time, so a builder steepens exactly as far into a pocket as the pocket
  is tight. It is gated on `NARROW_IDLE` all the same, because steepening at an
  ordinary wall is a bad trade — measured, always-narrow spent twelve bricks
  climbing walls the colony had no reason to be over and took levels that
  cleared to nothing. Getting nowhere for that long is what a hole looks like.
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

- **An obstacle can reach through the floor above it.** A `step` lifts the roof
  by as much as it lifts the floor, and with the biggest rise the raised roof of
  one corridor comes out a row *above* the floor of the corridor over it.
  Everywhere else that is a harmless shortcut and nobody had noticed it in two
  hundred levels. In a building it was a twenty-one cell hole in the second
  storey that the whole colony walked into, and no lift was ever rung for again.
  `roofLimit` clamps it on sealed biomes only, so the other eight keep the
  layouts they have always had.

- **A bridge that runs out over a hole is a diving board.** Bridges answer holes
  from the lip, where the far side is inside the twelve bricks' reach. One that
  starts on solid ground twenty cells short lays its last brick in mid-air, and
  the queue behind it walks up the ramp and off the end without ever seeing an
  edge to have an opinion about — twelve of fourteen on the level that found it.
  `canStartBuild` refuses those now, in every biome.

- **`wallHeight` answers zero for a wall that is not there**, and zero passed
  the "is it climbable" test. `advanceWalk` sends a low roof to `hitWall` as
  well as a wall, and its idea of the cell ahead is one step further on than
  `hitWall`'s whenever the stride crosses a cell boundary — so the agent bought
  a climber, started up nothing and dropped off it on the same tick, seven times
  in a row. The guard is `h > 0`; a blanket "turn round if the cell ahead is
  empty" looks equivalent and costs four points of home across the catalogue,
  because it also throws away the walls `hitWall` can see and `advanceWalk`
  could not.

- **Two rules that each reverse an agent make a trap between them.** The shut
  mission door bounces you out; `exitInSight` turns you back toward it; and the
  rebound renews `waitFor`, which is the flag that tells the loop detector an
  agent is holding on purpose — so nothing ever condemns it. Fifteen agents
  treading a threshold until the nuke. The fix is not another reflector: finding
  the door shut now sets `sawShut`, which is how an agent learns there is a job
  on and goes to do it.

- **The exit was the only beacon, and a mission moves it.** `stepWalk` sends
  the searchers toward the search point, but `crossingHelps`, `buildDirection`
  and `goalDist` each read `w.exit` for themselves — so while the door was shut
  they were all answering about a place the agent was deliberately not walking
  to. The bridge over the bottom pit was refused as leading away from home, the
  bricks that did get laid faced back toward the door, and an agent crossing the
  floor to do the job read to the stall detector as one getting nowhere and was
  bombed for it. Levels 29, 145 and 236 lost their **entire colony**; across the
  catalogue a mission over a crossing pit ran 20 points of home below the same
  ground without one. They ask `goalX` now, which is one question answered in
  one place. Anything else that wants to know which way home is belongs there
  too.

- **A shut door is a door, not a wall.** The mouth rebounds an early arrival so
  it does not vanish mid-mission, and a tower's cars can land the colony on the
  *far* side of its own exit — with the search point beyond the doorway. The
  rebound threw them back, the search steer turned them round, and neither rule
  ever gives: level 369 spent four thousand ticks with twelve agents in a
  one-cell tug of war, invisible to the loop detector because the rebound
  renews `waitFor` and `waitFor` is the flag for holding on purpose. Somebody on
  their way past the door is let past; only somebody who came to go home is
  turned around.

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

Baseline at the time of writing, 200 levels: **92% of levels cleared, 78% of
agents home, 46s per attempt, no hangs**, against 90% / 75% / 44s for the same
sweep with the Skyscraper taken back out. Almost none of the gap is the tower
being harder — most of it is the ninth biome re-assigning which level number is
which, which a fixed sweep cannot see through. The way to measure a change on a
catalogue whose length just changed is to run the sweep twice, once with
`BIOMES` and `Palette`'s modulus reverted to the old count: that isolates the
rule change from the reshuffle, and it is how the four cross-biome fixes that
came out of building the tower were shown to cost nothing. The extra four
seconds per attempt is real and is the tower's: a storey is eighty cells wide
and there is no falling down it.

Events are close to free — measured on the
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
is unchanged at 4. Per biome nothing is an outlier — 87–96% cleared and 70–86%
home across all nine. The Skyscraper sits at 91/79, mid-pack on both, and it
took work to get there: measured on 24 tower levels, the seal wall in front of
the exit was worth eleven points of home on its own (it is skipped there now —
see the note in `generate`), and letting a stuck agent on the exit floor take a
round trip in the car was worth another ten on the levels played upward.

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
