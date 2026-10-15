# Biomes

Moved out of AGENTS.md: one section per biome. The Cloud (the twentieth) is described in LOG.md entries 263–267 and test/cloud.test.js.

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

## The Desert

The third biome with a mechanism. The rules live in the Wind block under
`walkStep`.

- **`w.wind` is a number, not a system** — the Trench's rule again. `windAt`
  sets it every tick from the tick and the level (no RNG, so nothing
  reshuffles), and exactly two things read it: `walkStep` (0.55x into a full
  gust, 1.45x with it) and the floater's drift in `stepFall`. `Draw.js` reads
  the same field for `drawGust`; it cannot call `windAt`.
- **Gusts alternate direction**, so a corridor is fought by one and helped by
  the next. Measured over 240 Desert levels × 6 colonies: 89.3% home with wind
  against 90.0% without, timeouts 5 against 1 — a mild tax on what was one of
  the easier biomes, not a wall.

## The Ruins

The boulder (`placeBoulder` … `shatterBoulder`, above `placeMission`). One per
Ruins level, on a corridor below the first, against its back wall; placed from
its own stream, so the rest of the level is unchanged.

- **It wakes on the first walker on its floor, not on a plate.** A plate a few
  strides from the corridor's start was crossed on 24 of 68 plays: the colony
  mostly arrives on a floor far along it, by a special or a dig. The rumble
  (`BOULDER_RUMBLE`) is the warning, and agents already run during it.
- **Only those going its way run** (iteration 92): turning everyone ahead to
  flee cost more than the boulder's own victims. 90.80 → 91.45% Ruins home.
- **It takes at most one.** It shatters on the first body, blocker, special,
  wall or edge it meets. Agents in `fall` are never hit — they land in front
  and get to run like everyone else. Before that rule, and before running in
  the rumble, it took 26 in 204 plays, most of them people who could not have
  seen it; after, 16, and Ruins home is 92.4% against 93.5% without it.
- Running is `ag.sprintUntil`, read by `walkStep` (`BOULDER_SPRINT`). Draw reads
  `w.boulder` for `drawBoulder`, in fixed sandstone colours: the biome's rock
  is the backdrop's colour.


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

## The Factory

Conveyors (`placeBelts`, `beltUnder`, above `placeMission`). Most corridors get
a belt of 10–18 cells on a flat open stretch, running either way; own RNG
stream, so the rest of the level is unchanged.

- **`w.beltAt` is one number per feet cell**, read by `walkStep` alone — the
  wind's rule, fixed in place instead of in time. 1.5x with it, 0.5x against.
  No belt where the floor under it is gone: `beltUnder` checks, and
  `drawBelts` makes the same test so nothing is drawn moving that does not
  carry.
- Measured over 240 Factory plays: 92.7% home with belts against 92.5%
  without, levels about 5% longer, timeouts 3 against 1. Walkers spend about
  15% of their walking time on a belt — it is seen, and it barely costs.

## The Ice Cave

Frozen colleagues (`placeFrozen` … `stepFrozen`, above `placeMission`). Up to
two per level, standing in the ice of a full-height wall obstacle; own RNG
stream.

- **They thaw when any cell of the body opens**, not just the feet: a basher
  off a ledge cuts the wall at head height. On thaw the body column is
  cleared, or they step out with their feet still in the wall.
- **A thawed colleague is released**: `toRelease` and `released` both go up,
  so the level-end and stall rules see them like anyone else, and a level can
  report twenty saved. `src/counter.js`'s cap of 90 still holds because the
  client seals a batch by saved count, not by level count.
- Measured over 240 Ice Cave plays: 282 placed, 105 thawed, 89 of those home;
  the original colony's saves went from 89.9% to 91.6%. Most stay in the ice
  — the colony goes round or over more walls than it goes through.

## The Spaceship

Transporters (`placePads`, `stepPads`, above `placeMission`). One pair per
level: a pad 10–16 cells into a corridor, its partner 8 cells into the next
corridor down. A walker on the first is beamed to the second; 10 ticks to
recharge. Own RNG stream.

- **Only ever downstream**, so it is a shortcut and never a trap; it refuses
  while either pad's floor is gone.
- **Near the start of its floor, not the middle.** Mid-floor it caught 1.9
  agents a level (most of the colony arrives by other routes or behind the
  recharge) and saved no time. Near the start: 6.3 a level, 93.1% home
  against 92.8% without, levels ~1.5% shorter (800 plays).

**Colleagues added mid-level are released.** The Ice Cave's thawed and Model
Collapse's copies both bump `toRelease` and `released`. Copies used not to,
so a level could report more home than it released — the play test caught it
on level 19 once the pads changed that level's run.

## Frost

Powder snow (`killingFall`, `POWDER_FALL`). In Frost a fall kills only past
`SAFE_FALL + 8`: the same number is read by the fall itself and by every edge
decision, so the colony steps off drops it would bridge or umbrella anywhere
else. Draw throws up a burst of snow on a long landing (`drawPowderBursts`).
Measured over 800 Frost plays: umbrellas spent 8.4 → 2.9 a level, splats
13 → 5, levels ~3% shorter, home 94.5 → 94.3% (noise). Tried before it and
reverted: thin ice over chasms (iteration 54) — it closed a route.

## The Cavern

Sinkholes (`placeSinkholes` … `stepSinkholes`). On 60% of corridors (not the
last), a three-cell crust over rock that runs solid down to the next
corridor's open air. The first walker on it opens the whole column: a drop
of one corridor gap — the handoff's drop, always survivable — and the shaft
stays for later arrivals to take or not. Own stream. Measured over 400
Cavern plays: 94.80% home with sinkholes vs 93.78%, levels ~5% shorter, no
change in fall deaths; 308 of ~676 opened.

