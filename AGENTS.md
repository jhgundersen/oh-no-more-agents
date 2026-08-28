# Repository Guide

## Project

Oh No! More Agents is a framework-free, Lemmings-style browser game hosted on
Cloudflare Workers. Static game files live in `public/`; the Worker and global
rescue-counter API live in `src/`; D1 schema changes live in `migrations/`.
Production is `https://oh-no-more-agents.com`.

## Important files

- `public/index.html` — standalone game page and surrounding UI. `?full` opens
  it with the board covering the viewport and nothing else on screen — the
  `faux` CSS path, not the Fullscreen API, which cannot be driven from a URL
  because it refuses any request that did not come from a user gesture. For
  kiosks, second monitors and screenshots. `?full=0` is an explicit no, so the
  parameter can be templated in as a variable.
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
  stamp. The same command stamps the page's own hash into `<meta name="build">`
  and the generated `src/version.js`, which is how an open tab notices a deploy
  (see "Staying current" below), so an edit to `index.html` alone needs a stamp
  too. The soundtrack has no stamp and is cached just as hard, so a replacement
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
  with its own copy of the rule (`(level - 1) % 10` in `poolTint` and `biomeTint`)
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
- **A charge is laid at the wall, not where the agent gave up** (`blastWall`, at
  the end of `hitWall`). Recovery hands out tools by asking what the agent is
  standing next to — right for a shovel, wrong for an explosive, and the reason
  the bashers ran out on the bottom corridor while the miners and bombers sat in
  the toolbar and the stall detector bombed the colony one at a time in the
  middle of a corridor. The wall triggers this, not the stall: a mine first
  because it costs the colony nobody, then the agent itself. Gated on half the
  usual patience, because by the time `forceEscape` has run dry the bashers are
  already gone. Three guards keep it honest — `thickness < 1` is the fractional
  stride rather than an obstacle, wider than `MINE_RADIUS` is a hole that stops
  inside the wall, and `chargeNear` stops a queue laying the whole toolbar into
  one obstacle (level 6 spent six miners and sixteen bombers on five walls that
  needed one charge each, and the colony died of its own rescue).
- **Animated scenery cannot live in `drawDecor`.** That runs inside
  `drawTerrain`, which only repaints on `terrainVersion`. Use `drawMachines`,
  called from `drawActors` — the per-tick pass every host already calls.

## The Trench

The second biome with a mechanism rather than a skin, and the only one that is
water rather than a place with water in it. The rules live around the Water
block above `submerged()`.

- **`w.submerged` is a flag, not a subsystem.** It is set once at generation and
  read by exactly three things: how fast a body sinks (`SINK_SPEED`), whether a
  landing can kill (`killingFall`, which answers `Infinity` down here), and how
  fast a body swims (`SWIM_PACE`). Everything else about the level is left
  alone on purpose — corridors are corridors, every skill means what it meant,
  and the biome can therefore be measured against the same baselines as the
  other nine instead of being its own game.
- **Every drop is survivable, so the biome must get its danger elsewhere.**
  Removing splat deaths is most of what the water does to the game, and the
  first version came out the easiest biome on the board by six points. What
  fixed it was not the clock — cutting 40s of air moved the clear rate two
  points, because most levels finish long before the limit — it was
  `weather: true`. See below.
- **A fixture that cannot kill must not win the level's one hazard slot.** The
  current is weather: it sweeps a diver instead of killing one. While it sat in
  the ordinary draw it took the hazard slot on a third of Trench levels, which
  is why the biome lost 34 agents to hazards where the Cavern lost 64 and the
  Skyscraper 97. `weather: true` keeps it out of `hazardsFor` altogether and
  gives it a roll of its own after the real hazard is placed, on a corridor
  that hazard is not using. That alone brought the Trench from 97/92 to 90/89,
  in the middle of the band.
- **The current is also exempt from `hazardZoneAt`**, and it is the only thing
  on the board that is. Everything reading that function is asking "is it
  lethal over there" — it stops a walker at a lip and holds a queue for a
  reload. A colony that routed around the current would file politely past the
  one hazard in the biome that is *meant* to happen to them.
- **Hazard width is a placement budget, not a size.** `placeHazard` needs an
  unbroken span of clear floor with a solid anchor under or over all of it, so
  a wide fixture is a rare one. An 18-cell current placed on none of 240 runs;
  an 8-cell shark placed on 8 of 120 against the vent's 28. Both were fixed by
  making them narrower. How often the colony meets a thing is decided by how
  often it can be placed, not by how much corridor it covers.
