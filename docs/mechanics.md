# Mechanics

Moved out of AGENTS.md: how a level is put together, umbrellas, fighting back, and the failures that produced no error at the time.

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
  with its own copy of the rule (`(level - 1) % 20` in `poolTint` and `biomeTint`)
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
- **Art pixels and canvas pixels are different things.** Draw.js works in art
  pixels (the board is `COLS × CELL` = 400×248 of them); `w.res`, set by the
  host, is canvas pixels per art pixel, applied once in `clearLayer`. The page
  sets 2, the Omarchy panel sets nothing and gets 1. Detail finer than one art
  pixel is drawn at half-pixel coordinates (0.5 steps) and only shows at
  res 2 — keep the silhouette readable at res 1. `npm run shot ... --res 2`
  renders the way the page does.
- **`w.doneHold` is host-provided, like `w.res`.** The page sets its finished
  level hold in ticks when creating a world. Draw uses the last 25 ticks for
  a closing wipe; a host that leaves it undefined (currently the Omarchy panel)
  gets the results plate without a closing wipe. The intro uses level ticks.
- **Animated scenery cannot live in `drawDecor`.** That runs inside
  `drawTerrain`, which only repaints on `terrainVersion`. Use `drawMachines`,
  called from `drawActors` — the per-tick pass every host already calls.


## One umbrella each

The FLOAT stock is where an agent's umbrella comes from, not a supply of
single-use chutes: the first fall that needs one takes it (`ag.ownBrolly`),
and the agent keeps it, folded, for every fall after. At res 2 a walker that
owns one carries it furled like a cane (`drawFurledBrolly`). When every
landing used the umbrella up, two cliffs on one level ran the stock dry and
10 of 13 splats in 300 levels came after that; keeping it took home 93.0% →
93.5% and levels under half home 7 → 3. Walkers also check their own
footing (`stepWalk` → `unsupported`): a walker whose floor is blown away
falls, and opens its umbrella if the drop would kill.

**Cloud Provider** (`provisionBrolly`, the 24th hero) is where umbrellas
come from without the stock: every `cool` ticks the nearest colleague on its
floor, within `PROVISION_REACH`, with no umbrella of its own gets one. Its way
down is a door-wide umbrella (gear `brolly`). Adding a hero re-picks the hero
on about 155 of 400 levels (`pick(rng, SPECIALS)`), which moves the overall
numbers by a few tenths either way; compare like with like.

## Fighting back

The red team (guard posts, `planGuard`: from level 3, `guardChance` 40% rising to 65% by level 100) is the
fight the game is named for. Three ways the colony answers it, each rolled
from stable state (ticks, ids) so none draws on a random stream:

- **Sidearm** (`regularSidearm`): one hurried shot, 15% to hit a walking
  guard. Drawn at res 2 as a visible round, a trail and sparks where it lands.
- **Umbrella parry** (`umbrellaParries`): a lethal round at an ordinary walker
  is stopped in its umbrella half the time, opened toward the gun. It costs a
  floater from the toolbar and holds for `BROLLY_HOLD` ticks, from that side
  only. Red-team deaths 293 → 207 over 600 plays.
- **Brawl** (`stepBrawl`): a walker meeting a guard on its floor scuffles
  with it for `BRAWL_TICKS`; 50% alone, +15% per colleague within four cells
  (up to three). Both are drawn as one cartoon fight cloud.

- **The Bouncer** (`bouncerThrows`): a gunless post (15% of posts) that
  walks its stretch of corridor. A scuffle lost to it throws the agent back
  three cells, stunned but alive; it takes `BOUNCER_HP` 3 scuffles won, at
  the brawl odds minus `BOUNCER_EDGE` 20, so the colony beats it by bunching
  up. About two throws a level, put down in 10 of 18, nobody killed by it.
- **The Moderator** (`bossLevel`): every seventh level (not the Trench) the
  post is one crowned gunner with `BOSS_HP` 3; any hit — round, scuffle,
  ricochet — only staggers it (`staggerBoss`) until the last. Those levels
  sit near 84% home against 93% overall: the climax, on purpose.
  Every other boss level (14, 28 …) it is the **Head Bouncer** instead: a
  Bouncer with `HEAD_BOUNCER_HP` 5, crowned; it kills nobody and holds the
  door (95% home). `w.bossName` names whichever it is.
