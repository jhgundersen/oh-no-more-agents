# Repository Guide

## Project

Oh No! More Agents is a framework-free, Lemmings-style browser game hosted on
Cloudflare Workers. Static game files live in `public/`; the Worker and global
rescue-counter API live in `src/`; D1 schema changes live in `migrations/`.
Production is `https://oh-no-more-agents.com`.

## Important files

- `public/index.html` — standalone game page and surrounding UI.
- `public/agents/Sim.js` — simulation, agents, levels, skills, enemies, hazards.
- `public/agents/Draw.js` — Canvas rendering and animation.
- `public/agents/Palette.js` — biome and visual palettes.
- `public/agents/web.js` — browser integration, controls, audio, rescue reporting.
- `public/agents/Outcome.js` — end-of-level copy, shared with the Omarchy panel.
- `tools/render.js` — draws the game to a PNG from Node, no browser; `tools/shoot.js`
  is the command that uses it (`npm run shot`).
- `src/worker.js` — Worker routes and D1 access.
- `src/counter.js` — validation, JSON responses, counter rate-limit helpers.
- `migrations/` — ordered production migrations; never rewrite one that may
  already have been applied.
- `public/_headers` — cache lifetimes for the assets Workers serves.
- `wrangler.jsonc` — Worker bindings and production custom-domain routes.

## Working conventions

- Keep the game dependency-free and runnable as plain browser JavaScript.
- Keep simulation behaviour in `Sim.js` and rendering-only behaviour in `Draw.js`.
- Match the existing pixel-art look, biome palettes, humour, and agent puns.
- Script URLs in `index.html` carry `?v=<content hash>` so the JS can be cached
  forever. After editing anything under `public/agents/`, run `npm run stamp` and
  commit the re-stamped page with the code; `npm run check` fails on a stale
  stamp. The soundtrack has no stamp and is cached just as hard, so a replacement
  track gets a new number rather than overwriting an existing file.
- Test gameplay changes on the reported level and on nearby/random levels. Watch
  for trapped agents, repeated turning, unreachable exits, overlaps, and loops.
- Treat the rescue total as a community gimmick, not a secure leaderboard.
  Counter submissions must stay bounded, rate-limited, and idempotent.
- Never commit secrets or Wrangler credentials. `RATE_LIMIT_SALT` is a Worker
  secret.
- Do not edit generated Wrangler state under `.wrangler/` or `node_modules/`.

## How the level is put together

- **Generation is deterministic; the colony is not.** A level number produces the
  same layout every run. Traits are drawn from `w.colonySeed`, random per
  playthrough — same ground, different fifteen. Anything needing a repeatable run
  passes the seed back in: `generate(level, attempt, seed)`.
- **A colony is a cast, not a uniform draw.** `traitBag` picks `CAST_SIZE` of
  `TRAIT_DISTINCT`, fills `COMMON_SHARE` of the ranks from `TRAIT_COMMON`, and
  deals one per release, so two or three agents share each oddity. Adding a trait
  widens the range of colonies instead of making existing traits rarer.
- **A new trait earns its place with a rule, not new numbers.** Another row that
  only permutes `turnLimit`/`bridgeAt`/`digBias` is a relabelling of a trait that
  exists. `reserve`, `herd` and `wary` brought rules; `pace` is the one dial
  visible before an agent meets an obstacle.
- **The whims in `spawn()` take one `traitRng()` draw each.** Deriving them from
  a single number tied them together and made half the combinations impossible.
- **Every level ends over a hole.** `placeBottomPit` rolls none, a shaft behind
  the colony, or a crossing on the route to the exit (a crossing level may get
  both). Five of the nine biomes flood theirs (`pitLiquid`), and
  `Palette.poolTint` picks matching colours from the same level number — that is
  how two files that cannot call each other stay in step. A crossing is only
  survivable because of `edgeAhead`: a bottomless drop with ground on the far
  side gets bricks, and the blocker is kept for the drop with no far side.
- **Biomes are picked by level number, so a new one goes on the end of `BIOMES`**
  — inserting re-skins every level above it. `Palette.js` derives the same index
  with its own copy of the rule (`(level - 1) % 9` in `poolTint` and `biomeTint`)
  and must change in the same commit. `rock` is mixed from the theme foreground and is **not** tinted, so a
  skin built mostly of `ROCK` comes out the same grey everywhere.
