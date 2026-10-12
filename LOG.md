# Improvement log

One entry per iteration of the improvement loop, newest last. Each entry says
what was chosen and why, what changed, how it was checked, and what to look at
next. Start every iteration by reading the last entry's **Next**.

## Standing priorities

Considered at the start of every iteration, alongside the last entry's Next.

- **Finer pixels** (asked for by the owner, 2026-10-09). The board is drawn
  at 400×248 and scaled up in whole steps, so every art pixel is a big block.
  Draw at a higher internal resolution so sprites, terrain edges, hazards and
  effects can carry more detail — while keeping the retro pixel-art look: hard
  pixels, flat palette, no smoothing, no anti-aliasing, same silhouettes.
  Plan: first a resolution factor that changes nothing on screen (canvas ×2,
  Draw under a ×2 transform, renders byte-identical at ×1 art); then refine
  the art piece by piece — agents, terrain edges, hazards, effects — one or
  two per iteration, reviewed at full size. Mind the Omarchy plugin: it hosts
  the same Draw.js, so the factor has to come from the host and default to 1.
- Keep CRAP down: new or touched functions under 30 (`npm run crap -- --changed`).
- Deploy every two or three iterations, after a headless browser check.

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

## 10 — 2026-10-09 · Mechanic: Desert wind

**Why.** The Trench has water and the tower has lifts; the Desert was a skin.

**Changed.** `windAt` (Sim): a gust every 640 ticks lasting 220, sine rise
and fall, direction alternating per gust from a level-set start — a pure
function of tick and level, so no RNG and no reshuffle. Stored as `w.wind`,
read by `walkStep` (`WIND_PUSH` 0.45: half pace into a full gust, 1.45x with
it) and by umbrellas in `stepFall` (`WIND_DRIFT` 0.10 cells/tick sideways,
never into rock). Draw: `drawGust` — sand streaks down open corridors, count
and length growing with the gust, travelling with it. AGENTS.md has a Desert
section next to the Trench and Skyscraper.

**Checked.** Desert only, 240 levels × 6 colonies, page rules, on vs off:
98.3 / 89.3% home / 46s / 5 timeouts vs 98.8 / 90.0 / 45s / 1. A mild tax
on an easy biome. First streaks (decorLit, ≤70) were invisible on screen; now
`dust`, up to 130, alpha up to 0.65 — reads as wind at 4× and full size.
`sim play` 98 / 87 / 44s, `inert`, `heights` pass.

