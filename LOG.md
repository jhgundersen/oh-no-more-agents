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