- **Events change a level's premise while it is played** (see the block above
  `stepEvents`) — a table over five mechanisms; a new one is a row, not a
  function. Eligibility comes from the level seed and firing from the colony
  stream, so a level stays itself while a retry stays fresh. Nothing may touch
  ground near the exit or hatch (`eventSafeX`).
- **A bridge stops at the far side; a staircase does not.** `startBuild` records
  which (`buildSpan`: a lip has nothing solid beside it) and `bridgeLanded` ends
  a bridge once the ground ahead returns to the floor it set out from — measured
  against the starting floor, not a depth, because a staircase gains height.
- **A blocked builder cuts narrower steps before giving up** — one cell across
  and a row up. There is no width test: the wide step is tried first every time,
  so a builder steepens exactly as far as the pocket is tight. Gated on
  `NARROW_IDLE`, because steepening at an ordinary wall is a bad trade.
- **Animated scenery cannot live in `drawDecor`.** That runs inside
  `drawTerrain`, which only repaints on `terrainVersion`. Use `drawMachines`,
  called from `drawActors` — the per-tick pass every host already calls.

## The Skyscraper

The one biome with a mechanism rather than a skin. The rules it needs are
gathered above `cutHoistway`.

- Two shafts run the full height, one at each end, with a door onto every storey
  and a car in each. Floors are STEEL and nothing removes ground on a tower, so
  the cars are the only handoff. Corridors alternate direction, so the shaft an
  agent walks toward is always the far one from the shaft it arrived by.
- `placeTowerPit` rolls only the crossing, never the shaft — a shaft here would
  open at a lift door.
- **Some towers have a fire escape instead of one lift**, rolled from its own
  stream keyed on the level (`ESCAPE_CHANCE` in `cutHoistways`) so other levels
  stay byte-identical; verify with a terrain hash if you touch the roll. It is a
  `w.lifts` entry with `stairs: true`, so doors, `goalDist`, `liftColumn`'s ban
  on terrain edits and the climber stand-down all work on it unchanged; only
  `stepStairs` differs, by having nothing to wait for. **Never both sides** — a
  building with no lift is one the whole colony has to bash down, and the clock
  says no.
- **Fire-escape doors are ROCK, deliberately.** A glazed door is one cell thick
  and not steel, but `hitWall` recognises it and opens it without spending a
  basher. A material of its own would be the exception that ends the
  strata-and-skins scheme (`simcheck inert`). `alightStairs` opens the same door
  from outside, and an open frame is the readout of where the colony has been.
- **A basher that reaches an open stair door must be handed to the stairs**, not
  left to walk on — the door opens onto a well running past every floor.
  `stepBash` calls `useLift` for that cell.
- **A rider is drawn from `L.car`, never from its own `ag.y`.** Agents step
  before lifts in a tick, so a rider's `y` is one `LIFT_SPEED` stale the whole
  way down and the sprite floats above the floor plate. `drawAgent` reads the
  car instead — which needs `st` assigned above that line, not after it, or the
  branch is dead and the float comes back. The plate's own top row is the foot
  line (`carTop + ch2 - 4`), the same join a walker makes with a floor.
- **The switchback is written in both `Sim.js` and `Draw.js`** — `stairX` and
  `escapeRunX`, named differently because the files share one global scope and
  `npm run check` refuses a duplicate declaration. Change one, change the other;
  it is deliberately tiny for that reason.
- **A car is called; it does not patrol.** `liftDispatch` parks it where it last
  served until `liftWanted` says somebody is at a door. `L.parked` counts as
  docked, and `Draw.js` reads the same flag to leave that floor's doors open.
  Answering from rest needs the higher speed (0.60): at 0.42 a third of the queue
  gave up (`LIFT_PATIENCE`) and went looking for a wall to climb.
- **A tower can be played upside down.** `w.ascending` puts the hatch in the
  lobby ceiling and the door on the top floor on half of them; `w.exitCorridor`
  is what the rest of generation reads, so nothing else knows which way up it is.
  `liftRouted()` stands down every rule that answers "home is above me" with a
  climber or staircase — on a tower the answer is a machine at the end of a floor.
