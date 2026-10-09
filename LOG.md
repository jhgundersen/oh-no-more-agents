# Improvement log

One entry per iteration of the improvement loop, newest last. Each entry says
what was chosen and why, what changed, how it was checked, and what to look at
next. Start every iteration by reading the last entry's **Next**.

Baselines to measure against are in AGENTS.md ("Checking gameplay changes").
The CRAP figure is `npm run crap` — count of functions scoring over 30, and the
worst one.

---

## 1 — 2026-10-09 · Tooling: CRAP report and a smoke test

**Why first.** Nothing in `npm test` touched the game itself — it tested the
counter. A broken core file was only caught by someone remembering `npm run
sim`. And crapper needs coverage, which needs tests that run the game.

**Changed.**
- `tools/load-core.js`: the one loader for core files, used by `render.js` and
  `simcheck.js` (they each had a copy). It goes through `vm` with the real file
  name, which is what makes coverage attribute to `Sim.js`/`Draw.js`.
- `test/play.test.js`: plays three levels of every biome to the end and draws
  two frames of each. 30 levels, ~2s. Fails on a hang or an exception.
- `npm run coverage` (Node's built-in lcov) and `npm run crap` (fetches
  unclebob/crapper into `.crapper/`, gitignored).

**Checked.** `npm run sim play` unchanged at 98% / 88% / 46s / 0 hangs.

**CRAP baseline.** 331 functions, 57 over 30. Worst: `drawHazardKind`
(CC 279, 17k), `drawAgent` (CC 118), `drawAgentTrick` (CC 70). The simcheck
commands score high only because nothing tests the tester — ignore those.

**Next.** Graphics: every board is a flat background colour with the terrain on
it — there is no depth. A back wall / parallax layer per biome, drawn behind
terrain, would lift every level at once. Then split `drawHazardKind` (one
function per hazard kind) when next touching hazards.

## 2 — 2026-10-09 · Graphics: a far wall behind every biome

**Why.** Every board was terrain on a flat colour; nothing said "place".

**Changed.** `drawBackdrop` in `Draw.js`, called from `drawTerrain` before
the earth, with one small function per biome in `BACKDROPS`: cave pillars and
strata, ruined colonnade with arches, a mountain ridge (Frost), girders and
chains (Foundry), trunks and foliage (Jungle), crystals (Ice Cave), hull ribs
and portholes with stars (Spaceship), brick and gridded windows (Factory), rock
spires and kelp (Trench). Skyscraper already has its skyline and is left alone.
Three new palette shades `backDim/back/backLit` sit between the sky and
`dirtShade`. Props are placed with `backSpot`, which looks for open air — the
first pass put them at fixed heights and most landed behind solid earth.

**Checked.** Rendered every biome and level 7 in all five themes: the wall is
visible but darker than any walkable ground, agents read as before. Draw-only;
static, terrain layer, seeded from the level. New functions all CRAP < 10.
The Omarchy plugin copy now drifts (`npm run sync:check`); not synced — the
sync is the user's call.

**Next.** Animation: the backdrop is static. Cheap, stateless ambient motion
on the actor pass (drawMachines) — dust motes in caves, falling leaves in the
Jungle, snow in Frost, sparks in the Foundry — as pure functions of `w.ticks`
like the Trench's fish.

## 3 — 2026-10-09 · Graphics: air that moves

**Why.** With the backdrop in, the stillest thing on the board was the air.

**Changed.** `drawAmbience` / `drawMotes` in `Draw.js`, on the actor pass via
`drawMachines`. `AMBIENCE` is a table, one row per biome, each a list of mote
fields (count, drift, sway, size, colour, alpha, optional blink): dust in the
caves, ruins and ship, snow in two sizes in Frost, embers rising in the
Foundry, leaves and blinking fireflies in the Jungle, glints and drift in the
Ice Cave. Stateless like the Trench's fish, and a mote inside solid ground is
skipped so weather never draws over rock. Skyscraper and Trench untouched.

**Checked.** Crops of Foundry and Jungle at 400 ticks; embers read as embers
only in `fire` — `fireHot` alone came out near white and read as dust. Speeds
sized for ~30 ticks/s (snow ~10px/s, embers ~7px/s up). Draw-only. New
functions CRAP ≤ 7.

**Next.** Gameplay or heroes — two graphics iterations in a row. Look at what
the colony does least well (`npm run sim biomes`, the Skyscraper is lowest at
77% home) or add a special. Deploy after the next iteration if it holds up.

## 4 — 2026-10-09 · Hero: Rate Limiter

**Why.** Balance is not the problem: with varied colonies every biome lands
within 86–93% home (the Skyscraper's 77% in `sim biomes` is the pinned
colony, not the biome). So the iteration went to variety.