- **Backup** (`reinforcementsFor`, `callBackup`): the difficulty ramp. From
  level `BACKUP_FROM` 15 an ordinary post (never a boss) may have one or two
  sidearm guards in reserve, certain by level 135. The first guard down
  calls them, arriving `BACKUP_DELAY` 90 ticks later; if nobody falls they
  are called at `BACKUP_DEADLINE` 420. A red lamp flashes on the booth while
  they are on the way (`drawBackupLamp`). Deep guard levels went from 95.0%
  to 90.3% home, with twice the guards downed. It has its own RNG stream:
  keep it that way so levels before the ramp play exactly as they did.

The report card's battle line counts guards down and umbrella saves, and
names the boss when it falls; the MVP line names the agent who did most.


## What breaks quietly

Failures that have actually happened here. None produced an error at the time.

- **Most gaps are the colony's way down.** Anything that acts at *every* gap
  costs: paving it (Auto Complete), leaping it (Speculative Decoder, Model
  Collapse), carrying riders over it (the first crane), or icing it over
  (thin ice). Make such moves at lethal drops only (`depth > killingFall(w)`),
  and before a hero's own height move, which otherwise takes every lethal
  drop first (iterations 54, 98, 102, 103).

- **The core files must never call each other.** `Sim.js`, `Draw.js`,
  `Palette.js` and `Outcome.js` carry no imports, which is what lets identical
  files run in a browser and in the Omarchy plugin's QML engine. In a browser they share one
  global scope, so a cross-file call resolves and looks correct; in QML each file
  is its own scope and the same call throws at runtime — `Draw.js` calling
  `specialSpec()` drew **no agents at all** in the plugin on every level with a
  special. Anything one file needs from another travels on the world object (see
  `w.k`, `w.specialSpec`). `tools/check-core-refs.js` enforces this, and also
  catches the mirror-image failure of one name declared in two files.
- **A period that shares a factor with the biome count skips biomes.** The
  biome is `(level - 1) % BIOMES.length`, so anything every N levels lands
  only in the biomes N steps reach. Bosses every 8 with 18 biomes only ever
  visited the odd nine (iteration 158); `BOSS_EVERY` 7 visits all. Check
  `gcd(N, BIOMES.length) === 1` whenever either changes.
- **A second declaration in the same file silently wins.** `check-core-refs`
  catches a name declared in two core files, not twice in one. Splitting
  `stepFall` once named a helper `fallSpeed`, which `stepBomb` already used.
  Grep for `^function name(` before adding one.
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
- **`obstructionAhead` measures to the first column you could stand in**,
  level or a step up (`standable`). It counted any solid cell in the body's
  height, so a raised floor beyond a block read as wall to the exit, too deep
  to blast, and the colony was bombed by the loop rule instead (level 569:
  0/18 home before, 17/18 after).
- **A digger checks the drop before the last stroke** (`digOpensDeath`). It used
  to break through any floor and fall: over the deep soft fill of the Desert
  that was more than half its fall deaths (52 of 1200 plays; 9 after). It
  stops only with no umbrella in hand or on the toolbar — with one, the fall
  code takes it on the way down, as it always did.
- **Changing how much RNG a generation step consumes reshuffles every level.**
  Levels are a pure function of their number, so one added `rng()` call early
  changes the whole catalogue. Before/after clear rates across such a change are
  not like-for-like; isolate by disabling the new behaviour instead. Changing the
  length of `BIOMES` does the same thing — run the sweep a second time with
  `BIOMES` and `Palette`'s modulus reverted to the old count.

- **Some tests pin res-1 pixels of one component** (poses in
  `agents.test.js`, exits, backdrops, gear): the guard that half-pixel work
  never touches the Omarchy panel. Change res-1 art on purpose and you update
  those hashes on purpose. Never pin a whole frame — every later change to
  anything on the board breaks it (the deaths test did, on the first new
  feature after it).
- **Frames are not deterministic run to run**: Sim uses `Math.random` for
  particles and blood. To compare two renderers, seed `Math.random` the same
  way for both from the same world state.