- A tower's toolbar is the same size and a different shape: diggers and miners
  are unreachable (`canDescendHere` never says yes through a slab), so that
  allowance moves into basher, climber and builder at generation. Do not simply
  *add* skills — measured, more tools made the tower worse, because the extra
  builds cost more clock than the obstacles did.

## Validation

Install with `npm install`, then before committing:

```bash
npm run check     # syntax, core-file self-containment, stamps, unit tests
```

It does **not** cover gameplay. For that, see below.

Port 8787 (`npm run dev`) is the human's server — never take it over or kill it.
Agents use:

```bash
npm run db:local
npm run dev:agent     # same server, port 8788
```

Two `wrangler dev --local` instances coexist; they share the local D1 file,
which the rescue counter does not mind.

Use `npm run deploy` only when a production deployment is explicitly requested,
and apply new migrations with `npm run db:remote` first.

## What breaks quietly

Failures that have actually happened here. None produced an error at the time.

- **The core files must never call each other.** `Sim.js`, `Draw.js`,
  `Palette.js` and `Outcome.js` carry no imports, which is what lets identical
  files run in a browser and in the Omarchy plugin's QML engine. In a browser they share one
  global scope, so a cross-file call resolves and looks correct; in QML each file
  is its own scope and the same call throws at runtime — `Draw.js` calling
  `specialSpec()` drew **no agents at all** in the plugin on every level with a
  special. Anything one file needs from another travels on the world object (see
  `w.k`, `w.specialSpec`). `tools/check-core-refs.js` enforces this, and also
  catches the mirror-image failure of one name declared in two files.
- **`node --check` passes a file with a missing function.** A refactor once
  deleted `biomeSkin()` and killed the simulation on the first `generate()`. Run
  `npm run sim` for anything touching the sim.
- **Generation order is load-bearing.** In `generate()`: obstacles are cut before
  floors are roughened (roughening first leaves raised dirt hanging across a
  chasm as a free bridge); `biomeSkin` runs last in `fillEarth` (the grit pass
  otherwise frays every hull panel back into rock); the bottomless drop goes on
  the **last** corridor only (higher up, its shaft punches through the floors
  below and can make a level unwinnable); the pit is cut after the exit and its
  seal wall, because a crossing is positioned relative to both; decor goes last.
- **The last corridor's floor is the bottom of every chasm above it**, and that
  floor is what makes those chasms survivable. `placeBottomPit` cuts through it,
  so a crossing may only go where the roof over it is intact
  (`solid(w, x, floorY - CORR_H - 1)`) — otherwise an ordinary drop three floors
  up becomes a fall out of the world.
- **A fractional `x` reads as solid.** `at()` indexes a `Uint8Array`, and a
  non-integer index returns `undefined`, which is not `EMPTY`. `landingAhead()`
  called with `ag.x` therefore always answered "nothing on the far side" and
  silently switched off three build rules. Floor any coordinate taken from an
  agent rather than from a loop.
- **Dirt, rock and ore are one material to everything that decides.** Solidity
  asks only whether a cell is empty; every skill asks only whether it is steel.
  That is what makes strata, biome skins and hull plating free. `simcheck inert`
  proves it and must stay passing.
- **An obstacle can reach through the floor above it.** A `step` lifts the roof
  as much as the floor, and at the biggest rise the raised roof comes out a row
  above the floor above. Harmless everywhere else; in a building it was a
  twenty-one cell hole in the second storey. `roofLimit` clamps it on sealed
  biomes only, so the other eight keep their existing layouts.
- **A bridge that runs out over a hole is a diving board.** Bridges answer holes
  from the lip, where the far side is within twelve bricks. One starting twenty
  cells short lays its last brick in mid-air and the queue walks off the end
  without ever seeing an edge. `canStartBuild` refuses those in every biome.
- **A climber must not let go on the tick it arrives.** `stepClimb` asked "is my
  head about to hit something" before "have my feet cleared the wall", and the
  first test looks one row above the body. On a sealed biome the roof is exactly
  `CORR_H` above the floor, so the two coincided and over half of every climb on
  a tower ended in a wasted climber. The order is load-bearing and nothing else
  holds it in place — leave a climber's checks alone without `simcheck` numbers.