**Changed.** Special #19, *Rate Limiter* (`ratelimit`, act `throttle`,
height `backoff`, amber robe). When it can see a hazard or red team within
`THROTTLE_REACH` (34, either direction — the fixture it has already passed is
the one the queue is waiting at), everything hostile in reach is frozen for
`THROTTLE_TICKS` (210 ≈ 7s): fixtures stop in their phase and drop out of
`hazardZoneAt`/`hazardAhead`, so the waiting queue walks through; enemies
stand or hover and do nothing. A fixture comes back through `rest`, never
mid-shot. At a wall it turns, like Ada Blocker. Its fall is exponential
backoff: four equal drops with waits of 1, 2 and 4 (`backoffCurve`).
Drawn: stop sign raised and a ring going out to its reach; a pause mark with
a draining bar over each frozen thing, blinking in its last second; a frozen
fixture is drawn at rest so it does not look lethal; a stop-sign canopy that
lights on each drop. Ten flavour lines.

**Checked.** `sim play` 98% / 88% / 46s / 0 hangs (unchanged); `inert`,
`gravity`, `heights` (19/19 distinct) pass. On its own levels, on vs off over
57 runs: 91.2% vs 91.3% home — no balance effect, it acts in about a quarter
of its levels (hazards are sparse: ~0.6 per level). Rendered mid-throttle on
level 17. Tests: `test/specials.test.js` (backoff shape; throttle freezes,
clears the zone, resumes at rest). CRAP: `throttleHazard` 21, rest < 20.

**Next.** Deploy (iterations 2–4 are all visible). Then: the hero only
matters when it meets danger — consider whether hazards per level are too
sparse for the specials built around them, or start on a new biome.

**Deployed** 2026-10-09 after iteration 4 (version 48d1bacf). Headless
Chromium on `dev:agent` first: page loads, no console errors, backdrop and
motes visible.

## 5 — 2026-10-09 · Crap: drawHazardKind split up

**Why.** The worst CRAP score in the codebase by a factor of ten: one
825-line switch, CC 279, score 17,093. Every new hazard grew it.

**Changed.** Mechanically split (script, not by hand) into one function per
kind — `drawHzGun` … `drawHzServo`, `drawHzDefault` — dispatched through the
`HAZARD_DRAW` table. `drawHazardKind` keeps its signature and works out the
shared frame (`geo`) once; each function declares only the parts it uses.
New test `test/hazards.test.js`: every kind in `HAZARDS` has a drawing, and
draws something in every phase on a real raster (44 tests).

**Checked.** Golden comparison: every canvas call recorded for 44 kinds + the
default × 4 phases × 6 tick values × 2 directions × 3 biomes, hashed before
and after — identical. `npm run check` passes.

**CRAP.** Worst hazard drawing now `drawHzShark` (CC 34, 83). The function
over 17k is gone. Next worst real code: `drawAgentTrick` (CC 70, 1.5k),
`drawAgent` (CC 119, 1.4k), `drawAgentHeightGear` (CC 46, 843) — same switch
shape, same treatment works.

**Next.** Back to the game: a new biome is the biggest thing not yet tried.
Before that, check hazard density — specials built around danger rarely meet
it (log 4).

## 6 — 2026-10-09 · Biome: the Desert

**Why.** Ten biomes, and none hot, dry and outdoors. Biggest unexplored axis.