- **The scenery has no state.** Fish, marine snow and every bubble are pure
  functions of `w.ticks` and the level number — there is no `w.fish`. Scenery
  with state is scenery with bugs, and this way it costs the simulation nothing
  and cannot drift between two hosts. It lives in `drawWaterLife`, called from
  `drawMachines`, for the reason in the `drawDecor` note above.
- **The sea is drawn in front of the terrain, not behind it.** `drawSea` runs at
  the end of `drawTerrain`: the earth is drawn first and then looked *through*.
  Light is a filter, not a curtain — the first pass used 0.30 of wash over a
  0.42 depth fade and the sediment banding the biome is built from vanished.
- **The helmet is the silhouette.** On dry land what carries an agent against a
  dark board is the pale face over the white collar; there is no face to see
  through six inches of copper, so the helmet takes that job and is the only
  warm colour in the biome. It is built row by row rather than as a rectangle —
  the corners are the whole difference between a copper sphere and a brass
  brick, and the first version read as a blond square with a window in it.
- **A diver swims between corridors, and the chimneys are why.** Corridor floors
  are solid and every hole the colony makes it makes downward, so swimming was
  worth almost nothing until the Trench started cutting `cutChimneys`: two or
  three crevices per storey, open in both directions and usable by anybody
  rather than only by whoever still has a climber. `swimColumn` is bounded by
  water, not by will — a clear column to a floor that can actually be stood on,
  no swimming through rock and no hovering — so the level's shape still decides
  where the colony can go.
- **The shaft and the landing are different columns going up.** A chimney
  removes the floor at its own column, which is the whole point of it, so a
  riser looking for ground under its feet finds none the whole way up. It has
  to kick out sideways onto the ledge at the top, and `stepSwim` has to travel
  in `swimShaftX` while aiming at `swimToX`: travelling in the landing's column
  meant rising into the underside of the ledge, aborting, and sinking back —
  forever.
- **A Trench level played upside down does not work, and it is not close.**
  Hatch on the sea floor, way out at the surface, `w.ascending` doing exactly
  what it says. Measured with chimneys cut and swimming working both ways:
  **4% of ascending levels cleared and 12% of the colony home**, against 79%
  and 87% for descending levels in the same run. The flag is not the problem —
  `goalDist`, `exitInSight`, the corridor handoffs, obstacle and hazard
  placement and the whole recovery ladder are written for a colony working its
  way *down*, and inverting the destination points all of them the wrong way at
  once. There is a note where the roll used to be.
- **A trench pulls.** Underwater a fall is a sink and a sink is survivable,
  which left the one feature on the board that exists to be feared as the one
  feature with nothing to fear — a diver could drop into a pit, notice, and
  kick back out. `DOWNWELL_SPEED` replaces the sink speed inside a pit column
  and `swimRoute` refuses to fire for anybody already in one, so `edgeAhead`
  declining to step in is self-preservation rather than a rule inherited from a
  game with gravity in it. It is drawn as well: streamlines down the throat of
  the hole with arrowheads on them, plus silt going over the lip, because a
  danger the audience cannot see is a danger the audience thinks is a bug.
- **The hostiles wear the gear too.** The roster already keeps the drone
  operator and the planted sniper out of the water, but the ordinary gunner
  still turned up in a hood and coat with a rifle. It shares `drawEnemyDiver`
  with the harpooner now — same crew, two weapons, the long gun and the short
  one. They are **oxblood**, not a colder blue than the colony: two dark
  blue-greys are the same colour at the scale this is played, and the tell was
  down to a single red pixel in the port. Every other hostile on the board is
  read by its colour first, and these are too.
- **A current pushes you while you are in it, and not afterwards.** The grip is
  bounded by the water (`stepSweep` cuts it to `SWEEP_TAIL` past the downstream
  lip), not by the clock. `SWEEP_TICKS` is only the cap. Getting that backwards
  made level 100 unplayable: an eight-cell current on the exit corridor kept
  hold for the full 150 ticks, which at 0.34 a tick is fifty-one cells, so
  every diver that reached it was posted back to the far end of the level and
  walked into it again. It still kills — a diver carried into the wall of the
  world goes through it, and one carried into a pit meets the downdraught —
  but it kills by putting you somewhere lethal rather than by conveyor.
- **A biome where everybody is 18% slower needs 18% more clock.** `SWIM_PACE`
  takes that off every step a diver makes and the Trench was handed the same
  `LEVEL_LIMIT` as nine biomes where nobody is wading, so a level the colony
  was solving correctly could still be lost to the horn — the one kind of
  defeat a player cannot read. The tax is handed back as exactly `1 / SWIM_PACE`
  rather than a number that looked about right, and the check that it is a tax
  and not a crutch is that more buys nothing: on level 100 over 60 colonies it
  took wipeouts from 8 to 3 and timeouts from 15 to 6, and +25% and +35% were
  identical to +18%.