- **Two functions must not answer the same question differently.** `wallHeight`
  answers "the first course with room to stand on"; `stepClimb` used to answer
  "the first course that is not wall", and let go at every notch in a face.
  `climbShaftClear` is the third instance: `wallHeight` looks up the *wall*, the
  agent goes up the column *beside* it, and nothing checked the second was clear.
- **`wallHeight` answers zero for a wall that is not there**, and zero passed the
  climbable test — `advanceWalk` sends a low roof to `hitWall` too, and its idea
  of the cell ahead is one further on whenever the stride crosses a boundary. The
  guard is `h > 0`. A blanket "turn round if the cell ahead is empty" looks
  equivalent and costs four points of home, because it also throws away walls
  `hitWall` can see and `advanceWalk` cannot.
- **Two rules that each reverse an agent make a trap between them.** A shut
  mission door bounces you out, `exitInSight` turns you back, and the rebound
  renews `waitFor` — the flag that tells the loop detector an agent is holding on
  purpose — so nothing ever condemns it. The fix is not another reflector:
  finding the door shut sets `sawShut`, which is how an agent learns there is a
  job on. Relatedly, a shut door is a door, not a wall: somebody on their way
  past is let past, only somebody who came to go home is turned around.
- **The exit was the only beacon, and a mission moves it.** `stepWalk` steers to
  the search point, but `crossingHelps`, `buildDirection` and `goalDist` each
  read `w.exit` for themselves and answered about a place the agent was
  deliberately not walking to — bridges refused, bricks laid the wrong way, and
  crossing agents bombed by the stall detector. Three levels lost their **entire
  colony**. They ask `goalX` now; anything else wanting to know which way home is
  belongs there too.
- **The corridor gap is constrained, not chosen.** The handoff at the end of a
  corridor is a drop of exactly one gap, and a drop past `SAFE_FALL` kills — so
  more floors pack closer rather than reach deeper.
- **Changing how much RNG a generation step consumes reshuffles every level.**
  Levels are a pure function of their number, so one added `rng()` call early
  changes the whole catalogue. Before/after clear rates across such a change are
  not like-for-like; isolate by disabling the new behaviour instead. Changing the
  length of `BIOMES` does the same thing — run the sweep a second time with
  `BIOMES` and `Palette`'s modulus reverted to the old count.

## Checking gameplay changes

```bash
npm run sim play      # 200 levels, the way the page plays them
npm run sim biomes    # the same, broken down per biome
npm run sim inert     # materials must not affect behaviour
npm run sim gravity   # planted things must fall when their floor goes
npm run sim heights   # every special must be a distinct height device
npm run sim spread    # the same level played by several different colonies
```

Every one pins the colony seed, so the numbers are repeatable and comparable
with the baselines below. A run that varies between invocations means something
has picked up entropy.

`play` is the one to watch. A change that improves the look should leave it
roughly alone; a change that moves it several points has done something to the
gameplay, intended or not. `hangs` must stay at zero. The game has no pass mark,
so `cleared` is measured against `CLEAR_SHARE`, a fixed fraction of the colony
defined in `simcheck.js`.

Baselines, 200 levels: **92% of levels cleared, 79% of agents home, 46s per
attempt, no hangs.** Per biome nothing is an outlier — 83–100% cleared and 72–87%
home across all nine, with the Skyscraper mid-pack at 91/83. On a 24-level
sample a two-level swing is nine points, so widen the sweep before believing a
biome has moved.

- Events are close to free: with `stepEvents` stubbed out over 240 levels,
  overall home was 84% either way. Measure a change with events both on and off
  before concluding one of them did something.
- A random colony costs the game nothing: played the way the page plays it, the
  same sweep lands within a point or two of the pinned-seed figure.
- `spread` watches the personalities rather than the levels: over 60 levels with
  8 colonies each, agents home varies by about 4, and on about a third of levels
  the colony is the difference between clearing and not.
- A fire escape costs about three points of cleared and two of home against lifts
  on both sides — the bashers to get out against the queue it saves — which is
  the width a variant should be.
- The bottom pit is worth breaking numbers down by, and `tools/` has no command
  for it: generate a level, look at `w.pits`, bucket by whether anything is
  `crossing`. No pit runs at about 87% home, a shaft at 81%, a crossing at 80%. A
  change that opens a gap between those three has changed how the colony handles
  a hole in the floor, whatever else it was meant to do.