**Changed.** Eleventh biome, appended to `BIOMES` (so every level re-skins;
Palette's modulus moved to 11 in the same commit, AGENTS.md updated).
- Sim: `skinDesert` — cross-bedded sandstone (sine-waved ORE bands, each with
  its own phase) and flat-topped cap-rock in ROCK. Sparse decor, almost no
  hangings. Dry pit. Mission "FREE THE CAMELS" (new kind `camel`, two of
  them, walk at animal pace). Hazard `scorpion` "Tail Call" (desert-only,
  watch). Events: "Model Drift" sandstorm (sight), "Sandbox" dunes (growth),
  "Cache Miss" sinkhole (floor collapse).
- Draw: camel (one or two humps by variant, legs swing when freed) under an
  awning on a stake; saguaro cacti; a temple-pylon exit with a sun disc;
  backdrop with a low sun, two dune ranges and mesas; blowing sand; enemy
  hatch "SANDBOX ESCAPE"; scorpion with the tail coming over to strike.
- Palette: `SAND`, pulled hard (0.94) so it reads pale-dusty in every theme
  and apart from Ruins red and Factory brass.

**Checked.** Rendered in all five themes. `inert`, `gravity`, `heights` pass;
no hangs. Wider sweep, 200 levels × 6 colonies, the page's three-attempt rule,
with Desert vs with it spliced out of `BIOMES`: 96.4% cleared / 86.6% home vs
97.5 / 87.7. Desert itself 89% home, mid-band; the other biomes move ±6 in
both directions purely from level reassignment, which is the catalogue
reshuffle, not the new code. `sim play` 97 / 86 / 45s.
Tests: `test/missions.test.js` draws every mission held and freed. The Rate
Limiter test was pinned to a level the reshuffle moved — now sets the
encounter up directly.

**Found.** In the new catalogue the Rate Limiter met **no** fixture in 39
runs of its levels (6 enemy throttles). Log 4's worry is real.

**Next.** Make the Rate Limiter matter: it should go *to* the danger the
colony is queuing at, not just react if it happens past one. Then deploy
(Desert + hazard refactor + that fix).

## 7 — 2026-10-09 · Rate Limiter made to matter

**Why.** Log 6: zero fixtures throttled in 39 runs of its own levels.

**Found.** Not a reach problem. Traced on every hazard level it played: the
special falls past most storeys and is home in ~400 ticks; it passed the
shark on level 54 at zero cells — one storey up. And the trigger waited on
`sightsHazard`/`visibleEnemyAhead`, which look one way, at one storey.
Tried and dropped: throttling a fixture from anywhere when the colony is
queued at it. Queues of two at a fixture exist in 418 of 126k ticks, and in
78 runs not one coincided with the special being alive — so it never fired,
and the code went back out rather than stay as a feature that does nothing.

**Changed.** The trigger is now just "cooldown ready": `throttleHazard`'s own
`inReach` (34 cells both ways, a storey, clear line) decides. Comment on the
special rewritten to say what it actually is.

**Checked.** Its levels, 78 runs, move on vs off: **92.7% vs 89.7% home**
(was 91.2 vs 91.3). 29 throttles — 28 of them the red team, 1 a fixture.
`sim play` 98 / 87 / 45s / 0 hangs. Tests pass.

**Deployed** (version 3c359b2b, build d760a634): Desert, hazard-drawing
split, this. Headless Chromium on level 11 first — no errors, Desert reads.

**Next.** The Desert sun reads as a boulder in the browser — give it rays or
a halo. Then the agent-drawing switches (`drawAgentTrick` CC 70,
`drawAgentHeightGear` CC 46) are the next crap to split, same method as
log 5.

## 8 — 2026-10-09 · Desert sun; agent-gear switches split

**Sun.** In the browser it read as a boulder, and the first fix (rays in
wall shades) as a gear set into the rock. A light has to be lighter than
what it lights: now three discs of `decorLit` at 0.10/0.18/0.55 alpha with
thin rays at 0.22 — a glow, still behind the terrain.

**Crap.** `drawAgentTrick` (CC 70, 1.5k) and `drawAgentHeightGear` (CC 46,
843) split by script into `TRICK_DRAW` (16 functions) and `GEAR_DRAW` (19,
`web`/`chain` share one). The script is stricter than log 5's: these switches
mix `; break` on the statement line, braced cases, a fall-through, comments
between cases that belong to the next one, and loop `break`s that must stay.
Golden: every canvas call for every special × trick timer × flight device ×
tick × anim × direction, hashed — identical before and after.
Tests: every special has a flight drawing (and a trick drawing unless its act
never enters `trick`: ceiling, camp, shield, throttle); every trick and device
draws on a raster both ways.

**CRAP.** Both giants gone; worst of the new functions 25. Remaining worst
real code: `drawAgent` (CC 119, 1.1k), `stepCamp` (624, barely covered),
`drawEnemy` (CC 63, 559).

**Next.** Gameplay/graphics again rather than crap three in a row. Candidate:
the agents' own animation — walk cycle, landing squash, a celebration at the
exit — the thing on screen most of the time.

## 9 — 2026-10-09 · Graphics: the agents themselves move better

**Why.** The agent is on screen more than anything else, and its walk was two
leg blocks sliding sideways under a rigid body; getting home was a fade.

**Changed.**
- Walk: on the passing frames (legs together) everything above the hips
  rises a pixel; the torso stretches to the hips so the feet stay planted.
  A skin pixel for a hand swings against the legs.
- Landing: Sim records `landedAt`/`landedFrom` (bookkeeping only); for six
  ticks after a drop of more than three cells the knees go out and the body
  drops two pixels, then one (`landSquash`).
- Home: arms up, a two-pixel hop on the way in, and four sparks in
  `exitLight` circling outward as it fades (`drawAgentHome`).
- Walk pose moved out of `drawAgent` into `drawAgentWalk`.

**Checked.** Pose contact sheet at 5×: walk cycle, the landing over 12 ticks,
the home fade over 12. `sim play` byte-for-byte the same as log 7 (98 / 87 /
45s, 2884/3334) — the new fields change nothing. `drawAgent` CC 119 → 126
(the cycle has to be known before the head is drawn); new functions ≤ 6.

**Next.** Deploy (8 + 9). Then something with gameplay weight — events and
missions exist; heroes number 19; maybe a second mechanic in the Desert the
way the Trench and Skyscraper have one (sand that drifts and buries?).

**Deployed** after 9 (version d0931e83, build c011326e). Browser check on
level 11 first: no errors; the sun reads as a sun behind haze.