**Next.** Agents could lean into the wind (a pixel of head forward) — small.
Bigger: a new hero, or a second look at what kills most (`red team`,
`hazard`, `boom` — see log 4's tally) for a mechanic that answers it.

## 11 — 2026-10-09 · Graphics: explosions

**Why.** "boom" is one of the three biggest causes of death (log 4's tally),
and a bomb going off was 22 dust specks — the most common death on the board
looked like a sneeze.

**Changed.** Sim records each explosion with `noteBlast(w, x, y, r)` into
`w.blasts` (render-only, capped at 12, pruned after `BLAST_LIFE` 26 ticks):
the bomber, a mine, a drone hit and Prompt Injection's charge. Draw:
`drawBlast` — a white flash for two ticks, a three-layer fireball (rim, mid,
core in fixed fire colours, ragged per row so it billows) that swells to the
real blast radius and burns down from the core out, a shock ring running
past it, and smoke puffs left rising. Drawn last, over agents and enemies.

**Checked.** Strip of ten frames at 3×. First version used the theme's
`fire`/`fireHot`: pink in tokyo-night, and a flat disc — read as a balloon.
Fire is now fixed colours like blood. In context on level 2 at tick 838: the
first try drew agents over the fireball; moved to the end of `drawActors`.
`sim play` identical (98 / 87 / 44s, 2886/3334).

**Next.** Deploy (10 + 11). Then: deaths by `red team` — the enemies'
shooting could get the same treatment (tracer, muzzle flash, hit spark) if it
is as thin as the bombs were; check before assuming.

**Deployed** after 11 (version 90cb98c7, build 0b8fce95): wind and
explosions. Browser check clean. The stats endpoint answered the old build
for ~20s after the deploy before catching up — propagation, not a failure.

## 12 — 2026-10-09 · Graphics: the hatch opens

**Looked first at** enemy gunfire (log 11's lead): already a muzzle flash,
tracer and blood — not thin like the bombs were. Left alone.

**Why the hatch.** It is on screen the whole level and was three flat
rectangles that never moved.

**Changed.** `drawHatch`: a panelled, riveted housing with a roof band; a
lamp that blinks while agents are still to come and goes dark after; a flash
across the mouth on each drop; two doors hinged at the sides of the mouth
that swing down over `HATCH_SWING` (18) ticks before the first drop and
come back up 30 ticks after the last (`hatchOpen`). Sim records
`lastReleaseAt` — bookkeeping only.

**Checked.** Eight-frame sequence at 4× (shut, swinging, open, dropping,
closing, shut). `sim play` identical (2886/3334).

**Next.** The exit portal is the other fixture on screen all level — check
it the same way. Or a hero: nineteen, and the newest one turned out to be an
enemy-pauser; something that helps with *falls* or *bombs* (the colony's own
recovery killing it) would answer a real cause of death.

## 13 — 2026-10-09 · Mechanic: the last blockers stand down

**Why.** Before picking a hero to answer a cause of death, measured the
causes over 440 runs (220 levels × 2 colonies): boom 31%, red team 27%,
hazard 23%, drones 7%, splat 7%. Then tagged every bomb by what lit it:
**116 "everyone left is a blocker"**, 82 condemned-as-stuck, 7 wall charges,
1 nuke. The single commonest death on the board was an agent that had done
its job, blown up so the level could end.

**Changed.** `finishWorldStep`: when every agent still out is a blocker (or
a camped sniper) and the whole colony has been released, `standDown` sends
them home — state back to walk, counters cleared — once per level
(`w.stoodDown`). If they end up all blockers again, `bombBlockers` (the old
rule) ends it. If agents are still to come, the old rule applies unchanged.

**Checked.** Causes, same 440 runs: lost 641 → 564, boom 201 → 111, home
5864 → 5939. Wide sweep (200 × 6, page rules), on vs off: 97.0 / 88.1% home
vs 96.8 / 86.9 — every biome up or level, no hangs. `sim play` 98 / 88 /
45s (was 44s: they walk home). `inert`, `gravity`, `heights` pass.

**Next.** Deploy (12 + 13). The 82 condemned stuck agents are the next
biggest self-inflicted death; and a visible cue for the stand-down (a
"STAND DOWN" banner like the events have) would let a viewer see why the
blockers suddenly started walking.

**Deployed** after 13 (version 8f354663, build 57059384): hatch + stand-down. Browser check clean.

## 14 — 2026-10-09 · The stand-down, made visible

**Changed.** `standDown` stamps `w.stoodDownAt` and each released agent's
`stoodDownAt`. Draw: "STAND DOWN — EVERYBODY HOME" across the sky band for
three seconds, fading over the last one (`drawStandDown`, from the event
banner); a ring going out from each released blocker for 20 ticks
(`drawReleaseRing`).

**Checked.** Rendered level 3 eight ticks after a stand-down: the ring reads
on the one blocker left at the lip of the pit. (`tools/render.js` skips text;
the banner wants a browser check at the next deploy.) `sim play` unchanged.

**Next.** The 82 condemned-as-stuck agents: find where they get stuck before
deciding whether the answer is the recovery, the level, or a hero.

## 15 — 2026-10-09 · Finer pixels, step 1: room to draw in

**Why.** Standing priority from the owner: smaller pixels, more detail, the
same retro look.

**Changed.** `w.res` — canvas pixels per art pixel, set by the host, applied
as one transform in `clearLayer` at the start of every pass. Everything in
Draw.js stays in art pixels. The page (`web.js` `RES = 2`) makes its canvases
800×496 and sets `world.res`; the board's size on screen is unchanged. The
Omarchy panel sets nothing and gets 1. `tools/render.js` `frame` takes `res`;
`npm run shot … --res 2` draws the way the page does. AGENTS.md says how to
draw detail into it: half-pixel coordinates, silhouette readable at res 1.

**Checked.** Every level of every biome plus 22/33/44/100, at three points in
play, res 1 vs res 2 with `Math.random` pinned (particles and spawn phases
use it — unpinned, res 1 is not even equal to itself): worst 12 differing
art pixels of 99,200, all fractional-coordinate shapes now landing on a real
half-pixel. Headless Chromium: same layout, same size, no errors.

**Next.** Step 2: spend the resolution. Agents first — they are on screen
most — then terrain edges, then hazards and effects. Review each at the
page's res, full size.

## 16 — 2026-10-09 · Finer pixels, step 2: the agents

**Changed.** `drawAgentFine`, drawn only when `w.res >= 2` and on dry land,
in upright poses (`FINE_POSES`): a light band on the hair (reads as the brim
of a hat), an ear, glasses with an arm back to the ear and a white glint on
the lens, a mouth, a shirt front with a black knotted tie, lapels, two
buttons, and black shoes with a toe ahead of the heel (walk only). All at
half-pixel steps through `blitFine` (`blit` rounded to 0.5), all inside the
silhouette the coarse sprite already draws — at res 1 nothing is missing.

**Checked.** Contact sheet of ten poses in two themes at 8× before and
after; a jungle crop at the page's res. They read as agents in suits and
shades now — men in black — where before they were a dark block with a face.
`test/play.test.js` now draws every level at res 1 and res 2.

**Next.** Terrain at the finer res: the earth is drawn in 4-px cells, and
next to the new agents the edges look like a different game. A half-pixel lip
on every top edge, grain inside the strata.

## 17 — 2026-10-09 · Finer pixels, step 3: the earth

**Changed.** `drawTerrainFine` (res ≥ 2, on the terrain layer, so it costs
nothing per tick): a pale half-pixel hairline on the very top of every
walkable edge and a dark one under the lip, so a floor reads as a surface;
a shaded half-pixel down every exposed side; and grain inside natural
materials (`drawGrain`: a dark fleck in a quarter of cells, a pale one in an
eighth, placed by a hash of the cell so it stays put while the colony digs).

**Checked.** Before/after crops at 4× in the Cavern, Spaceship and
Skyscraper, and full levels at the page's res. On hull plate and office wall
the grain read as dirt — `BUILT` biomes (Spaceship, Factory, Skyscraper) get
the edges but no grain. CRAP: 14 and 3.

**Next.** Hazards and the exit at the finer res, or step back to gameplay
for an iteration (the 82 condemned agents are still waiting).

**Deployed** after 17 (version c011eb88, build d8ad9af6): stand-down cue, res 2, finer agents and earth. Browser check on level 5: suits and lips visible, no errors.

## 18 — 2026-10-09 · The jam on level 6

**Why.** Log 13 left 82 agents condemned as stuck per 440 runs. Profiled
each condemnation (biome, spot, toolbar): Ice Cave had 30, and eleven of
those were one colony on level 6 blown up one by one at x68,y51 — flat open
corridor, eighteen cells from the door, six miners in the toolbar.

**Found.** A two-cell obstacle (a one-cell bump under an icicle mass) leaves a
three-cell gap; the queue piles against it and turns at it every tick without
leaving its cell. `hitWall` was reached 1,730 times there and `blastWall`
refused every time on its half-patience gate (idle > 300) — while the
stuck-in-one-cell rule condemns at `STILL_ESCAPE` (130) whatever the
patience. The bomb always won the race to the charge.

**Changed.** `hitWall`: an agent that is jammed (`still` past half of
`STILL_ESCAPE`) may lay a wall charge before its patience runs out — but only
a mine (`blastWall(…, mineOnly)`). First version let it be the bomb itself
too: level 6 went 0 → 10 home and the aggregate didn't move, the jams it
cleared paid for by agents spent early elsewhere. Mines only: 14 of 18 home.

**Checked.** Wide sweep on vs off: 88.06 vs 88.10% home, 97.0 / 97.0
cleared, no hangs — a correctness fix with no aggregate effect, like
AGENTS.md's level 100 fixes. `sim play` 98 / 88 / 45s; `inert`, `gravity`.

**Next.** The rest of the condemned are "open corridor, tools left" — agents
pacing in the open, not at a wall. Worth one look at a sample before deciding.
Graphics alternative: hazards at the finer res.

## 19 — 2026-10-09 · Finer pixels, step 4: the red team

**Changed.** `drawGunnerFine` (res ≥ 2), the ordinary gunner's half-pixel
detail, inside its coarse silhouette like the agents': a shadow under the
crest and a swept-back tuft, a scarred brow over the red eye with a pale hot
core, a vest with two straps, a belt with a brass buckle, vents on the pack,
a lit edge along the pistol slide, and boots (not while jetting).

**Checked.** Eight-pose sheet at 8× (walk, both facings, firing, jet). First
crest texture was vertical lines — read as a chef's hat; now a shadow line
along its base. Divers, snipers, drones, operators and xenos untouched.

**Next.** Deploy soon (18 + 19). Remaining finer-res candidates: the exit
portal, the mission pens, the commonest hazards (gun, sentry, spikes,
crusher). Or gameplay: the open-corridor condemnations.

## 20 — 2026-10-09 · Finer pixels, step 5: the way out

**Changed.** `drawExitShimmer` (res ≥ 2, actor pass, only once the door is
open): four half-pixel bands of `exitLight` climbing the mouth and brighter
toward the floor, five white sparks drifting up through it, and a pulsing
spill of light across the floor in front. The biome frames are untouched.

**Checked.** Seven biomes' exits at 6×, before and after. Subtle in a still,
alive in motion — the point is that the way home looks like it is on.

**Deployed** with 18 and 19 after a browser check (below).

**Deployed** after 20 (name="build" content="6a61628f"): jam fix, finer red team, exit shimmer. Browser check on level 13 clean.

## 21 — 2026-10-09 · Hero: Fallback

**Why.** First hero since log 4, aimed at a measured cause: falls ("splat"
and "fell") are about a tenth of deaths. Profiled 53 of them: 41 came after
the floaters ran out — while there are umbrellas, `stepFall` hands one out.

**Changed.** Special #20, *Fallback* (`fallback`, act `net`, height
`bungee`, teal with pink hair). Walking, cooldown ready, no floaters left,
and a colleague within `NET_REACH` (16) falling further than a body
survives (`dropDepth`) onto ground: it throws a net (`w.nets`) at the landing
spot, `NET_HALF` 3 cells either side, lasting `NET_LIFE` (120 ticks). A lethal
landing on a net is a landing (`stepFall`). At a wall it turns, like Ada
Blocker. Its own drop is a bungee (`bungeeCurve`: down in the first half,
two dying bounces). Drawn: arms out and a cord arcing to the net as it is
thrown; posts and a mesh that sags and springs back when it takes somebody,
fading over its last second; the bungee cord and harness. Ten lines.

**Checked.** Its levels, 192 runs: first version (no floater gate) threw 9
nets and caught nobody — the colony's own umbrella got there first. Gated:
4 nets, 3 catches, splats 8 → 5; home 91.9% either way (falls without
floaters are rare). Rendered a throw (level 533) and a catch (level 551).
`sim play` 98 / 88 / 46s, `inert`, `heights` 20/20. Tests: a constructed
lethal shaft — netted, the faller walks away; without the net, it dies.

**Next.** Deploy with 22. Candidates: mission pens at the finer res; the
drone (9% of deaths) has no counter at all.

## 22 — 2026-10-09 · The colony shoots back at drones

**Why.** Drones are 9% of deaths and nothing answered them. Over 42 operator
runs: 118 drones launched, 92 killed somebody, one was shot down, and 38 of
42 operators survived to launch again. The sidearm only looked ahead, and
hit 1% of the time — a drone homes in from behind or above.

**Changed.** `shootDrone`, tried first in `regularSidearm`: the nearest drone
within `SIDEARM_DRONE_RANGE` (14) with a clear line, front or back, is fired
at with a `SIDEARM_DRONE_HIT` 35% chance (deterministic roll, like the rest of
the sidearm). Same reload as any sidearm shot; a hit pops the drone with a
small blast ("drone down").

**Checked.** Same 42 runs: strikes 92 → 80, shot down 1 → 18. Wide sweep,
on vs off: 88.39 vs 88.32% home, cleared equal, no hangs — operators are in
~7% of runs, so the aggregate barely moves; on those levels the colony now
fights back. Rendered a kill on level 78. Test: fires at a drone behind it,
not at one out of range, and reloads.

**Deployed** with 21 (below).

**Next.** Mission pens at the finer res, or the operator itself (it survives
38 of 42 runs) — but check whether killing it more often makes the levels too
easy before trying.

**Deployed** after 22 (name="build" content="6e2971a1"): Fallback, drone fire. Browser check clean.

## 23 — 2026-10-09 · Finer pixels, step 6: the people in the pens

**Changed.** `drawPersonFine` (res ≥ 2) for civilians and explorers — the
prisoners of seven of eleven biomes, which were a pale block with two dots:
a skin face, half-pixel eyes, a frown while held and an open cheer once
freed, arms up from the shoulders in the coat's colour when freed, buttons
down civilians' coats, a goggle strap with a glint on explorers.
`drawMissionSubject` takes a `fine` flag from `drawMission` (`w.res`).

**Checked.** All mission kinds held and freed at 3×; civilians and
explorers at 10×. First arms were thin dark lines standing off the body —
read as antennae; now coat-coloured and attached. `test/missions.test.js`
draws every kind with and without fine detail.

**Next.** Animals, alien, treasure and camel are untouched — smaller wins.
Time for gameplay again: the drone operator (survives 38 of 42), or a look at
whether any biome has drifted out of the band after all the changes.

## 24 — 2026-10-09 · Balance check: the echo bat

**Why.** Twenty-three iterations of changes; time to look at the band.
First-attempt runs, 40 levels × 6 colonies per biome: Cavern 88.6, Spaceship
91.3, Frost 92.4 — no outlier in home. But Cavern lost 157 agents to hazards
where the others lost 40–50. By kind: the Cavern-only echo bat, placed in 60
of 132 Cavern hazard slots (local fixtures are preferred 45% of the time),
killed 1.7 per placement; the worst elsewhere was under 1.2.

**Found.** Its screech kills anyone in the corridor out to `reach` both
ways. At 15 that is a 32-cell zone — about 114 ticks of walking — against a
quiet window (rest + wind-up) of 88. No timing got anybody across. And it
was drawn out to 5 cells: the colony died to something nobody could see.

**Changed.** Reach 15 → 9 (≈71 ticks to cross: timing becomes a skill).
Hazards carry `reach` on the object so Draw can read it; the screech is now
drawn as three rings travelling to the true reach, with end caps, fading out.

**Checked.** Cavern 88.6 → 91.8% home, hazard deaths 157 → 81, its worst
level (276, 49%) off the worst list. `sim play` 98 / 89 / 46s / 0 hangs.
AGENTS.md baselines brought up to date (89%).

**Next.** Deploy (23 + 24). Same audit for the other biome-only fixtures —
a local fixture is drawn 45% of the time, so one bad one dominates a biome.

**Deployed** after 24 (name="build" content="05ddc8ce"): prisoner faces, echo bat. Browser check clean.

## 25 — 2026-10-09 · Hazard audit, and a fix that was not one

**Why.** Log 24's lead: one bad fixture can dominate a biome.

**Measured.** Kills per placement for every kind, attributed to the fixture
that struck (not guessed): 759 placements, 406 kills, 0.53 average. Above
1.5: the grinder (2.04) and the sniper (1.59, intended). Zero: darts,
pendulum, flywheel, spores, packetloss — timed perfectly by the colony.

**Tried, measured, reverted.** The grinder's grind (fire 30 → 18): no change
at all. Traced its kills: most on its *first* turn, queue bunched on the
plate — level 96 had it between a chasm lip and a wall, eight dead at once.
Kept fixtures off lips in `placeHazard`: grinder 2.04 → 0.71, but the
sawblade jumped to 2.58 — now against a wall on level 109 (14 of 17 dead).
Kept them off walls too, swept the clearance 0–3 cells: kills per placement
stayed at 0.57–0.67 at every setting, and placements fell from 759 to
390–645. It only removed danger; it did not make danger fairer. Reverted.

**Kept.** Each hazard counts its own kills (`h.kills`, bookkeeping only);
`npm run sim hazards` prints the table. AGENTS.md records the finding so the
placement rule is not tried again blind. `sim play` unchanged.

**Next.** The real fix for queue traps is behavioural (a queue that sees the
plate wind up under it should scatter, not stand) — bigger, and worth its
own iteration. Or something visible for a while: animals/alien/treasure at
the finer res.

## 26 — 2026-10-09 · Getting off a plate that is winding up

**Why.** Log 25: the placement fix moved deaths around; the real problem was
behaviour on the spot.

**Found.** Traced level 96's grinder through its wind-up: agents land on the
plate from the shaft above and are told to leave by the "already inside its
reach" branch of `stepWalk` — which picks a side from the fixture's `reach`
and facing. For a floor plate that number means nothing; it pointed at the
chasm lip, the edge rule turned them back, and they paced mid-plate until it
fired. (A first attempt added a separate flee rule ahead of the branch: no
effect at all, because the branch overrode it every tick.)

**Changed.** `fleeHazard`: the nearer edge of the zone if the cell beyond it
can be stood on, else the far one, else nothing — used by that branch before
its old reach-based guess. One rule, not two.

**Checked.** `sim hazards`: kills 406 → 206 over 759 placements (0.53 →
0.27), grinder 49 → 30. Wide sweep on vs off: 97.7 / 90.13% vs 97.0 /
88.84%, every biome up or level, no hangs. Causes: hazards 23% → 16% of
deaths; red team is now 35%. `sim play` 99 / 90 / 46s (AGENTS.md baselines
updated); `inert`, `gravity`, `heights` pass. CRAP 13.7 / 3.

**Next.** Red team is the biggest killer now. Deploy first.

**Deployed** after 26 (name="build" content="85519e16"): hazard audit tool, flee fix. Browser check clean.

## 27 — 2026-10-09 · Red team checked; umbrellas at the finer res

**Red team (35% of deaths).** Profiled every enemy kill over 600 runs by
shooter kind, range, time on the board and whether the victim was already
wounded: gunners one-shot by design (`woundFriendly(…, lethal)` for gun and
harpoon, after an 8-tick aim), at ranges spread evenly from point-blank to 20,
with no cluster at the hatch or anywhere unfair. Not a bug like the bat or
the plate. Weakening the commonest enemy in a game at 90% home would only
take drama out. Left alone.

**Umbrellas.** `drawUmbrellaFine` (res ≥ 2): a dome built in half-pixel rows
instead of a slab, every other panel shaded, a lit rim with the tips hanging
off it, a ferrule on top, a slimmer shaft; the crown still lifts with the
canopy's breathing (`flex`). Six floaters at 5× before/after. A hand on the
shaft was drawn and sat hidden behind the head — removed.

**Next.** Deploy soon (27 + whatever comes next). Remaining coarse pieces in
order of screen time: drones/operators, sniper, divers, then hazards.

## 28 — 2026-10-09 · Finer pixels: drone, operator, sniper

**Changed.** At res ≥ 2: `drawDroneFine` — rotors as blurred discs, a seam,
a lens glint, a blinking green tail light; `drawOperatorFine` — a streak on
the visor, a radio antenna with a blinking red tip, a belt, two sticks on
the controller; `drawSniperFine` — a scope with a blue lens on the rifle, a
hood rim, and a ragged camouflage fringe when prone.

**Checked.** Eight poses at 8× before/after. The hood rim barely shows on
the dark hood; kept, it costs nothing. Every enemy the colony meets on dry
land now has res-2 detail (divers and xenos still coarse).

**Deployed** with 27 (below).

**Deployed** after 28 (name="build" content="cd446c8c"): umbrellas, drone/operator/sniper detail. Browser check clean.

## 29 — 2026-10-09 · Crap: drawAgent split and covered

**Why.** The worst real code: `drawAgent`, CC 129, CRAP 1,065 — and the
finer-pixel work had been adding to it.

**Changed.** By script, verified by golden: the 13-branch torso-and-limbs
chain became `AGENT_POSES` (one `drawPose…` per state, `drawAgentBody`
dispatching, with tucked/swim/home/walk as its special cases); the umbrella,
Ada Blocker's plate and spark, and Beam Search's shot line moved out into
`drawUmbrella`, `drawShieldPlate`, `drawShieldSpark`, `drawCampShot`.
Golden: every canvas call for 20 states × 2 facings × 2 variants × every
special and none × res 1/2 × dry/submerged (84 combinations, all distinct),
hashed before and after — identical.

**Tests.** `test/agents.test.js`: the agent in every state with every overlay
(plate, spark, throttle signal, net, wounds, infection, a collapse copy), as
each special, dry and wet, at both res — nothing throws, every pose draws.

**CRAP.** `drawAgent` 1,065 → 81 (CC 81, coverage 61% → 98%). Functions
over 30: 57 → 55 of 485. Worst real code now `startSpecialAscent` (355) and
`specialTraverse` (316), both barely covered.

**Next.** Something new to look at: a twelfth biome, or a hero. Deploy after.

## 30 — 2026-10-09 · Biome: the Data Center

**Why.** Eleven biomes and none of them is where the agents come from.

**Changed.** Twelfth biome, appended (catalogue reshuffles; Palette modulus
12, AGENTS.md updated). Sim: `skinDataCenter` — a raised-floor hall of racks
at a fixed pitch, each rack a stack of units (ORE and grey ROCK on alternate
rows), cable trays across in ROCK; cable runs off the ceiling, almost nothing
on the floor. Mission "RELIEVE THE ON-CALL" (civilians, two). Hazard
`hotaisle` "Hot Aisle" (Data Center only): a rack fan that spins up and blows
hot air down the aisle, a directional reach like the sentry's. Events
"Failover" (every fixture stops for 300 ticks), "Hot Swap" (ceiling
collapse), "Capacity Planning" (growth). Palette `TERMINAL` green, pulled
toward the accent. Draw: `drawRackLights` — status lights on rack faces that
blink on their own phases, a few amber (pure function of tick and cell);
`backDataCenter` — two receding rows of racks with dim dots; a rack-door
exit with a light strip and badge reader; the fan; "SHADOW IT" over the
enemy hatch; floor-vent dust rising; no terrain grain (`BUILT`).

**Checked.** First skin read as a teal cave — racks were faint bands; units
on alternate rows fixed it. Wide sweep with vs without it in `BIOMES`:
89.58 / 96.3 vs 90.13 / 97.7 — the Data Center itself 92% home; the other
biomes swing ±10 both ways from reassignment alone. `sim play` 95 / 89 / 44s
(failures across seven biomes, one in the Data Center). `inert`, `gravity`,
`heights` pass. New functions CRAP ≤ 10.

**Next.** A mechanic of its own, the way the Desert got wind. Deploy now.

**Deployed** after 30 (name="build" content="ad2f1f52"): drawAgent split, Data Center. Browser check on level 12 clean.

## 31 — 2026-10-09 · Mechanic: the Data Center's updrafts

**Changed.** `w.updraft`, set by `skinDataCenter`: the air column beside
every rack rises. `stepFall` caps speed to `FLOAT_SPEED` there and a landing
after a fall through it is safe (`ag.drafted`), without spending a floater.
Draw: a faint wash down each column in open air and streaks climbing it.

**Found on the way.** The fall rule alone changed nothing — floaters spent
identical to the tick — because the colony opens its umbrella at the lip,
before it is ever in the column. The lip decision now asks too
(`wantsChute` is false over an updraft). AGENTS.md has a Data Center
section saying so.

**Checked.** Data Center levels, 240 runs, on vs off: floaters spent 2159
→ 1957, splats 17 → 15, home 94.0 vs 94.3 (noise at that size). First
streaks read as rain; a column wash and denser streaks fixed it. Suites pass.

**Next.** Deploy with the next one. Candidates: a hero (twenty now; one that
uses the board's new pieces?), hazards at the finer res, or divers/xenos.

## 32 — 2026-10-09 · Finer pixels: the commonest fixtures

**Changed.** `HAZARD_FINE`, a table of half-pixel detail drawn over the
coarse fixture at res ≥ 2, inside its silhouette: fence — white insulators
on both posts and a warning plate; tripwire — eyelets and a blinking armed
lamp; bear trap — teeth along both jaws while open, a chain to the floor;
gun — the bore, an ammo belt, two bolts; sentry — vents, a lens glint, a
blinking status lamp. The five most-placed kinds outside the Trench (about a
fifth of all placements).

**Checked.** Five kinds × four phases at 3×, before and after.
`test/hazards.test.js` now draws every kind at res 1 and res 2.

**Next.** Deploy (31 + 32).

**Deployed** after 32 (name="build" content="14727faa"): updrafts, finer fixtures. Browser check clean.

## 33 — 2026-10-09 · Hero: Hot Reload

**Why.** Every hero so far prevents a kind of death. One that answers all of
them after the fact — sparingly — is a different kind of special.

**Changed.** Special #21, *Hot Reload* (`hotreload`, act `reload`, height
`teleport`, white with pink). Walking, cooldown ready (420), under
`RELOAD_MAX` (2) this level: the colleague lost most recently within
`RELOAD_WINDOW` (300 ticks) comes back — a fresh spawn at the hatch with the
dead one's trait, `w.lost` decremented, the dead marked `revived`. The sim
now stamps `diedAt` on every loss (one loop after `stepAgents`; there are a
dozen death sites and none recorded the moment). At a wall it turns. Its
fall: gone at the top, there at the bottom. Drawn: a trail of light arcing
from the death spot to the hatch over a second, a ring as it drops back
through; a turning arrow over the hero's head; the teleport scatters into
pixels and assembles. Ten lines.

**Checked.** Its levels, 152 runs, on vs off: 95.4 vs 93.9% home, 45
reloads (about one in three levels). Rendered a real one (level 61): blood
at the fixture, the arrow, the trail to the hatch. `heights` 21/21, `inert`,
`sim play` 88%. Tests: the cap, the trait carried over, a death outside the
window staying dead; the trail drawn through its life and gone after.

**Next.** Deploy with the next iteration.

## 34 — 2026-10-09 · Finer pixels: the divers

**Changed.** `drawDiverFine` (res ≥ 2, submerged): rivets round the collar,
a dark ring framing the port with two grille bars across it, a second
highlight along the helmet's curve, a weight belt with two lead blocks. The
dry-land detail never ran under water, so every agent in the Trench was still
coarse.

**Checked.** Ten poses in two themes at 8×, before/after: reads as a hard-hat
helmet now. `test/agents.test.js` already draws every pose wet at res 2.

**Deployed** with 33 (below).

**Deployed** after 34 (name="build" content="64289d66"): Hot Reload, finer divers. Browser check on level 10 clean.

## 35 — 2026-10-09 · Crap: the heroes' moves under test

**Why.** The worst real code was the heroes' movement — `startSpecialAscent`
(355) and `specialTraverse` (316) — high only because no test reached it.
`npm run sim heights` checked the roster, but nothing made it fail a build.

**Changed.** Tests only. `test/heroes.test.js`: every hero survives a lethal
drop by its own device (21 tests), no two share a device, every powered
device reaches an upper ledge and none goes up without one; chain, speculate
and collapse cross a wall to standing room (bringing a colleague, leaving a
copy) and never into steel; Web Crawler climbs, walks the ceiling past a wall
and comes down whole, and refuses a roof too short to walk.
`test/outcome.test.js`: every end-of-level branch hands back a line.

**CRAP.** `startSpecialAscent` 355 → 20, `specialTraverse` 316 → 18,
`startCeiling` 195 → 17, `outcomeLine` 182 → 13. Functions over 30: 55 →
46 of 495. Tests 118 → 159. Worst real code now `specialShapeCut` (135),
`generate` (124, CC 124 — the generator), `specialCut` (120).

**Next.** Back to the game. The specials' trick poses haven't had the finer
res; or a look at what the newest pieces (Data Center, Hot Reload) look like
in a full browser session.

## 36 — 2026-10-09 · Finer pixels: the hero's portrait

**Changed.** `drawBustFine` (res ≥ 2), quarter-block detail on the
portrait in the sky card — up all level on nearly every level, and still
flat blocks while the agents under it wore ties: light on the hair and two
strands, an ear, the glasses' arm and a glint, a smirk, a chin shadow, a
black tie, lapels, light on the shoulder pip, a shoulder seam.
`tools/render.js` now reads `#rrggbbaa` colours (browsers do; the renderer
turned them grey).

**Checked.** Twelve portraits at 6× before/after. The first "after" showed
no change — the sheet script never passed the flag; caught by looking.

**Next.** Deploy (35 + 36). Then gameplay: a mechanic for one of the older
biomes that is still only a skin (Frost, Ruins, Jungle…).

**Deployed** after 36 (name="build" content="989e8998"): hero tests, finer portraits. Browser check clean.

## 37 — 2026-10-09 · Tracks in the snow and the sand

**Changed.** Frost and Desert: every walker leaves a footprint per cell
crossed (`notePrint` in `stepWalk`, render-only like the blasts, capped at
`PRINT_CAP` 240, aged out at `PRINT_LIFE` 900 ticks). Draw: alternating
feet, toe toward the way it was going, fading as the snow or the wind fills
them in (`drawPrints`). A still frame now says where the colony has been and
which routes it took.

**Checked.** First version drew prints in `dirtShade` on the very top row and
faded them fast — invisible on Frost's rock floors and barely there on snow.
Now `rigDark`, inside the lit edge, with a floor of 0.1 alpha. Crops of Frost
(level 3) and Desert (level 11) after 500 ticks: tracks read. Test: prints in
Frost, none in the Cavern, none older than their life. `sim play` unchanged.

**Next.** Deploy with the next. Ideas still open: a mechanic for Ruins or
Jungle; specials' trick poses at the finer res; xeno at the finer res.

## 38 — 2026-10-09 · Jungle vines

**Changed.** `placeVines` (end of `generate`, Jungle only): half the wall
faces the colony meets coming along a corridor — with a top to stand on and
a floor in front — get a vine, which is a `w.ladders` entry with `vine: true`.
A ladder is the one rule every agent treats the same (hitWall climbs it
before anything else), so a vine needs no new mechanism. Own random stream,
so Jungle terrain and every other roll are unchanged. Drawn as a wavering
stem with leaves on alternate sides (`drawVine`) instead of timber.

**Checked — honestly modest.** 132 vines over 75 Jungle runs; 32 climbed.
Most sit on tall faces the colony rarely has to cross, and where one is
climbed it replaces a bash, not a climber: climbers spent 1532 vs 1526,
home 89.3 vs 89.1. It is visible and used about once every two or three
Jungle levels, not a balance change. Kept for that. Test: a Jungle level has
a vine and the climb rule sees it.

**Deployed** with 37 (below).

**Deployed** after 38 (name="build" content="ffd57772"): footprints, Jungle vines. Browser check on level 5 clean.

## 39 — 2026-10-09 · Crap: specialCut split, a dead move removed

**Changed.** `specialCut` (CC 100) became a two-line dispatcher over
`SPECIAL_CUTS` — one function per act (`cutBlast`, `cutComplete`, `cutKick`,
`cutSap`, `cutStack`, `cutSpray`, `cutPhase`, and `cutTraverse`/`cutShape`
for the acts that already delegated), with the old shared tail as
`cutTail`. Split by script. Found on the way: no special on the roster has
the act `topple` — the cut and its trick drawing were dead code. Removed.

**Checked.** A deterministic golden: 300 levels × 2 colonies played to the
end, hashing saved / lost / ticks / terrainVersion / special per run —
identical before, after the split, after the renames and after the removal.
New tests: every hero's wall move on the same constructed wall (a dry run
changes nothing, the real one changes the world, steel stops all of them).

**CRAP.** Over 30: 48 → 45 of 509. `specialShapeCut` 135 → 55 (now
covered). Tests 161 → 176.

**Next.** Something visible again — xenos at the finer res, or an event that
has never been looked at closely.

## 40 — 2026-10-09 · Events say where, not only what

**Why.** A collapse or a growth was announced by a line of text across the
sky band and then happened somewhere — instantly, under a puff of dust. The
banner said what; nothing said where.

**Changed.** `stepEvents` picks the spot when the warning starts (it used to
pick it on landing) and puts it on the world as `eventSiteFx` (with the
ceiling row — Draw cannot see `CORR_H`); `fireEvent` uses that same spot.
Draw: a zigzag crack spreading across the slab from the middle through the
countdown, with dust trickling out of a ceiling faster as it comes
(`drawCrackWarning`); the floor's edge blinking where a growth will rise
(`drawGrowthWarning`); for a collapse, the slab's chunks falling and fading
over half a second (`drawRubble`).

**Checked.** First crack was drawn in the slab's own dark colour —
invisible — and at NaN: `w.k` has no `CORR_H`. Fixed both; rendered level 1
ten ticks before and three after a ceiling collapse. Test: each mechanism is
marked through the countdown and the rubble falls for 18 ticks and stops.
Choosing the spot earlier draws the event stream in a different order, so
runs differ slightly: `sim play` 95 / 88 (was 95 / 88), `inert` passes.

**Next.** Deploy (39 + 40).

**Deployed** after 40 (name="build" content="671240dd"): specialCut split, event sites. Browser check clean.

## 41 — 2026-10-09 · Review pass, and the xeno

**Review.** All twelve biomes rendered at the page's res, 500 ticks in, after
twenty-odd iterations of art changes. Agents, umbrellas, gunners, prisoners,
fixtures and backdrops sit together; nothing broken, nothing clashing.

**Changed.** `drawXenoFine` (res ≥ 2): ribs across the body, spines along
the back, a gloss down the head, teeth, a barb on the tail — the Spaceship's
infecting alien was the coarsest thing left in view. Every hostile on the
board now has res-2 detail.

**Checked.** Three poses (walking both ways, sated) at 4×. Tests pass (the
enemy test already draws the xeno at res 2).

**Next.** Ideas still open: a mechanic for Ruins; mission animals/treasure
at the finer res; deploy after the next iteration.

## 42 — 2026-10-09 · Finer pixels: the rest of the prisoners

**Changed.** `CREATURE_FINE` (res ≥ 2), run after every mission subject is
drawn (`drawMissionSubject` now wraps `drawMissionSubjectBase`): boar —
bristles and a tusk; bird — feathers; monkey — a pale face with eyes; chest —
lock plate and rivets, and coins glinting once it is open; camel — a red
halter and light on the hump; alien — a glow round its eyes. With 23
(people) every mission subject in the game now has res-2 detail.

**Checked.** Four kinds × three variants, held and freed, at 5×. Mission
test draws every kind with and without fine detail.

**Deployed** with 41 (below).

**Deployed** after 42 (name="build" content="77eaad9c"): xeno and creature detail. Browser check clean.

## 43 — 2026-10-12 · The Ruins get a boulder

**Why.** The last open idea in the log: Ruins was a skin with three events and
a hazard, but nothing of its own that the colony has to live with the way the
Trench has water, the Desert wind and the Data Center updrafts.

**Changed.** Sim: `w.boulder`, one per Ruins level on a corridor below the
first, against the back wall (`placeBoulder`, own RNG stream). The first agent
walking that floor wakes it; it rocks for 36 ticks, then rolls the corridor's
way at 1.4× a walk, up one-cell steps and down two-cell drops. Agents ahead of
it and within 26 cells turn and run (`sprintUntil`, 1.8× pace in `walkStep`).
It shatters on the first body, blocker, wall or edge — at most one crushed.
Draw: `drawBoulder` — a sandstone ball with a carved cross that turns as it
rolls, rocking while it wakes, dust behind it, shards where it stops; rim
light, moss and pits at res 2.

**Checked.** First version used a plate near the corridor start: rolled on
24 of 68 plays (the colony mostly lands far along the floor). Switched to the
first walker. Then it took 26 in 204 plays, 12 in mid-fall and 9 in the
first tick of rolling; sparing fallers and running during the rumble brought
that to 16. Ruins home 92.4% against 93.5% with the boulder removed (same
levels, same colonies). First drawing was in the biome's rock — the
backdrop's colour, invisible; fixed sandstone instead. Rendered rest, roll and
shatter at res 2. `sim play` 95 / 88, `inert` passes, 6 new tests, every
new function under 30 CRAP.

**Next.** Deploy after the next iteration. Ideas: civilians on a mission
floor ignore the boulder (it rolls through them); finer-pixel pass on what is
left coarse (decor? the hatch?).

## 44 — 2026-10-12 · Boulder off the prisoners, a riveted hatch

**Changed.**
- The boulder no longer goes on the mission corridor: prisoners neither run
  nor step aside, and in iteration 43's shots it rolled straight through
  three caged civilians. All 31 mission levels sampled still get a boulder,
  on another floor.
- `drawHatchFine` (res ≥ 2): each housing panel bevelled (light top and left,
  shadow right), rivets along the roof, light along the lip and shadow under
  it, a bolt at each end, a glint and a halo on the lamp. The hatch was the
  last big plain-block thing on screen — every level starts with it in view.
  A first go put warning paint on the lip; at size it read as dirt, so I
  replaced it with the bolts.

**Checked.** Hatch at 6×, lamp lit and dark, before/after. Boulder test was
pinned to level 38's boulder rolling far; it moved floors with this change,
so it now asks only that the boulder moved. `sim play` 95 / 88; check passes
(183 tests); headless page check clean.

**Next.** Decor at finer pixels (spires, tufts, clumps are the chunkiest
thing left); look for a hero or mechanic gap.

**Deployed** after 44 (name="build" content="f793ad70"): Ruins boulder, riveted hatch. Browser check clean.

## 45 — 2026-10-12 · Decor at finer pixels

**Changed.** `drawDecor` split three ways: `DECOR_FITTINGS` (window, strip,
grate, desk — a table, each checking its own mount), `drawDecorShape` (the
four ground shapes in every biome), and the loop. New `drawDecorFine` /
`DECOR_FINE` (res ≥ 2), by shape and look: shadow and highlight down a
cave or frost cone and a white point on the ice needle; fluting, a base
course and a lit edge on a Ruins column; light, shade and collar bolts on a
pipe; spines on a cactus; leaf specks and bark on a jungle trunk; a shadow
side and a forming drop on stalactites and icicles; pebbles in a clump; lit
tips on tuft blades.

**Checked.** Res-1 frames byte-identical before/after on nine biomes at
tick 1 (later ticks differ run to run by random particles — a repeat-run
control showed that). Res 2 rendered at 6× on Ruins and Cavern. Check passes;
`drawDecor` CRAP 32 → 20; 44 functions over 30 (was 45).

**Next.** A hero or mechanic gap — every biome now has a mechanism or a
fixture of its own except Cavern, Frost and Foundry (check); or the exit
frames at finer pixels.

## 46 — 2026-10-12 · Factory conveyors

**Why.** The Factory was all fittings and no mechanism. The cheapest
mechanism this game has found is one number read by `walkStep` (the wind);
a belt is that number fixed to a place, which suits a factory.

**Changed.** Sim: `placeBelts` (own stream) puts a 10–18-cell belt on a flat
stretch of three in four corridors, running either way; `w.beltAt` per feet
cell; `beltUnder` reads it and refuses where the floor is gone; `walkStep`
multiplies pace by 1.5 with it, 0.5 against. Draw: `drawBelts` — a dark band
on the floor's top edge with treads travelling at the speed it adds, drums at
each end with a turning spoke at res 2.

**Checked.** Factory, 240 plays each way: 92.7% home with belts / 92.5%
without; avg ticks 1229 / 1163; timeouts 3 / 1. Walkers are on a belt for
~15% of walking time. Render at 4×, two ticks apart. `sim play` 95 / 88,
`inert` passes, 4 new tests, all new functions under 10 CRAP.

**Next.** Cavern, Frost, Foundry, Ice Cave and Spaceship still have no
mechanism of their own; the exit frames at finer pixels.

**Deployed** after 46 (name="build" content="ad86fe51"): decor detail, Factory conveyors. Browser check clean.

## 47 — 2026-10-12 · Ice Cave: colleagues frozen in the walls

**Why.** Next biome without a mechanism. Everything so far taxes or bends the
route (wind, belts, boulder, updraft); this one is a reward you see coming —
a figure in the ice of the wall the colony is about to dig through.

**Changed.** Sim: `placeFrozen` (own stream) stands up to two former
colleagues in full-height walls on corridor floors; `stepFrozen` thaws one
when any of its body cells is opened, melts the column it stood in, and
spawns it walking the corridor's way, counted into `toRelease`/`released`.
Draw: `drawFrozen` — the ordinary sprite under a pane of ice with a lit edge
and a shine; `drawThaw` — shards and steam for a second.

**Checked.** First thaw rule (feet cells only) left half-exposed figures in
the ice; widening it to the whole body made agents spawn into solid ice when
cut at the head — they stuck. Clearing the column fixed it: 89 of 105 thawed
get home. Ice Cave, 240 plays: original colony 89.9% → 91.6% saved.
Rendered frozen and thawing at res 2. Checked the stats cap
(`MAX_SAVED_PER_REPORT` 90) against a 20-agent level: the client seals
batches by saved count, fine; comment updated. `sim play` 95 / 88; `inert`,
`gravity` pass; 4 new tests; new functions under 10 CRAP.

**Next.** Cavern, Frost, Foundry, Spaceship still without a mechanism. Exit
frames at finer pixels. Deploy after the next iteration.

## 48 — 2026-10-12 · Review: what is killing the Desert

**Why.** Looked at exit frames at finer pixels first — the doorway already
has its res-2 shimmer and the frames are per-biome bespoke; not worth an
iteration. Ran a per-biome cause-of-death tally instead (600 levels × 2).
Desert stood out: splats 52, more than any other biome. Wind on/off on 300
Desert plays: 112 splats with wind against 50 without, 90.7% vs 92.9% home.

**Found.** Not the wind directly: profiling each splat by the state before the
fall, about four in five were diggers. `stepDig` cleared the last layer of a
floor without asking what was under it, and in the Desert's soft fill that
is often a drop past `SAFE_FALL`. The wind makes the colony dig more.

**Changed.** `digOpensDeath`: on the stroke that would break through, if the
drop beneath is fatal and there is no umbrella in hand or on the toolbar,
stop and turn round. With an umbrella the old path is untouched.

**Checked.** Per-biome tally: Desert splats 52 → 9, home 90.5 → 92.3%;
Jungle splats 20 → 12; Spaceship 23 → off the top five. Desert bombs rose
39 → 53 (some stranded diggers are bombed by the stall rule) — net clearly
better. `sim play` 95% / 88% (cleared 189 → 190, home 2992 → 3003),
`inert`, `heights` pass; new test.

**Next.** Jungle is now the weakest biome (88.4%): "boom" 73 is its top
cause — look at why it bombs. Deploy now (47 + 48).

**Deployed** after 48 (name="build" content="f899c3ad"): Ice Cave frozen colleagues, dig safety. Browser check clean.

## 49 — 2026-10-12 · Review: why the Jungle bombs itself

**Why.** Iteration 48 left the Jungle weakest (88.4% home), with "boom" its
top cause. Tagged every bomb by who lit it: in the Jungle 69 of 80 were
`condemn` — the stall rules clearing stuck agents — and of those almost all
came from the loop detector (agents pacing one stretch). Vines on/off made no
difference.

**Found.** Worst case, level 569 colony 24326: 0 of 18 home. A three-cell
block under a low roof stands in front of the exit, bashers and diggers are
spent, eighteen bombs are left. `blastWall` would open it — but
`obstructionAhead` counted any solid cell in the body's height as wall, and
the floor beyond the block is one step higher, so every column to the exit
measured as obstruction: deeper than `MINE_RADIUS`, so no charge. Tried and
reverted first: capping growth events by headroom (a growth event was my
first guess; it never triggered in 1200 plays — that level had none).

**Changed.** `obstructionAhead` stops at the first column a walker could
stand in, level or one step up (`standable`).

**Checked.** Level 569: 0/18 → 17/18. Per-biome (600 × 2): Jungle 88.4 →
89.4%, booms 73 → 56; Skyscraper 92.4 → 93.1; Trench 93.3 → 92.7 and Ice
Cave 91.2 → 90.8 the only dips. `sim play` 95% / 88%, home 3003 → 3011;
`inert`, `heights` pass; regression test on level 569.

**Next.** Trench and Ice Cave dipped — check whether earlier charges there
are wasted. A biome mechanism for Cavern / Frost / Foundry / Spaceship.

## 50 — 2026-10-12 · Half-pixel action poses

**Changed.** `FINE_POSES` now dispatches small per-pose functions. Climb,
webup and rappel get grips, cuffs and braced shoes; build gets a cuff, hand
and brick face/joint; dig gets alternating grips; fall (including umbrellas)
and height get raised hands or tucked knees. Slide and stunned get compact
coat detail, hands and soles; bomb, jump and ceil get tailoring and shoes.
Swimmers get seams and fin edges following their kick. The original upright
pass is retained. New marks use palette colours and opaque half-pixel steps
inside the coarse silhouette, with the existing res-2 guard.

**Checked.** `npm run check` / `npm test` pass. The new tests render all
thirteen action states at both resolutions, both facings and varied phases,
including height transforms and swimming up/down; they check silhouette
containment and the opaque half-pixel grid. The pre-edit res-1 hash matches
624 pose samples with `w.res` absent or 1; 30 full frames on levels 7, 8, 9,
10 and 100 also match byte for byte from identical world states. Reviewed
before/after contact sheets and ImageMagick crops, including level 8 at
400/712 ticks and level 10 at 670. Asset and build stamps refreshed.

**CRAP.** `drawFineBuild`, `drawFineClimb`, `drawFineFall`, `drawFineRappel`,
`drawFineShoes`, `drawFineSlide`, `drawFineStride`, `drawFineStunned`,
`drawFineSuit`, `drawFineWebUp`: 1.0 each. `drawFineDig`, `drawFineHead`,
`drawFineHeight`: 2.0 each. `drawFineSwim`: 6.0. Dispatcher `drawAgentFine`:
3.0; retained `drawAgentUprightFine`: 5.0; extended `drawDiverFine`: 4.0.
Used the cached crapper tool after the first-run download had no network.

**Next.** Review the separate special height-device props at res 2.

*Reviewed and merged by the loop:* written by Codex in a worktree
(`codex/fine-poses`) while iteration 49 ran on main — the owner OK'd
parallel Codex runs for art. Read the diff (a table of small per-pose
functions, inside the existing res-2 guard, no Sim changes), looked at
before/after pose sheets, re-ran res-1 frames on levels 3, 8, 10 (same),
`npm run check` (207 pass), CRAP count over 30 unchanged at 44.

**Deployed** after 50 (name="build" content="1616e35e"): obstruction fix, action-pose detail. Browser check clean.

## 51 — 2026-10-12 · Half-pixel exit frames

**Changed.** `EXIT_FINE` dispatches one small drawing per biome, gated at
res 2 in `drawExitFrameFine`; `drawExitBack` gains only the dispatch line.
Cavern gets bevels, mortar and a crack; Ruins fluting and fractured stone;
Frost icicle edges and glints; Foundry rivet crowns and welded joints;
Jungle vine edges, leaf veins and cracked stone; Ice Cave arch facets and
ice glints; Spaceship collar seams, bolt slots and a lamp glint; Factory
shutter edges, rail screws and inset lamps; Skyscraper polished trim and
indicator detail; Trench wet edges, salt pits and marine deposits; Desert
carved glyphs, eroded joints and a recessed sun disc; Data Center vents,
LED glints and a badge-reader slot. All marks are opaque rectangles on the
half-pixel grid using existing palette colours inside the coarse silhouette.
The mouth, glow and animated shimmer are unchanged.

**Checked.** `npm run check` / `npm test`: 221 pass. Fourteen new tests cover
every biome at both resolutions in all five themes, visible fine pixels,
silhouette containment, the half-pixel grid, palette use and the Cavern
fallback. The pre-edit res-1 hash matches 120 exit rasters with `w.res`
absent or 1; 96 complete frames on levels 1–12, two seeds and two tick
counts also match byte for byte from identical world states. Rendered and
reviewed every exit before and after at seed 3, tick 1, res 2, with 120×90
ImageMagick crops enlarged 500%. Contact sheet:
`/tmp/codex-exit/sheet.png`. Asset and build stamps refreshed.

**CRAP.** `drawExitRuinsFine`, `drawExitDesertFine`: 1.0 each.
`drawExitFrostFine`, `drawExitJungleFine`, `drawExitSpaceshipFine`,
`drawExitSkyscraperFine`: 2.0 each. `drawExitCavernFine`,
`drawExitFoundryFine`, `drawExitIceFine`, `drawExitFactoryFine`,
`drawExitTrenchFine`, `drawExitDataFine`: 3.0 each. Dispatcher
`drawExitFrameFine`: 4.0; existing `drawExitBack`: 29.0. All have 100%
coverage. Used a local copy of the cached crapper tool.

**Next.** Review the separate special height-device props at res 2.

*Reviewed and merged by the loop:* written by Codex in a worktree
(`codex/exit-frames`). Looked at the before/after sheet for all twelve
biomes — subtle, in style, nothing changes shape — and the diff (an
`EXIT_FINE` table, one dispatch line in `drawExitBack`). Check 221 pass;
CRAP count over 30 unchanged at 44.

## 52 — 2026-10-12 · Spaceship transporters; the dips were noise

**Checked first.** Iteration 49's Trench / Ice Cave dips, on fresh seeds
(600 plays each, before vs after the obstruction fix): Trench 93.19 → 93.20,
Ice Cave 92.22 → 92.43, Jungle 90.15 → 91.30. Noise; the fix stands.

**Changed.** Spaceship transporters: a pad pair per level, beaming a walker
from near the start of one corridor to near the start of the next one down
(`placePads`, `padSpot`, `stepPads`); `drawPadPair` — floor plates whose lamps
refill as they recharge, a column of light with scan lines rising from the
sender and settling on the receiver. First placement (mid-floor, 45-tick
recharge) beamed 1.9 a level and saved nothing; 10-tick recharge 3.4; near
the floor's start 6.3 a level, Spaceship home 92.76 → 93.08%, avg ticks
1220 → 1202 (800 plays).

**Found on the way.** The play test failed on level 19: 17 saved of 16
released. Not the pads — Model Collapse's copies walk home and count as
saved but were never released. They are now (`toRelease`/`released` bumped
as the Ice Cave's thawed are). Counter comment updated.

**Checked.** 225 tests pass (4 new); `sim play` 95% / 88%; `inert` passes;
new functions under 12 CRAP. Rendered both pads through a beam at res 2.

**Next.** Deploy (exit frames + pads). Codex is on hero gear detail.
Cavern, Frost, Foundry still have no mechanism.

**Deployed** after 52 (name="build" content="f4c51999"): exit frames, Spaceship transporters, copy count fix. Browser check clean.

## 53 — 2026-10-12 · Crap: biomeSkin and stepEnemy split

**Why.** Considered a Foundry crane ferrying walkers across a chasm — but a
chasm already drops the colony safely to the floor below, so it would have
saved nothing. Took the standing CRAP priority instead.

**Changed.** `biomeSkin` (CRAP 113) is a `BIOME_SKINS` table over one function
per biome (`skinSpaceship`, `skinIceCave`, `skinFactory`, `skinSkyscraper`,
`skinJungle`, `skinTrench`, plus the existing Desert / Data Center): now 2,
the largest piece 26. `stepEnemy` (91) split by state — `stepEnemyMover`,
`stepOperatorOperate`, `stepSniperCamp`, `stepEnemyJet`, `stepEnemyAim`,
`stepEnemyRecover` — now 15, the largest piece 16.

**Checked.** Generation golden (600 levels: terrain, decor, hazards, exit,
hatch, and every 50th played out) identical before and after; full-play
golden (150 levels played to the end, agents and enemies hashed every 50
ticks) identical to HEAD. 225 tests pass. Functions over 30: 44 → 42.

**Next.** Review Codex's hero-gear branch when it finishes. More CRAP:
`stepAgents` (122), `generate` (129), `drawAgent` (86). A mechanism for
Cavern / Frost / Foundry when a good one comes along.

## 54 — 2026-10-12 · Tried and reverted: thin ice for Frost

**Idea.** The first chasm on a Frost level frozen over level with the floor:
the colony walks across, the sheet cracks under load and gives way, and the
rest drop to the corridor below.

**Measured** (800 Frost plays, same levels with the sheet removed as
control): load 220 → 92.93% vs 93.36% home, 6% longer; load 60 → 92.69%;
only over survivable drops (a third of chasms were deeper than `SAFE_FALL`
and the break took away the choice of umbrella or bridge) → 92.49%; load 25
→ 92.81%. Always worse.

**Why.** A chasm is a shortcut: dropping into it skips the rest of the
corridor. Ice turns the early arrivals into walkers of the whole corridor,
into its hazard and its obstacles — hazard deaths +20, bombs +26 per 800.
The mechanism takes away a route rather than adding one. Reverted. Lesson
for the next biome mechanism: add routes (pads, vines, frozen colleagues)
or bend existing ones (wind, belts), don't close them.

**Next.** Merge Codex's hero gear when it is done; deploy. CRAP:
`stepAgents`, `generate`, `drawAgent`.

## 55 — 2026-10-12 · Crap: stepAgents

**Changed.** Out of `stepAgents` (CRAP 122): `tickAgentTimers` (the plain
countdowns as an `AGENT_COUNTDOWNS` list; shield and sweep kept explicit, and
the chill still wears off after the sweep, which walks at the agent's pace),
`specialReacts` + `specialTakesAim` (what a special does when it sees
something), `watchStill` (stuck in one cell) and `watchProgress` (getting
nowhere → forceEscape → countPass → condemn, in the same order). Now 58.

**Checked.** Full-play golden (150 levels to the end, agents and enemies
every 50 ticks) identical to before. A new test runs `specialReacts` for
every special on two levels — the first cut left it at 33% coverage and
pushed it over 30. 226 tests pass; over 30: 42 (it went to 44 mid-way, with
the split pieces untested).

**Next.** Codex's hero gear branch. `generate` (129), `drawAgent` (86).

## 56 — 2026-10-12 · Crap: generate

**Changed.** Out of `generate` (CRAP 129): `planGuard` (the red team's post:
corridor, spot, roster — on its own stream as before), `setupColony` (size,
release pace, personalities, toolbar, special), `buildGuardBooth` with
`boothSiteClear` (the seven-by-eight clearance test), and a
`BIOME_MECHANISMS` table for the five biome placements. Now 77; the pieces
20 at most.

**Checked.** Generation golden (600 levels) and full-play golden (150
levels) identical before and after. 226 tests pass; over 30 stays 42.

**Next.** Codex's hero-gear branch (still running, slow model). `drawAgent`
(86) once that branch is merged — it touches Draw.js.
## 57 — 2026-10-12 · Half-pixel hero gear

**Changed.** `GEAR_FINE` and `TRICK_FINE` dispatch small per-item overlays
only at res 2. The dispatchers preserve the coarse pass's canvas state,
including Hot Reload's body fade; Ghost remains a body fade without a prop.
Every new rectangle is on the half-pixel grid inside the existing silhouette.

Bungee gets cable shading, anchor bolts and a harness buckle; teleport gets
bright corners on its moving reassembly pixels; jetpack gets a valve, tank
edge, nozzle rim and flame core. Helicopter gets cockpit mullions and glints,
cabin rivets and seams, mast, rotor and skid edges. Cushion copies get
compressed collars, glasses and ties. Conning gets hull seams and rivets,
a port glint/rim, periscope edge, tower hatch and turning screw detail.
Web gets a shaded cable edge; chain gets hollow links along its existing route.

Balloon gets panel seams, a glint and rope edges; promptchute gets a folded
edge, panel stitches and hem; extender gets recessed rail channels, tread
edges and rung bolts. Shieldglider gets plate bevels, a spar and rivets;
backoff gets a rim following its lit/dark phases, lamp glints and straps.
Glasswing gets panel ribs, edges and reflections; tractor gets emitter
detail and beam-edge pulses; steps get tread lips and shading. The retained
logchute drawing gets grain breaks and end grain. Recoil gets barrel edges
and a flash edge; gunwing gets barrel shading and a grip strap following
its existing aim; cyclone gets fine streaks; piledrive gets bevels, a piston
recess and rivets.

The trick props get matching detail: rocket a tube seam, sight screw and
muzzle bore; spray a receiver edge, grip grooves and breech; quarry a lit
cutting rail and fixings; slab glazed lips and panel joints; chain inset
bubble edges; stack tread lips and fixings; sap crisper terminal strokes.

**Checked.** `npm run check` / `npm test` pass; 250 tests also pass with
Node's test isolation disabled to expose the individual test results.
Twenty-nine new tests pin the pre-edit res-1 hash across every hero in all
five themes, and exercise every detailed item at both resolutions, both
facings and five phases. They verify visible fine pixels, silhouette
containment, half-pixel rectangles and preserved canvas state; a zero-length
slab correctly has no overlay. The retained logchute has its own sample.
Compared directly with `git show HEAD:public/agents/Draw.js`: 3,700 prop
rasters and 144 complete frames (levels 1–12, two seeds, three tick counts,
absent or explicit res 1) match byte for byte. Rendered and reviewed every
changed item before/after at two phases, plus enlarged crops. Contact sheet:
`/tmp/codex-gear/sheet.png`. Asset and build stamps refreshed.

**CRAP.** `gearFineRect`, `drawGearBalloonFine`, `drawGearGlasswingFine`,
`drawGearJetpackFine`, `drawGearRecoilFine`: 1.0 each.
`drawGearBungeeFine`, `drawGearCushionFine`, `drawGearExtenderFine`,
`drawGearHelicopterFine`, `drawGearLogchuteFine`, `drawGearPiledriveFine`,
`drawGearPromptchuteFine`, `drawGearShieldgliderFine`, `drawGearStepsFine`,
`drawTrickChainFine`: 2.0 each. `drawGearBackoffFine`, `drawGearCycloneFine`,
`drawGearTeleportFine`, `drawGearTractorFine`, `drawTrickQuarryFine`,
`drawTrickRocketFine`, `drawTrickSapFine`, `drawTrickStackFine`: 3.0 each.
`drawGearChainFine`, `drawGearGunwingFine`, `drawGearWebFine`,
`drawHeightGearFine`, `drawTrickSlabFine`: 4.0 each. `drawTrickFine`,
`drawTrickSprayFine`: 5.0 each; `drawGearConningFine`: 5.1. The two existing
dispatchers score 5.0 (`drawAgentHeightGear`) and 7.0 (`drawAgentTrick`).
Used a local copy of the cached crapper tool.

**Next.** Review the heroes' walking signature props beside their detailed
flight devices at res 2.

*Reviewed and merged by the loop:* written by Codex in a worktree
(`codex/gear`), interrupted twice by model-capacity errors and resumed on a
second model. Looked at the before/after sheet for all 28 items (detail stays
inside each silhouette); merged over iterations 52–56 (log and stamps were the
only conflicts). Res-1: 180 frames (levels 1–60 at three ticks, Math.random
seeded, 88 with a special on screen) byte-identical old vs merged Draw.js.

**Deployed** after 57 (name="build" content="49f0ff05"): refactors 53–56, hero gear detail. Browser check clean.

## 58 — 2026-10-12 · Half-pixel backdrops and ambience

**Changed.** `BACKDROP_FINE` and `AMBIENCE_FINE` dispatch small per-biome
recipes only at res 2. Wall detail replays the existing seeded rectangles
through a recording context, so placement rules stay in one place and every
mark stays inside the original shapes. Only the three dark wall shades are
used, at 0.4 alpha, behind terrain and actors. The sun and port stars retain
their light. Fine particles keep the original drift and blink recipes, move
on half-pixel steps, and check their complete footprints against solid ground.

Cavern gets mineral seams, split edges and dust flakes; Ruins gets mortar,
fluted shadows and chipped dust. Frost gets ridge crevices, snow lips and
crossed snowflakes; Foundry gets girder recesses, chain hollows, fixings and
embers with hot cores. Jungle gets bark, vine edges, leaf veins, curling
leaves with stems and winged fireflies; Ice Cave gets split facets, face
shading, asymmetric glints and ice splinters. Spaceship gets rib channels,
joints, port rims and weightless flecks; Factory gets mortar/glazing depth
and soot flakes. Skyscraper had no coarse interior wall or dust: res 2 gets
quiet office panel joints and indoor dust. Trench gets spire erosion, kelp
midribs, sediment ledges and shaped marine snow in its existing water-life
pass. Desert gets dune lips, mesa strata and wind-polished grains; Data Center
gets cabinet seams, vent slots and shaped vent dust. Fine passes preserve the
coarse pass's canvas state.

**Checked.** `npm run check` / `npm test` pass; 294 individual tests pass with
Node test isolation disabled, including 39 new tests. Each biome's wall and
air/water ambience draws at both resolutions and adds visible fine pixels
across all five themes at three phases. Tests pin the pre-edit coarse hash,
check hard half-pixel rectangles, dark wall colours, silhouette containment,
canvas state and particles staying out of solid ground. Compared the committed
Draw.js with the final renderer on the same world states, seeding Math.random
identically: 360 full frames (levels 1–60 at ticks 200/500/900, absent or
explicit res 1) byte-identical. Temporary core copy removed afterwards.
Rendered all 12 biomes before/after via tools/shoot.js at res 2 with identical
Math.random seeds; reviewed full boards and ImageMagick crops enlarged with
nearest-neighbour scaling. Agents still stand out clearly. Contact sheet:
`/tmp/codex-backdrops/sheet.png`. Asset and build stamps refreshed.

**CRAP.** `backCavernFine`, `backFactoryFine`, `drawMoteCavernFine`,
`drawMoteRuinsFine`, `drawMoteFrostFine`, `drawMoteFoundryFine`,
`drawMoteSpaceshipFine`, `drawMoteFactoryFine`, `drawMoteSkyscraperFine`,
`drawMoteTrenchFine`, `drawMoteDesertFine`, `drawMoteDataFine`: 1.0 each.
`backRuinsFine`, `backFrostFine`, `backJungleFine`, `backIceCaveFine`,
`backTrenchFine`, `drawMoteJungleFine`, `drawMoteIceFine`: 2.0 each.
`backSkyscraperFine`, `backDesertFine`, `backDataCenterFine`,
`drawBackdropFine`: 3.0 each. `backFoundryFine`: 4.0;
`backSpaceshipFine`: 5.0; `backFineRecorder`: 6.0; `moteFineRect`: 8.0.
All 27 added functions have 100% coverage. Existing touched dispatchers:
`drawBackdrop` 4.0, `drawMotes` 7.0, `drawAmbience` 9.0,
`drawWaterLife` 14.0. Used a local copy of the cached crapper tool.

**Next.** Review distant sky stars and skyline detail at res 2.

*Reviewed and merged by the loop:* written by Codex (`codex/backdrops`).
Zoomed before/after on Ruins, Foundry, Jungle at res 2 — quiet, as asked:
mortar on the columns, girder recesses, bark; agents unaffected. Seeded res-1
comparison, 180 frames old vs merged Draw.js: identical.

## 59 — 2026-10-12 · Deaths carry their cause

**Why.** Groundwork for death animations (next Codex task): an agent that
dies just stops being drawn, whatever killed it. Draw needs to know how.

**Changed.** `noteDeaths` (out of `step`, run after the whole tick) stamps
`diedAt` and a render-only `diedBy` — the tick's last event — on every agent
that went that tick. It used to run before `finishWorldStep`, so deaths in
the hazards' and enemies' step got the next tick's stamp and an empty event
(75 of 220 deaths in a 120-level sample); now every one has a cause: boom,
red team, hazard, fell, drone strike, splat, stand down, crushed, turned.

**Checked.** `sim play` 95% / 88%, home 3023 (unchanged); check passes.
Hot Reload's revival window now counts from the true tick for those deaths
(one tick earlier) — no measurable effect.

## 60 — 2026-10-12 · Short death poses by cause

**Why.** A death used to remove its sprite immediately, so only the existing
blood, dust or blast said what had happened. The cause stamps from 59 let the
renderer give each departure a short, readable pose.

**Changed.** `DEATH_DRAW` dispatches from the dead-agent branch in `drawActors`
for 32 ticks, fading over the last ten. Splat folds into a flattened suit with
a dust ring; crushed presses it to one row with dust at the sides. Red team
knocks the body backward, keels it over, then releases a small ghost. Drone
strike splays the suit with impact rays and a floating tie. Hazard leaves a
zapped charcoal silhouette that collapses into ash. Boom throws a hat out of
the existing blast (a copper helmet underwater). Turned sheds green/purple
pixels that contract and disperse around the replacement enemy. Stand down
drops an empty collar and tie while a white handkerchief flutters away. Fell
stays invisible below the world; empty and unknown causes get a rising ghost
and dust. Saved, unstamped and revived agents get no death pose.

All base marks use whole art pixels; the ghost adds cheek detail at res 2.
The pass uses no randomness, reads world state only, and saves/restores the
canvas transform, colour and alpha. Extracted the existing mine, ladder and
particle loops unchanged so the touched actor pass also stays under CRAP 30.
Asset and build stamps refreshed.

**Checked.** `npm run check` / `npm test` pass. Sixteen new tests exercise every
animation age at res 1, res 2 and unspecified resolution, facing both ways,
on land and underwater; future and expired stamps draw nothing. Unknown
causes include inherited object names. Tests check hard pixels, marks staying
above the boot line, canvas-state restoration, the actual actor dispatch and
no world mutation. A golden recorded before this edit pins 108 full frames
across all twelve biomes, ticks 0/200/500 and all three resolution settings,
with deaths outside the window and Math.random seeded identically: exact
byte match after the animation pass and helper extraction. Rendered and
visually reviewed every age 0–32 of all ten recipes at both resolutions,
enlarged with nearest-neighbour scaling. Fixed the recoil-to-ground facing
and kept the final ash eyes and dropped tie above the floor. Contact sheet:
`/tmp/codex-deaths/sheet.png`; per-cause sheets there include every frame.

**CRAP.** `drawDeath`: 8.0. `drawDeathSplat`, `drawDeathTurned`: 4.0 each.
`drawDeathBoom`, `drawDeathGhost`, `drawDeathShot`: 3.0 each.
`drawDeathCrushed`, `drawDeathDrone`, `drawDeathGeneric`, `drawDeathHazard`:
2.0 each. `drawDeathDust`, `drawDeathFell`, `drawDeathFlat`, `drawDeathRecoil`,
`drawDeathStandDown`, `drawDeathTie`: 1.0 each. All sixteen death functions
have 100% coverage. Extracted helpers: `drawActorMines` 8.1,
`drawActorLadders` 12.0, `drawActorParticles` 3.0. `drawActors`: 21.2,
down from 48.2. Used a local copy of the cached crapper tool.

**Next.** Watch the short poses against overlapping live colonies and blasts
in normal play before adding any further detail.

*Reviewed and merged by the loop:* written by Codex (`codex/deaths`) on the
`diedBy` groundwork from 59. Looked at every cause frame by frame at both
resolutions on its contact sheet: comic, short (32 ticks), nothing that
reads as a living agent. Check and CRAP below; deployed with 58–59.

**Deployed** after 60 (name="build" content="3b5aa723"): backdrops and ambience detail, death causes and animations. Browser check clean.

## 61 — 2026-10-12 · Foundry hoist chains

**Why.** Last iteration's lesson: a mechanism should add a route. The
Jungle's vines do (a ladder the colony meets on a wall face); the Foundry
gets the same rule in iron.

**Changed.** `placeVines` and new `placeChains` share `placeWallRopes`
(own stream each; vines byte-identical — 550 non-Foundry levels compared,
terrain and ladders). Foundry walls get a hoist chain at 45% of eligible
faces, ~2 a level; `drawChain` — alternating face-on and edge-on links, a
hook, a glint at res 2.

**Checked.** 800 Foundry plays: 91.70% home with chains vs 91.49%, levels
~4% longer, climbers spent 5.96 → 5.59 a level. `sim play` 95% / 88%;
`inert` passes. Rendered a climber on a chain at res 2.

**Also.** Codex's deaths test pinned a hash of whole frames; the chains broke
it at once. Replaced with what it meant: a death past its window draws
exactly as if the agent were not in the list. AGENTS.md now says which
pinned hashes are deliberate (res-1, one component) and that whole frames
must not be pinned.

## 62 — 2026-10-12 · Biome mechanisms in motion

**Why.** The mechanisms worked but their first drawings were plain. Small
moving marks needed clearer silhouettes and direction at the panel's res 1,
with half-pixel detail added for the page's res 2.

**Changed.** Draw only; no simulation changes. Ruins boulders now roll three
carved cracks and an off-centre fossil under fixed upper-left sandstone
lighting, rumble with dust at both feet, leave a fading dust trail, and break
into shaded shards that settle at floor height with an impact cloud. Factory
belts have jointed treads, an opposing return run and rotating drum marks that
follow their own belt's direction at both resolutions; a missing end floor
also removes its drum. Ice panes have clipped corners, facets, frosty edges
and a restrained glint; thawing throws small lit shards, drips into a shallow
meltwater strip and releases mist. Spaceship pads have bevels, emitter studs
and four sequential recharge lamps. Their beam scans a head, shoulders, tie
and split boots away at the sending pad and assembles the traveller's outline
at its actual moving position. Fresh pads no longer show a phantom beam.
Jungle vines gain cupped leaves, shaded stems and a little anchored sway;
Foundry chains gain lit alternating links, a fixed hook and a loose-end sway.
Desert sand streaks have bright heads, fading stepped tails and a gentle curl;
Data Center updrafts have rising wisps with visible whole-pixel marks at res 1.
Both clip each mark to open air, including tails and half-pixel accents.

**Checked.** `npm run check` (including `npm test`) passes; core files stay
self-contained and stamps are current. Existing mechanism tests and all
component pixel pins pass unchanged; no pins needed updating. Five new tests
check belt and drum direction, missing floors, wind/updraft clipping, fresh
pads, arrival lifetime, both resolutions and rendering without state writes.
Seeded `Math.random` identically for the before/after renderers on twelve
Cavern, Frost and Trench levels at ticks 0, 200, 500, 900 and 1600: all 120
frames are byte-identical across res 1 and res 2. Stepped actual play to capture
the boulder's wake/roll/shatter, an Ice Cave thaw and a transporter use; also
captured belts, ropes, both wind directions and updrafts across several frames.
Reviewed every mechanism at both resolutions, enlarged without smoothing.
Before/after contact sheet: `/tmp/codex-mech/sheet.png` (240 crops); individual
mechanism sheets, capture script and seeded comparison are in that directory.

**CRAP.** `npm run crap -- --changed`, using a local copy of the cached tool.
All sixteen new functions are below 30: `drawBeamOutline` 10.0,
`drawSandStreak` 9.0, `drawDraftWisp` 8.0, `drawBeamArrival` and
`drawBeltTreads` 7.0, `drawBoulderDust` 6.1, `drawIceFacets` 6.0,
`drawChainLink`, `drawPadLamps`, `drawThawDrips` and `mechanismAir` 5.0,
`drawVineLeaf` 4.0, `drawBeamGrains`, `drawBoulderBody` and
`drawBoulderImpact` 3.0, `drawIcePane` 1.0. Existing touched functions also
stay below 30; the largest is `drawActors` at 21.9.

**Next.** Watch these short effects in crowded colonies on the panel and page
before adding more detail; keep the mechanism silhouettes readable at res 1.

*Reviewed and merged by the loop:* written by Codex (`codex/mechanisms`).
Looked at its before/after sheet frame by frame, zoomed on ice and
transporters: the beamed agent now dissolves as a cyan outline climbing the
column and re-forms on arrival; the thaw shards and drips read clearly.
Codex's seeded comparison kept Cavern / Frost / Trench frames identical.

**Deployed** after 62 (name="build" content="467d7a1b"): Foundry chains, mechanism polish. Browser check clean.

## 63 — 2026-10-12 · Fixtures that show their wind-up

**Why.** Reviewed all 45 fixtures before changing pixels. Charge blinked off
entirely for half its frames, while some idle payloads already looked lethal.
Priority ranking, weakest tells first, in three tiers: (1) beartrap, packetloss,
grinder, polisher, scarab, snowball, molten, rockfall, stamper; (2) gun, sentry,
turret, darts, flame, tesla, sniper, lasergrid, sweeper, tripwire, spikes,
sawblade, geyser, echobat, spores, blackice, frostjet, steamvent, sprinkler,
shredder, vent, current, flywheel, hotaisle, pendulum; (3) crusher, piston,
airlock, servo, icicle, vinelock, snake, scorpion, shark — these already had a
useful pose change. Brazier and fence are continuously live fields, with no
charge or recovery in the simulation; their art is unchanged.

**Changed.** Draw only, all 43 phased fixtures. Charge stays visible, builds
from warning colour toward a hot tip, and differs from the full release.
Optical heads use dotted sights, dart ports load before launching, Tesla's
charge climbs its coils with short local arcs, jets gather pressure at their
outlets, and falling payloads wait at the source. Plates raise teeth or draw
jaws inward; grinders, wheels, fans and the buffer spin up from a quiet idle.
The pendulum draws back before swinging. Rams, floor plates and vines travel
through charge and return over the first twelve rest ticks. Fire adds short
flashes or impact marks, followed by local dust, wisps, bubbles, frost,
settling payloads or cooling lamps. Animals keep their silhouettes and use
breathing, a raised neck, a drawn-back sting or a steady shark lining up;
the current strengthens its directional streamlines. Slow lamps, drips,
flakes and glints keep idle alive. Half-pixel jaw teeth track the moving base,
and fine sentry lamps follow the phase. Spin-up uses elapsed charge time so
a long-running level does not amplify the animation speed. Recovery is
suppressed while throttled, and an unfired fixture has no phantom discharge.
Shark body, fins and jaw are separate small drawings, preserving its outline.

**Checked.** `npm run check`, including `npm test`, passes; stamps are current
and the core files remain self-contained. No component pixel pins needed
updating. Hazard tests now check persistent early/late tells, distinct release,
quiet idle motion, recovery expiry, throttling, visual timing against Sim,
opacity restoration and no writes to world/hazard state at both resolutions
and both facing orientations. Seeded `Math.random` identically for old/new
renderers on all 118 hazard-free levels in 1–240, at ticks 0, 200, 500, 900 and
1600: all 1,180 res-1/res-2 frames byte-identical, including 350 with specials.
Reviewed the before/after contact sheet and enlarged res-1 crops for every
fixture. `/tmp/codex-hazards/sheet.png` has res-2 art enlarged with nearest
neighbour pixels: idle, early/late charge, fire, early/late rest; individual
crops, readable pages, scripts, baseline and check logs are alongside it.

**CRAP.** `npm run crap -- --changed`, with the cached tool copied locally;
every changed/new function is under 30, maximum `drawHzCurrent` 21.0.
New helpers: `hzLamp` 7.0, `hzPressure` 9.0, `hzImpact` 6.0, `hzStroke` and
`hzSwing` 4.0; shark body/fins/jaw 11.0/13.0/7.0, its dispatcher 8.0.
Full before/after reports against HEAD: functions over 30 fall from 41 to 40
across the repository, and from 8 to 7 in Draw (the former shark giant was
83.1). No existing over-30 count increases.

**Next.** Watch the tells and twelve-tick recovery in crowded colonies on the
panel and page before making the effects larger; retain the quiet idle.

*Reviewed and merged by the loop:* written by Codex (`codex/hazards`).
Before/after sheet: before, charge-early and charge-late were pixel-for-
pixel the same as idle on most kinds — the colony's tell was invisible to
the audience. After, every kind winds up visibly (the sentry's dotted aim
line, the dart trap loading, the gun's muzzle warming) and recovers with a
short afterglow. Codex's seeded check: 1,180 hazard-free frames identical.

## 64 — 2026-10-12 · A new hero: Rubber Duck

**Why.** The per-biome tally again: bombs are still among the top causes of
death everywhere, and most of them are the stall rules clearing an agent
that has been getting nowhere. Nothing on the board acts *before* that.

**Changed.** Sim: special `rubberduck` (act `debug`, own way down
`duckfloat`). On cooldown (150), a colleague on its floor within 18 cells
that is walking and past half its patience gets `forceEscape` now, instead of
at the end of its patience — the paid escapes the stall rules would hand
out anyway, sooner. Render-only `debugFx` / `debugFor`. Draw: it holds up a
rubber duck that bobs as it squeaks (rings off the duck), a "?" over the
colleague that turns to "!" when the escape lands; it floats down sat on an
inflatable duck. Ten fact lines for the sky card.

**Checked.** Paired on the 445 of the first 600 levels that roll a special,
same colony each way: its own special 91.37% home and 197 bomb deaths; the
duck in that slot 91.93% and 155; no special at all 91.65% and 186. It acts
0.84 times a level. Hero suit first yellow — vanished into its own duck;
now blue with yellow hair. Adding a special changes which one each level
rolls (pick over 22). `sim play` 96% / 88% (cleared 190 → 191). The gear
test pinned every special's res-1 pixels; it now pins the first 21, since the
list only grows at the end. Over 30: 41 → 39 (Codex's hazard work included).

**Next.** Deploy (hazard animation + duck).

**Deployed** after 64 (name="build" content="d26329ab"): hazard animation, Rubber Duck. Browser check clean.

## 65 — 2026-10-12 · The red team in motion

**Why.** Hostiles had fine kit at res 2 but mostly slid through patrols and
held the same pose through a shot. Their warning needs to read at panel scale,
including the ordinary gunner's eight-tick aim.

**Changed.** Draw only. Gunners, snipers, operators, xenos and the rival divers
lift alternate feet and bob while a planted foot keeps its floor line; falling
and jetting bodies tuck their legs. Drones and jetpacks hover in whole pixels.
Gunners raise and brace the pistol; sniper lasers now originate at the rifle
muzzle. All three shooters hold red muzzle brackets throughout aim, warm the
tip toward release, recoil two pixels then one, flash for three ticks and shed
short smoke or pressure bubbles through reload tick eleven. The sniper works
the bolt; harpooners keep their travelling spear and paying-out line. Divers
keep brass helmets and oxblood suits, with moving fins and half-pixel suit
straps/port glints. Operators press the controller and signal a replacement
launch; drones brighten the camera and bracket a close contact target. Xenos
keep the long green body and swinging tail, with opposing steps and a bared
jaw on pursuit. Small per-kind routines replace the giant enemy dispatcher.

**Checked.** `npm run check` and `npm test` pass; stamps are current and the
core files stay self-contained. Enemy tests cover every real state, both
facings/resolutions, underwater gunners, the half-pixel grid, planted feet,
body bob, hover, the actual Sim shot timings (8/36/46 ticks), recoil/recovery,
expired and abandoned shots, launch/pursuit tells, absent enemies, unspecified
panel resolution and no writes to enemy/world state. Enemy res-1 pixels change
intentionally; there were no enemy pins to update, and every existing non-enemy
pin passes unchanged. Seeded `Math.random` identically for old/new rendering
on enemy-free levels 1–11 at ticks 0/200/500/900/1600, both resolutions: all
110 frames byte-identical. Reviewed `/tmp/codex-enemies/sheet.png`, the res-2
before/after contact sheet enlarged with hard pixels, plus individual res-1
and res-2 sheets. Baseline, generation/comparison scripts and check logs are
alongside it.

**CRAP.** `npm run crap -- --changed`: every changed/new function is below 30,
maximum `drawSniper` 20.0; the former `drawEnemy` giant falls from 73.6 to 5.0.
Full reports against HEAD, using the cached tool copied locally: functions
over 30 fall from 39 to 37 across the repository, and from 7 to 6 in Draw.

**Next.** A timed defeat needs simulation evidence. `killEnemy`, `sinkEnemy`,
`stepEnemyFall` and `explodeDrone` leave `gone`/`dead`, counts or unlinked
particles, but no per-enemy death tick; Draw cannot date a defeat from those
without storing state. Sim remains untouched and gone enemies remain absent.
Watch the eight-tick gunner tell in crowded colonies before enlarging it.

*Reviewed and merged by the loop:* written by Codex (`codex/enemies`).
Rendered a gunner on level 13 through aim, fire and recover at res 2 myself:
a red dotted aim line, a muzzle flash with recoil, and the colleague hit now
plays its new death animation. Codex reported that a defeat animation needed
a death tick Sim did not record; `noteDeaths` now stamps `diedAt` / `diedBy`
on enemies too (render-only), for a follow-up.

## 66 — 2026-10-12 · The red team takes a bow

**Why.** Sim now leaves a render-only death tick and last-event hint on gone
enemies. Their disappearance can have the same comic punctuation as the colony's
deaths without giving Draw state or changing the game.

**Changed.** Draw only. One kind table dispatches 32-tick defeats at the enemy's
last position and facing: gunners knocked flat with rolling caps; snipers with
dropping, bouncing rifles; operators with sparking controllers that go dark;
xenos shrinking into a curled stump; rival divers and underwater gunners with
empty oxblood suits and brass helmets bobbing up through a burst of bubbles.
Shot-down drones tumble in crisp quarter turns trailing smoke, then pop;
contact strikes pop immediately. Mines scatter sparks, splashes shed bubbles
(a dry gunner leaves only its cap), and force pushes throw the defeat away from
its facing. Other events keep the kind's normal defeat, with a gunner fallback
for unknown kinds. Whole-pixel silhouettes at res 1, half-pixel kit at res 2;
the final ten ticks fade and tick 32 draws nothing. Sim is untouched.

**Checked.** `npm run check` (including `npm test`) passes; stamps and core
self-containment pass. New tests cover all six kinds at every age, both
facings, panel/page resolution, causes and unknown/prototype-name fallbacks,
changing poses, underwater gunners, drone impact versus shoot-down, expiry,
context restoration, no state writes, and actor dispatch of Sim's actual stamp.
The living renderer's unstamped-gone test now describes that narrower guard.
Seeded `Math.random` identically against HEAD: all 992 living-enemy poses
(all six kinds/states/facings/resolutions, dry and wet) and 1,198 full frames
across levels 1–120 at five ages are byte-identical. Two frames with recent
enemy deaths excluded; 188 compared frames contain living hostiles and 36
contain expired defeats. No whole-frame hashes added to tests. Reviewed
`/tmp/codex-defeats/sheet.png`: every kind, underwater gunner, cause variants,
eight ages including expiry, res 2 enlarged with hard pixels. Baseline,
comparison/review scripts and validation reports are alongside it.

**CRAP.** `npm run crap -- --changed`: every changed/new function below 30;
`drawActors` remains 24.7, new functions peak at `drawEnemyDefeat` 9.0.
Full before/after reports: over-30 count stays 37 across the repository and
6 in Draw. Used the cached tool copied into this worktree.

**Next.** Watch defeats among crowded colonies on the panel and page before
enlarging the kit or extending their window.