## Checking looks

Looks are checked by rendering, not by reading code:

```bash
npm run shot level 8          # one level, as the page draws it
npm run shot crop 8           # a close crop, for texture rather than layout
npm run shot biomes           # one of each biome, stacked
npm run shot themes 8         # one level in every theme
```

`tools/render.js` rasterises `Draw.js` straight to a PNG with no browser and no
dependencies — the core files only call `fillRect` and a few no-ops, so a
recording canvas plus zlib is the whole of it. Shots land in `shots/`, which is
not committed, and every command pins the colony seed, so a diff between two
runs is a real change. Text is skipped and gradients collapse to their middle
stop.

The Factory shipped noisy — seventeen identical cogs at random heights, a dashed
roller line on every floor — and none of it was visible from the code, where each
piece looked reasonable alone. One render made it obvious. Contact sheets are the
way to check a set of things against each other: every hazard in all three
phases, or every special, side by side. That is how eight dangers were found
sharing one graphic.

## Checking the page itself, headlessly

Layout, controls and anything using the browser's own APIs have to be checked in
a browser, and there may not be one to drive. Chromium's remote debugging
protocol needs no display and no dependencies — Node has a global `WebSocket`,
so a throwaway script is enough:

```bash
chromium --headless=new --remote-debugging-port=9222 \
         --window-size=1920,1200 --screen-info='{1920x1200}' \
         --user-data-dir=/tmp/probe-$$ --hide-scrollbars http://127.0.0.1:8788/
```

Then `GET http://127.0.0.1:9222/json` for the page target, open its
`webSocketDebuggerUrl`, and send CDP commands: `Runtime.evaluate` to read the DOM
back as JSON, `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent` to drive
it, `Page.captureScreenshot` to look at it. `clip` with `scale: 2` crops to one
element and doubles it, which is how to read an 11px label.

- **`--screen-info` is not optional when fullscreen is involved.** Headless
  reports a 600px-tall screen regardless of `--window-size`, so a fullscreen
  element gets a 600px viewport and every scale calculation comes out wrong.
- **A fullscreen request needs a user gesture.** A dispatched key or mouse event
  is one; `Runtime.evaluate` is not, unless called with `userGesture: true`.
- **Use a fresh `--user-data-dir` per run.** A reused profile can leave the
  target list empty and the script waiting for a page that never appears.
- **Measure, don't eyeball.** Compare bounding boxes — a screenshot will not tell
  you two rows are eight pixels out of alignment; `getBoundingClientRect()` will.

Kill the browser when finished. Nothing on screen says it is still running.

## Sibling copies, and one real hazard

This repo is the source of truth. The core files are meant to be byte-identical
in the Omarchy plugin copy at
`~/.config/omarchy/plugins/jhgundersen.oh-no-more-agents/`:

```bash
npm run sync:check    # report drift, change nothing
npm run sync          # push the core files out to whichever copies exist
```

`web.js` is deliberately **not** synced — each copy has its own host integration
(this one reports to the rescue counter, the plugin has `Panel.qml`), and that is
the seam where they are allowed to differ. Do not silently edit the sibling from
here: if a fix should be shared, say so, and update it only when the task
includes that scope.

**Do not write into that directory while the screen is locked.** The Omarchy lock
screen is a quickshell plugin, so quickshell *is* the lockscreen app. Copying a
file in makes the shell hot-reload, and a hot-reload while a session lock is held
destroys the lock surface: Hyprland reports the lockscreen app died and the
machine is unusable until someone runs
`hyprctl eval 'hl.clear_crashed_lockscreen()'` from another tty. Afterwards check
`omarchy shell lock status` — it can be left believing it is locked, in which
case the screen silently stops locking until the shell is restarted.

The plugin copy can be tested headlessly, the only way to see QML runtime errors
without a display:

```bash
QT_ASSUME_STDERR_HAS_CONSOLE=1 QT_QPA_PLATFORM=offscreen qml6 main.qml
```

## Conventions

- No `Co-Authored-By` or similar trailers in commit messages.
- Commit freely; **do not push unless asked**.