- **Thickness is measured at the boots and a ceiling has none.** `advanceWalk`
  sends a low roof to `hitWall` exactly as it sends a wall, so `blastWall`'s
  guard against spending a charge on thin air also refused every charge on an
  overhang. Level 100's colony dug itself a two-row tunnel — floor at 56, slab
  at 53, no room to stand or crouch between them — and turned round in it 451
  times with six miners in the box and every wall tool spent.
  `obstructionAhead` measures across the whole body instead: 451 turnarounds
  became 39, and a mine opened the tunnel. Aggregate effect is nil either way
  (under 1pp on 800 runs), which is the point — it is a correctness fix, not a
  tuning one.
- **Six pinned colonies is not a sample.** Level 100 measured 12-14 home out of
  14 on the salts `simcheck` uses and 59% over sixty random ones, which is what
  the page actually rolls. Anything claimed about a specific level wants
  `generate(level, 0, <varied seed>)` in bulk, not the pinned set.
- **Level 100 is the hardest level in the catalogue and it is not a bug.** 63%
  home against the Trench's 92%, and about 7% of colonies get nobody out. Its
  bottom corridor is long, carries repeated six-tall obstacles, and has a
  current pointing away from the door; the colony runs out of climbers and
  bashers, builders are refused at walls by design, and what is left is slow.
  Both defects above were found in it and fixed; what remains is the level.
- **A stuck diver looks a corridor's width for a way up, not two cells.**
  `SWIM_SIDESTEP` is right for the ordinary case: a diver does not cross a
  corridor on the off-chance. It is hopeless for the case the search exists to
  answer. Level 100's exit corridor has exactly one opening in its ceiling, at
  x21, and the colony jammed at x10-15 between a pit lip and a current with the
  way out overhead and eleven cells away. `forceEscape` passes `SWIM_HUNT`
  instead, and `clearAcross` keeps the wide look honest — swimming sideways to
  a shaft is only swimming if the water in between is open, or the diver glides
  through rock to reach a chimney behind it. Level 100 went from 5-8 home out
  of 14 to 12-14, and the Trench's upward swims from 114 to 154 per sixty runs.
  This is the branch that lets a diver rise at all on a level whose door is on
  its own storey, where `exitAbove` is never true.
- **A shark is not symmetric and a submarine is.** The first shark was a
  symmetric wedge and read, unmistakably, as a submarine — which matters here,
  because there is a submarine on the special roster. A fish needs two curves:
  a long shallow arch for the back, a deep one for the belly, a peduncle that
  pinches to nothing, and a crescent tail with the upper lobe longer.

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

## Staying current

A tab is left open for days, so a deploy has to reach it without anyone pressing
reload.

- **The version is the page's own content hash.** `stamp-assets.js` hashes
  `index.html` with the build slot blanked — a hash cannot contain itself — and
  writes the result to both `<meta name="build">` and `src/version.js`. Script
  stamps are inside that hash, so it moves for a code change and for a
  markup-only change alike.
- **`reporting` was a latch with nothing to open it.** It stops two reports
  going up at once and was cleared only by the fetch settling — and a fetch is
  not obliged to settle. A request in flight when the tab is backgrounded, or
  on a network that goes away without closing the socket, can hang for the life
  of the page; the latch then stayed shut for the rest of the session and every
  later report was queued and never sent. The page kept playing and kept
  counting, so nothing looked wrong locally: a screen left running for a day
  rescued thirteen thousand agents and posted about nine hundred. It is now
  aborted on a timer *and* treated as stale past `REPORT_STALE` regardless of
  what the promise did, because the failure is silent and there is no way to
  notice it from inside the page.
- **The reload that recovers a backlog was throwing most of it away.** The
  queue was trimmed to the last fifty reports on load — about three thousand
  rescues kept out of however many had piled up. `REPORT_QUEUE_CAP` is four
  hundred now, and `packReports` merges a run of part-batches, though not full
  ones: two five-level batches are 130 against a `MAX_SAVED_PER_REPORT` of 90,
  so on a stalled day of full batches it merges nothing. The cap is what saves
  that day; the packing is for a browser that keeps being closed mid-run.
- **A limit written in two places drifted, and the database won.** 0001 capped
  `rescue_events.saved` at 30, back when a report was one finished level and the
  biggest colony was eighteen. Batching then made a report up to five levels and
  raised `MAX_SAVED_PER_REPORT` to 90 — in `src/counter.js`, not in the schema.
  The Worker accepted what the table then refused: the INSERT raised a CHECK
  violation, the D1 batch is one transaction so the whole thing rolled back, and
  the client queued the report and retried it forever. In 7,712 rows the largest
  `saved` ever stored was 29. Anybody finishing three or more levels between
  reports had those rescues refused for as long as they kept playing, and a
  screen left running reported about seven per cent of what it rescued.
  Migration 0002 rebuilds the table around the right bound — SQLite cannot alter
  a CHECK — and `npm test` now fails if the two numbers ever disagree again,
  which is the only guard available when one of them lives in a .sql file.