## The Library

The thirteenth biome. `skinLibrary`: floor-to-ceiling stacks — uprights on a
pitch, shelf boards every third row, books between. Its mechanism is
`shelfClimb`: a wall of books is climbed without spending a climber. The
book cells are recorded in `w.shelves` at generation and the climb reads
that, never the material — materials are paint (`sim inert`), and the first
version, reading ORE, failed it. Measured over 400 Library plays: 94.19% home
with the free climb vs 93.77%, climbers spent 5.59 → 5.24 a level.
Adding it reshuffled every level number's biome; tests now find levels by
biome (`test/levels.js`, `levelWith`) instead of pinning numbers.

## The Mail Room

The fourteenth biome: a sorting office, pigeonholes in a 3×2 grid
(`skinMailRoom`). Its mechanism is pneumatic tubes — `placeTubes` reuses the
Spaceship's transporter rule (`placePads` with its own stream, pads marked
`tube`), and Draw gives a tube a brass pipe from intake to outlet and a
capsule with the agent in it. Measured over 400 plays: 94.03% home with
tubes vs 93.85%, 6.4 capsules a level.

## The Building Site

The fifteenth biome: a concrete frame going up (`skinBuildingSite`: ROCK
columns and slabs on a grid of bays, ORE cross-bracing, DIRT blockwork).
Palette `% 15`, hi-vis yellow. Its mechanism is gantry cranes (`placeCranes`
… `stepCrane`, `w.cranes`): over a hole in a corridor floor that runs straight
down to another corridor's floor, a hook lifts a walker and lowers them down
it. The rider's state is `"hooked"`, and the crane positions them.

- **Lower, don't carry over.** Carrying riders across the hole to its far side
  cost a point: the hole is the colony's way down, and the far side is where
  the guards are.
- **The rider keeps its direction.** Turning riders to the lower corridor's
  way cost 0.7 in condemned agents at its dead end. A faller keeps its way,
  and the routes are built around that.
- Measured neutral (94.02% vs 94.08%, 800 plays). It is there for the ride.

## The Clock Tower

The sixteenth biome: the works of a tower clock (`skinClockTower`: DIRT
blockwork with ten gear wheels set into it). Palette `% 16`, verdigris. Its
mechanism is clockwork gates (`placeGates` … `stepGates`, `w.gates`):
doorways through thin walls (≤3 cells) the colony meets, open 150 of every
240 ticks and steel otherwise. An agent at a shut gate turns and waits
(`waitFor`), and nobody bashes one.

- **Toggling writes cells directly.** It bumps `terrainVersion` (repaint)
  but not `carved`, which is the director's measure of progress. A clock
  ticking is not progress.
- **A gate never shuts on somebody standing in it** (`gateOccupied`).
- **The turn at a shut gate is counted**, so a patient agent can still give
  up and dig. Not counting it measured 0.2–0.5 worse.
- Measured +0.1/+0.2 against no gates (400 plays × 2), 0.45 fewer bashers a
  level.


## The Rooftops

The seventeenth biome: a terrace of houses at night in section
(`skinRooftops`: DIRT brick in courses, ROCK mortar every third row, ORE slate
roofs pitched over each house). Palette `% 17`, wet slate. Its mechanism is
lines (`placeZiplines` … `stepZiplines`, `w.ziplines`): strung lip to lip at
head height across every **crossing** pit. A walker under the near end hooks
its own closed umbrella over the line (state `"zip"`), rides across sagging
through the middle, and lets go walking the same way on the far side. No
toolbar cost; specials do not ride.

- **Only crossings.** A diagonal line down through a hole in a floor was the
  first idea; the holes between floors are one or two cells wide and a slant
  through one hits the slab (69 of 85 candidate holes blocked). Floor gaps are
  the colony's way down anyway.
- Measured neutral (94.7% vs 94.9% home over 240 Rooftops plays; 188 rides on
  60 levels). Like the crane, it is there for the ride.

## The Subway

The eighteenth biome: station walls in section (`skinSubway`: DIRT glazed
tiles on a ROCK grout grid, an ORE line-colour band every few rows). Palette
`% 18`, tile green. Its mechanism is a train (`placeTrains` … `stepTrains`,
`w.trains`, one at most): on the floor of the colony's route with the longest
walk (`trainLeg` traces hatch → each floor's first way down → the door), from
a platform just past where the colony comes in to one a few strides short of
where it leaves. It waits 45 ticks at the first, then runs; anybody walking
the line's way beside it gets on (state `"train"`, hidden), at the platform
or as it passes them; at the far platform they get off one at a time,
walking the same way, and it goes back empty at twice the speed.

- **Never past the way down.** The line ends before the floor's first hole to
  another corridor (`firstHoleAfter`): carrying riders over it would carry
  them off their route. Obstacle pits that are not a way down, the rails cross.
- **Where agents arrive is not where the plan says.** Platforms at the
  corridor start, the handoff, or the first hole each missed most of the
  colony; tracing the route and boarding on the move is what works (about
  45% of agents walking the stretch ride).
- Measured +0.25 (93.10% vs 92.85% home, 240 Subway plays), 0.4 s faster.

## The Harbour

The nineteenth biome: a quay wall in section (`skinHarbour`: DIRT dressed
stone in courses, ROCK mortar, ORE timber piles). Palette `% 19`, BRINE. Its
crossings are frequent (as on the Rooftops) and full of water to one row
under the quay (`cutPit`: `surfaceY = floorY + 1`). Its mechanism is a
**ferry** over each (`placeFerries`): the Subway's train on water — a
`w.trains` entry with `boat` and `pit` set, quay to quay — so boarding,
crossing and putting ashore are the train's rules exactly. Measured +0.4
(95.75% vs 95.32% home, 200 Harbour plays), no hangs.