- **Every retry trigger was an event that might never come again.** The report
  queue was flushed when a level completed, when a send succeeded, and when the
  browser came back online — and nothing else. So any wedge at the head of the
  queue (a 429, a reload that killed the request in flight, a stalled socket)
  parked the whole backlog until somebody finished another level, and if the
  wedge also stopped the game there was no next level. There is a 20-second
  timer now that owes nothing to any of that, and a head that fails
  `REPORT_MAX_TRIES` times rotates to the back so one poisoned report cannot
  hold everything behind it — safe, because the server dedupes on event id.
- **A live ticker has to tick.** The rescue counter was compacted to two
  significant digits ("96k") and the site earns about nine hundred rescues a
  day, so the number on screen changed once per thousand — it stood still for a
  whole day at a time and was reported as the API being down. That is the right
  reading: a counter that does not move is broken, whatever the database says.
  It shows the exact figure below a million now and two decimals above
  ("8.04m"), which moves every ten thousand. Fit was never the constraint —
  measured at seven widths from 1400px down, the long form wraps the controls
  row in exactly the same places as the short one.
- **Nothing polls for it.** `readStats` puts `build` on every counter reply, and
  `web.js` compares it with its own meta tag, so a deploy is noticed on a request
  the page was already making — about one per batch of levels. The 20-minute
  `STATS_IDLE` poll exists for a paused game, which makes no requests at all.
- **The reload happens between levels**, right after `advance(1)` has written the
  next level to localStorage, so it costs the player nothing.
- **A build gets one attempt** (`BUILD_KEY`). If the reload comes back the same
  stale page — a proxy, an over-eager cache — trying again would be a loop.

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
- **Only generation may open that floor.** Everything else goes through
  `clearCell`, which refuses at `w.bedFloor` and below — set at the end of
  `generate()` so `placeBottomPit` and `roughFloor` still cut freely. The strata
  under the last corridor are fill: no skill has a reason to be there (every
  descent is gated on a corridor below), but a blast does not ask, and a mine or
  a bomb at the bottom took out six rows of it. The queue fell into the crater,
  could not climb out of a pocket with the world's floor under it, and was
  condemned one at a time — each bomb deepening the hole the last one had
  dropped somebody into. Level 6 buried whole colonies that way. The floor row
  itself is sealed too, not just the fill: carve one cell out of it beside a pit
  and the walking surface drops to the pit's own `floorY`, where the rule that
  distrusts debris inside a hole (`insidePit` in `stepAgents`) drops everyone
  standing there — including a builder mid-bridge and the span it had laid.
  Worth 4 points of cleared and 2.5 of home on a 1600-run sweep.
- **A basher does not ask what a walker asks.** Everything known about a
  bottomless drop lives in `edgeAhead`, and `stepBash` reaches its next cell
  without consulting any of it — so a basher that broke into the side of a
  crossing pit stepped out of the world and the queue followed it through the
  hole it had just made. It stops at the lip now. A floater is no answer here:
  there is no floor to land on.
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

Baselines, 200 levels: **98% of levels cleared, 88% of agents home, 46s per
attempt, no hangs.** Per biome nothing is an outlier — 95–100% cleared and 77–93%
home across all ten, with the Trench at 100/92 and the Skyscraper at 95/77. On
the wider 300×6 sweep the band is 87–93% cleared and 86–92% home, the Trench at
91/92. On a 24-level
sample a two-level swing is nine points, so widen the sweep before believing a
biome has moved.

`play` pins one colony per level, which is too narrow to see a change in how the
colony copes. The wider sweep — 200 levels × 8 colonies, played the way the page
plays them — is the one to run for anything touching recovery or the toolbar;
`tools/` has no command for it, so write the loop against `generate`/`step` and
pin the seeds. It sat at **88% cleared, 89% home, 44s** on the nine-biome
catalogue and **91% cleared, 90% home, 45s** on the ten-biome one.

Adding the Trench changed the length of `BIOMES`, so nothing before it is
like-for-like with anything after it. The isolation AGENTS.md asks for was run
and is the number that matters: with `"Trench"` spliced back out of `BIOMES`,
the branch measures 88.0/89.05 against main's 88.2/89.14 over 1600 runs — the
other nine biomes and the shared physics changes cost nothing.

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
