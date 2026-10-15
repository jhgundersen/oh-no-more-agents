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

## Entries 1–149, in brief

Archived in `docs/log-archive.md` (git keeps the full history too). Over
2026-10-09 to 10-14 the loop built the tooling first: the CRAP report, smoke
tests, `npm run shots` and the art and playtest harnesses. Then it built the
game the later entries take for granted: thirteen biomes with their skins and
mechanisms (vines, the boulder, belts, the frozen, pads, chains, sinkholes,
tubes, cranes, gates and the rest), page-resolution art, the far walls, traits
and specials (heroes), the red team and bosses (the Bouncer among them),
missions and events, umbrellas as parries, and the sound layer. It also tuned
the colony's rules against the play-tests until most levels clear. Read the
archive when an old rule's reasoning matters.

## 150 — 2026-10-14 · Station chime, line zing — and the sound layer under test

The newer mechanisms were silent. With sound on (117): a two-tone station
chime when the train's doors open (wait or drop), and a rising zing when
somebody hooks onto a Rooftops line. And `public/agents/sfx.js` had no tests
at all: `test/sfx.test.js` loads it into a sandbox with a stand-in
AudioContext and checks that nothing plays while it is off, that each of ten
changes in a world (home, down, boom, umbrella save, umbrella opening, doors,
line, throw, scuffle, level over) plays something, and that moving to a new
world plays nothing for the difference. Tests 747.

## 151 — 2026-10-14 · The red team takes more interest

Nothing about a level changed with how far the colony had come: level 300
played like level 30. Guard posts now ramp — `guardChance`: 40% plus a
quarter-point a level, capped at 65% from level 100 (the boss levels are
unaffected; the roll is the same draw, so only which levels have a post
moves).

**Measured** (levels by band, one colony each, before → after):

| levels | posts | home |
|---|---|---|
| 1–50 | 46 → 50% | 92.6 → 92.8% |
| 51–100 | 46 → 64% | 95.3 → 94.6% |
| 101–200 | 48 → 68% | 95.4 → 95.1% |
| 201–300 | 45 → 67% | 96.3 → 96.3% |

More fights deeper into a session, at almost no cost — the colony now has
answers to a post (parries, brawls, ricochets). Later levels were already
the easier ones. `npm run sim`: 100% / 94%, hangs 0. Tests 747.

(Also considered: a colour per agent's tie. Rejected — black suit, black tie
is the colony's look.)

**Deployed** after 151 (name="build" content="89e81c20"): station chime and line zing, the guard ramp. Browser check clean.

## 152 — 2026-10-14 · Checked in a real browser

After a run of new mechanics (bosses, Bouncers, Rooftops lines, the Subway,
sound), the page itself, played rather than simulated:

- **Why are later levels easier?** (151: 92.6% home in 1–50, 96% past 200.)
  Colony size, corridors, toolbar and time limit are flat across bands; only
  fixed hazards fall (0.36 → 0.23 a level) as guard posts, which replace
  them, rise. The rest is level-to-level variance. Nothing to fix.
- **Soak:** the local build in headless Chromium for 2.5 and 3.3 minutes from
  level 1 — levels advanced, the home counter climbed, no exceptions.
- **The new content in the page:** level 8 (the Moderator, Factory), 13 (a
  Bouncer; it finished and moved on to 14 inside 25 s), 17 (Rooftops) and
  36 (Subway), set through localStorage and played 25 s each at Brisk: no
  exceptions.

No code change.

## 153 — 2026-10-14 · The ticker

Nobody is playing; somebody is watching, and a lot of what happens in a fight
is too small or too quick to follow. The board now says what just happened:
Sim notes the moments worth telling (`feedNote`, bookkeeping only; fingerprint
unchanged) and Draw spells the newest one along the bedrock at the foot of
the board for five seconds, flashing white as it arrives and fading at the
end — "AGENT 012 · UMBRELLA SAVE", "AGENT 017 · GUARD DOWN", "THE BOUNCER
THROWS AGENT 009 OUT", "THE MODERATOR IS DOWN", a hero by name when it wins a
scuffle. Agents are numbered (`agentTag`), as the MVP line numbers them.

What gets a line, over levels 3–120: umbrella saves 27, scuffles won 22,
guards shot down 20, blows landed on a boss or Bouncer 9, drones down 8,
ricochets 8, Bouncer throws 8, scuffles lost 8, the Moderator down 4. Page
resolution only (the panel has no room for prose). Looked at level 13 at the
moment of a throw. Tests 748.

## 154 — 2026-10-14 · More for the ticker

Two more moments get a line: the first agent through the door ("AGENT 003 IS
FIRST HOME", or a hero by name) and a Subway train pulling out with riders
("THE TRAIN LEAVES WITH 5 AGENTS"). Fingerprint unchanged. Tests 748.

**Deployed** after 154 (name="build" content="39ceba9e"): the ticker. Browser check clean.

## 155 — 2026-10-14 · Quips

The game talks dev already (hazards called Edge Cases and Memory Leak, a boss
called The Moderator, a booth sign that says BUILD FAILED). Now the agents do,
for a moment each: a white pixel speech bubble over the head — "LGTM" up out
of a won scuffle, "429" thrown out by the Bouncer, "NOPE" as the umbrella
stops a round. One per agent, the newest, 36 ticks, fading; page resolution
only; drawn from stamps Sim already keeps (`wonAt`, `thrownAt`, `brollyFor`).
Looked at level 5 (LGTM), 13 (429) and 24 (NOPE). Over a low ceiling the
bubble sits over the rock above, like a comic's would. Tests 749.

## 156 — 2026-10-14 · The Head Bouncer

Every boss level was the Moderator. Now they alternate: 8, 24, 40 … the
Moderator; 16, 32, 48 … **the Head Bouncer** — a Bouncer (122/142: no gun,
throws agents out, beaten by a crowd) that takes five scuffles won
(`HEAD_BOUNCER_HP`), drawn with the Moderator's gold: a crown on the shaved
head, a chain across the jacket, five pips. `w.bossName` carries the name to
the intro warning, the battle line and the ticker.

**Measured** (72 boss-level plays, levels 8–320 × 2): Moderator levels 88.8%
home, down in 16 of 36; Head Bouncer levels 95.0% home, down in 10 of 36 —
it kills nobody, it holds the door. Two different climaxes: a gunfight to
survive, and a crowd to push through. Looked at level 16 (Clock Tower).
Tests 750.

## 157 — 2026-10-14 · The red team answers back

The quips (155) went one way. Now a Bouncer says "NOT TONIGHT" as it throws
somebody out, and the Moderator "BANNED" when its round lands, in the same
pixel bubble with red-team lettering — drawn over the fight cloud too, since
a Bouncer is usually straight into its next scuffle. Sim stamps `threwAt` and
`killedAt` for it (bookkeeping; fingerprint unchanged). Looked at level 13:
"NOT TONIGHT" in red beside the thrown agent's "429". AGENTS.md gains the
Head Bouncer. Tests 751.

**Deployed** after 157 (name="build" content="b8502088"): quips both ways, the Head Bouncer. Browser check clean.

## 158 — 2026-10-14 · Bosses everywhere, not in half the biomes

**Looked at first:** three whole frames of a busy guard level (13) with all
the new overlay — ticker, quips both ways, a fight cloud, sparks. It reads:
each overlay is local and small, and the ticker sits on the bedrock. Then the
biomes by home rate: Ruins lowest (87%), and its deaths were 80% red team —
a quarter of the Ruins levels sampled were boss levels.

**The bug:** bosses came every 8th level and there are 18 biomes. 8 and 18
share a factor, so boss levels only ever landed in the 9 odd-numbered biomes
(Ruins, Foundry, Ice Cave, Factory, Data Center, Mail Room, Clock Tower,
Subway; the Trench is skipped), each on one level in four — and never in the
other nine. **`BOSS_EVERY` is 7** now: coprime with 18, so the bosses rotate
through every biome (Moderator on 7, 21, 35 …; Head Bouncer on 14, 28 …).

Ruins is still lowest after the change (86% over 15 levels — its gun-pair
posts, not its bosses; noted for later). `npm run sim`: 99% / 94%, hangs 0.
The Moderator art test pinned level 8's timeline; it now finds a level where
the Moderator falls and checks around that. Tests 751.

## 159 — 2026-10-14 · Hats on the floor

**Checked, no change:** two-gunner posts by biome. Ruins (2.2 deaths a play)
and Rooftops (3.0) sit above the rest (~1.3), on samples of 9 and 4 levels;
no mechanism found. Variance until a bigger sample says otherwise.

**Change:** the death poses last a second; after that an agent was simply
gone. Now its hat stays on the floor where it fell for ten seconds, fading
out over the last two (`drawFallenHat`) — only on ground (nothing is left of
a fall out of the world or a drowning), only at page resolution. A level
remembers what it cost, where it cost it, without saying so in words. Looked
at level 6 after a drone strike: dark and small, as a reminder should be.
Tests 752.

**Deployed** after 159 (name="build" content="ddc6b5e4"): bosses in every biome, hats on the floor. Browser check clean.

**Mistake in the deploy above:** it went out with three tests failing — the
deploy command was chained after `npm run check` without stopping on its
result. Two death-pose tests draw from a mock world with no terrain, and
`drawFallenHat` read `w.terrain` unguarded (the real game always has terrain,
so the live page was not affected); my own hat test put its agent on an
unsuitable cell. Fixed (a guard; the test uses `padSpot`), checks green, and
redeployed below with the deploy gated on `npm run check` passing. From here
the deploy step runs only after a passing check.

**Deployed** (fix) (name="build" content="31dbb3f0"): checks green. Browser check clean.

## 160 — 2026-10-14 · Floating through a bridge

Rooftops deaths by cause, 120 plays: red team 79, boom 20, **fell 13** — out
of the bottom of the world, through the bottomless crossings that 126 made
common there. Twelve of the thirteen were floating on their umbrellas when
they went, and most had stepped off the *top* corridor at one column and
floated forty rows straight down.

**The bug:** a bridge across a crossing is laid on the pit's lip row. The
landing scan (`fallLands`) treated everything at or below the lip as debris
in a bottomless shaft — the rule from the level-13 fix, where bricks deep in
a pit had become a floor at row 61. So the decision to step off counted the
bridge as ground far below (a long drop: open the umbrella), and the fall
then sank straight through it. Walkers on the bridge were never affected.

**Fix:** the lip row itself is a floor (`yy > shaft.floorY` is debris, not
`>=`), in `fallLands` and in `stepEnemyFall` alike. A regression test drops
an umbrella onto a bridge at the lip (lands) and onto debris below it (does
not), and fails on the old rule.

**Measured:** Rooftops falls 13 → 9, home 92.54 → 92.76% (120 plays); all
guard-post levels 93.1 → 93.4%, all 480 plays 94.23 → 94.61%. `npm run sim`
99% / 94%, hangs 0. Tests 753.

**Deployed** after 160 (name="build" content="d97d0b09"), gated on a passing check: the bridge fix. Browser check clean.

## 161 — 2026-10-14 · Death causes, and the umbrella folds

**Checked, no change:** death causes over 300 levels — 179 lost of 4,521:
red team 101, bombs 31 (all bombers themselves, 15 of them condemned; 8
bystanders over 300 levels), drone strikes 20, hazards 12, falls 8, out of
the world 6. Nothing like 160's bridge left in it.

**Considered, not built:** a nineteenth biome, the Airport, with moving
walkways — but a walkway is the Factory's belt pointed the right way, and a
biome should bring something of its own.

**Change:** a floater that touched down had its open umbrella simply
vanish. Now it folds: over eight ticks the canopy narrows to a furled point
on its shaft and is gone (`drawUmbrellaFolding`, page resolution; Sim stamps
`brollyClosedAt` at the landing — bookkeeping, fingerprint unchanged).
Looked at level 2's landing at ticks 248–258. Tests 754.

## 162 — 2026-10-14 · The Harbour (on a branch)

A nineteenth biome that reuses a proven mechanism rather than copying an old
one. Every Harbour crossing is a dock — water up to one row under the quay —
and a ferry works it: the Subway's train (148), as a `w.trains` entry with
`boat` set, quay to quay over the one stretch of the route that has no floor.
Crossings come as often as on the Rooftops (the roll passes at 0.15).

**Measured** (200 Harbour plays): 95.75% home with ferries vs 95.32% without,
38.3 s a level, no hangs; ferries on 33 of 40 levels, about three riders a
level (the rest bridge it, as before). 19 biomes: `BOSS_EVERY` 7 is still
coprime. Biome wiring as before (mission "SEE THE PASSENGERS ASHORE", events
Sea Fog / High Water / Dock Strike, Palette `% 19` with BRINE, pool tint
water). Tests `test/ferries.test.js`; the art tests fail until Codex draws it.

## 163 — 2026-10-14 · The Harbour comes into view

**Change:** Draw-only Harbour art: dusk cranes, containers and masts, a
lighthouse with a turning beam, wheeling gulls, drifting fog and spray.
Dressed stone follows the existing courses; timber has continuous grain and
iron bands. Quay furniture is bollards and rope coils, crates, lobster pots,
lamps, life rings and nets. The harbour-master's exit and PORT AUTHORITY booth
finish the port; Sea Fog, High Water and Dock Strike have their visual mirrors.
Crossings catch the light, swell gently and occasionally show a fish.

The ferry is a cream-and-green launch, with a stepped hull, wheelhouse,
funnel smoke, life ring and lit portholes showing its passengers. Its gangway
comes down at either quay, its hull bobs on the actual sea surface, and moving
boats leave foam and a wake. Water draws first, then the boat, then walkers;
quay stone occludes the hull. Neither Sim.js nor Palette.js changed.

**Checked:** `npm run check` and `npm run crap` pass. Six new component tests
cover both resolutions and every ferry phase, passengers, gangways, wake
bounds, foreground occlusion and read-only drawing; the Subway tests now find
its layouts under the nineteen-biome catalogue. Metro component bytes are
unchanged. Seeded old/new Draw comparison: **1,080 identical frames** across
the other eighteen biomes, Subway included (two layouts, three tick checkpoints,
five themes, res 1 and 2). No whole-frame test pins. CRAP at or above 30:
**0 → 0**, maximum **29.0 → 28.5**; the shared waterline was extracted to keep
the pool function below 30.

**Looked:** actual play on levels 19, 38 and 57, res 1 and 2 enlarged; the
ferry waiting, crossing with one/three passengers and putting them ashore.
Contact sheet `/tmp/codex-harbour/sheet.png`, with enlarged ferry crops beside it.

**Measured:** res-2 software rasteriser, levels 19 (Harbour) and 18 (Subway) at
476 ticks, warmed, median of nine batches of forty frames: actor pass
**2.47 vs 2.64 ms**, full terrain + actors **21.23 vs 31.82 ms**. The terrain
pass is cached during ordinary play; these are Node raster times, not browser FPS.

**Next:** broader Harbour play before any ferry tuning. Committed on the
Harbour branch only; no push or deployment.

Reviewed and merged by the loop. Level 19 at ticks 440–480: the quay and
dusk harbour read, and so does the ferry, with three fixes in review. Sim's
ferry waits at platforms on the quay itself, so it was drawn beached on the
stone: the hull is now kept within the dock's water (moored, not beached).
White life rings hung on every net and every lamp — the Rooftops' white
washing again — now on one net in three and no lamps. The ticker said "THE
TRAIN LEAVES" for a boat; it says FERRY. 775 tests pass; nothing over CRAP 30.


**Deployed** after 163 (name="build" content="7d8bd9e9"), gated on a passing check: the Harbour and its ferry, the folding umbrella. Browser check clean. (The first attempt never ran: the Harbour review commit had picked up the worktree's node_modules symlink, the merge turned main's node_modules into a link to itself, and npm died with exit 216. The link is untracked and ignored now.)

## 164 — 2026-10-14 · Backup

**Problem:** no difficulty curve. Over 400 levels home ran 93–97% in every
band of fifty; level 400 was as easy as level 1. For a game about fighting
your way home, nothing got harder the further they got.

**Measured first:** the red team does most of the killing (101 of 179 deaths
in 161's survey). On guard levels, adding sidearm guards at the start gave
94.8% → 90.4% (+1), 88.6% (+2), 86.5% (+3) home.

**Change:** backup. From level 15 an ordinary post (never a boss) may hold
one or two guards in reserve; the chance rises until by level 135 every post
has one and half have two. The first guard down radios for them and they
walk out of the booth 90 ticks later; if nobody falls they are called at
tick 420 anyway. First try (delay 120, deadline 900) barely moved anything:
the colony was home before backup came. The ticker says "BACKUP ARRIVES AT
THE GUARD POST"; while backup is on its way a red lamp flashes on the booth
wall, with ")))" signal rings off both walls at res 2 (looked at level 125,
ticks 253–330: lamp, rings, then two guards jetting straight at the fight).

**Result** (levels 120–320, three colonies, guard levels only, 345 plays):
home 95.0% → 90.3%, guards downed per level 0.70 → 1.59, failed levels 2 → 4.
More fighting on screen, still rarely a lost level. Own RNG stream; levels
1–60 compared old against new: 58 identical, the two that differ are past
level 15 with backup. Tests 780 (`test/backup.test.js`); nothing over CRAP 30.

**Next:** watch a deep level in the browser for how backup feels at speed.

## 165 — 2026-10-14 · Backup, seen in the browser

**Looked:** level 125 in headless Chromium at the page's own speed, a frame
every four seconds. The ticker reads "BACKUP ARRIVES AT THE GUARD POST", two
red guards drop out of the booth and jet into the colony, and the last fight
happens at the exit door (LGTM, a scuffle won). No console errors. No change
needed.

**Deployed** after 165 (name="build" content="903ae7e8"), gated on a passing
check (780 tests): backup at deeper guard posts.

## 166 — 2026-10-14 · Two steps are one too many

**Survey:** death causes per biome over 380 levels × 2 colonies. The Harbour
stood out with 29 "boom" deaths (others 1–14), and 28 of them were one level:
228, a total wipe in both colonies. Every level that fails all three of the
page's attempts, 1–400: just 20 (10/15, a guard level, fine) and 228 (2/18).

**Cause:** a step costs every agent a climber of its own. 228 has one on the
top floor, which used all 14 climbers, then another on the exit floor, which
has no chasm to skip it. The ferry put the colony ashore one cell from that
second step, and with no climbers they rode back and forth until the stall
rules bombed them and the timer took the rest.

**Tried and dropped:**
- Not resetting `idle` on a ferry ride: no change; the rescue only hands out
  bashers, and the bashers were gone too.
- Backing off two cells to build a staircase: a staircase rises one row per
  four to six cells, so it can never top a six-high step. Reverted.

**Change:** the exit floor gets no step if an earlier floor already has one;
it becomes a wall, which one bash opens for everybody (`stepEarlier`).
`rng()` burns the step's second draw, so the rest of the level is unchanged.
Terrain differs on 7 of 400 levels.

**Measured** (400 levels × 2 colonies): home 92.52% → 92.92%; levels under
half home 10 → 7 (228 and 363 no longer). Level 228 goes 18/18 in four
colonies where it got 1–4. Tests 782 (`test/steps.test.js`); nothing over
CRAP 30.

## 167 — 2026-10-14 · Drips

Three gameplay iterations in a row; this one is for the umbrella.

**Considered, dropped:** rain. Every biome is a cross-section with a ceiling:
walkers are under open sky 1–12% of the time, mostly about 2%.

**Change (Draw only, page resolution only):** drips. In the wet biomes
(Cavern, Harbour, Subway, Jungle, Ice Cave) about one column in eleven has a
crack in its first ceiling. A bead gathers there and lets go every three or
four seconds, falls (accelerating) and splashes on the floor. A walker under
it puts its umbrella up overhead just before the drop lets go and keeps it
up through the splash, and the drop splashes on the canopy rather than the
floor. Everything comes from the terrain, the level number and the clock: no
RNG, nothing stored on the world, nothing on the panel at res 1. In a
six-row corridor the canopy is level with the crack, so the drop lands on it
almost at once — the umbrella going up is the moment.

**Looked:** levels 1, 18 and 19 at res 2, enlarged: three walkers under
umbrellas, a drop mid-fall and its splash; level 19 in headless Chromium,
umbrellas going up on the quay, no console errors. Tests 785
(`test/drips.test.js`: only wet biomes and res 2, cracks from the terrain
alone, up for part of the cycle and only under the crack, read-only, no RNG,
half-pixel grid). Nothing over CRAP 30.

**Deployed** after 167 (name="build" content="1e9adfad"), gated on a passing check (785 tests): no second step on the exit floor (166) and drips (167). Browser check clean.

## 168 — 2026-10-14 · Walking on air

**Hunted:** the levels still under half home (47, 113, 169, 267, 284, 331).
On 284, three agents were bombed at once at tick ~520, idle only 130–196:
not the patience rule but the still-in-one-cell one. They were in `walk`
over open air, turning every tick on the spot. A charge had taken the ledge
out from under them, and `advanceWalk` only ever looks at the cell ahead —
open both ways, so a cliff edge both ways, so turn. Blockers, campers, the
stunned and lit bombs all check their footing; walkers never did.

**Measured, old code:** walkers in mid-air on 128 of 300 levels (1,699
agent-ticks; mostly brief, floors dug or blown from under them).

**Change:** `stepWalk` starts with the footing check the other states have,
falling with `beginUncontrolledFall`, which opens an umbrella if the drop
would kill and the colony has one.

**Consequence:** the hop (`canJump` / `stepJump`, a jump after 40 ticks in one
cell) never fired again: 0 jumps in 200 levels. Its only trigger in practice
had been this bug. Removed it, its constants, its Draw pose and its label.
The panel-pixel pin in `test/agents.test.js` was recomputed for the poses
that remain under both the old and the new Draw, and the two hashes matched
before the pin was updated.

**Result** (400 levels × 2 colonies): home 92.92% → 93.03%, ticks per level
1250 → 1238. 169 back above half, 79 and one 284 colony below; 284 itself is
not fixed (the colony falls now, but there are no umbrellas left).
Tests 787 (`test/footing.test.js`); nothing over CRAP 30.

## 169 — 2026-10-14 · One umbrella each

The page says "one umbrella each". The game said one umbrella per fall: the
FLOAT stock paid for every deadly drop and the landing used it up.

**Measured first** (300 levels): the stock ran dry on 23 levels, and 10 of
the 13 splats came after it had (levels 37, 112, 113, 149, 284) — two cliffs
on one level, every agent paying twice.

**Change:** the first fall that needs an umbrella takes one from the stock
(`ag.ownBrolly`); after that the agent keeps it and opens the same one. At
res 2 a walker that owns one carries it furled in the leading hand like a
cane, its tip tapping the floor every other stride (`drawFurledBrolly`; they
are men in suits — it was always going to be a cane). Looked at level 2
enlarged, three nudges to get the crook on the hand and the canopy clear of
the sleeve, then in headless Chromium: canes on the floor below, no errors.

**Result** (400 levels × 2 colonies): home 93.01% → 93.53%; levels under half
home 7 → 3 (113 and both 284 colonies recover). Tests 791
(`test/brolly-kept.test.js`: one take per owner, floats on an empty stock
with its own, carried at res 2 only, panel unchanged). Nothing over CRAP 30.

**Next:** the umbrella parry still takes from the stock even when the agent
has an umbrella in its hand.

**Deployed** after 169 (name="build" content="8127c564"), gated on a passing check (791 tests): walkers fall when the floor goes (168), one umbrella each (169). Browser check clean.

## 170 — 2026-10-14 · The parry uses your own umbrella

169 left the umbrella parry and the overhead guard taking from the stock even
for an agent with its own umbrella in hand. Now every use — a fall, a parry,
a guard — goes through one rule (`brollyInHand`): your own if you have had
one, else one from the stock, which you keep.

**Measured** (levels 3–300): 55 umbrella saves either way, umbrellas drawn per
level 6.43 → 6.36, home and under-half levels identical over 400 × 2. Parries
are rare and mostly come before an agent owns one, so this is a consistency
fix, not a balance change. Tests 792.

(The first commit of 170 went in with its new test failing: the test picked "another agent" when only one had been released. Fixed in the next commit; nothing was deployed in between. Commit only behind a passing check.)

## 171 — 2026-10-14 · Looking at the board

**Looked:** levels 41–43 in headless Chromium through a whole level, and one
of every biome at res 2 (`shoot.js biomes`). Most biomes read at a glance;
the Foundry is the blandest by a distance — dark grey stone, embers too
small to see, one lava pool in a corner. For the biome that should be the
hottest on the board, nothing says heat.

**Started:** Foundry art on branch `codex/foundry` (Codex, brief in the
scratchpad): warm underglow, molten seams, furnace silhouettes, sparks,
shimmer — Draw only, res 2 only, every other biome byte-identical. To be
reviewed and merged by the loop.

## 172 — 2026-10-14 · Iron and fire in the Foundry (on a branch)

**Why:** level 4 was grey stone with pinpricks of ember and a lava pool in
the corner. The Foundry needed to read as an ironworks even without a pool.

**Change:** Draw-only, res 2 and above: refractory brick courses, riveted iron
jackets, warm floor lips and lava-lit pit faces. The back wall has tapered
furnaces with tapping arches, overhead ladles and rows of ingot moulds, against
a stepped heat wash that strengthens below. Ladles pour intermittently, sparks
fall and fade, sparse molten seams pulse through surviving earth, and rising
embers have orange tails and pale cores. Heat colours are fixed in Draw rather
than borrowing the theme's hostile red. The exit and hoist chains retain their
existing art. No Palette, Sim or Outcome changes.

Static machinery and floor light use the terrain cache. Only pours, sparks,
seams and embers animate; their clocks and positions come from ticks, level
and coordinates, with no RNG or world writes. Pours clip against current
terrain, seams refuse air and steel, and every effect precedes the actors.

**Checked:** `npm run stamp`, `npm run check` and `npm run crap`. Seven new
component tests cover read-only proxies, forbidden Math.random, deterministic
pixels, context restoration, half-pixel geometry, cache independence from time,
pour phases and occlusion, seam pulses, actor layering and panel component
bytes. CRAP at or above 30: **0**; maximum **28.5**, new functions at most
**9.0**. Seeded old/new comparison over all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2); Foundry's **60** res-1/unspecified-res frames also identical, and all
**30** res-2 frames changed. Saved baseline and comparison harness in
`/tmp/codex-foundry/`.

**Looked:** before/after levels 4, 23 and 42 at ticks 77 and 476, plus enlarged
machinery/actor crops: `/tmp/codex-foundry/sheet.png`. The first furnace mouths
were too dim; raised their contrast and added light spilling onto the near
floors. Also inspected level 4 in all five themes. Faces, umbrellas, the
Moderator and the exit remain distinct from the orange machinery.

**Measured:** warmed res-2 software rasteriser, tick 476, median of nine batches
of forty frames, old → new. Level 4: actors **1.640 → 1.723 ms**, full terrain
+ actors **11.953 → 19.754 ms**. Level 42: actors **2.144 → 2.293 ms**, full
**15.571 → 26.447 ms**. Subway control, level 18: actors **2.645 → 2.651 ms**,
full **31.520 → 31.483 ms**. Terrain is cached in ordinary play; these are
Node raster times, not browser FPS.

**Next:** review the Foundry's heat in longer play. Committed on
`codex/foundry` only; no push or deployment.

Reviewed and merged by the loop. Level 4 at tick 300, enlarged, against
main: iron-brown courses, lit furnace mouths, the ladle rail and sparks all
read, and the agents, umbrellas and hero stay distinct from the orange. The
cyan marks by the furnace on level 4 are a hero's effect that was there
before. One weakness kept for later: the same furnace-and-ladle stamp appears
three or four times a level, so a long Foundry level repeats itself.

**Deployed** after 172 (name="build" content="eadab782"), gated on a passing check (799 tests): the Foundry art, parries with your own umbrella. Browser check of level 4 clean.

## 173 — 2026-10-14 · Three more sounds; the Cavern on a branch

**Started:** Cavern art on branch `codex/cavern` (Codex). Level 1 is the first
thing anybody sees, and next to the new Foundry it is flat blue blocks.

**Looked, no change:** level 331, colony 2048, 0/15 home. The exit floor has
one four-high pillar; by then the colony has spent its 12 climbers and 3
bashers on the floors above, and nothing else answers a pillar. Same family
as 228 (166). With 3 of 400 levels under half home and the page moving on
after three attempts, a level the colony loses now and then is part of the
game; stopping the hunt here.

**Change (sfx.js):** three events the world names outright now have a cue:
a boss taking a hit (a metallic clang), backup on its way (radio squelch and
two beeps, 164), a mission done (three rising notes). Still off by default.
Tests 800.

Cavern review (on `codex/cavern`): **rejected as drawn.** Enlarged level 1,
tick 400, against main: the blue mottled rock with lit edges, the checkered
ore block and the decor tufts became flat grey-green slabs with lower
contrast — different, and drabber, on the one level everybody sees. Kept for
the revision: the background formations, the fungi and their light, the grit.
Sent back for a revision that keeps the original rock and adds on top.

## 174 — 2026-10-14 · Limestone and living light in the Cavern (on a branch)

**Change:** Draw-only, page-resolution Cavern art. Folded limestone beds and
hairline fractures replace the blue patchwork, including the checkered wall;
wet ledges catch pale calcite highlights and carry small moss patches. Dim
strata and irregular, fluted flowstone curtains give the corridors a far wall,
and the hatch's void now has a cave roof. Foreground formations have asymmetric
faces, mineral ridges and rubble. Small luminous fungi replace the grass tufts;
a selected third breathe slowly and cast a local pool of light. Ceiling grit
falls occasionally. The existing live drips, exit and guard booth retain their
rules and art. Palette, Sim and Outcome are unchanged.

Static bedding, formations and surface detail use the terrain cache; only
fungal light and grit run each frame, before agents, guards and umbrellas.
All new art is gated on Cavern and `(w.res || 1) >= 2`, uses the half-pixel
grid, reads the world without writes and derives variation from coordinates,
level and ticks rather than RNG.

**Checked:** `npm run stamp`, `npm run check` and `npm run crap` pass. Eight
component tests cover read-only proxies, forbidden Math.random, deterministic
pixels, canvas-state restoration, the half-pixel grid, clock-independent cached
art, surviving terrain and support, pulse/grit phases, drip spots, actor
layering and panel component bytes. CRAP at or above 30: **0**; maximum
**28.5**, new functions at most **13.0**. Seeded old/new comparison across all
nineteen biomes: **1,080 identical frames** in the other eighteen (two layouts,
ticks 77/240/600, five themes, res 1/2); Cavern's **60** res-1/unspecified-res
frames also identical, and all **30** res-2 frames changed. Saved baseline,
comparison harness and results in `/tmp/codex-cavern/`.

**Looked:** before/after levels 1, 20 and 39 at ticks 77 and 476, with enlarged
terrain crops: `/tmp/codex-cavern/sheet.png`. Also inspected enlarged guard,
umbrella and exit crops, and level 1 in all five themes. The first far-wall
bands were too regular and bright; softened them and replaced repeated cones
with uneven mineral curtains. Faces, hostile red, umbrellas and the exit stay
clear against the damp stone.

**Measured:** warmed res-2 software rasteriser, tick 476, median of nine batches
of forty frames, old → new. Level 1: actors **0.563 → 0.704 ms**, full terrain
+ actors **13.327 → 25.390 ms**. Level 39: actors **1.891 → 2.015 ms**, full
**15.644 → 28.235 ms**. Subway control, level 18: actors **2.681 → 2.690 ms**,
full **31.878 → 31.844 ms**. Reduced the animated light pools to selected
clusters after the first timing pass. Terrain is cached in ordinary play;
these are Node raster times, not browser FPS.

**Next:** review the opening cave in longer page play. Committed on
`codex/cavern` only; no push or deployment.

**Revision after review — 2026-10-14:** the first pass above was rejected for
flattening the original blue terrain. Removed the green stone repaint and all
foreground decor replacements. The original palette, mottling, lit edges,
checkered ore, grass tufts, spires, hanging formations and rubble now render
through their original paths. Added terrain detail is limited to occasional
half-pixel glints in each material's existing edge colour; ore gets no overlay.
The dark background curtains and strata remain, with fungi growing beside
selected tufts rather than replacing them. Their small breathing light pools
and the falling grit remain read-only and RNG-free; fungi and light both stop
when their adjacent floor or air is removed.

Compared ORIGINAL (current `main`) against this revision at tick 400 on levels
1, 20 and 39, inspecting matched 2× and 4× crops before finishing. The foreground
keeps its texture and gains contrast against the darker recesses; no green wash
remains. Contact sheet: `/tmp/codex-cavern/sheet2.png`. Nine component tests
include a new original-decor command hash and sparse, palette-only terrain
checks with byte-identical ore. `npm run stamp`, `npm run check` and
`npm run crap -- --threshold 30` pass; maximum CRAP **28.5**, Cavern helpers
at most **7.0**. Comparison with main: **1,140 byte-identical protected frames**
(all other biomes at res 1/2, Cavern at res 1/unspecified; two layouts, three
ticks, five themes), with all **30** Cavern res-2 frames changed. New commit
on `codex/cavern`; no history rewrite, push or deployment.

Revision reviewed and merged by the loop. Level 1, tick 400, enlarged against
main: the rock, ore block and decor are exactly as before; behind them, dark
mineral curtains and mounds on the back wall, faint strata, a few fungi with
small pools of light. A modest gain — the cave has depth now — and nothing
the first visitor sees got worse.

**Deployed** after 174 (name="build" content="26744b7e"), gated on a passing check (809 tests): the Cavern depth art, three new sounds. Browser check of level 1 clean.

## 175 — 2026-10-14 · Cloud Provider

**Checked, no change:** pacing. Median level 1,186 ticks; after the last
arrival the median wait is 0 ticks, p90 151; only 4 of 200 levels drag past
400 ticks. Nothing to cut.

**Change:** a 24th hero and the first built on the umbrella. Cloud Provider
hands out umbrellas: every 120 ticks the nearest colleague on its floor
(within 14 cells) with no umbrella of its own gets one, free, kept for every
fall, parry and guard after (169's one umbrella each). The umbrella is thrown
across, furled and spinning, in the hero's blue; the ticker says
"AGENT 012 · GETS AN UMBRELLA". Its own way down is under a door-wide blue
umbrella with white scallops, swaying. Ten lines for its card ("the cloud is
just somebody else's umbrella").

**Looked:** level 61 enlarged — the descent reads at once; the first throw
arced up into the ceiling rock in slate grey, nearly invisible, so the arc
is now hand height to hand height and in the hero's colour.

**Measured:** ten Cloud Provider levels in 300, about three umbrellas each,
94.2% home. Over 400 × 2 the total moved 93.53% → 93.35%: adding a hero
re-picks the hero on 155 of 400 levels, and the one new level under half
(106) is Fallback where Rate Limiter used to be. Tests 814
(`test/cloudprovider.test.js`). Nothing over CRAP 30.

## 176 — 2026-10-14 · Cloud Provider, seen in the browser

**Looked:** level 61 in headless Chromium: the card ("it is not raining. It
is a regional outage."), the blue hero on the top floor, colleagues getting
umbrellas, no console errors. But the ticker said "GETS AN UMBRELLA" in all
four frames sixteen seconds apart: a hand-out every four seconds is routine,
and it drowned out the news.

**Change:** the ticker hears about the first two hand-outs a level; the rest
happen quietly. Tests 815.

**Deployed** after 176 (name="build" content="f63e0d9b"), gated on a passing check (815 tests): Cloud Provider.

## 177 — 2026-10-14 · Three kinds of Foundry bay

The 172 review's open point: every floor of a Foundry level had the same
furnace with the same ladle to its left, so a long level repeated itself.

**Change (Draw, res 2 only):** a bay kind per floor, from the level and the
floor index — the furnace with its ladle left, the same mirrored (ladle and
pour on the right), or a Bessemer converter: a banded vessel tipped on two
stands, its mouth up and right, blowing a flame and sparks for part of a
240-tick cycle. Levels 4, 23, 42, 61, 80 get kinds 2012, 12012, 012, 20120,
1201.

**Looked:** level 4 at tick 300, enlarged. The first converter was 43 px
tall; a corridor shows about 24 px of back wall, so its mouth and flame were
behind rock — redrawn to fit one corridor. Then its iron body vanished into
the heat haze; lifted a shade above the wall with darker bands and a lit
flank. The mirrored bay pours on its own side.

Tests 817 (`foundry-art.test.js`: all three kinds occur; the converter flame
blows and rests, clips to air, hides behind rock; mirrored pours fall right
of the furnace). Nothing over CRAP 30.

## 178 — 2026-10-14 · Spaceship art on a branch

Looked at Spaceship, Skyscraper and Data Center at res 2: the last two read as places (desks and fire escapes; green racks); the Spaceship is grey blocks and portholes. Spaceship art started on `codex/spaceship`, with the Cavern lesson in the brief: keep the terrain, add on top, compare side by side. Level 4 in headless Chromium: converters top and bottom, a mirrored bay mid-right, no console errors.

**Deployed** after 178 (name="build" content="1c2c87b0"), gated on a passing check (817 tests): three kinds of Foundry bay.

Spaceship review (on `codex/spaceship`): **too timid.** At the full 800x496 frame, level 7 before and after are nearly indistinguishable — faint seams, one small panel, hairline conduits. Not worse, not clearly richer either: the Cavern feedback overcorrected. Sent back for bolder additions that read at 1x (saturated blinking lights, visible plating seams and hazard stripes, back-wall ribs and conduits with presence), still keeping the original terrain.

## 179 — 2026-10-14 · Services and instruments aboard the Spaceship

**Change (Draw, res 2 only):** added detail over the original hull: narrow
panel grooves, sparse paired fasteners, deck tread breaks and occasional lit
edge markers. The corridors have paired supply/return conduits with couplings
on the far wall, plus three kinds of recessed service fitting — heat exchanger,
cable manifold and instrument rack. Small instruments mounted in the hull show
coolant-coloured scanning traces and independently blinking status lamps.

The original terrain colours, panel pattern, portholes and stars, pipes and
other decor, motes, hazards, airlock and REMOTE OFFICE booth retain their
existing drawing paths. Background services draw before the original ribs and
portholes; hull fixings and instrument housings use the terrain cache. Only the
displays run each frame, before actors and the exit. Instruments disappear when
any part of their housing is breached. All additions use the half-pixel grid,
read the world without writes or RNG, and are gated on Spaceship and
`(w.res || 1) >= 2`. Palette, Sim and Outcome are unchanged.

**Checked:** `npm run stamp`, `npm run check` and `npm run crap` pass. Seven new
component tests cover resolution and biome gates, read-only proxies, forbidden
Math.random, deterministic pixels, canvas-state restoration, the half-pixel
grid, cached versus animated detail, surviving terrain, sparse palette-only
fixings, actor layering and original panel component bytes. New functions have
100% line coverage and CRAP at most **10.0**. Functions at or above 30: **0**;
maximum **28.5**.

Seeded old/new Draw comparison over all nineteen biomes: **1,080 identical
frames** across the other eighteen (two layouts, ticks 77/240/600, all five
themes, res 1/2). Spaceship's **60** res-1/unspecified-res frames are identical;
all **30** res-2 frames changed. Baseline, comparison harness and results are
in `/tmp/codex-spaceship/`.

**Looked:** `node tools/shoot.js level 7 --res 2`; matched before/after levels
7, 26 and 45 at ticks 77 and 476, with the same terrain/decor crops at 2× and
4×: `/tmp/codex-spaceship/sheet.png`. The first instrument traces were too grey;
changed the small displays to the existing coolant colours. The added plate
fixings preserve the large original colour blocks and bright floor edges;
the low-contrast services give the empty corridors depth. Faces, hostile gear,
umbrellas and the airlock stay clear.

**Measured:** warmed res-2 software rasteriser, tick 476, median of nine batches
of forty frames, interleaved old → new. Level 7: actors **2.013 → 2.019 ms**,
full terrain + actors **11.509 → 12.936 ms**. Level 45: actors
**0.918 → 0.922 ms**, full **11.833 → 13.419 ms**. Subway control, level 18:
actors **2.646 → 2.642 ms**, full **31.744 → 31.782 ms**. Terrain is cached
in normal play; these are Node raster times, not browser FPS.

**Next:** review the ship's instruments in longer page play. Committed on
`codex/spaceship` only; no push or deployment.

**Revision after review — 2026-10-14:** the first pass was too timid at the
visitor's 800×496 viewing size. Strengthened the back wall with broad bulkhead
shoulders and brackets, paired two-art-pixel conduits with collars, and larger
service fittings. Hull seams are now one art pixel wide; exposed floors have
lit deck lips and yellow-black tape beside drops. Up to three consoles per
corridor carry saturated cyan/green/amber/red lamps, independently blinking
from `w.ticks`, and slow cyan scanner sweeps. Console placement avoids the
original viewports, uses decor alone so a breach cannot move a mounting point,
and hides the whole console when its hull is removed. Original terrain
colours, panel pattern, portholes, stars and decor keep their drawing paths;
actors and the exit draw above the instruments. No world writes or RNG; Draw
only, with the existing res-2 gate. Inspected ORIGINAL (`main`) against this
revision on levels 7, 26 and 45 at ticks 77/476: full frames at 1× viewing size
and matching crops at 2×, `/tmp/codex-spaceship/sheet2.png`. Ten component tests,
`npm run stamp`, `npm run check` and `npm run crap -- --threshold 30` pass;
changed helpers have 100% line coverage and CRAP at most **9.0**, whole-project
maximum **28.5**. Comparison against main: **1,140 byte-identical protected
frames**, all **30** Spaceship res-2 frames changed. Warmed software-raster
actor medians: level 7 **2.007 → 2.057 ms**, level 45 **0.924 → 0.968 ms**;
full terrain + actors **11.300 → 14.482** and **11.816 → 15.247 ms** respectively
(terrain is cached in play; Node timings, not browser FPS). New commit on
`codex/spaceship`; no history rewrite, push or deployment.

Revision reviewed and merged by the loop. Level 7, tick 400, full frame against main: the difference now shows at a glance — a frame of pipes and girders on the back wall, amber lights on deck edges, cyan console strips, all over the original terrain, which is unchanged. The back-wall grid is a little busy behind the agents, but they stay readable.

**Deployed** after 179 (name="build" content="4466460b"), gated on a passing check (827 tests): the Spaceship art. Level 7 in headless Chromium, no console errors.

## 180 — 2026-10-14 · Frame rate, and the umbrellas on the report card

**Measured, no change:** three biome art passes later, frame times in
headless Chromium on levels 1, 7 (Spaceship), 18 (Subway) and 42 (Foundry):
16.7 ms median, 16.8 ms worst frame over 240 — a steady 60 fps everywhere.

**Change:** the end-of-level report said nothing about umbrellas, the one
thing the game is about. It now has an umbrella line under the fight and
the MVP: "8 UMBRELLA LANDINGS · 4 HANDED OUT" (Sim counts a landing in the
one place a floated fall ends, `w.brollyLandings`; bookkeeping only).
Looked at levels 61 and 126: with escorts, a boss down, the MVP and the
umbrellas the card stacks evenly. Adding the row tipped `drawLevelResults`
to CRAP 67; it now draws a list of rows (`reportRows`) and is back under,
with the plate the same height as before for every existing combination.
Tests 829 (`test/report-brolly.test.js`).

## 181 — 2026-10-14 · Frost art on a branch

Compared Ruins, Frost, Ice Cave, Factory and Desert at res 2: the Frost is the drabbest — near-monochrome grey with a shapeless mass along the bottom. Frost art started on `codex/frost`, the brief carrying both earlier lessons (keep the terrain; additions must read at 1x). Level 130 end in headless Chromium: the card reads "13 UMBRELLA LANDINGS", no console errors.

**Deployed** after 181 (name="build" content="04d80fe9"), gated on a passing check (829 tests): the umbrella line on the report card.

## 182 — 2026-10-14 · Snow and northern light in Frost (on a branch)

**Change:** Draw-only, page-resolution Frost art, added over the original
terrain. Crisp white caps follow exposed top edges, with stepped drifts and
blue dents; exposed cliff sides catch a narrow translucent glaze and glints.
The original grey mottling, ledge faces, mountain ridge, icicles, crystals,
clumps, hazards, exit and ICE SECURITY booth keep their original draw paths.
A dark green/blue/violet aurora moves slowly behind the original peaks; brighter
near snowflakes drift among the existing motes, occasionally bending in a gust.
Walking colleagues exhale small fading breath puffs, staggered by id.
Palette, Sim and Outcome are unchanged.

Snow and ice use the terrain cache. Aurora, snowfall and breath run before
actors and fixtures, read the world without writes or Math.random, and derive
variation from level, coordinates, ids and ticks. All additions are gated on
Frost and `(w.res || 1) >= 2`, on the half-pixel grid. The live aurora mirrors
the original deterministic ridge so it cannot paint across a mountain.

**Checked:** `npm run stamp` and `npm run check` pass. Eight component tests
cover read-only proxies, forbidden Math.random, deterministic pixels, canvas
state, the half-pixel grid, cached versus animated art, surviving support,
untouched bridge bricks, original ridge occlusion, air-only flakes, breath
phases, actor layering and original component bytes at both resolutions.
`npm run crap` reports **0** functions at or above 30; maximum **28.6**,
Frost helpers at most **10.0** with 100% coverage. Coverage ran in one test
process (`--test-isolation=none`) after the default coverage process was
terminated by the environment; the full coverage run and threshold check pass.
Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2); Frost's **60** res-1/unspecified-res frames also identical, and all
**30** res-2 frames changed. Baseline, harness and results: `/tmp/codex-frost/`.

**Looked:** original main versus this branch on levels 3, 22 and 41 at ticks
77/476: full 800×496 frames at 1× viewing size, matching crops at 2×, and
4× detail crops in `/tmp/codex-frost/sheet.png`. Also inspected all five themes
and level 60. The first aurora read like a rail with repeated hanging bars;
replaced those with a broader soft veil. Removed repeated gaps in the blue
cliff glaze. The full frames now read snowy at a glance, retain the original
terrain texture, and keep faces, guards, umbrellas and exits distinct.

**Measured:** warmed res-2 software rasteriser, tick 476, median of nine batches
of forty frames, interleaved old/new. Level 3: actors **2.036 → 2.672 ms**,
full terrain + actors **15.131 → 16.353 ms**. Level 41: actors
**2.225 → 2.844 ms**, full **16.842 → 18.614 ms**. Subway control, level 18:
actors **2.702 → 2.695 ms**, full **32.091 → 32.131 ms**. Terrain is cached
in ordinary play; these are Node raster times, not browser FPS.

**Next:** review Frost's snowfall in longer page play. Committed on
`codex/frost` only; no push or deployment.

Reviewed and merged by the loop. Level 3, tick 400, full frame against main at 1x: a green aurora along the back, white snow caps on every floor edge, blue ice on the pillars, snowfall; the original rock untouched beneath. Still a grey biome, but now a cold one.

**Deployed** after 182 (name="build" content="9973a8a5"), gated on a passing check (837 tests): the Frost art. Level 3 in headless Chromium, no console errors.

## 183 — 2026-10-14 · Umbrellas up in mid-air

**Started:** Desert art on `codex/desert` (Codex; same brief lessons).

**Survey after 164–182:** 200 levels, 199 cleared, 94% home. The Cavern was
lowest again (88%), and level 20 — about 13 minutes in for a new viewer —
failed all three attempts at 10/15. All six losses on its first attempt were the
same death: a gunner by the foot of a shaft shooting each agent as it fell.
Over 197 guard levels, 37 of the red team's kills were fallers.

**Tried both ways** (394 guard plays): gunners that ignore fallers, 92.17% →
92.74% home; floaters allowed to parry, 92.17% → 92.64%. Kept the second —
it makes the umbrella the answer, and adds umbrella moments rather than
removing gunfire.

**Change:** a floater (falling with its umbrella open) can parry a round like
a walker; a short drop without one is still a clean shot. Draw shows the
canopy swung toward the gun while it holds, then overhead again. Level 20
clears (11/15). Looked at level 20, ticks 451 and 455, enlarged: the round
stops on the canopy with a spark and a NOPE. Tests 838.

## 184 — 2026-10-14 · Sand and old stone in the Desert (on a branch)

**Change:** Draw-only, page-resolution Desert art, added over the original
terrain. Golden sand caps follow exposed ledges, with stepped drifts and lee
banks against inner corners. Narrow warm sediment seams and wind scoring
leave the original material bands, mottling and dark cap-rock visible.
Chipped obelisks with incised sun, reed and step glyphs stand in the far wall,
partly buried behind the original terrain. A stepped hot-air sky warms the
existing sun; broken mirage bands ripple just above intact long floors.
The original dunes, mesas, cactus, clumps, motes, gusts, hazards, exit and
SANDBOX ESCAPE booth keep their draw recipes. Palette, Sim and Outcome are
unchanged, including Model Drift, Sandbox and Cache Miss and their mirrors.

Static additions use the terrain cache; mirage bands run in drawMachines
before events, fixtures and actors. Every addition is gated on Desert and
`(w.res || 1) >= 2`, uses the half-pixel grid, and reads the world without
writes or Math.random. Sand and heat footprints check current air, and heat
requires a surviving floor. Monuments avoid the original sun's glow and rays.

**Checked:** `npm run stamp` and `npm run check` pass. Eight component tests
cover read-only proxies, forbidden RNG, deterministic pixels, canvas state,
resolution/biome gates, the half-pixel grid, cached versus moving art,
original component bytes at both resolutions, preserved texture, destroyed
support, untouched steel/bridge bricks, corner banks, air-only heat, sun
clearance, actor layering and the three event mirrors. `npm run crap` reports
**0** functions at or above 30, maximum **28.5**; Desert helpers reach **8.0**
with 100% coverage. The local coverage output directory was created and the
existing ignored CRAP tool copied into this worktree for the report.
Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2); Desert's **60** res-1/unspecified-res frames are also identical,
and all **30** res-2 frames change. Baseline, harness and results are in
`/tmp/codex-desert/`.

**Looked:** original main versus this branch on levels 11, 30 and 49 at ticks
77/476: full 800×496 frames at 1× viewing size, matching crops at 2×, and
4× detail crops in `/tmp/codex-desert/sheet.png`. Inspected the sheet, each
full-frame pair, enlarged texture/actor crops, all five themes and level 68.
The golden ledges read immediately in full frames; enlarged crops retain
the original grain and bands. Faces, guards, umbrellas, booths and exits
remain distinct. The mirage is deliberately faint beneath their silhouettes.

**Measured:** warmed res-2 software rasteriser, tick 476, median of nine batches
of forty frames, interleaved old/new, with tests and coverage finished.
Level 11: actors **2.094 → 2.187 ms**, full terrain + actors
**16.692 → 19.758 ms**. Level 49: actors **2.339 → 2.490 ms**,
full **18.535 → 21.864 ms**. Subway control, level 18: actors
**2.660 → 2.658 ms**, full **32.246 → 32.248 ms**. Terrain is cached in
ordinary play; these are Node raster times, not browser FPS.

**Next:** review the Desert's mirage during longer page play. Committed on
`codex/desert` only; no push or deployment.

Reviewed and merged by the loop. Level 11, tick 400, full frame against main at 1x: golden drifts on every edge, warm strata, glyph panels on the back wall, a hotter sky; the original rock intact.

**Deployed** after 184 (name="build" content="12ca3918"), gated on a passing check (846 tests): floaters parry in mid-air (183), the Desert art (184). Level 20 in headless Chromium, no console errors.

## 185 — 2026-10-14 · Ruins art on a branch

**Looked, no change:** the Jungle, lowest in 183's survey (86% home). One
level carries it: 176, where a colony out of bashers, climbers, miners and
diggers is stranded on the bottom floor (2/13). Its retries get 10/13 and
12/13 — a lost first run that comes good is part of the game.

**Started:** Ruins art on `codex/ruins` (level 2, the second thing every
visitor sees): cut stone with mortar, broken columns, vines, torchlight,
the same two brief lessons.

## 186 — 2026-10-14 · An ancient temple in the Ruins (on a branch)

**Change:** Draw-only, page-resolution temple art behind and over the original
Ruins. Broad fluted columns have capitals, snapped shafts and fallen drums;
stepped arches alternate with low pediments, with Greek-key relief on their
lintels. Sparse wall niches hold amber flames. Narrow mortar courses, chipped
joints and moss sit over the original maroon and grey mottling, with short
roots hanging from surviving ceilings. The original terrain colours, shapes,
pink column stubs, drips, weeds, dust, hazards, boulder, exit and LEGACY SUPPORT
booth keep their existing recipes. Palette, Sim and Outcome are unchanged.

Architecture and masonry use the terrain cache. Flames, embers and small
flickering light pools run before actors, fixtures and event mirrors; terrain
occludes them, including new Backfill. Placement stays fixed through excavation.
Every addition is gated on Ruins and `(w.res || 1) >= 2`, uses the half-pixel
grid, and reads coordinates, level and ticks without world writes or RNG.

**Checked:** `npm run stamp`, `npm run check` and `npm run crap` pass. Nine
component tests cover read-only proxies, forbidden Math.random, deterministic
pixels, canvas state, the half-pixel grid, cached versus animated art, surviving
ceiling support, Backfill occlusion, untouched bridge/steel cells, visible
architecture, actor layering, original component bytes at both resolutions,
and Legacy Collapse / Backfill / Daemon Restart mirrors. CRAP: **0** functions
at or above 30, maximum **28.5**; Ruins helpers at most **9.0**, all with 100%
coverage. Used a local copy of the already installed CRAP tool after its GitHub
download failed in the restricted network; no tracked tooling changes.

Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2). Ruins' **60** res-1/unspecified-res frames are also identical; all
**30** res-2 frames changed. Baseline, harness and results: `/tmp/codex-ruins/`.

**Looked:** main versus this branch on levels 2, 21 and 40 at ticks 77/476:
full 800×496 frames at 1× viewing size, matching 2× crops and 4× detail crops
in `/tmp/codex-ruins/sheet.png`. Also inspected all five themes and level 59.
The colonnades, arches, relief and warm torch niches change the full-frame
silhouette at a glance. The enlarged pairs retain the old speckled stone,
pink stubs and drips; faces, guards, umbrellas, the blue exit and boulder
remain distinct from the darker architecture.

**Measured:** warmed res-2 software rasteriser at tick 476, median of nine
batches of forty frames, interleaved old/new, after tests and coverage finished.
Level 2: actors **1.559 → 1.622 ms**, full terrain + actors
**12.308 → 16.741 ms**. Level 40: actors **1.795 → 1.897 ms**, full
**13.851 → 18.392 ms**. Subway control, level 18: actors
**2.657 → 2.659 ms**, full **31.900 → 31.842 ms**. Terrain is cached in
ordinary play; these are Node raster times, not browser FPS.

**Next:** review the temple during longer page play. Committed on
`codex/ruins` only; no push or deployment.

Reviewed and merged by the loop. Level 2, tick 400, full frame against main at 1x: columns with capitals, arches, torches in niches and vines on the back wall; the original maroon blocks, pillar stubs and boulder unchanged in front. Busier behind the play, but the dark suits still stand out against the tan stone.

**Deployed** after 186 (name="build" content="b5d568de"), gated on a passing check (855 tests): the Ruins art. Level 2 in headless Chromium, no console errors.

## 187 — 2026-10-14 · Jungle art on a branch

**Started:** Jungle art on `codex/jungle` (level 5): foliage depth, god-rays,
fireflies, mossy root-bound earth; same brief lessons.

**Measured, no change:** page weight. Draw.js is 630 KB raw / 164 KB gzipped
(556 KB raw at the Harbour, 162), Sim.js 441 / 139; all six scripts about
330 KB gzipped, cached by their stamps and compressed in transit. Not worth
a build step yet; worth watching as the art passes continue.

## 188 — 2026-10-14 · Under a living Jungle canopy (on a branch)

**Change:** Draw-only, page-resolution Jungle art added behind and over the
original forest. Overhead boughs carry drooping banana and split philodendron
leaves; broad trunks have bark grooves, forks and buttress roots. Irregular
groves mix tall fronds and broad leaves along the corridors, with slack lianas
behind the original vines. Small lime-tipped ferns, fallen ochre leaves and
narrow branching roots follow surviving terrain edges. Slowly shifting sunlight
shafts, thin humid mist and amber/teal butterflies bring the open air to life.
The original terrain colours, grain, bands, leafy tops, decor, motes, drips,
pool, hazards, exit and BRANCH OFFICE booth keep their existing recipes.
Palette, Sim and Outcome are unchanged.

Canopy and surface plants use the terrain cache. Light, humidity and butterflies
run on the actor pass, before the original drips, event mirrors, fixtures and
colony. Live air is clipped to current empty cells, including after Dependency
Hell grows new ground. Every addition is gated on Jungle and `(w.res || 1) >= 2`,
uses the half-pixel grid, and reads coordinates, level and ticks without world
writes or RNG. No new scenery state or terrain repaint replaces the old art.

**Checked:** `npm run stamp`, `npm run check` and `npm run crap -- --threshold 30`
pass. Nine component tests cover read-only proxies, forbidden Math.random,
deterministic pixels, canvas state, the half-pixel grid, cached versus animated
art, surviving plant support, root bounds, untouched bridge/steel cells,
terrain occlusion, broad leaf silhouettes, actor layering, original component
bytes at both resolutions, and Dependency Hell / Cloud Burst / Fork Bomb.
CRAP: **0** functions at or above 30, maximum **28.5**; Jungle helpers at most
**13.0**, all with 100% coverage. Used a local copy of the installed CRAP tool
and created the ignored coverage output directory; no tooling changes.

Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2). Jungle's **60** res-1/unspecified-res frames are also identical;
all **30** res-2 frames changed. Baseline, harness and results:
`/tmp/codex-jungle/`.

**Looked:** `node tools/shoot.js level 5 --res 2`; main versus this branch on
levels 5, 24 and 43 at ticks 77/476, full 800×496 frames at 1× viewing size,
matching 2× crops and enlarged 4× details in `/tmp/codex-jungle/sheet.png`.
Also inspected all five themes and level 62. The broad leaves and trunks
change the full-frame silhouette at a glance. Crops retain the original
mottled soil, vine shapes, mushrooms and leafy tops; faces, guards, umbrellas,
booths, hazards and exits remain distinct. Review removed scattered root noise
in favour of longer supported branches, and varied the grove spacing and
leaf silhouettes so the forest does not read as planted rows.

**Measured:** warmed res-2 software rasteriser at tick 476, median of nine
batches of forty frames, interleaved old/new, after tests and coverage finished.
Level 5: actors **0.606 → 0.900 ms**, full terrain + actors
**14.646 → 20.137 ms**. Level 43: actors **0.818 → 1.070 ms**, full
**16.044 → 20.814 ms**. Subway control, level 18: actors
**2.673 → 2.680 ms**, full **31.833 → 31.825 ms**. Terrain is cached in
ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Jungle art review. Committed on `codex/jungle` only;
no push or deployment.

Reviewed and merged by the loop. Level 5, tick 400, full frame against main at 1x: big leaves and trunks behind, ferns on the ledges, butterflies, a leafy canopy over the sky band; the original terrain in front. Busy, but the agents read.

**Deployed** after 188 (name="build" content="313f8d57"), gated on a passing check (864 tests): the Jungle art. Level 5 in headless Chromium, no console errors.

## 189 — 2026-10-14 · Ice Cave art on a branch

Started: Ice Cave art on `codex/icecave` (level 6) — underground glacier ice, distinct from the Frost outdoors: translucent faces, glints, a glowing glacier wall behind; same brief lessons.

## 190 — 2026-10-14 · Glitter deep under the glacier (on a branch)

**Change:** Draw-only, page-resolution Ice Cave additions over the original
art. Broad blue-green glacier columns, deep crevasses and compressed strata
make the far wall read at full-frame size. Sparse internal cracks and trapped
bubbles, broken frosted top edges, pulsing cold light, drifting frost motes
and short specular crosses give the ice depth and glitter. The original
terrain colours, grain, checker blocks, rubble, crystals, icicles, frozen
colleagues, hazards, exit and COLD STORAGE booth keep their recipes. Palette,
Sim and Outcome are unchanged.

Columns and surface detail use the terrain cache. Live light and glitter run
before the original drips, event mirrors, fixtures and actors. Light is clipped
at current terrain-cell boundaries, so Frozen Snapshot's new ground occludes
it and Breaking Change opens it; glints require surviving ice. Every addition
is gated on Ice Cave and `(w.res || 1) >= 2`, stays on the half-pixel grid,
and reads coordinates, level and ticks without world writes or RNG.

**Checked:** `npm run stamp`, `npm run check` and
`npm run crap -- --threshold 30` pass. Eight new component tests cover
read-only proxies, forbidden RNG, deterministic pixels, canvas state, the
half-pixel grid, cached versus live art, animated glints, sparse face coverage,
terrain occlusion, untouched bridge/steel cells, actor layering, original
component bytes at both resolutions, and all three Ice Cave event mirrors.
CRAP: **0** functions at or above 30, maximum **29.0**; new helpers at most
**7.0**, all with 100% coverage. Used a local copy of the installed CRAP tool
and the ignored coverage directory; no tooling changes.

Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2). Ice Cave's **60** res-1/unspecified-res frames are also identical;
all **30** res-2 frames changed. Baseline, harness and results:
`/tmp/codex-icecave/`.

**Looked:** `node tools/shoot.js level 6 --res 2`; main versus this branch on
levels 6, 25 and 44 at ticks 77/476, full 800×496 frames at 1× viewing size,
matching 2× crops and enlarged 4× details in `/tmp/codex-icecave/sheet.png`.
Also inspected level 63 in all five themes. The glacier faces change the
full-frame read immediately; enlarged crops retain the old textured blocks,
icicles and decor. Pale faces, red guards, umbrellas, frozen colleagues,
booths, hazards and exits remain distinct against the darker far ice.

**Measured:** warmed res-2 software rasteriser at tick 476, median of nine
batches of forty frames, interleaved old/new, after tests and coverage finished.
Level 6: actors **1.705 → 2.172 ms**, full terrain + actors
**14.929 → 22.451 ms**. Level 44: actors **1.908 → 2.272 ms**, full
**16.045 → 23.810 ms**. Subway control, level 18: actors
**2.678 → 2.675 ms**, full **31.699 → 31.633 ms**. Terrain is cached in
ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Ice Cave art review. Committed on `codex/icecave` only;
no push or deployment.

Reviewed and merged by the loop. Level 6, tick 400, full frame against main at 1x: teal glacier curtains fill the back wall, glints sparkle across the ice; nothing like the Frost's snow and aurora. The original blocks, icicles and rubble in front; the agents read.

**Deployed** after 190 (name="build" content="255a6063"), gated on a passing check (872 tests): the Ice Cave art. Level 6 in headless Chromium, no console errors.

## 191 — 2026-10-14 · Factory art on a branch

Started: Factory art on `codex/factory` (level 8) — a production line distinct from the Foundry: belts, robot arms, gantries, safety stripes, signage; same brief lessons.

## 192 — 2026-10-14 · A working assembly floor (on a branch)

**Change:** Draw-only, page-resolution Factory art added over the original
factory. Continuous overhead I-beams, brackets, cable trays and small trolley
hooks frame two production bays per corridor. Back-wall roller conveyors carry
shipping crates and blue-grey housings; articulated yellow robot arms swing
between workpieces and briefly weld with cold blue sparks. Painted BAY stencils,
hanging task lamps, stack lights and sparse yellow/black ledge stripes complete
the line. The original brown blocks, seams, rivets, brickwork, windows, gear
decals, motes, pipes, rubble, cables, belts, hazards, roller-shutter exit and guard
booth keep their recipes. Palette, Sim and Outcome are unchanged.

Rails, conveyor housings, signs, lamps and paint use the terrain cache. Products,
rollers, arms and stack lights run before the original fittings, event mirrors,
fixtures and colony. Live art is clipped at current terrain-cell boundaries and
clears the exit shutter and original decor. Bay positions come from the original
corridor metadata, so digging and Hard Fault cannot relocate them; short lines
carry fewer crates so packages never overlap. Every addition is gated on Factory
and `(w.res || 1) >= 2`, uses the half-pixel grid, and reads coordinates, level
and ticks without world writes, RNG or new scenery state.

**Checked:** `npm run stamp`, `npm run check` and
`npm run crap -- --threshold 30` pass. Nine new component tests cover read-only
proxies, forbidden Math.random, deterministic pixels, canvas state, the
half-pixel grid, cached versus live art, moving products in both directions,
crate spacing, articulated joints, intermittent welding, terrain occlusion,
exit/decor clearance, sparse paint coverage, untouched steel/bridge/belt cells,
foreground ordering, original component bytes at both resolutions, and Scale Up,
Technical Debt and Hard Fault with their visual mirrors. CRAP: **0** functions
at or above 30, maximum **29.0**; new helpers at most **8.0**, all with 100%
coverage. Used a local copy of the installed CRAP tool and the ignored coverage
directory; no tooling changes.

Seeded main/new Draw comparison across all nineteen biomes: **1,080 identical
frames** in the other eighteen (two layouts, ticks 77/240/600, five themes,
res 1/2). Factory's **60** res-1/unspecified-res frames are also identical;
all **30** res-2 frames changed. Baseline, harness and results:
`/tmp/codex-factory/`.

**Looked:** `node tools/shoot.js level 8 --res 2`; main versus this branch on
levels 8, 27 and 46 at ticks 77/476, full 800×496 frames at 1× viewing size,
matching 2× crops and enlarged 4× details in `/tmp/codex-factory/sheet.png`.
Also inspected level 65 in all five themes. The rails, production lines and
stencils change the full-frame read immediately, without the Foundry's furnaces
or molten glow. Enlarged crops retain the old terrain, gear wheels and pipes;
faces, guards, umbrellas, booth, hazards and exit remain distinct. Review cleared
products off the cached shutter, protected the original decor, put stencils over
mortar strokes, and reduced package density on short conveyors.

**Measured:** warmed res-2 software rasteriser at tick 476, median of nine
batches of forty frames, interleaved old/new, after tests and coverage finished.
Level 8: actors **1.555 → 2.835 ms**, full terrain + actors
**13.732 → 16.137 ms**. Level 46: actors **2.581 → 3.992 ms**, full
**16.441 → 19.190 ms**. Subway control, level 18: actors
**2.659 → 2.660 ms**, full **31.996 → 31.997 ms**. Terrain is cached in
ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Factory art review. Committed on `codex/factory` only;
no push or deployment.

Reviewed and merged by the loop. Level 8, tick 400, full frame against main at 1x: gantry rails, conveyors carrying boxes, robot arms and safety stripes read as a production line, nothing like the Foundry. One fix in review: the "BAY 3" signs read "BA'o 7" at 3x — the ceiling, drawn later, clipped the tops of the letters, and lowering the sign put it under the stations instead. The signs are gone; the line reads without them.

Merge fix: dropping `drawAssemblyLabels` left "cached rails" on `layers.slice(0, 3)`, which now took in the animated `drawAssemblyLife`. The failing `deepEqual` on two raw 800×496 buffers made node build a diff of them and the run reached 22 GB before it was killed. Now `slice(0, 2)`, and `picture()` returns a pixel digest so a failed comparison is a 64-character diff; `footprint` refuses non-finite or larger-than-board rectangles and recording stops at 20k fills. The file runs in 2 s; `npm run check` 881/881.

**Deployed** after 192 (name="build" content="525f1324"), gated on a passing check (881 tests): the Factory art. Level 8 in headless Chromium, no console errors.

## 193 — 2026-10-14 · The dreamer: an exit that is not there

**Change:** a thirteenth trait, `dreamer`, cast like the other distinctive
ones. Its rule (`dreamSteer`, at landing beside `herdSteer`): once a level, on
55% of landings until it happens, it sees a mirage exit 8–26 cells along its
own floor, faces it and walks. On arrival the door comes apart, the ticker says
HALLUCINATION DETECTED and it turns back the way it came — a round trip, never
a life. The mirage is only placed down a stretch with headroom, ground under
every step, no known hazard reach and no pit, never on the real exit or hatch
(`eventSafeX`), and it lets go if anything else turns the agent, takes it off
the floor, or after 360 ticks. Mirages draw from their own `dreamRng`, so a
dreamer landing mid-level does not reshuffle the whims of agents still queued.
Draw: a lit doorway with a sign over it, every other row swimming like heat
haze, coming apart row by row (whole art pixels, so the panel shows it too);
the dreamer's res-2 tell is a far-off glance and a loosened tie. Outcome: five
"cited a source that does not exist" lines, only when a hallucination happened.

**Measured:** `simcheck play 60` base vs new: 60/60 cleared both, home
877/917 (96%) → 881/929 (95%), 0 hangs, avg 41s → 40s — noise from the
reshuffled casts. 80 runs over levels 1–40: 62 dreamers, 42 mirages, 40
reached, 2 abandoned.

**Tests:** `test/dreamer.test.js` (6): placement invariants on every mirage met
over 24 levels, one per agent, arrival reverses and early turns release,
non-dreamers/heroes/fallers never dream, read-only deterministic drawing that
fades out on whole pixels, and outcome lines only after a hallucination.
`bouncer-art` "actual level 13" pinned one colony's timeline (seed `13 * 7919 + 13`, death
at 580); a new trait reshuffles every cast, so it now uses seed 102991 (same
story, death at 580) and reads its moments off a scouting run instead of a tick
list. `npm run check` 888/888 in 15 s, run under `systemd-run -p MemoryMax=6G`.

**Tooling:** AGENTS.md gains the fast-and-bounded tools convention and the
`node-test-guard` note (from the supervisor).

**Deployed** after 193 (name="build" content="b6092665"), gated on a passing check (888 tests): the dreamer. Levels 1, 8 and 13 in headless Chromium, no console errors.

## 194 — 2026-10-14 · Faster tests, and 429 Too Many Requests

**Tooling, measured on 16 cores:** `npm run check` **15.7 s → 10.1 s**,
`npm run coverage` **55 s → 30 s**, `npm run crap` (which runs coverage
itself) **~85 s → 32 s**. Coverage was CPU-bound (8.5 min CPU in under a
minute of wall time) with a tail of one or two late, heavy files running alone,
so splitting files alone changed nothing; what moved it was doing less work:
- `tools/render.js`: `parseColor` is cached per string (it ran several regexes
  per fillRect), and a scaled-but-not-rotated transform — every res-2 frame —
  now tests columns and rows once each with the same arithmetic as the
  per-pixel inverse map and fills the product; an opaque fill writes instead of
  blending. Bit-identical: a 78-frame spread over 14 levels, both resolutions,
  three themes, plus rotated/flipped/translucent fills, hashes the same before
  and after, and every pinned hash in the suite still passes. Full frames
  render ~1.7× faster. The fill code moved out of `canvas` into named
  functions (crapper scored the closures as part of `canvas`: 36).
- `hazards.test.js` 7.5 s → 2.8 s: a read-only proxy (writes throw) instead
  of `JSON.stringify` of the world before and after each of ~4,000 frames, and
  a byte compare against a cached blank instead of base64 strings.
- `escort-art` 7.1 s → 2.3 s and `transitions` 6.4 s → 2.8 s: the drawing does
  not branch on theme, so the full matrix runs in one theme and every theme
  gets a representative case; frames compare by bytes, not `deepEqual`.
- `play.test.js` sharded into three passes (`play-levels.js`), the event
  playthroughs into `catalogue-events.test.js`, the biome half of backdrops into
  `backdrops-2.test.js` (`backdrops-biomes.js`), so the heavy files overlap.
- `crop()` rounds its origin: a fractional one silently returned a black image.
No `check:quick`: at 10 s the full check is the inner loop.

**Gameplay — 429 Too Many Requests.** When five or more ordinary walkers bunch
inside five cells of one floor, the first such crowd of a level (after tick 240)
gets a coin toss (60%); on heads a red **429** sign springs up on a post over
them, everybody in the crowd stands still checking a phone, a watch or tapping
a foot, and they are let go from the front one every 16 ticks after a 54-tick
hold — a token bucket drawn as a queue. Once a level at most. It cannot hold
anybody for good: every hold is a countdown, a queued agent is invisible to the
stuck watchers, and a fall, a skill, a hero, a fight or the floor going ends its
turn in the queue at once; nobody is queued by the exit, by the hatch, in a
known hazard's reach or over a pit. Outcome gains five Retry-After lines, only
when a queue happened. Over 120 runs of levels 1–60: fired on 13, held 68
agents, longest hold 134 ticks, none still queued at the end; `simcheck play 60`
unchanged (60/60, 881/929, 0 hangs).

**Tests:** `ratelimit.test.js` (8): crowd detection and its exclusions, front-
first release in both directions, a queue that stands still then drains and
takes the sign down, early release on a fall/hero/lost floor, once-a-level and
the coin, 30 played levels with the coin forced (no hangs, bounded holds), the
sign's pop/blink/linger/sink on whole pixels via the actor pass, outcome lines.
`xeno.test.js` (4): `xenoCloses` lost its incidental coverage when the casts
reshuffled (CRAP 58.3); now reached directly. `idle.test.js` learns the queue
pose. `npm run check` 903/903; CRAP worst 29.0.

**Deployed** after 194 (name="build" content="4e3f11ac"), gated on a passing check (903 tests): the faster tooling and 429 Too Many Requests. Levels 3, 9 and 21 in headless Chromium, no console errors.

## 195 — 2026-10-14 · After hours in the tower (on a branch)

**Change:** Draw-only, page-resolution Skyscraper art. Large curtain-wall bays
look across a second, distant skyline: staggered rooflines, narrow aerials and
small warm office lights behind cool blue glazing. Slim mullions, deep sills,
broken diagonal reflections and recessed ceiling fittings give each storey depth.
Sparse half-pixel glints pick out the original tinted glass cells without
covering their texture. Distant offices slowly light up on the actor layer;
the city itself stays still. Original skyline, frame, slabs, grain, desks,
strip lights, pipes, rubble, lift cars, hoistways, fire escape, motes, hazards,
booth and exit keep their recipes. Sim, Palette and Outcome are unchanged.

Window positions come from the original corridor metadata, so carving cannot
relocate the glazing. Cached architecture precedes original terrain/decor.
Animated light pixels reject live terrain, mullions, original desk/prop bounds
and the exit frame; they precede lifts, event mirrors, hazards and the colony.
Every addition is gated on Skyscraper and `(w.res || 1) >= 2`, uses the
half-pixel grid, and reads level/ticks without world writes, RNG or scenery state.
Rebased onto current main (`3ba3403`, including Factory and Dreamer) before
final validation.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-skyscraper/coverage-safe.sh` pass. Eight Skyscraper component tests cover
resolution/biome gates, read-only proxies, forbidden Math.random, deterministic
pixels, canvas-state restoration, half-pixel placement, fixed bays after digging,
cached versus live art, the light cycle, sparse glass coverage, untouched
rock/ore/steel/bridge cells, terrain/decor/exit/mullion clearance, foreground
ordering, original component bytes at both resolutions, and Open Plan/Refactor
with their visual mirrors. CRAP: **0** functions at or above 30, maximum **29.3**; new art
helpers at most **9.0**, all with 100% coverage; new raster helpers also 100%.

Following the supervisor's memory instruction, final check and coverage ran
as separate runs, with Node's heap capped at **2048 MB** and
`ulimit -v 6000000`. Check uses one test worker; coverage uses two bounded
workers after observed worker RSS stayed below 250 MB. The driver gates each phase
on other active Node test runs. `test/factory-art.test.js` was explicitly excluded;
**888** tests pass.
Validation commands and outputs are in
`/tmp/codex-skyscraper/validate-safe.sh`, `check-final.log`,
`coverage-safe.sh` and `crap-final.log`.
Final coverage initially reported `xenoCloses` at 7.7% (CRAP 58.3); a focused
Xeno contact test now checks no prey, horizontal/vertical reach, facing,
cooldown expiry, the infection cap and already infected colleagues. The helper
is unchanged and now 100% covered (8.0). No package or simulation changes.
The Node shot renderer optimization is described below.

Seeded merged-main/new Draw comparison across all nineteen biomes:
**1,080 identical frames** in the other eighteen (two layouts, ticks
77/240/600, five themes, res 1/2). Skyscraper's **60** res-1/unspecified-res
frames are also identical; all **30** res-2 frames changed. Baseline, harness
and results: `/tmp/codex-skyscraper/`.

**Looked:** level 9 at res 2; main versus this branch on levels 9, 28 and 47
at ticks 77/476, full 800×496 frames at 1× viewing size, matching 2× crops and
4× details in `/tmp/codex-skyscraper/sheet.png`. Level 66 in all five themes,
and ascending level 85. Also staged open/furled umbrellas and the steam vent,
sprinkler, polisher and shredder in idle/charge/fire/rest, before/after at 1×,
in `/tmp/codex-skyscraper/readability-sheet.png`. The window wall changes the
full-frame read; pale faces, warm umbrellas, red guards, desks, hazards, lifts,
fire escape, booth and exit remain distinct. Cool glass and distant offices
keep it separate from the Factory's assembly floor and the Rooftops' brick
terraces. Live lights were cleared off the glazing mullions during review.

**Pipeline:** ordinary scaled rectangles in `tools/render.js` were using the
rotation rasterizer and inverse-mapping every pixel. A fast path now fills
axis-aligned rectangles with exact integer edges directly. Clipped row spans
blend inline, creating the pixel callback only for the fallback; fractional
edges,
rotated sprites and the existing res-1 identity recipe retain their paths.
A pixel-centre test covers translation, clipping, negative sizes, alpha and
fallback transforms. All **1,140** full-frame comparisons across nineteen biomes,
two layouts,
three ticks, five themes and res 1/2 are byte-identical between the old and
optimized rasterizers. Interleaved total render work fell **15.429 →
7.555 s** (**51.0% less**, 2.04× faster);
`renderer-verify.json` records the comparison. Skyscraper tests now compare SHA-256
pixel digests, limit recording to 20k fills and bound footprint loops, following
the Factory memory fix; failed assertions cannot build giant buffer diffs.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved old/new, after tests and coverage finished.
Level 9: actors **0.745 → 0.779 ms**, full terrain + actors
**4.224 → 5.001 ms**. Level 47: actors **0.710 → 0.759 ms**, full terrain + actors
**9.886 → 11.422 ms**. Subway control, level 18: actors **2.452 → 2.443 ms**, full terrain + actors
**16.424 → 15.913 ms**. Terrain is cached in ordinary play;
these are Node raster times with the optimized tool, not browser FPS.

**Next:** ready for Skyscraper art review. Committed on `codex/skyscraper` only;
no push or deployment.

Reviewed and merged by the loop. Level 9 at res 2: lit night-city windows behind the floors; agents, desks, stairs and exit all readable. In the merge, `tools/render.js` keeps main's axis-aligned fast path from 194 (it covers fractional edges too and is verified bit-identical) in place of this branch's integer-edge `scaledBounds`/`paintRect`; the branch's pixel-centre test in `png.test.js` now checks main's path.

**Deployed** after 195 (name="build" content="cf7bd9cd"), gated on a passing check (913 tests, 11 s): the Skyscraper art. Level 9 in headless Chromium, no console errors; night-city windows behind the floors.

## 196 — 2026-10-14 · AGI achieved (sometimes), and everybody gets a voice

**AGI.** About one colony in eight (`AGI_CHANCE`, from its own `agiRng`, so the
cast and the level are the same either way) has one agent in gold: the colony's
suit in `#d9a826` and a few pixels of glitter that twinkle around it, whole
pixels so the Omarchy panel shows it too. It is otherwise an ordinary agent —
same trait, same rules, same umbrella — and a hero never wears it (the next one
through the hatch does). Ticker: AGI DETECTED IN THE COLONY when it drops in;
AGI ACHIEVED · IT WENT HOME, or AGI LOST · STILL FIVE YEARS AWAY. The report card
gets a gold "AGI ACHIEVED. IT WENT HOME. +1 BONUS" row or a red obituary. A
level that ends on the stall cutoffs with the AGI still pacing counts it lost;
Reload brings the gold back with the agent (AGI RESTORED FROM BACKUP). The
rescue counts once toward the global total like anybody's — the counter, its
bounds and its validation are untouched; the bonus is on the card only. Outcome
gains four lines each way. The pixel font gains "." and "-".

**Voices.** Quips (res 2, the newest wins): a dreamer says EXIT! when it sees
its mirage and OH. when it arrives; the front of a 429 queue says AFTER YOU and
each agent let through says 200 OK. sfx.js, synthesised like the rest: a sine
glissando with a late fifth for a mirage, a soap-bubble pop when it dissolves, a
two-beat telephone busy signal for 429 and a single blip per 200 OK, a glitter of
high notes when the AGI appears, a six-note arpeggio when it gets home (in place
of the ordinary home chirp) and a slipping-roadmap four-note fall when it does
not (in place of the ordinary down).

**Checked:** 400 colonies: 7–19% have an AGI (test bound), never more than one.
24 levels with the AGI forced: every one ends home or lost, never both, never
neither, no hangs. `simcheck play 60` unchanged: 60/60, 881/929, 0 hangs.
`test/agi.test.js` (8), quip tests in dreamer/ratelimit, two sfx tests (each new
cue plays; the AGI's homecoming replaces the ordinary chirp: exactly six
oscillators). `npm run check` 925/925 in 11 s; CRAP worst 29.2.

**Deployed** after 196 (name="build" content="8c67a72a"), gated on a passing check (925 tests): the golden AGI, and sounds and quips for the dreamer and the 429 queue. Levels 3, 9 and 14 in headless Chromium, no console errors.

## 197 — 2026-10-14 · A play-test harness, a 429 that only queues queues, and the level as a commit

**Tool: `npm run playtest -- 1-20 [--seeds N] [--json]`** (`tools/playtest.js`).
Plays every (level, colony) pair headlessly on worker threads — 800 runs of
levels 1–20 in about 3 s — and reports per level: home %, worst run, hangs,
runs that ran out the clock, runs ended by the stall cutoff and how many were
stranded, agents written off as looping, agents still queued at the end, and
how often the dreamer, the 429 and the AGI (h/l) turned up; then a "worth a
look" list, worst first. Exits non-zero on a hang or a stuck queue. Colonies
come from simcheck's `colonySeed` with a salt per run, so any run can be
replayed.

**Found and fixed — the 429 was causing the worst regression.** Level 6 (Ice
Cave) fell from 93% to 72% home against the pre-dreamer code, with timeouts and
24 agents written off as looping. A/B on the same colonies: with the 429 on,
17/19 home became 6/19, and 12/19 became 1/19. Every crowd it held was a stuck
colony milling both ways on the bottom floor (idle counts in the hundreds), and
holding them still took the time the director needed to get them out. A crowd
now only qualifies if everyone in it faces the same way and has made progress in
the last 60 ticks (`LIMIT_FRESH`) — a queue, not a jam. With real queues only it
fires less, so the coin went from 0.6 to 0.85: about 4–6% of runs. Over 40
colonies a level, 1–20 now match the pre-dreamer code within noise (level 6:
90% vs 91%; overall 95% vs 95%); `simcheck play 60` unchanged at 881/929.

**Found, not fixed — stragglers at a debris-filled crossing.** The tool's top
entries are pre-existing and the same on the old code: level 10 (Trench) ends
on the stall cutoff in 26/40 runs, level 2 in 18/40, level 18 in 13/40, each
with one or two agents stranded — no hangs, the cutoff ends the level. Traced
on level 10, salt 3: the bottom crossing (pit x31–42) is part-filled with bridge
and debris that leaves a one-cell bottomless gap at x39 between solid
footing either side. The straggler paces x12↔x39 with 22 builders in the
toolbar and never bridges it: the crossing's far lip is measured from the pit's
edge (x43, a row lower), not from the debris. A rule that let a diver learn the
current after three sweeps was tried and reverted — it changed nothing, because
the current was not what held them. Next for a focused iteration.

**Report card: the level as a commit.** Its last line is now a fake git commit
in the game's voice, deterministic from the finished world, hash included:
`D8FBB08 FIX: 17/19 AGENTS WENT HOME; 1 HALLUCINATED AN EXIT`. FEAT when all
are home ("SHIP ALL 18 AGENTS HOME"), REVERT for none, HOTFIX when the clock
ran out, FIX otherwise; up to two notes that fit, most interesting first (AGI
ACHIEVED / POSTPONED, N HALLUCINATED AN EXIT, N LOST IN PROD, N UMBRELLAS, SCOPE
CHANGED MID-SPRINT), and `(#429)` when a queue happened. At most 64 characters,
inside the plate. The font gains `: # ( ) , ;`. The plate is 16px taller on
every card; the escort test's pinned heights moved by exactly that.

**Tests:** `commit-line.test.js` (4), `playtest.test.js` (4: a repeatable run,
summaries and problem order, arguments, workers end to end and the report's
verdict). `npm run check` 933/933; CRAP worst 29.2.

Not deployed: deploys are now batched, at most about hourly.

## 198 — 2026-10-14 · Further under the sea (on a branch)

**Change:** Draw-only, page-resolution Trench art. Twelve explicit dark-water
bands deepen toward the bottom; four dim nested light curtains with broken
edges descend from water overhead. One large distant whale silhouette has a
blunt head, deep belly and flukes, with no eye, port or hazard colours. Curved
kelp beds add green silhouettes at the lower storeys. The original sediment,
grain, rock spires, kelp, sea filter, fish, marine snow, pits/downwell arrows,
divers, gear, hazards, booth and exit retain their recipes. Sim, Palette and
Outcome are unchanged. Based on approved `codex/skyscraper` (`860af5a`), as
requested, rather than picking up unrelated main work.

All large art is cached behind the original backdrop and terrain. Only eight
faint caustic fragments, twelve small rising bubble rings and one kelp tip per
bed animate: at most **68** rectangles per actor pass. Live pixels reject
current terrain, exit/decor bounds, hazard zones with a margin, and the pit
throats, preserving the current and downwell cues. Positions come from level
and original corridor metadata, so carving cannot relocate the whale or kelp.
Every addition requires Trench, `w.submerged` and `(w.res || 1) >= 2`, uses the
half-pixel grid, and reads ticks without world writes, RNG or scenery state.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-trench/coverage-safe.sh` pass: **895** tests. Seven new component
tests cover resolution/submerged gates, read-only proxies, forbidden renderer
RNG, deterministic pixel digests, balanced canvas state, half-pixel placement,
cached versus live art, fixed anchors after carving, both whale directions,
live draw-call budget, all crossed terrain corners, fixture/decor/exit/pit
clearance, and foreground ordering. Original component digests at res 1/2 are
unchanged. Four 600-tick Trench replays compare complete world digests with
and without drawing, pinning Sim's cosmetic animation/blood randomness per
step; swimming, sinking and current play remain identical. CRAP: **0**
functions at or above 30, maximum **29.3**; new helpers at most **8.0**, all
with 100% coverage.

The same resource caps apply: Node heap **2048 MB**, `ulimit -v 6000000`,
check with one test worker, coverage with two bounded workers, and the driver
waits for other Node test runs before each phase. Factory's art test remains
explicitly excluded per the standing instruction. Pixel assertions use small
digests, recording is capped at 20k fills, and accent footprint rectangles are
bounded to one cell in width/height. Scripts and results are in `/tmp/codex-trench/`.

**Looked:** baseline/branch comparisons on levels 10, 29 and 48, ticks 77/476,
full 800×496 frames at 1×, matching 2× crops and 4× details in
`/tmp/codex-trench/sheet.png`; level 67 in all five themes. Staged open/furled
umbrellas, rising/descending swim poses, and vent/shark/current/geyser/brazier/
tesla/fence in idle/charge/fire/rest in `readability-sheet.png`. Copper helmets,
oxblood guards, umbrellas, original fish and hazard tells, chests and exit
remain distinct. Review moved the whale clear of its bay's obstacle face and
joined the moving tips to their cached kelp stems.

Seeded parent/branch comparison: **1,080 identical frames** across the other
eighteen biomes (two layouts, ticks 77/240/600, five themes, res 1/2).
Trench's **60** res-1/unspecified-res frames are identical; all **30** res-2
frames changed. Baseline, harness and isolation result are in the review folder.

**Pipeline:** reused the approved faster shot rasterizer and the automatic
validation queue. Coverage now writes a progress reporter alongside LCOV, so
the slow phase exposes the running test and failures in `crap-final.log`
instead of requiring repeated process inspection. No package/tool source changes.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after check and coverage.
Level 10: actors **0.566 → 0.612 ms**, full terrain + actors
**6.347 → 7.378 ms**. Level 48: actors **0.734 → 0.772 ms**, full terrain + actors
**7.669 → 8.798 ms**. Subway control, level 18: actors **1.071 → 1.072 ms**, full terrain + actors
**15.150 → 15.114 ms**. Terrain is cached in ordinary play;
these are Node raster times, not browser FPS.

**Next:** ready for Trench art review. Committed on `codex/trench` only;
no push or deployment.

Reviewed and merged by the loop. Level 10 at res 2: light shafts, kelp, fish and a faint whale; divers and exit readable.

## 199 — 2026-10-14 · Stragglers: four rules that kept the last ones out

Traced with `npm run playtest` and fixed where the stragglers actually were.
Each rule has a unit test in `test/stragglers.test.js` that fails on the old
code.

**Level 10 (Trench), the bottom crossing.** Three things stacked:
- `bridgeLanded` tested only the far cell of a two-cell stride, so a bridge was
  "landed" with a bottomless hole still in the nearer cell — every bridge over
  that crossing ended one brick short.
- `makeBuildRoom` would lift a walker standing in a brick's cell but not a
  blocker; the blocker guarding the far lip stood in the last brick, the
  builder waited out its patience and abandoned the bridge. A blocker is now
  lifted onto the brick and keeps blocking.
- `edgeBottomless` only bridged when the landing was more than two cells out,
  so a one-cell gap fell through to turning round. And a straggler that had
  spent its trait's build cap could not bridge it with twenty builders in the
  toolbar: once the rest of the colony is settled (`lastOut`, the stall
  cutoff's own test) the cap no longer applies — to crossings only; letting
  stragglers lay free staircases too ran level 54 out of the clock in three
  more colonies of 24, so that was taken back out.
Level 10: home 82% → 88%, stall-cutoff endings 15 → 8 of 24 colonies.

**Level 49 (Desert), a hero in lock-step.** Context Window's quarry move went
on the east wall of a bottom corridor — away from home — and its 220-tick
cooldown came back exactly as it reached that wall again, having turned at the
west wall it needed on the way. A hero now turns at a wall facing away from
home and keeps its move (`crossingHelps`). Level 49: stall endings 9 → 0 of
24, home 94% → 97%.

**Measured, levels 1–57 × 24 colonies, against main before this iteration:**
home 95.15% → 95.31% (+33 agents), stall-cutoff endings 77 → 63, clock-outs 9 →
10 (level 10's one), hangs 0 → 0. No level worse by 2 points or more.
`npm run check` 944/944; CRAP worst 29.2.

**Still on the list (21–57, 24 colonies each), for later:**
- level 54 (Clock Tower): runs out the clock in 5/24, also on the old code
- level 24: stall cutoff in 8/24 (9 stranded)
- level 36: stall cutoff in 7/24
- levels 32 and 51: stall cutoff in 5/24 each
- levels 25, 40, 41, 42, 55: one straggler in one run each
- 1–20: level 2 (stall 18/40), level 18 (13/40), level 6 (clock 5/40)

Not deployed: 17 minutes since the last deploy (196, 23:40); the next batch
covers 197–199.

## 200 — 2026-10-15 · Heroes wait for their move, builders trim debris, and the page on a phone

**Stragglers, round two** (`npm run playtest`, levels 1–57 × 24 colonies,
against 199): home 95.31% → 95.42% (+23 agents), stall-cutoff endings 63 → 48,
clock-outs 10 → 10, hangs 0.
- **Heroes wait at a wall toward home** when their move is due back within
  `HERO_WAIT` (130 ticks), instead of turning. Turning meant a walk to the far
  end and back, and with two walls in a row each needing the move the hero
  fell into lock-step: level 24's Auto Complete cleared one pillar, met the
  next on cooldown, walked a hundred cells and spent the move elsewhere on the
  way. Level 24: stall endings 8 → 1, home 85% → 89%; level 51: 5 → 1; level
  2: 11 → 8. Level 32 got slightly worse (stall 5 → 8, home 98% → 97%) and one
  level-27 colony now runs out the clock — on the list below.
- **A crossing builder trims a thin scrap of debris** at head height (two
  cells of the agent's height at most, never steel) rather than abandoning the
  bridge (`trimOverhang`). Level 10: 88% → 90%, stall 8 → 7, its one clock-out
  gone.
- Tried and reverted: not counting a current the diver is already standing in
  as "ahead". It stops the per-tick flipping inside a charging current, but
  divers then walked on into it and were swept off the board — level 10 fell
  from 88% to 83%. The flip is clumsy and safe; it stays.
Level 10's remaining 7/24 are a mix of debris tangles at the bottom crossing
(bricks at body height left by earlier bridges) — not one rule.

**Phone.** New tool: `npm run phone` serves `public/` locally, opens it in
headless Chromium with touch emulation at 390×844 portrait, 844×390 landscape
and the desktop, saves screenshots, and reports controls under 44px, sideways
scroll, a board or game below the fold, and hover-only UI. Portrait was
already fine (44px controls, the whole game on the first screen; the board
crops its outer edges as designed). Landscape was not: the title and blurb
pushed the board below the fold and every control off-screen. Phones on their
side (`pointer: coarse`, landscape, under 500px tall) now get the game side by
side — board at 1× on the left, the readout, skills and controls stacked on the
right, all on one screen; title and blurb hidden, the rest of the page still
below. `touch-action: manipulation` on the board and buttons stops a double
tap zooming the page. The desktop look is unchanged. There is no skill
selection or release-rate control to make thumb-sized — nobody plays this
game; the skills are a readout, and speed and pause are the controls.

**Tests:** two more in `stragglers.test.js` (trim, hero wait), and
`phone.test.js` (7): the judgement, arguments and report, the local server,
and one end-to-end Chromium capture (skipped where there is no chromium).
`npm run check` 953/953 in 12 s; CRAP worst 29.2.

**Still on the list:** level 54 clock-outs 5/24; level 36 stall 7/24; level 32
stall 8/24; level 10 stall 7/24; level 18 stall; level 2 stall 8/24; one
level-27 clock-out.

## 201 — 2026-10-14 · Servers in the cold aisle (on a branch)

**Change:** Draw-only, page-resolution Data Center art, based on approved
`codex/trench` (`78d03c5`). Staggered distant cabinet rows have six server
faceplates, vents, rails and dim status dots each. Nested blue bands light the
cold aisles; overhead cable trays carry paired cables and regular ties. One
small half-pixel `UP 99` display sits in the first cabinet. Fine slots, handles
and lower rims detail the surviving foreground rack cells. Original materials,
backdrop columns/dots, rack lights, updraft streaks, decor, pits, hazards, guards,
missions, agents, gear and exit keep their recipes. Sim, Palette and Outcome
are unchanged.

The cabinets, glow, trays, display and faceplates are cached in the terrain
pass, beneath original props and exit. Only two half-pixel status dots per
cabinet animate, at most **108** fills in the tested layouts, with no raster
scan. Live dots reject solid terrain, original decor/exit bounds and hazard
zones with a margin. All additions require Data Center and `(w.res || 1) >= 2`,
use the half-pixel grid, and read existing ticks without RNG or world writes.
Cabinet anchors use original corridor metadata, so carving does not move them.
Foreground rack columns use the original `updraft` pitch markers rather than
assuming every ROCK cell is a server; steel and built dirt stay untouched.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-datacenter/coverage-safe.sh` pass: **904** tests. Nine new tests cover
resolution/biome gates, read-only proxies and forbidden RNG, deterministic
pixel digests, half-pixel placement and balanced canvas state, static anchors,
solid rack footprints, live budgets/fixture clearance, foreground ordering,
unchanged original component digests, Hot Swap/Capacity Planning terrain edits,
and four 600-tick updraft playthroughs with complete world digests. CRAP:
**0** functions at or above 30, maximum **29.3**; new helpers at most
**8.0**, all with 100% coverage.

Node heap **2048 MB**, `ulimit -v 6000000`, one check worker/two coverage workers,
and waiting for other Node test runs before every phase remain in effect.
Factory's art test stays explicitly excluded per the standing instruction.
Assertions compare small digests, recording is capped at 20k fills, and accent
footprint loops are bounded to one cell. The full check took **80.7 s**, coverage **109.7 s**.

**Looked:** baseline/branch pairs on levels 12, 31 and 50, ticks 77/476, full
800×496 frames at 1×, matching 2× crops and 4× details in
`/tmp/codex-datacenter/sheet.png`; level 69 in all five themes. Open/furled
umbrellas and Hot Aisle/geyser/brazier/tesla/fence/crusher/turret in
idle/charge/fire/rest are paired in `readability-sheet.png`. Pale faces,
umbrella grips/canopies, hostile colours, hazard tells and the bright exit
remain clear against restrained cabinet faces and blue light.

Seeded comparison: **1,080 identical frames** across the other eighteen biomes
(two layouts, ticks 77/240/600, five themes, res 1/2). Data Center's **60**
res-1/unspecified-res frames are identical; all **30** res-2 frames changed.
Baseline, harnesses, isolation results and logs live in `/tmp/codex-datacenter/`.

**Pipeline:** reused the approved faster shot rasterizer and queued validation
with coverage progress reporting. Removed the comparison harness's unused raw
sheet and its duplicate crop scaling/pixel-copy loops; the labeled sheet builder
now owns composition. One timed pair: **0.590 → 0.346 s**, peak RSS
**175,820 → 103,028 KB**. No package/tool source changes.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 12: actors **1.100 → 1.140 ms**, full terrain + actors
**6.800 → 7.918 ms**.
Level 50: actors **1.073 → 1.088 ms**, full terrain + actors
**7.119 → 8.316 ms**.
Subway control, level 18: actors **1.084 → 1.080 ms**, full terrain + actors
**15.081 → 15.092 ms**.
Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Data Center art review. Committed on `codex/datacenter`
only; no push or deployment.

## 202 — 2026-10-15 · Turn the rack lights up (on a branch)

**Change:** One Data Center revision on `codex/datacenter`, following review
of `5423f3e`. The original single canvas-pixel dots at 65% opacity did not read
at 1×. Each distant rack now has three fixed **3×2 canvas-pixel** lamp clusters
at full opacity: two green and one amber, with a rare red cycle. Lamps blink
at independent **17/41/73-tick** rates with cabinet-specific offsets; they
change colour at their mount, rather than moving between faceplates. Dark
indicator housings keep the off phase visible. Brighter top/left bevels,
faceplate lips and a shaded right side give the cabinet depth while the broad
faces remain subdued behind dark suits. Three nested low-alpha blue bands
meet the floor in each cold aisle. Glow, bevels and housings remain cached;
only the three tiny lamps per cabinet run per frame (at most **162** fills
in the tested layouts). Live lamps check both crossed terrain rows and retain
exit/decor/hazard clearance. Original recipes, Sim, Palette and Outcome stay
unchanged; all additions remain res-2 only, pure and RNG-free.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-datacenter-revision/coverage-safe.sh` pass: **906** tests. Eleven
Data Center tests now check lamp colours, opaque multi-pixel footprints,
independent cadence, fixed lamp coordinates and the cached floor pools,
alongside the existing gates, purity/state, clearance, original component
digests, events and four simulation replays. CRAP: **0** functions at or above
30, maximum **29.3**; Data Center helpers at most **8.0**, all with
100% coverage. Same **2048 MB** heap, `ulimit -v 6000000`, one check worker/two
coverage workers and queue before each phase. Factory's art test remains
excluded under the standing instruction. Digests, 20k draw-call recording
caps and bounded accent footprint loops remain in place.

**Looked:** matching initial/revised pairs on levels 12, 31 and 50 at ticks
77/476 in `/tmp/codex-datacenter-revision/sheet.png`, with 1× full frames,
2× crops and 4× details. The exact `shoot.js crop 12 --res 2 --ticks 476`
region is paired in `shoot-crop-pair.png`; LEDs read plainly there and in the
1× board. Level 69 in all five themes, plus staged open/furled umbrellas and
seven hazards in idle/charge/fire/rest, retain clear suits, faces, canopies,
hazard tells and exit. `blink.gif` shows five status phases; the colour tests
exercise the occasional red as well. The seeded comparison still gives
**1,080 identical frames** across the other eighteen biomes and **60 identical**
Data Center res-1/unspecified-res frames; all **30** Data Center res-2 frames
changed. Baseline, harnesses and results are in the revision review folder.

**Pipeline:** retained the fast rasterizer, single composition pass, progress
reporting and validation queue. Added matching shoot-style crops and blink
shots from one seeded 476-tick world, avoiding repeated process starts and
simulation advances for each comparison phase. No package/tool source edits.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved initial/revised, after tests and coverage.
Level 12: actors **1.136 → 1.152 ms**, full terrain + actors
**7.938 → 8.172 ms**.
Level 50: actors **1.094 → 1.110 ms**, full terrain + actors
**8.371 → 8.516 ms**.
Subway control, level 18: actors **1.074 → 1.089 ms**, full terrain + actors
**15.280 → 15.158 ms**.
Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Data Center revision review. Commit on `codex/datacenter`
only; no push or deployment.

Reviewed and merged by the loop. Level 12: racks with clear green and amber LEDs and cabinet depth; agents readable.

## 203 — 2026-10-15 · Frame rate measured, and rubber duck debugging

**Tool: `npm run fps -- 8 9 10 [--seconds N] [--speed 0-2] [--json]`**
(`tools/fps.js`, on top of phone.js's local server and Chromium driver). Opens
each level on the real page at page resolution, times requestAnimationFrame
for N seconds and reports median fps, the 5th-percentile fps, the worst frame,
the share of time in tasks over 50ms, and the renderer main thread's busy share
from CDP's TaskDuration — the headroom. Measured on this machine, headless
software rendering, the fastest speed: Factory 8, Skyscraper 9, Trench 10, Data
Center 12 and Subway 18 all hold **60 fps, p5 60, worst frame 17ms, no long
tasks, main thread 9–12% busy**. Nothing to fix; the art passes cost nothing a
frame can see. Also: phone.js's `close()` now waits for Chromium to exit before
removing its profile (it threw ENOTEMPTY and took a report with it).

**Rubber duck debugging.** The first agent of a level to go 300 ticks without
getting any closer to home has a one-in-four chance of a rubber duck dropping
onto the floor a few cells ahead of it (behind, if there is no room ahead;
never over a pit, in a known hazard or in mid-air) — A RUBBER DUCK APPEARS.
Walking into it, the agent stops, holds it up and explains: SO BASICALLY…
OH! After 48 ticks everything the stall rules know about its loop is wiped and
it gets the rescue they would have run six hundred ticks later (`forceEscape`),
without the bomb — EXPLAINED IT TO THE DUCK. Once a level; a duck nobody reaches
goes after 600 ticks; a fall, a lost floor or anything else that isn't walking
ends the explanation. A plop and a squeaky quack in sfx.js, four outcome lines,
and RUBBER-DUCKED on the report card's commit line. Over 57 levels × 24
colonies a duck is used in 163 of 1368 runs (12%); home 95.42% → 95.38%,
stall endings 48 → 51, hangs 0 — a gag, balance-neutral within noise.

**Found on the way, and now a check.** The duck's `DUCK_REACH = 4` was silently
replaced by the Debug hero's `DUCK_REACH = 18` declared three thousand lines
later in the same file — the second `var` wins. The duck's constants are now
`RUBBER_*`, and `tools/check-core-refs.js` (part of `npm run check`) fails on a
name declared more than once within a core file, as it already did across
files.

**Tests:** `duck.test.js` (8), `fps.test.js` (3, one a 1-second real Chromium
measurement). `npm run check` 974/974; CRAP worst 30.0 (`drawHeldDuck` keeps
`drawAgent` under the gate).

## 204 — 2026-10-15 · Level 10 under four, and a pep talk for whoever is watching

**Level 10 (Trench): stall-cutoff endings 9 → 3 of 24 colonies, home 90% →
92%.** With the bottom crossing bridged (199–200), the straggler now reached
the current between it and the door and lost there:
- **After a sweep a diver kept walking the way the water carried it.**
  `stepSweep` turns a diver to face the way it is carried — right while it is
  carried — and nothing ever turned it back, so after every sweep it walked
  the length of the corridor away from home and the stall cutoff ended the
  level on the way. The heading it had when the current took it (`sweptFrom`)
  is given back when the sweep ends. This is the fix that moved the number.
- **Alone at a current that is charging or running, a diver waits at its edge**
  (`currentAhead`, `aloneHere`) instead of turning and walking the corridor
  back. Only alone: with the whole colony queueing at the edge more of them
  were in reach when it came on, and level 10 lost more than it gained (90% →
  86%); "last out" was too late a test — the straggler meets the current while
  one or two others are still somewhere.
Levels 1–57 × 24 colonies against 203: home 95.38% → 95.41%, stall endings 51
→ 45, clock-outs 10 → 10, hangs 0; no level worse by 2 points.

**Pep talks — one light way for the watcher to take part.** Tap or click an
agent and it hears it: YOU'RE ABSOLUTELY RIGHT! · GREAT QUESTION! · BRILLIANT
INSIGHT! · SHARP OBSERVATION! · PERFECT. SHIP IT! · LOVE THIS APPROACH! — a
bubble, the AGI's glitter for a moment, a two-note chirp, and a small nudge: a
walker that has been stuck for 120 ticks turns and tries the other way, any
other walker steps out 20% faster for three seconds (`pepTalk`). Each agent at
most once every 15 seconds and the board at most once every two-thirds of a
second, so tapping cannot play the level; the stall rules still see how long a
stuck agent has been stuck. A tap anywhere else on the board, or while paused,
still pauses. Nothing in the simulation runs without a tap, so the play-test
and the global counter are untouched — the counter only ever sees ordinary
rescues. The page exposes the live world read-only as `window.AgentWorld()`
for tools and tests. The font gains an apostrophe.

**Tests:** `pep.test.js` (6, one a real touch tap in headless Chromium at
844×390: an agent tapped gets a pep talk and the game keeps running, empty
board tapped pauses), two more in `stragglers.test.js`, a pep cue in
`sfx.test.js`. `npm run check` 983/983; CRAP worst 30.0.

## 205 — 2026-10-15 · A reading room after hours (on a branch)

**Change:** Draw-only, page-resolution Library art, based on approved
`codex/datacenter` (`b5a02d9`). Tall timber cases span the building behind its
playable shelves. Six muted cloth-binding colours, varied spine widths/heights,
recessed edges and sparse title bands make the books readable at 1×. Two green
banker lamps per storey have brass mounts and warm undersides; six explicit
light bands below each fade from **0.11 to 0.05** opacity. Two tall wall-side
ladders and a raster-font `SILENCE` plaque finish the room. Original book cells,
free shelf climbing, materials, props, lamps/dust, hazards, pits, hostiles,
missions, agents, umbrellas and exit keep their recipes. Sim, Palette and
Outcome are unchanged.

All large art and light are cached beneath the terrain and original props.
Only six small motes per lamp animate (budget **≤72** fills in the tested
layouts), confined to the actual light bands and rejecting current terrain,
exit/decor bounds, hazard zones and pit throats. Movement is arithmetic from
level metadata and ticks, without RNG, scenery state or world writes. Anchors
stay fixed after carving. Every addition requires Library and
`(w.res || 1) >= 2` and uses the half-pixel grid. The warm pool runs before the
agents; their opaque skin, shirt, eye and umbrella pixels retain their colours.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-library/coverage-safe.sh` pass: **915** tests. Nine new page-art tests
cover biome/resolution gates, read-only proxies and forbidden RNG, deterministic
pixel digests, half-pixel placement/state restoration, fixed cached anchors,
varied bindings, pool opacity, dust budgets/cone bounds/terrain clearance,
foreground ordering, opaque actor colours beneath lamps in all five themes,
unchanged original component digests, Deprecation Notice/Reindexing terrain
edits, and four 600-tick shelf-climb replays with complete world digests.
CRAP: **0** functions at or above 30, maximum **29.3**; new helpers at most
**5.0**, all with 100% coverage.

Same **2048 MB** Node heap, `ulimit -v 6000000`, one check worker/two coverage
workers and waiting for other Node test runs before every phase. Factory's art
test remains excluded under the standing instruction. Component image assertions
use digests, recording stays capped at 20k fills, and accent footprint loops
stay bounded to one cell.

**Looked:** original/branch pairs on levels 13, 32 and 51 at ticks 77/476 in
`/tmp/codex-library/sheet.png`, with full 800×496 frames viewed at 1×, 2× crops
and 4× details. The exact `shoot.js crop 13 --res 2 --ticks 476` region is
paired in `shoot-crop-pair.png`; books, lamps, ladders and plaque read at 1×
and in the crop. Level 70 in all five themes; open/furled umbrellas and
rockfall/geyser/brazier/tesla/fence/crusher/turret in idle/charge/fire/rest in
`readability-sheet.png`. Warm light leaves pale faces, dark suits, canopy/grip
shapes, hostile colours, hazard tells, mission objects and the exit clear.
`dust.gif` shows the small live pass across five staged ticks.

Seeded parent/branch comparison: **1,080 identical frames** across the other
eighteen biomes and **60 identical** Library res-1/unspecified-res frames
(two layouts, ticks 77/240/600, five themes). All **30** Library res-2 frames
changed. Baseline, harnesses, isolation results and logs are in the review folder.

**Pipeline:** the Library's dense original shelf/terrain strokes exceeded the
full-scene recorder's 20k limit. The ordering check now streams four paint
markers and a serial number, stores no fill array, and caps the complete pass
at 100k calls. Component recording retains its smaller cap. Reused the fast
rasterizer, single sheet composition pass, validation queue and coverage progress
reporter. The helper now marks every phase log pending before queueing and
writes a completion marker only after all three phases pass, preventing stale
results from an earlier run being mistaken for current ones. Matching shoot-style
crops and dust phases reuse one seeded world.
No package/tool source edits.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 13: actors **1.074 → 1.105 ms**, full terrain + actors
**29.179 → 32.566 ms**.
Level 51: actors **1.605 → 1.615 ms**, full terrain + actors
**28.257 → 33.792 ms**.
Subway control, level 18: actors **1.151 → 1.147 ms**, full terrain + actors
**15.420 → 15.227 ms**.
Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Library art review. Commit on `codex/library` only;
no push or deployment.

## 206 — 2026-10-15 · Put the shelves in the back (on a branch)

**Change:** Library revision on `codex/library`, following review of
`f1c0b4d`. Distant bindings drop from **0.72** opacity to **0.38 → 0.28** down
the case; title bands, timber boards and edge highlights also fade with depth.
A darker recess separates those stacks from the original opaque book floors.
The tall cases and ladders remain readable, with the walkable shelves now the
stronger plane. Removed the extra clipped `SILENCE` sign; the original exit
plaque keeps its recipe. Green reading lamps now cast warm centres at
**0.18 → 0.11** opacity, feathered with wider bands at **0.065 → 0.04**.
The soft cones light the distant shelf face and stop before the floor.
They are cached beneath terrain and actors; no new per-frame work. Original
materials, book walls, props, hazards, missions, agents, umbrellas and exit are
unchanged. Sim, Palette and Outcome are unchanged; all additions remain res-2
only, deterministic and free of RNG/world writes.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-library-revision/coverage-safe.sh` pass: **916** tests. Ten Library
page-art tests now verify depth fading and compare distant binding luminance
with the original walkable shelves across all five themes. They also check
feathered pool geometry/strength and removal of the extra plaque. The existing
purity, resolution, cache anchors, dust clearance/budget, ordering, opaque
actor colours under lamps, original component digests, terrain events and
four shelf-climb replays still pass. CRAP: **0** functions at or above 30,
maximum **29.3**; revised helpers at most **4.0**, all at 100% coverage.
Same **2048 MB** heap, `ulimit -v 6000000`, one check worker/two coverage
workers, and queue before each phase. Factory's art test remains excluded.
Digest assertions, capped recording, streamed ordering markers and bounded
footprint loops remain in place.

**Looked:** the reported **level 13, seed 3, tick 400**, full 800×496 board
viewed at **1×** and exact `shoot.js crop` pair in
`/tmp/codex-library-revision/shoot-crop-pair.png`. Walkable floors read as ground,
background books sit back, the clipped sign is gone, and warm cones are visible
beneath green shades without bleaching dark suits or pale faces. Matching
initial/revised levels 13, 32 and 51 at ticks 77/476 are in `sheet.png`; level
70 in all five themes, plus seven hazards and open/furled umbrellas in
idle/charge/fire/rest, are in the review folder. Hazard tells, hostile colours,
mission objects and exit remain clear.

The full comparison preserves **1,080 frames** across the other eighteen
biomes and **60** Library res-1/unspecified-res frames; all **30** Library
res-2 frames changed. A separate actor-only comparison gives **120 identical
res-2 frames** (four Library layouts, two colony seeds including 3, ticks
77/400/600, five themes), confirming the live pass is unchanged.

**Pipeline:** reused the bounded rasterizer, seeded single-world crop/phase
shots, streamed paint-order check and validation queue. This run uses pending
phase logs and a completion marker, so earlier results cannot look current.
The focused luminance check catches bright backdrop books without requiring
another screenshot review; actor-only digest comparisons separate cached
lighting changes from live rendering. No package/tool source changes.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved initial/revised, after tests and coverage.
Level 13: actors **1.107 → 1.108 ms**, full terrain + actors
**16.028 → 16.114 ms**.
Level 51: actors **0.778 → 0.780 ms**, full terrain + actors
**16.899 → 16.925 ms**.
Subway control, level 18: actors **1.092 → 1.088 ms**, full terrain + actors
**15.017 → 15.057 ms**.
Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Library revision review. Commit on `codex/library` only;
no push or deployment.

Reviewed and merged by the loop. Library: dimmer back shelves so the floors read, warm lamp pools, the clipped sign removed.

## 207 — 2026-10-15 · Library merged; level 54 waits at the gate

**Merged** `codex/library` (205–206 above) after review.

**Level 54 (Clock Tower): clock-outs 5 → 0 of 24 colonies, home 95% → 100%.**
The bottom floor has a run of pillars and then a clockwork gate. At a shut gate
an agent turned round (with `waitFor` so the loop detector would leave it
alone) — and turning meant climbing back over the pillars, spending a climber
each way, then meeting the gate again, until the toolbar or the clock ran out;
the level's hero, Beam Search, sat in its camp over the exit the whole time
because the colony only stands campers down when everybody still out is a
blocker or a camper. Now an agent waits at a shut gate, facing it: a gate is
shut for at most 90 ticks of its 240. Levels 1–57 × 24 colonies: home 95.41% →
95.51% (+20 agents), clock-outs 10 → 5, stall endings 45 → 46, average level
1224 → 1203 ticks, hangs 0; no other level moves 2 points.

Tried and taken back out: a camping hero breaking camp once the rest of the
colony is settled (`lastOut`). It got level 54 out of the clock too, but it
cost level 23 (Foundry, also Beam Search) three points, and the gate alone
does all of the work on 54.

`npm run check` 994/994; CRAP under 30.

**Still on the list:** level 36 stall 6/24 and one clock-out; level 32 stall
8/24; level 2 stall 8/24; level 18 stall; level 6 clock-outs; level 23 (87%,
Beam Search camping over the exit).

## 208 — 2026-10-15 · Daily standup, and share this run

**Daily standup.** Every fifth level, between the report card and the next
level, the colony that just got home holds one: up to five of them in a ring on
a plain floor in front of a sprint board (three columns of sticky notes, most
of them in the last), facing the middle, each in turn with a three-line bubble —
`YESTERDAY: FELL IN A PIT. / TODAY: NOT THAT. / BLOCKERS: GRAVITY.` The lines
come from what actually happened over the last five levels (Outcome.js
`standupFacts` / `standupRecap` / `standupLines`), most specific first: AGI
shipped or lost, hallucinated exits, rubber ducks, 429 queues, pits, deaths in
prod, blockers, umbrellas, bridges, changed scope; filler after that ("SHIPPED. /
SHIP AGAIN. / THIS MEETING."). Nothing in it is random. It runs on wall-clock
time, about five and a half seconds for five speakers whatever the speed, with
a soft murmur in sfx.js as each one starts (`AgentSfx.cue`), and a tap or
click anywhere on the board skips it. No survivors, no standup. The intro
dreamer, AGI and trait looks all carry through — they are the same agents.

**Share this run.** A "copy link" control (and the `c` key) copies the page's
address with `?level=N&seed=S` — this level, this colony — and shows a small
LINK COPIED toast (or COPY FAILED, if neither the clipboard API nor the old
select-and-copy is allowed). Opening such a link plays that level with that
colony once, then cleans the address bar so a reload or the next level is an
ordinary one. `public/agents/share.js` parses strictly — level 1–9999 and seed
0–2147483646 as plain decimal integers, no leading zeros, signs, decimals,
exponents, hex, whitespace or trailing junk — and ignores anything else.
Checked that a seed really replays: forty levels played twice under different
page randomness (`Math.random` only feeds animation phase and particles) end
identically.

**Tooling.** `check-core-refs` now also sees the second names in a
`var A = 1, B = 2` declaration, so those collide loudly too (proved with a
planted duplicate). Two `STANDUP_` constants that were declared that way had
been invisible to the test loader as well.

**Tests:** `share.test.js` (4: good links, nineteen bad ones, the URL builder
and round trip, seed replay), `standup.test.js` (4: facts and recap, priority
and determinism, every line fits and has glyphs, the meeting drawn read-only
with the bubble passing round), and `page-features.test.js` (2, in headless
Chromium: a shared link opens that colony and cleans the URL, a malformed one
is ignored, copy shows the toast; five finished levels lead to a standup that
holds the next level and a click skips). The pinned `generate(level, 0)` in
the transitions test now allows the seed. `npm run check` 1004/1004; CRAP
under 30; `npm run phone` fine on all three views with the new control.

## 209 — 2026-10-15 · Level 36: the hero out of camp

**Level 36 (Rooftops): stall-cutoff endings 6 → 2 of 24 colonies, home 92% →
93%.** Every one was the colony's hero, Beam Search, after the colony stood
it down from its camp:
- **Stood down, a camper turned at every wall** — a hero is barred from the
  toolbar, and the camp branch of `specialAtWall` just turned it. At a wall
  toward home it now borrows the colony's tools the way `forceEscape` already
  does for a stuck hero (`borrowWallTools`); facing away, it still turns.
  6 → 4.
- **Alone at a fixture about to fire, it turned and walked fifty cells back.**
  The edge-wait from 204 (a lone diver at a running current) now covers any
  fixture that is charging or firing, heroes included, as long as nobody else
  is within six cells and it is not already inside a reach. It stays out of
  `walkHazardZone`, which handles reaches that can be lethal all the time —
  waiting at one of those could hold an agent for good; `walkHazardAhead`
  only fires while the fixture is charging or firing, which passes. 4 → 2.
Levels 1–57 × 24 colonies against 208: home 95.51% → 95.51%, stall endings 46
→ 42, clock-outs 5 → 5, hangs 0; no level worse by 2 points. Two tests in
`stragglers.test.js`. `npm run check` 1006/1006; CRAP under 30.

**Deployed** at 00:42 after 209 (name="build" content="6d4123cd"), gated on a
passing check (1006 tests), covering 197–209: the play-test harness, the 429
fix, the commit line, the straggler fixes, the phone layout, `npm run fps`,
rubber duck debugging, pep talks, the gate wait, the daily standup, share
links, and the Trench, Data Center and Library art. Verified on production in
headless Chromium:
- a share link (`?level=7&seed=12345`, opened twice) plays the same colony both
  times and cleans the address bar; a real click on "copy link" shows LINK
  COPIED, puts `…/?level=1&seed=1899087605` on the clipboard, and opening that
  link plays level 1 with that seed;
- after five finished levels the daily standup holds the next level (four
  agents in the ring, a status bubble, the sprint board), and a click skips it
  to the next level without pausing; no console errors anywhere.
To reach a standup quickly the check finished five levels by hand on the live
page — which also reported their few agents to the global counter as rescues.
A few dozen at most; not repeated, and the next check of this kind will run
against a local server.
The skip hint was barely visible on the floor colour; it now uses the label
colour (committed after the deploy).

## 210 — 2026-10-15 · Level 32: a hero whose move cannot pass

**Level 32 (Library): stall-cutoff endings 9 → 6 of 24, home 97% → 98%.**
Hal Lucination phases through walls — but only onto floor within ten cells,
never through steel. On level 32 it waited out its cooldown at a pillar it
could not phase past (my 200 rule doing its job), asked, was refused, took a
third of its cooldown and turned, and came back to do it again. When its own
move cannot answer a wall toward home and the rest of the colony is settled,
a hero now borrows the colony's tools (`borrowWallTools`, as for the
stood-down camper in 209). Without the "rest settled" condition it also
helped level 27 but cost level 16 two points — a hero spending tools the
colony still needed mid-level — so it waits for `lastOut`. Levels 1–57 × 24:
home 95.51% → 95.53%, stall endings 42 → 39, clock-outs 5 → 5, hangs 0; no
other level moves. One test in `stragglers.test.js`. `npm run check` 1007/1007.

**List after 210, by severity:** level 6 clock-outs 3/24 (Ice Cave; the colony
runs out of climbers and bashers — balance, not a soft-lock); level 18 stall
8/24; level 2 stall 6/24; level 32 stall 6/24 (Hal Lucination wandering in
three different ways); levels 10, 23, 36, 55 stall 2/24; single runs on 4, 5,
9, 12, 24, 27, 38.

## 211 — 2026-10-15 · Level 18: heroes give way the same way everywhere

**Level 18 (Subway): stall-cutoff endings 8 → 0 of 24.** Gradient Descent, a
stomper, only drives down when home is below; on level 18 home is on its own
floor, and it was trapped in a two-cell pocket between an overhang and a wall,
turning at both every few ticks until the cutoff. Every exit from
`specialAtWall` that used to just turn — on cooldown, a move that cannot answer
the wall, a stomper with home level, a sub with home not above, the heroes
whose move is not for walls — now goes through `heroGivesWay`: mid-level it
turns as before (the colony needs its tools, and the move comes back); with
the rest of the colony settled and the wall between it and home, it borrows
the colony's tools (`borrowWallTools`, 209–210). Levels 1–57 × 24: home
95.53% → 95.54%, stall endings 39 → 31, clock-outs 5 → 5, hangs 0; no other
level moves 2 points. One test. `npm run check` 1008/1008; CRAP under 30.

## 212 — 2026-10-15 · A little sorting office (on a branch)

**Change:** Draw-only, page-resolution Mail Room art on `codex/mailroom`,
based on approved `codex/library` (`b84c73b`). Recessed 4×3 pigeonhole banks
carry folded, stamped envelopes, including empty slots and small stacks.
Warm paper and timber are muted, with the lower slots fading further: the
original opaque letter floors remain the stronger plane. Service-wall parcel
chutes have dark mouths, stepped ramps and string-tied parcels. One green
franking press per storey has trays, paper stock, a roller opening and a small
stamp. An optional raster-label `RETURN / TO / SENDER` bin appears only when
its complete rectangle clears terrain and fixtures, otherwise it is omitted.
Original materials, pigeonholes, letters, rails, props, tubes/capsules, hazards,
pits, hostiles, missions, agents, umbrellas and exit keep their recipes. Sim,
Palette and Outcome are unchanged.

The walls, chutes, presses and bin are cached beneath the original terrain,
props and actors. Only a small envelope and press head per station animate,
with staggered four-phase 120-tick cycles and at most **30** fills in the tested
layouts. Incoming paper moves through the press and emerges with a stamp.
Live pixels reject solid terrain, original exit/decor/hazard/pit bounds, tube
segments and both complete hoppers. Whole envelopes are omitted when occluded,
so no orphan fold or stamp remains. All additions require Mail Room and
`(w.res || 1) >= 2`, use the half-pixel grid and read existing ticks without
RNG, world writes or scenery state. Carving cannot relocate their anchors.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-mailroom/coverage-safe.sh` pass: **927** tests. Eleven new page-art
tests cover biome/resolution gates, read-only proxies and forbidden RNG,
deterministic digests, half-pixel placement/state restoration, cache anchors,
far/near sorting-panel luminance across five themes, empty/varied pigeonholes,
animation budgets, complete envelope/prop/pipe/hopper clearance, whole-bin
labels, paint ordering, unchanged opaque actor colours, original component
digests, Dead Letter Queue/Backlog edits on an intact corridor span, and four
600-tick pneumatic-tube playthroughs with complete world digests. CRAP: **0**
functions at or above 30, maximum **29.3**; new helpers at most **11.0**,
all with 100% coverage.

Same **2048 MB** Node heap, `ulimit -v 6000000`, one check worker/two coverage
workers and queue before each phase. Factory's art test remains excluded under
the standing instruction. Image assertions use small digests, component
recording is capped at 20k fills, full-pass ordering streams markers under a
100k-call bound, and live footprint loops stay within one cell.

**Looked:** level 14, seed 3, tick 400 at **1×**, with the exact shoot crop
paired in `/tmp/codex-mailroom/shoot-crop-pair.png`. Also matching parent/branch
levels 14, 33 and 52 at ticks 77/476, full 800×496 frames at 1×, 2× crops and
4× details in `sheet.png`; level 71 in all five themes. Open/furled umbrellas
and rockfall/geyser/brazier/tesla/fence/crusher/turret in idle/charge/fire/rest
are paired in `readability-sheet.png`. Paper tones leave dark suits, pale faces,
canopies, original pink signals, hazard tells, brass tube paths, capsule ports,
mission parcels and the exit clear. Review expanded the generic decor bounds
for the original hanging signs and franking trays; a sign could otherwise
cover part of the new bin's label.

Seeded comparison: **1,080 identical frames** across the other eighteen biomes
and **60** identical Mail Room res-1/unspecified-res frames (two layouts,
ticks 77/240/600, five themes). All **30** Mail Room res-2 frames changed.
Baseline, harnesses, comparison results and logs are in `/tmp/codex-mailroom/`.

**Pipeline:** retained the fast rasterizer, single sheet composition, streamed
paint-order checks, seeded single-world crop/phase shots and validation queue.
Pending phase logs plus the completion marker keep earlier results distinct.
The top corridor contains a hole at the old pinned event coordinate; the
event art test now selects an intact, safe floor span. Complete original
prop footprints are recorded in the focused clearance check, catching the
hanging-sign/tray extent mismatch before delivery. No package/tool source edits.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 14: actors **0.792 → 0.811 ms**, full terrain + actors
**10.576 → 11.381 ms**.
Level 52: actors **0.395 → 0.400 ms**, full terrain + actors
**13.462 → 14.018 ms**.
Subway control, level 18: actors **2.298 → 2.335 ms**, full terrain + actors
**15.302 → 15.239 ms**.
Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Mail Room art review. Commit on `codex/mailroom` only;
no push or deployment.

Reviewed and merged by the loop. Level 14: pigeonhole walls with letters, franking machines and parcels; the backdrop lower in contrast so the floors read.

## 213 — 2026-10-15 · The last one out may lay a mine at once

At a wall that nothing in the toolbar answers — no room on top to climb to,
no bashers left — `wallLastResort` only blasts once the agent has spent half
its patience, or when it is jammed in one cell. For the last ones out
(`lastOut`) it may now lay a charge straight away — still only a mine, the
charge that costs nobody, never the agent itself: nobody is behind them to
save the toolbar for, and each turn is the length of a corridor. Found on
level 2 (stall 6 → 5 of 24; the straggler there usually meets the wall before
it is last out, which is why it moves only one). Levels 1–57 × 24: home 95.54%
→ 95.56% (+5 agents), stall endings 31 → 28, clock-outs 5 → 5, hangs 0; no
level moves 2 points. One test. `npm run check` 1020/1020.

## 214 — 2026-10-15 · Facing home, not merely crossing toward it

`npm run playtest -- 58-150` (12 colonies each) found two levels much worse than
anything in 1–57: 92 (stall cutoff 10/12) and 83 (9/12), both the hero. On 92
the hero was pocketed between two walls with home far below and to the west.
The 200 rule (wait at a wall toward home when the move is nearly back) asked
`crossingHelps` — which, rightly for a bridge, says yes in both directions
whenever home is above or below — so it waited out its cooldown at each wall in
turn. Now the wait, and the lending of tools in `heroGivesWay`, ask
`facingHome`: is home on this side, across the board. Levels 1–150 × 12: home
95.23% → 95.30% (+21 agents), stall endings 75 → 72, clock-outs 6 → 5, hangs
0. At 24 colonies: 24 89 → 93%, 128 83 → 87%, 27 95 → 96% with its clock-out
gone (worst run 31% → 77%); 120 96 → 94%; 92 unchanged.

**Tried and taken back out:** a shorter patience for the general rescue
(`forceEscape` at 200 idle ticks instead of 900) for the last ones out. It
cleared 83 (9 → 0) and most of 92, and stall endings across 1–150 fell 75 → 46
— but clock-outs went 6 → 20 (level 67 alone got eight) and levels 104 and
120 lost five or six points. Worth a narrower version later.

Level 92's hero is in a pocket it cannot leave with its move, has no climbers
left and a wall fourteen cells thick; ordinary agents dig out. One test.
`npm run check` 1021/1021; CRAP under 30.

**List after 214:** 92 stall (hero, Model Collapse); 83 stall 9/12 (hero, Chain
of Thought); level 6 clock-outs (Ice Cave tool budget); 32 stall 6/24; 2 stall
5/24; 70, 81, 84 stall 3/12; single runs elsewhere.

## 215 — 2026-10-15 · A hero among the last out gets the rescue sooner

The narrow version of what 214 took back out. The stall cutoff ends a nearly
finished level once nobody has got closer to home for 300 ticks — inside
`PATIENCE` (900) — so a hero lost on the wrong floor never reached the rescue
that would have lent it the colony's tools (`forceEscape` → `specialEscape`,
then the toolbar). Now a hero that is one of the last out gets it after 200
idle ticks (`HERO_LAST_PATIENCE`). Ordinary stragglers keep the long patience
— rescuing them early ran levels into the clock (214) — and so does a hero on
a tower, where the way home is a lift and an early rescue built and slid it
into corners (level 104 lost six points before that exclusion).

Levels 1–150 × 12 against 214: home 95.30% → 95.41% (+30 agents), stall
endings 72 → 43, clock-outs 5 → 7 (level 92's two, which used to end on the
cutoff), hangs 0. Level 83: 95% → 100%, stall 10 → 0; level 92: 88% → 91%,
stall 10 → 2; level 23: stall 2 → 0. Levels 1–57 × 24 against 213: home
95.56% → 95.72% (+31), stall 28 → 21, clock-outs 5 → 4. One test.
`npm run check` 1022/1022; CRAP under 30.

**List after 215** (`npm run playtest -- 1-150 --seeds 12`, 1800 runs, 95%
home, no hangs, nothing worse than 3/12): clock-outs on 6 (Ice Cave tool
budget), 92 (the hero ends in a three-wide pocket over a one-cell floor with
six diggers in the toolbar, and the rescue spends nothing — the descent rules
refuse it; next to look at), 61, 101, 138 (one run each); stall endings on 70,
81, 113 (3/12), 2, 55, 84 (2/12).

## 216 — 2026-10-15 · Level 92: the rescue digs, and a hero digs through

Level 92's hero sat in a three-wide pocket over a one-cell floor with six
diggers in the toolbar. Two rules stood in the way, both now changed:
- **`startDescent` gave up when it preferred a mine and the miners were
  gone.** Half of all agents prefer a mine (even ids), and the non-fallback
  path paid for the preferred tool or nothing. It now plants a mine if it can
  and otherwise digs.
- **`digOpensDeath` stopped a hero on the last layer over any lethal drop.**
  The rule exists because a hero falling through a dug floor died (Guard Rails,
  a tenth of its levels): it cannot take an umbrella from the toolbar. But
  every hero has its own device for a lethal drop and uses it off any edge
  (`startSpecialHeight`); when a hero's dig opens the floor over a drop it now
  goes down on that device. Only a bottomless drop still stops it.
Levels 1–150 × 12 against 215: home 95.41% → 95.42%, clock-outs 7 → 5 (level
92: 2 → 0), stall 43 → 43, hangs 0. Heroes over 1–150 × 6: 612 → 615 home,
48 → 46 lost. `simcheck heights`: 24/24 specials reach safe ground. Two tests.
`npm run check` 1024/1024; CRAP under 30.

## 217 — 2026-10-15 · Merge conflicts

Two ordinary walkers meeting head-on in a tunnel exactly their own height
(ceiling right over both heads) stop nose to nose for a beat: one bubble says
`<<<<<<<` and, a line above it, the other `>>>>>>>`. Then the one walking away
from home rebases — holds a moment longer, REBASED, and lets the other through
— and both carry on. The ticker says MERGE CONFLICT · AGENT 012 REBASED, sfx.js
plays two notes a semitone apart and a falling third, the commit line on the
report card gets "N MERGE CONFLICTS", and Outcome four lines. The font gains
`<`, `>` and `=`. It fires on a coin (its own `conflictRng`) and then not again
for 600 ticks: about one run in sixteen.

Measured honestly, because the first two versions were not neutral. Having the
rebaser turn round cost −13 agents over 1–150 × 12 — in a tunnel "away from
home" is often the route. Waiting instead, at 30+18 ticks, cost −30 over
1–150 × 24 (3600 runs). The noise floor for any timing change at all, measured
with a one-tick hold, is −16; the shipped 20+10 beat is −10 with four fewer
stall endings — inside the noise. Switched off (chance 0) it reproduces main
exactly. Nothing can hold anybody: the beat is a countdown, a fall or anything
that is not walking ends it, and no level ends with anyone still in one.

**Tests:** `conflict.test.js` (5: the beat and the yield, only in a tunnel and
for ordinary walkers facing each other and on the coin, a fall ends it, played
levels end clean, bubbles stacked and the commit line), a cue in `sfx.test.js`.
`npm run check` 1030/1030; CRAP under 30.

## 218 — 2026-10-15 · Community milestones

The page already fetches the worldwide rescue total. When it crosses a round
number while somebody is watching — every 10,000, with a hundred-thousand and
the million as bigger occasions — or has only just passed one (within 300)
when the page opens, the colony dresses for it for the rest of the session:
party hats in five colours with a white pompom, gold hats on a hundred-
thousand, crowns on the million; a burst of confetti out of the hatch as the
first agent drops in; and a ticker line after the intro, COMMUNITY MILESTONE:
490,000 AGENTS HOME. Outcome.js `milestoneFor(previous, total)` decides (pure,
and its comma formatting is by hand because the Omarchy panel's QML engine
runs that file too); web.js passes every total it receives through
`noteTotal` and stamps the session's milestone on each new world; Draw.js
draws hats and confetti from it; Sim only records `firstReleaseAt`. Purely
cosmetic: no counter, API or simulation change, and with no total (offline)
nothing happens. `tools/phone.js`'s Chromium driver gained an `onEvent` hook so
a test can answer the page's API calls itself (CDP Fetch).

**Tests:** `milestone.test.js` (3: the crossing rule and its refusals, hats
and confetti only with a milestone and read-only, and in headless Chromium a
mocked total of 490,050 puts the milestone and the ticker line on the colony
while an offline page shows none). `npm run check` 1033/1033; CRAP under 30.

## 219 — 2026-10-15 · Workwear on the scaffold (on a branch)

**Why:** the Building Site already had its concrete frame, props and gantry
rides from 99–100. The page wanted a richer second plane without confusing
scenery with ground or changing the crane's ride.

**Changed:** `codex/buildingsite`, based on approved `codex/mailroom` at
`69943b2`, adds a cached far scaffold plane: thin uprights, crossed braces,
muted diagonal hazard tape, orange/yellow hi-vis jackets on empty
hangers and hooks, reflective bands, and tied stacks of rebar with curled ends.
Small orange cement mixers stand in the gaps between bays, rather than under
jackets where they first read as stationary workers. A raster board checked across its full rectangle
reads "SITE SAFETY / 0 DAYS SINCE / LAST INCIDENT". It is present on
level 15, seed 3; a wall or fixture omits the entire board instead of clipping
its lettering. Scaffold luminance stays below playable concrete in all five
themes, including matte-black. Original terrain, props, cranes, trolley lamps,
cables, hooks, hard hats, dangling riders, landing puffs, hazards and exit
recipes are untouched. No Sim.js or Palette.js edits.

All additions require Building Site and `(w.res || 1) >= 2`. Static scenery
paints before original terrain; only three small drum glints per surviving
mixer animate before original machines and actors. Integer tick recipes have
staggered slow periods and no RNG, world writes or scenery state. Whole-mixer
clearance checks terrain, support, complete original signs/work lamps and
fixtures, pits, exit, hazards, and the entire gantry/rider/drop envelope. The
crane lane reservation uses the sky bound rather than walking the roof again
per frame, so it stays fixed throughout a ride and costs no extra roof scan.
Anchors stay put through excavation.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-buildingsite/coverage-safe.sh` pass: **938** tests in check and
coverage. Eleven new page-art tests cover biome/resolution gates, read-only
proxies and forbidden RNG, deterministic digests, half-pixel placement and
canvas restoration, fixed cache anchors, far/near luminance in five themes,
separated mixer/workwear silhouettes, four drum phases and bounded footprints,
complete original prop/crane reservations, whole-board lettering, paint order,
unchanged opaque actor colours including a hooked rider, original component
digests, and four 600-tick crane playthroughs with complete world digests.
The existing crane placement, ride, refusal, stall/release, collar alignment,
roof clearance, landing, prop and event tests also pass. CRAP: **0** functions
at or above 30, maximum **29.3**; all fourteen new helpers have **100%**
coverage, maximum **6.0**.

The standing caps remain: Node heap 2048 MB, `ulimit -v 6000000`, one check
worker/two coverage workers, and a queue before every phase. The check waited
for another agent's coverage to finish. A later full run started while this
branch's first coverage was active; stopped only our coverage process tree and
restarted that phase after the other run. Factory's art test stays excluded.
Frame assertions use SHA-256 digests, component recording is capped at 20k
fills, paint-order checks stream markers under 100k fills, and each live
footprint is within one cell.

**Looked:** level 15, seed 3, tick 400 at **1×**, the actual `shoot.js crop 15`,
and the paired crop in `/tmp/codex-buildingsite/shoot-crop-pair.png`. Matching
parent/branch levels 15, 34 and 53 at ticks 77/476 are in `sheet.png`, with
800×496 frames at 1×, 2× crops and 4× details. Level 72 covers all five themes.
`rides-sheet.png` pairs the real wait/up/across/down/back poses, including the
carried colleague, collar joint and landing. `readability-sheet.png` pairs
open/furled umbrellas and rockfall/geyser/brazier/tesla/fence/crusher/turret in
idle/charge/fire/rest. Dark suits, pale faces, canopy colours, original yellow
fixtures and pink hazard tells remain clear against the quieter back wall.
The 400×248 panel shot also remains unchanged.

Seeded comparison: **1,080 identical frames** across the other eighteen biomes
and **60** identical Building Site res-1/unspecified-res frames (two layouts,
ticks 77/240/600, five themes). All **30** Building Site res-2 frames changed.
Baseline, harnesses, images, logs and comparison results are under
`/tmp/codex-buildingsite/`.

**Pipeline:** retained the fast rasterizer, single sheet composition, seeded
single-world crop shots, validation queue, pending logs and completion marker.
The queue now monitors throughout validation: if another test starts, it
suspends only its own launcher/children and resumes them after that run exits,
rather than trusting the gap before launch. The completed check is retained
when a coverage phase must restart.
The comparison now uses zero-copy Buffer views instead of allocating two
whole-frame copies for every pair; the 1,170 comparisons completed in
**17.58 s**, peak RSS **205.5 MB**. Removed the unused stale hash mode from
the temporary harness; baseline component hashes have their own exact recipe.
The prop-footprint test caught the original hanging work lamp's extra lower
rows and widened its clearance before delivery. No package/tool source edits.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 15: actors **0.722 → 0.726 ms**, full terrain + actors
**13.124 → 13.633 ms**.
Level 53: actors **0.453 → 0.460 ms**, full terrain + actors
**12.865 → 13.473 ms**.
Subway control, level 18: actors **1.066 → 1.065 ms**, full terrain + actors
**15.051 → 15.042 ms**.

Terrain is cached in ordinary play; these are Node raster times, not browser FPS.

**Next:** ready for Building Site art review. Commit on `codex/buildingsite`
only; no push or deployment.

## 220 — 2026-10-15 · Open scaffolds and fewer jackets (on a branch)

**Why:** review of level 15, seed 3, tick 400 found the repeating framed
brown workwear too much like a museum. The safety board and cones already read.

**Changed:** revision on `codex/buildingsite`, from `23c32d1`. Removed the
closed display frames and jackets from every bay. A fixed seven-part sequence
varies scaffold boards/clamps, hi-vis workwear, stacked rebar, spray-marked
plywood, a hard-hat rack, a wheelbarrow and strapped pallets; neighbouring
bays always differ. At most **two** jackets per level hang from bare wall
hooks, in saturated orange/yellow with a broad pale reflective band. Mixers
stay in the gaps. An open scaffold run carries visible poles, guardrails,
projecting boards, clamp collars and diagonal braces across the quiet back
wall. Static props remain dimmer overall than playable concrete in all five
themes, including the brightest yellow jacket. No Sim/Palette changes.

The approved safety board, original cones, terrain and crane/gantry recipes
remain intact. All changes are cached below terrain at res 2. The live mixer
pass is unchanged: no new per-frame work, RNG, world writes or scenery state.
The existing terrain/fixture/exit and complete crane/rider reservations remain.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-buildingsite-revision/coverage-safe.sh` pass: **939** tests in
check and coverage. Updated the cache/contrast checks for all seven contents
and both jacket colours; a new density/adjacency check spans Building Sites
through level 395, verifies seven distinct silhouettes, broad reflective
bands, bare hooks and canvas-state restoration. All original crane, terrain,
fixture, event, umbrella, read-only and simulation replay checks still pass.
CRAP: **0** functions at or above 30, maximum **29.3**. All 22 worksite
helpers have **100%** coverage, maximum **6.0**.

Node heap **2048 MB**, `ulimit -v 6000000`, one check worker/two coverage
workers; Factory's art test remains excluded. Retained the continuous shared
machine queue, which suspends only our validation children if another test
starts, and the pending-phase logs/completion marker. The guard suspended and
resumed check and coverage during this run instead of overlapping other full
runs or restarting completed phases. Digest assertions and
bounded draw recording remain; no full image diffs enter assertion messages.

**Looked:** exact reported level 15, seed 3, tick 400 at **1×**, actual
`shoot.js crop 15`, and the paired crop. Comparison with `23c32d1` at levels
15/34/53, ticks 77/476, full frames at 1× plus enlarged crops/details, is in
`/tmp/codex-buildingsite-revision/sheet.png`. Level 72 covers all five themes.
`rides-sheet.png` pairs wait/up/across/down/back poses; `readability-sheet.png`
pairs original hazards and open/furled umbrellas. Scaffold silhouettes read
as a continuous structure, wheelbarrows retain their tray/wheel/handles, and
bright workwear has an empty hook above it. Dark suits, faces, umbrellas,
pink hazard signals, crane cable/collar/rider and exit remain clear.

Seeded full-frame comparison: **1,140 identical** frames (other eighteen
biomes plus Building Site res 1/unspecified), **30 changed** Building Site
res-2 frames. An additional **60 actor-only** frames are byte-identical to
`23c32d1`, across four Building Sites, three ticks and five themes. The scene
revision is entirely in cached art. Baseline, harnesses, images and logs are
under `/tmp/codex-buildingsite-revision/`.

**Pipeline:** reused zero-copy comparison buffers and the single sheet builder;
1,170 full-frame comparisons took **26.34 s**, peak RSS **200 MB**, while
check was running. Actor-only isolation takes under a second and confirms
unchanged animation without replaying or composing more full scenes. Retained
single-world crop/ride shots and the guarded validation queue. No package/tool
source changes.

**Measured:** warmed res-2 rasterizer at tick 476, median of nine batches of
forty frames, interleaved original/revision, after tests and coverage.
Level 15: actors **0.742 → 0.732 ms**, full terrain + actors
**13.719 → 13.775 ms**.
Level 53: actors **0.456 → 0.453 ms**, full terrain + actors
**13.432 → 13.514 ms**.
Subway control, level 18: actors **1.056 → 1.060 ms**, full terrain + actors
**15.074 → 15.037 ms**.
Terrain is cached in play; these are software raster times, not browser FPS.

**Next:** ready for the Building Site revision review; commit on this branch
only, no push or deployment.

Reviewed and merged by the loop. Level 15: scaffold poles and boards, a hard-hat rack, wheelbarrow, plywood, sparse orange hi-vis and a safety board; the crane intact.

## 221 — 2026-10-15 · Not stuck while walking home

On level 70 the stall cutoff ended the level with the last agent on the exit's
own floor, eight cells from the door, walking at it — in 3 of 12 colonies. The
cutoff ends a nearly finished level once nobody has been "moving" for 210
ticks, and a walker counts as moving only if it has beaten its closest-ever
distance to home in the last 300; an agent that got near once, turned back and
is coming again reads as stuck the whole way in. Now a walker on the exit's
floor facing the door counts as moving (`homeStretch`). The cutoff's other
limit — 600 ticks with nobody getting home — still bounds the level. Levels
1–150 × 24 (3600 runs) against main: home 95.373% → 95.441% (+37 agents), stall
endings 86 → 53, clock-outs 12 → 12, average level 1197 → 1199 ticks, hangs
0; level 2: 95% → 97%, stall 6 → 1. One test. `npm run check` 1046/1046.

## 222 — 2026-10-15 · The Ice Cave gets two more bashers and two more climbers

The supervisor's call, made from the play-test: the Ice Cave's colonies run
out of bashers and climbers long before they run out of ice. Per biome over
levels 1–152 × 24, the Ice Cave ran out the clock in **2.60%** of runs; the
next-worst biomes (Ruins, Foundry, Jungle) in 1.04% and most in none; its home
rate was 93.3%. Swept on the eight Ice Cave levels in 1–152, 48 colonies each
(384 runs):

| extra bashers / climbers | clock-outs | home | average level |
|---|---|---|---|
| +0 / +0 | 2.60% | 93.39% | 1432 ticks |
| +2 / +0 | 1.30% | 94.57% | 1380 |
| **+2 / +2** | **0.78%** | **94.80%** | **1369** |
| +3 / +2 | 1.04% | 94.56% | 1352 |
| +4 / +3 | 0.26% | 94.85% | 1323 |

+2/+2 is the smallest step that brings the clock-outs under the other
biomes' worst, and its home rate (94.8%) sits in the middle of the field
(Building Site 91.5%, Data Center 98.8%) — harder than most, nowhere near
trivial. The bonus is added after the toolbar is rolled from the level's own
stream (`ICE_BASHERS`, `ICE_CLIMBERS`), so every Ice Cave level keeps its
layout, hazards and events. On the way: a constant declared inside `generate`
at column 0 is read by the test loader as a top-level name and fails it; the
constants live at the top of the file. One test. `npm run check` 1047/1047;
CRAP under 30.

## 223 — 2026-10-15 · Outages

About one level in twelve (8.3% of 1200 generated), never before level 6, the
lights go out for four seconds somewhere between ten and thirty seconds in.
The board dims to near-black over ten ticks — with a brief flicker as it goes
— and only what would glow in the dark shows: every agent's eyes and hat
brim, the exit's lit threshold, each fixture's red warning lamp. A status page
across the top says **INVESTIGATING - DEGRADED PERFORMANCE** with a red dot,
then **RESOLVED** with a green one for two seconds after the lights return.
sfx.js winds the hum down and back up. With `prefers-reduced-motion` (the page
sets `w.reducedMotion`) the dim is gentler and does not flicker. Purely visual:
`rollOutage` decides at generation from its own stream off the colony seed, so
a shared link replays the same outage at the same moment, and nothing in the
simulation reads it — a level plays identically with the lights on or off
(tested on three levels).

**Tooling:** the test loader (`tools/load-core.js`) now exports every name in
a `var A = 1, B = 2` declaration, not only the first. Tests reading
`OUTAGE_RESOLVED` (and before it `STANDUP_TURN`) silently got `undefined`.

**Tests:** `outage.test.js` (3: rate, timing, determinism; the simulation is
unchanged by it; dark only in its window, banner phases, gentler with reduced
motion, nothing over the report card, read-only), a cue test in
`sfx.test.js`. `npm run check` 1051/1051; CRAP under 30.

## 224 — 2026-10-15 · `npm run compare` for art reviews

`npm run compare -- <ref> <level> [--seed N] [--ticks N] [--base REF] [--out FILE]`
(`tools/compare.js`) renders the base (main by default) and the ref at page
resolution — same level, colony seed and tick, page randomness seeded the same
— and writes one PNG: the two full frames side by side, each labelled with
ref, level, seed and tick, and under each a 2x crop of where the two differ
(centred on the bounding box of changed pixels; the middle of the board if
nothing changed). Both sides come out of git objects (`git show
<ref>:public/agents/…`) into temp dirs and load from there
(`loadCoreFrom` in tools/load-core.js), so nothing is checked out and the
working tree does not matter. 0.2 s for a 400-tick frame; prints the size and
place of the difference or "identical". E.g. across the Library merge on level
13: "differs in 660x425px at 64,56". Three tests (arguments, diff box and
window, an end-to-end render of HEAD against itself from git objects).
`npm run check` 1054/1054; CRAP under 30.

## 225 — 2026-10-15 · Sightings

A small collection per viewer of the rare things the game can show: the
golden AGI, a dreamer's mirage, a 429 queue, a rubber duck, a merge conflict,
an outage, a community milestone. At the end of each level the page asks
Outcome's `sightingsIn(w)` what that level showed, adds anything new to a list
kept in this browser only (`localStorage` key `oh-no-more-agents-sightings`,
every access in try/catch — blocked or full storage just means no strip), and
the report card gains a strip: seven little pixel icons, dim until seen and
bright after, the one first seen on this level ringed in gold, "3/7
SIGHTINGS", and a line for the new one — "NEW: RUBBER DUCK - IT JUST
LISTENED", "NEW: OUTAGE - HAVE YOU TRIED IT ON AGAIN?", "NEW: 429 QUEUE - YOUR
CALL IS IMPORTANT TO US". No network. The names, puns and icons live in Draw.js
(`SIGHTINGS`; check-core-refs refused the first attempt, which had Draw reading
Outcome's list — fine in a browser, a ReferenceError in the Omarchy panel); Sim
only records `duckAppeared`, read by nothing in it.

**Tests:** `sightings.test.js` (3: what a level showed, the strip and its
lines and glyphs read-only, and in headless Chromium a finished level records
"agi" and "duck" in this browser while a page with localStorage blocked shows
no strip and throws nothing). `npm run check` 1057/1057; CRAP under 30.

## 226 — 2026-10-15 · Consolidation: the card, the bubbles, the dark

A pass over the gags of the last iterations together, before adding more.
Screenshots in headless Chromium of the busiest realistic report card (AGI
bonus, two rescues, a fight, umbrella saves and landings, a commit line, the
sightings strip) at 1280×900, 390×844 and 844×390:
`shots/consolidation/report-{desktop,portrait,landscape}.png`.

- **The report card ran off the board.** Its top was fixed, and the full house
  — eight rows — pushed the bottom edge and the last line past the 248px
  board. Now the plate is centred on its own height (`reportTop`, also used by
  the transitions test instead of a pinned row), umbrella landings join the
  fight line when both fit ("3 GUARDS DOWN · 2 UMBRELLA SAVES · 5 UMBRELLA
  LANDINGS"), the AGI row is "AGI ACHIEVED · +1 BONUS", and the commit line no
  longer repeats the AGI when the card already says it. Six rows; it fits with
  room at all three sizes.
- **Bubbles.** No quips over a finished level (an "LGTM" was showing beside
  the card). At most two speakers at once, newest first, a merge conflict's two
  bubbles counting as one conversation (`quipAllowed`, worked out from the
  world each frame). A bubble that would cover the exit or a hazard's zone is
  lifted clear of it, or not drawn if there is no room above
  (`bubbleClear`). Quips were already page-resolution only, so the panel at 1x
  never shows text it cannot render.
- **The outage hid event and boss warnings.** It was drawn after the event
  banner. The banner now draws after the outage; the outage already stayed off
  the report card, and the standup is drawn by the page instead of the actor
  pass, so the dark never reaches it.

**Tests:** `consolidation.test.js` (5: the busiest card inside the board on
three levels with every row inside the plate and the AGI said once; two
speakers at most with the conflict pair counted once; bubbles lifted clear of
the exit and a hazard or not shown; no quips over the card; the warning drawn
after the dark and nothing over the card). `npm run check` 1062/1062; CRAP
under 30.

## 227 — 2026-10-15 · Light through the great dial (on a branch)

**Why:** the Clock Tower already had clockwork shutters and a rear dial from
111–112. The page wanted clearer glass, gearing and service-room depth while
preserving the gate's readable timing and the colony's route.

**Changed:** `codex/clocktower`, from approved `codex/buildingsite` at `cb47f23`.
A cached 172-art-pixel dial surrounds the original axle, with restrained warm
backlighting, a feathered halo, leading in unequal sectors, and true Roman
hours viewed from behind: both glyphs and their order mirror, and three
o'clock lies on the left. Dusty light falls through the dial before terrain.
Cached bronze wheel rims and bearings retain the original three pinion centres
and counter-rotation rates. Distinct service bays alternate bell ropes with
unequal lengths and tassels, spare pinions, timber braces and paired weights;
neighbouring bays differ. No Sim.js or Palette.js changes.

The res-2 scenery pass now draws three turning spoke/tooth sets, reversed
hands, a swinging bob above the lowest floor in a clear service lane, and
twelve slow dust flecks. At most **350** small rectangles before clipping,
with no per-frame rim or light-shaft repaint, RNG, world writes or scenery
state. Static glass, light, rims, ropes and fittings live on the terrain cache;
all added motion rejects terrain, original props, hazards, exit, pits and the
whole gate cassette/dial/guide/shutter bounds. Anchors remain fixed through
carving. The original movement/light functions remain the res-1 path; panel
pixels are unchanged. Original gate and shutter recipes, timing, occupancy
behaviour, materials, props, booth, captives, hazards and exit remain intact.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-clocktower/coverage-safe.sh` pass: **950** tests in check and
coverage. Eleven new page-art tests cover biome/resolution gates, forbidden
world writes and RNG, deterministic digests, half-pixel grid and state
restoration, cached/fixed anchors, varied adjacent bays, exact mirrored Roman
glyph/order pixels and reversed hour placement, five-theme masonry/glass
contrast, motion budgets, a visible level-16 bob, slow swing, complete original
prop/gate reservations, paint order, unchanged opaque actor/umbrella colours,
original component digests and four 600-tick gate playthroughs with complete
world digests. Existing gate phase/width/countdown/occupancy/event tests pass.
CRAP: **0** functions at or above 30, maximum **29.3**; all 22 new helpers
have **100%** coverage and score at most **6.0**. The changed machine dispatcher
has 100% coverage and scores **3.0**.

Heap **2048 MB**, `ulimit -v 6000000`, one check worker/two coverage workers,
Factory art test excluded under the standing instruction. Retained the
continuous queue: another full run suspends only our validation process tree
until it completes. Pending logs and a completion marker prevent stale passes.
New image assertions use digests; recording is capped at 20k component fills,
paint-order checks stream under 100k fills, and live footprint loops cover at
most one cell.

**Looked:** level 16, seed 3, tick 400 at **1×** and actual `shoot.js crop 16`,
paired in `/tmp/codex-clocktower/shoot-crop-pair.png`. Matching parent/branch
levels 16/35/54 at ticks 77/476 are in `sheet.png`, with 1× full frames,
2× crops and 4× details; level 73 covers all five themes. `gates-sheet.png`
uses a real level-35 gate with colleagues alongside, comparing shut, opening
start, half-open, fully open and half-closing. Its bars, pawls, countdown dial
and dark slot stay clear. `readability-sheet.png` pairs seven original hazard
fixtures and open/furled umbrellas in idle/charge/fire/rest. The glass remains
lower contrast than masonry; dark suits, pale faces, bright heroes, canopies,
clockmakers and the exit retain their silhouettes and colours.

Seeded comparison: **1,080** identical other-biome frames, **60** identical
Clock Tower res-1/unspecified-res frames, **30** changed Clock Tower res-2
frames: two layouts, ticks 77/240/600, five themes. Baseline, harnesses,
images, comparisons and logs are under `/tmp/codex-clocktower/`.

**Pipeline/cost:** the old Clock Tower page repainted static rims and shafts
on every tick and hid the long pendulum bob below level 16's bottom floor.
Cached those recipes for the page and moved its bob into visible air, while
retaining the panel path and exact gate drawing. At tick 476, total actor
rectangles dropped **1,884 → 1,101** on level 16 and **1,570 → 890** on
level 54. The bounded live layer adds depth without duplicating old scenery.
Reused the fast rasterizer, zero-copy comparisons, single sheet composition,
single-world crop/phase shots and continuously guarded validation. The 1,170
comparison frames took **17.21 s**, peak RSS **204.5 MB**. Gate crops are
composed after their seeded pose images exist. No package/tool source changes.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 16: actors **1.188 → 0.794 ms**, full terrain + actors
**8.393 → 9.313 ms**.
Level 54: actors **1.093 → 0.743 ms**, full terrain + actors
**9.148 → 10.219 ms**.
Subway control, level 18: actors **1.070 → 1.072 ms**, full terrain + actors
**15.068 → 15.081 ms**.
Terrain is cached in play; these are Node software raster times, not browser FPS.

**Next:** ready for Clock Tower art review. Commit on `codex/clocktower`
only; no push or deployment.

Reviewed and merged by the loop (with `npm run compare`). Level 16: a backlit reversed dial, gears, a pendulum and bell ropes; agents readable.

## 228 — 2026-10-15 · The intro stops saying you cannot help

The page's intro said "Nobody is playing — there is no cursor and no way to
help", which pep talks (204) made untrue. Now: "Nobody is playing. You can tap
one for a pep talk; it will tell you you're absolutely right and carry on. They
work it out, or they don't." Checked the rest: Outcome.js and Draw.js make no
such claim; the Omarchy plugin's README says "no cursor and no way to help",
which is still true of the panel (pep talks are page-only), so it stays. `npm
run phone`: all three views still fine with the longer line.

**List pass after 228** (`npm run playtest -- 1-150 --seeds 24`, 3600 runs,
95.5% home, hangs 0, nothing worse than 5/24): level 138 (Jungle) is the top
entry, 2 clock-outs and 5 stall endings of 24. Its stragglers come down a shaft
seven cells west of the exit facing west and wander off; at the moment they
land, a three-high block stands between them and the door (someone bashes it
later). A rule to face a visible door on landing (`seeTheDoor`, within 12
cells along a clear floor) was tried and measured neutral (+3 agents over 3600
runs) because the door was not visible when it mattered — not kept. The rest:
clock-outs on 78 (2/24), 61, 92, 101, 118 (1 each); stall endings on 84, 118
(3/24), 5, 32 (2/24). The Ice Cave is in line with the other biomes since 222.

**Deployed** at 01:46 after 228 (name="build" content="751570d3"), gated on a
passing check (1074 tests), covering 210–228: the hero rescues and digging,
merge conflicts, community milestones, the Ice Cave toolbar, outages,
`npm run compare`, sightings, the consolidation pass, the new intro line, and
the Mail Room, Building Site and Clock Tower art. Verified on production with a
read-only check (nothing finished by hand, nothing reported to the counter):
levels 3, 9, 14, 18 and 92 open from share links on build 751570d3 with no
console errors; every new feature's code is present; a share link replays the
same cast; and a share link with an early outage (level 9, seed 40) goes dark
at its tick with the event warning ("INCOMING · Fire Drill") drawn above the
dark and the new intro copy on the page. Follow-up seen there: the event
banner and the outage's status banner share the top of the board, and the
event banner covers the status one — the status banner should move down while
an event warning is up.

## 229 — 2026-10-15 · The outage status sits below the sky

On production an event warning ("INCOMING · Fire Drill") covered the outage's
INVESTIGATING line: both used the top of the board. The sky band is where event
warnings and the hero's card live, so the status banner now sits just below
it. One test.

## 230 — 2026-10-15 · Instant replay

When a level ends with a moment worth seeing again, it is played back before
the report card, under an **INSTANT REPLAY** tag with a blinking red dot and a
letterbox bar. Sim notes moments as they happen (`noteMoment`; bookkeeping
only, nothing in the simulation reads them, and a level plays identically
without them): an umbrella opened with six cells or less to go (3), a bridge
landed with somebody right behind the builder (3), a ricochet (3), a parry (2,
or 4 with a boss on the board), a merge conflict (2), the last agent home in
the final ten seconds (4), the AGI home (5). The page takes the best moment
scoring 3 or more — about 30% of levels; none, no replay — generates the level
again from its seed and re-simulates it to two seconds before the moment, then
plays three seconds at the usual speed. No frames are kept: the simulation is
deterministic (page randomness only feeds animation phase and particles), the
re-simulation runs 150 ticks per page tick so a phone never stalls, the
watcher's pep talks are replayed at their ticks, and if the re-simulation does
not note the same moment on the same tick the replay gives up rather than show
something that did not happen. The finished world, its report card and its
rescues are untouched; a tap skips. The page exposes `window.AgentReplay()`
read-only for tools and tests.

**Measured:** all 70 replay-worthy moments in 240 runs (levels 1–60) reproduce
from the seed. Worst case for a phone — level 25, a moment at tick 1613, 4x CPU
throttling at 390×844 — no long tasks and no frame over 17 ms while it rewinds.
`npm run fps` unchanged (60 fps, 7–12% main thread). Screenshot:
`shots/replay.png` (the AGI walking home, level 1 seed 2).

**Tests:** `replay.test.js` (4: moments noted and changing nothing; every
replay-worthy moment on 30 levels × 3 seeds re-noted by a re-simulation; the
tag only while replaying; in headless Chromium a level ending with the AGI
replays it while the report card waits, a click skips to the card without
pausing, and a level with no big moment goes straight to the card). The
bridge landing moved into `landBridge` to keep `stepBuild` under the CRAP gate.
`npm run check` 1079/1079; CRAP under 30.

## 231 — 2026-10-15 · Sweepstake

The watcher can pick who gets home first. The first tap on an agent in a
level, before anybody is home, is the pick — a bet, not a pep talk, so it
nudges nobody and the run is the same run (an instant replay re-simulates
without it). The pick says MY MONEY'S ON YOU and wears a small turning gold
coin until it is home. The first three levels of a visit put TAP AN AGENT: WHO
GETS HOME FIRST? on the ticker. The report card says how it went —
"CALLED IT: AGENT 003 FIRST HOME" in gold, "YOUR PICK AGENT 009 CAME HOME
3RD", or "YOUR PICK AGENT 042 DID NOT MAKE IT" — with "· CALLED 3 OF 9" from a
tally kept in this browser only (localStorage, silent without it). Later taps
are pep talks, as before. Sim only keeps `homeOrder`, read by nothing in it.

**Tests:** `sweepstake.test.js` (4: home order kept and changing nothing; every
form of the line, ordinals and the tally, within the plate and the font; gold
when called and the coin until home; in headless Chromium the first tap is the
pick with no pep talk, the ticker explains it, and a finished level tallies
it). The pep-talk browser test notes that its first tap is now the pick.
`npm run check` 1083/1083; CRAP under 30.

## 232 — 2026-10-15 · The office radio

The "office radio" idea, folded into the ticker rather than built beside it.
Now and then a line narrates what is actually on screen — `ON AIR: AGENT 007
HAS BEEN WALKING INTO THIS WALL SINCE TUESDAY` (someone getting nowhere for 400
ticks), `… IS TAKING THE SCENIC ROUTE DOWN` (a long float), `OPEN-PLAN SEATING
ON THE LEDGE. NOBODY ASKED FOR THIS.` (six on one ledge), `… HAS BEEN IN THE
SAME MEETING FOR TEN SECONDS` (a blocker), `… IS THE LAST ONE IN. THE LIGHTS ARE
ON A TIMER.`, `HALF THE TEAM IS HOME. THE OTHER HALF HAS THOUGHTS.` — each
with a second take used on alternate levels. Each line at most once a level,
one every 600 ticks at most, never over a ticker note less than five seconds
old; about one line per level (levels 1–60 × 4: 1.08), at most three. Read
from the world alone, no random draws, so an instant replay or a shared link
hears the same broadcast, and nothing in the simulation reads it (a level plays
identically without it). The AGI test now collects ticker lines as they appear,
since the ticker keeps only the last few and the radio may have spoken since.

**Tests:** `radio.test.js` (2: at most once each and far apart, within the
ticker and the font, identical on a second run, changing nothing; what it
notices, and quiet over a fresh note). `npm run check` 1085/1085; CRAP under 30.

## 233 — 2026-10-15 · Rain above the city (on a branch)

**Asked:** Rooftops page art, level 17, on `codex/rooftops` based on the
approved `codex/clocktower` (`09030ca`). Preserve rain, washing and umbrella
rides from 119–120; keep the skyline quieter than terrain, neighbours varied,
and suits, canopies, hazards and the way out legible.

**Changed:** res-2-only dark city terraces, uneven roofs, sparse warm windows
and small pink OPEN neon signs. Service stretches rotate through cylindrical
water tanks with bands and legs, paired chimney pots, TV aerials, three pigeons
on a ledge and satellite dishes. Heights, widths and window patterns vary;
no neighbouring fixtures share a kind. Static buildings, fittings and signs
sit beneath playable masonry on the terrain cache. Half-pixel blue-grey wet
glints sit on surviving exposed non-steel ledges before the original props.
The original moon, rain, washing, pigeons, aerials, chimney steam, rain splashes,
zipline geometry, riders, hazards and exit recipes are unchanged. No Sim.js or
Palette.js changes.

Four faint drifting flecks per new chimney are pure functions of ticks and
level, with no scenery state or RNG. The live layer emits at most 32 small
rectangles in the tested layouts; 8–12 survive clipping on levels 17/36/55/74
at tick 400. It rejects terrain and complete original prop, washing, cable,
post, rider, hazard, pit and exit bounds. Static scenery is not repainted per
frame. Added layers self-gate; res 1 and unspecified res retain original pixels.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-rooftops/coverage-safe.sh` pass: **962** tests in both check and
coverage, including twelve new page-art tests. Check took 105.00 s; coverage
took 123.21 s, including guard pauses.
New tests cover biome/resolution gating, forbidden RNG and world writes,
deterministic digests, half-pixel geometry and restored canvas state, fixed
anchors and differing adjacent fixtures, five-theme terrain/backdrop contrast,
whole-sign rejection, glints only on intact exposed non-steel ground, bounded
slow motion and full terrain/fixture/ride reservations, paint order, opaque
faces/shirts/eyes/canopies/stems, original component hashes and four 600-tick
rainy Rooftops playthroughs with matching complete world digests.
CRAP: **0** functions at or above 30, maximum **29.3**. All fourteen new
helpers have **100%** coverage and score at most **8.0**.

Heap 2048 MB and `ulimit -v 6000000`; one check worker and two coverage
workers. `test/factory-art.test.js` remains excluded. The continuous queue
paused only our test process tree while another full run was active, then
resumed it. Assertions use digests, component fill recording is capped at
20k, paint order streams under 100k calls and live footprint loops are bounded
by one cell. Completion markers distinguish pending from passed phases.

**Looked:** level 17, seed 3, tick 400 at 1× and actual `shoot.js crop 17`.
Matching parent/branch frames for levels 17/36/55 at ticks 77/476, 2× crops and
4× details are in `/tmp/codex-rooftops/sheet.png`; level 74 is checked in five
themes. `readability-sheet.png` pairs open/furled umbrellas and seven original
hazards at idle/charge/fire/rest. `zips-sheet.png` follows a real level-36
umbrella ride through boarding, midway and landing (44 steps). Background
fittings stay dark, neon labels are complete, terrain retains its stronger
plane and agents, canopies, warning colours, rain and the exit remain clear.
Ran the requested `npm run compare -- codex/rooftops 17 --out
/tmp/codex-rooftops/compare-main.png` from main against the committed branch.
Also ran `--base codex/clocktower --seed 3 --ticks 400` into
`compare-parent.png` to isolate the art against its direct parent. Viewed both
full frames and their automatically selected 2× crops. Each command took
**0.28 s**, peak child RSS under **103 MB**.

Seeded comparison: 1,080 identical other-biome frames, 60 identical Rooftops
res-1/unspecified-res frames and 30 changed Rooftops res-2 frames: two layouts,
three tick states and five themes. This took 16.84 s, peak RSS 205 MB.

**Pipeline:** retained the fast software rasterizer and zero-copy comparison
buffers. Crop/phase images share one seeded world; the sheet builder composes
only the labelled review sheet. Final comparisons use the shared git-object
comparison command from main without checking out files or copying main's
package/tool changes onto this older art ancestry. Full runs remain serialized
and continuously monitored, including the pauses noted above. No new slow
rendering or comparison step required a source/tool change.

**Measured:** warmed res-2 software rasterizer at tick 476, median of nine
batches of forty frames, interleaved parent/branch, after tests and coverage.
Level 17: actors **0.628 → 0.645 ms**, full terrain + actors
**9.425 → 9.802 ms**.
Level 55: actors **0.467 → 0.487 ms**, full terrain + actors
**9.823 → 10.247 ms**.
Subway control, level 18: actors **1.091 → 1.096 ms**, full terrain + actors
**15.116 → 15.084 ms**. The new live pass adds roughly 17–20 microseconds
on the sampled Rooftops frames.
Terrain is cached in play; these are Node software raster times, not browser FPS.

**Next:** ready for Rooftops art review. Commit on `codex/rooftops` only;
no push or deployment.

## 234 — 2026-10-15 · Give the rooftops a skyline and neon (on a branch)

**Asked:** revise `codex/rooftops` after review found the skyline indistinct,
props floating and dim, and neon barely glowing. Make the city, grounded
fittings and wet reflections read at 1× while keeping umbrellas clear.

**Changed:** replaced repeated little terraces with one city in two depth
planes: stepped tower silhouettes, sparse warm windows, and two taller crowns
with radio masts. The distant city stays darker than playable brick. Tanks,
dishes, aerials, pigeons and warm chimney pots now have opaque filled bodies,
stronger shading and highlights, and stand on actual surviving roof cells.
Full bodies must fit clear air and complete ground support; neighbouring
selected props cannot overlap or share a kind, with at most three per storey.

Pink and cyan OPEN signs use full art-pixel lettering, visible mounting posts,
soft clipped colour spill, and tapered reflection streaks on the roof below.
A continuous restrained sheen traces exposed non-steel roof edges. The whole
sign is checked before painting; small halo strips clip independently so one
nearby original prop cannot erase all its glow. Guard booths (including roofs,
aerials and backup signals) and captive containers now reserve their complete
bounds too; this fixes a booth hiding half a sign in the level-74 theme sweep.
Original rain, washing, rides, materials, moon, props, hazards and exit recipes
remain unchanged. Res-2 only; no Sim.js or Palette.js changes.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-rooftops-revision/coverage-safe.sh` pass: **966** included tests
in both check and coverage. Check took 222.59 s; coverage 197.48 s, including
pauses behind other full runs.
Sixteen bounded page-art tests cover deterministic read-only rendering, RNG
and state restoration, fixed anchors, opaque supported and separate fittings,
readable pink/cyan letters plus spill/reflections in the reported frame,
cache reuse/invalidation and support removal, whole booth/captive reservations,
terrain contrast, motion limits, full washing/rider bounds, paint order,
unchanged opaque actor/canopy colours, original component hashes and four
600-tick simulation replays. CRAP: **0** functions at or above 30, maximum **29.3**; all **21** Rooftops
helpers have **100%** coverage and score at most **10.0**.

**Looked:** final level 17, seed 3, tick 400 at 1× and actual `shoot.js crop 17`,
plus levels 36/55 and level 74 in five themes. Paired seven hazards and
open/furled umbrellas through idle/charge/fire/rest, and followed the real
level-36 umbrella ride through boarding, midway and landing. All artifacts
are under `/tmp/codex-rooftops-revision/`; `sheet.png` includes full frames,
2× crops and 4× details. Ran and viewed `npm run compare --
codex/rooftops 17 --seed 3 --ticks 400 --out
/tmp/codex-rooftops-revision/compare-main.png` from main, plus
`--base c6a912b` into `compare-first-pass.png`. Each includes native full
frames and automatic 2× crops. Commands took 0.55/0.51 s; peak child RSS
under 100 MB. Both signs are complete in the reported frame and the pink
letters, halo and reflection read in the actual shoot crop.

Seeded isolation: **1,080** identical other-biome frames, **60** identical
Rooftops res-1/unspecified-res frames and **30** changed res-2 frames, across
two layouts, three ticks and five themes. Took **17.15 s**, peak RSS
**203.1 MB**. Live fill counts at tick 400 on levels 17/36/55/74 are
**4 / 0 / 4 / 8** added rectangles.

**Pipeline/cost:** retained the host-aware queue, 2048 MB Node heap,
`ulimit -v 6000000`, one check worker/two coverage workers and the Factory-test
exclusion. The superseded check was stopped after the booth occlusion was
found, then final validation restarted. Logs are reset to PENDING before a
run and a completion marker records all phases passing. Image assertions use
digests and bounded draw records.

Denser support-aware placement made the new fixture search more expensive.
The terrain pass now saves its selected fittings in a WeakMap keyed by world
and terrainVersion. The live wisps reuse that static geometry, still check
current support and clip every fleck; a version change rebuilds placement.
This cache holds no animation state and writes nothing to the simulation.
Only four faint flecks per visible new chimney move. Static neon, windows,
roofs, prop bodies and wet sheen remain on the terrain cache.

**Measured:** the benchmark now primes terrain before live timing, matching
the host and avoiding timing the placement search on every actor frame.
Warmed res-2 software rasterizer, tick 476, median of nine interleaved
parent/branch batches of forty frames, after tests and coverage:
level 17 actors **0.682 → 0.685 ms**, full terrain + actors
**9.447 → 11.038 ms**; level 55 actors **0.465 → 0.470 ms**, full
**9.866 → 11.359 ms**; Subway control level 18 actors **1.080 → 1.084 ms**,
full **14.914 → 14.919 ms**. Static repaint cost rises for the new skyline
and light, while the cached live pass adds about 3–5 microseconds in these
frames. Terrain is cached in play; these are Node raster times, not browser FPS.

**Next:** ready for Rooftops revision review. Commit on `codex/rooftops` only;
no push or deployment.

Reviewed and merged by the loop (with `npm run compare`). Rooftops: a skyline band with lit windows, readable pink and cyan neon, solid tanks and dishes on the roofs; the umbrellas still pop.

## 235 — 2026-10-15 · A crawlway that ends at a ledge

**Asked:** after the office radio, take the best remaining item from the
play-test list.

**Found:** level 84's stall endings (and several clock-outs elsewhere) were
agents crawling west under a low roof whose floor ends three cells above the
ground on the way home. The slide treated the missing floor like a wall,
turned, tried the other end, gave up, and walked back out. They did that until
the stall cutoff or the clock.

**Changed:** in `stepSlide`, a crawlway whose floor ends ahead hands the agent
back to walking without turning it, so the walk's ordinary edge rule decides
whether the drop is safe. Walls and a roof too low to crawl under still turn
it as before. Test in `test/stragglers.test.js`; it fails without the fix.

**Measured:** playtest 1-150 × 24, A/B against main: 51339 → 51383 home
(+44, noise about ±16). Runs that ran out the clock fell from 8 to 2 (level 78
2→0, 61, 101 and 118 1→0; 92 and 138 left). Level 84 331 → 335. Some
stall endings moved: 138 went from 5 to 8 of 24 and 81 now has 4. Those are
agents who now get further and stop somewhere new.

**Next:** level 138 (stalls and a clock-out), then 81.

## 236 — 2026-10-15 · Maps and delays on the platform (on a branch)

**Asked:** Subway page art, level 18, on `codex/subway` based on approved
Rooftops `e140602`. Preserve the trains and gap/platform readout from 148–149;
add tiled walls, coloured line stripes, a punning route map, torn posters,
fluorescent flicker, a delayed departure board and yellow platform edges.

**Changed:** res-2-only darker tiled wall bands, with teal, rose and blue line
stripes below the original cable trays. A four-dot AGENT LINE map labels
HEAP ST, LOOP, CACHE and HOME in half-pixel lettering. JOIN/404 posters have
ragged bottom edges and curled paper scraps. A framed amber board reads
NEXT: HOME / — DELAYED in full art-pixel letters, with bitmap colon and dash
support local to these labels; the shared ROM font and other biomes are
unchanged. Yellow half-pixel edge lines follow exposed surviving non-steel
ground and stop at gaps. Walls remain lower contrast than walkable tile.

All wall art, map, posters, board housing/first line, tube housings and soft
lamp spill are cached. The only added animation is the board's delayed line
and two tube filaments, with different flicker periods; Signal Failure dims
them too. At most 150 small fills per live pass in the tests. A WeakMap stores
selected static geometry by world/terrainVersion; live painting still rejects
terrain and complete original fixture bounds, and version changes rebuild it.
No scenery animation state, RNG or simulation writes.

Original furniture, camera LEDs, poster bodies and their widest font titles,
roundels, adverts, tunnels, booth, captive containers, hazards, pits and exit
reserve their full bounds. Whole panels fit before any lettering is drawn;
selected panels and tubes cannot overlap. Original train cars, riders, doors,
platforms, rail/third rail, braking, signals, gap warnings, ambience, original
lamps, events and exit recipes remain intact. No Sim.js or Palette.js changes;
res 1 and unspecified resolution retain their original pixels.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-subway-page/coverage-safe.sh` pass: **980** included tests in
both check and coverage. Check took 90.44 s; coverage 129.48 s.
Fourteen new bounded page-art tests cover biome/resolution gating, RNG and
world writes, deterministic digests, half-pixel grid and context restoration,
cached/separate complete fittings, exact private colon/dash glyphs, four map
dots and contained labels, a readable board within the reported shoot crop,
independent flicker and signal-failure dimming, cache invalidation, live work
budgets and full air/reservation checks, five-theme wall/terrain contrast,
edge integrity, whole original prop/title/booth bounds, paint order, unchanged
opaque face/shirt/eye/canopy pixels, component digests and four 600-tick train
playthroughs with matching complete world digests. CRAP: **0** functions at or above 30, maximum **29.3**. Thirteen of the
fourteen new helpers have **100%** coverage; the live pass has **96.6%**
and scores **18.1**, the highest of the added helpers.

**Looked:** level 18, seed 3, tick 400 at 1× and actual `shoot.js crop 18`.
The departure label is complete and clear of the reported fall/shooting path.
Reviewed levels 18/37/56 at ticks 77/476 with native frames, 2× crops and 4×
details in `/tmp/codex-subway-page/sheet.png`; level 75 in all five themes.
`readability-sheet.png` pairs seven original hazards and open/furled umbrellas
through idle/charge/fire/rest. `trains-sheet.png` follows an actual 199-step
trip through waiting, running, drop, alighted and return, with riders' window
silhouettes, open doors, platform alignment and the gap intact. Map/board
phase crops are also saved in the same directory. Ran and viewed `npm run
compare -- codex/subway 18 --seed 3 --ticks 400 --out
/tmp/codex-subway-page/compare-main.png` from main, plus `--base
codex/rooftops` into `compare-parent.png`. Both contain native full frames
and automatically selected 2× crops; they took 0.31/0.32 s, peak child RSS
about 101 MB.

Seeded isolation: **1,080** identical other-biome frames, **60** identical
Subway res-1/unspecified-res frames and **30** changed Subway res-2 frames:
two layouts, ticks 77/240/600, five themes. Took **17.07 s**, peak RSS
**202.5 MB**. Original component digests retain all ground, fixtures, lights,
rails, trains, ambience, pits, hazards, booth and exit bytes.

**Pipeline:** retained the fast rasterizer, zero-copy frame comparisons,
bounded digest assertions, and one labelled sheet builder. New details use
one seeded tick-400 world for panel phases and one bounded real train trip
for the five ride poses, avoiding repeated full playthroughs. The timing
harness primes terrain before timing actors, matching the page's cache path.
Heap 2048 MB, `ulimit -v 6000000`, one check worker/two coverage workers,
Factory art excluded. The host-aware queue pauses only our process tree while
another full run is active. Pending logs and the all-phases completion marker
prevent stale passes. No package/tool source changes or new slow pipeline step.

**Measured:** warmed res-2 Node software rasterizer at tick 476, median of
nine interleaved parent/branch batches of forty frames after tests/coverage.
Level 18 actors **1.026 → 1.096 ms**, full terrain + actors
**14.355 → 15.834 ms**; level 56 actors **0.959 → 1.007 ms**, full
**16.792 → 17.860 ms**. Harbour control level 19 actors
**0.969 → 0.968 ms**, full **9.174 → 9.176 ms**. Added live work costs
about 48–70 microseconds in these frames. Terrain is cached in play; these
are Node raster timings, not browser FPS.

**Next:** ready for Subway art review. Commit on `codex/subway` only;
no push or deployment.

Reviewed and merged by the loop (with `npm run compare`). Subway: a readable `NEXT: HOME - DELAYED` board, an Agent Line map, wall stripes and posters; the trains are intact. One branch test asserted the shared font had no `:`; main added that glyph in 197 for the commit line on the report card, so the merge drops that one assertion and keeps the station's own glyph checks.

## 237 — 2026-10-15 · Stairs that run into a roof

**Asked:** keep going down the play-test list before the deploy.

**Found:** on level 138 the builders climb a one-brick hump towards the exit
and their next step meets the ledge above. A blocked build always turned the
builder around, even where the floor ahead is perfectly walkable at foot level,
or at a crawl. So the last few in the colony kept walking back to the far wall,
and the level ended on the stall cutoff.

**Changed:** when both a full and a narrow step are blocked, the build still
ends, but the builder turns only if a walker couldn't go on from there
(`walkOnAhead`: the next cell is free, there is floor under it or one below,
and there is room to stand or crawl). Since 235, a crawl over a lip ends in a
step down. Test in `test/stragglers.test.js`; it fails without the fix.

**Measured:** playtest 1-150 × 24 against 235: 51383 → 51408 home (+25,
noise about ±16). Level 138's stall endings went from 8 to 6 of 24. Level 92's
last clock-out is gone, so 138 has the only one left (1/24). 118 375 → 382 and
47 299 → 304. 7 and 142 lost 3 and 4, which is within noise.

**Next:** 138's remaining stalls, then 81.

## 238 — 2026-10-15 · Ask the edge question at the lip

**Asked:** keep going down the play-test list (level 81's stall endings).

**Found:** a side effect of 235. When a crawlway ends at a lip, 235 handed the
agent back to walking. But a walker's stride is shorter than a slider's, so it
landed short of the lip, still under the same low roof, and slid again. On
level 81 one agent flickered between slide and walk every tick on the same
cell until the stall cutoff.

**Changed:** the slide now asks the walk's edge question itself, at the lip
(`edgeAhead` with the slider's own next position). A drop it would take, it
takes. One it wouldn't, it turns from, as before. The 235 test now expects the
fall.

**Measured:** playtest 1-150 × 24 against 237: 51408 → 51435 home (+27).
Level 81's stall endings (4/24) are off the list. 66 304 → 308, 123 355 → 361
and 142 306 → 309. 68 261 → 257 now runs out the clock once in 24.

**Next:** 138's stalls, then 68's clock-out.

## 239 — 2026-10-15 · The long way home counts as moving

**Asked:** keep going down the play-test list (level 138).

**Found:** most of level 138's remaining stall endings had the last agent
walking steadily east along the ledge towards the exit when the cutoff fired.
It had landed near the door early on, facing the wrong way, and wandered off.
Its best distance came from before that detour, so `idle` had long passed 300,
and it wasn't on the exit's own floor, so `homeStretch` didn't count it.

**Changed:** `longWayHome` in the stall tally. A walker facing home that has
gone `LONG_RUN` (12) cells since it last changed direction counts as moving.
An agent shuttling between two walls still counts as stuck on its away legs
and on short legs. If it loops on a long one, the 600-tick no-progress cutoff
still ends the level. Test in `test/stragglers.test.js`.

**Measured:** playtest 1-150 × 24 against 238: 51435 → 51445 home. Level 138
went 320 → 323 and its stall endings went from 7 to 4 of 24. Mean level
length is unchanged (1179 ticks) and nothing hangs.

**Next:** 10's stalls (3/24), and 68's one clock-out. That one is a pillared
corridor with no bashers or climbers left, so it may just be a hard level.

## 240 — 2026-10-15 · Halloween

**Asked:** a Halloween mode from Oct 24 to Nov 1 by the viewer's local date,
previewable with `?season=halloween` (strictly validated) and forced off with
`?season=none`. Cosmetic only: pumpkin-orange accents, jack-o'-lanterns,
bat-wing umbrellas, a ghost rising from each death, spooky ticker puns, and
"TRICK OR TREAT: N/M HOME" on the card. No sim changes, cheap per frame,
readable in every biome, and a small removable module so Christmas can follow.

**Changed:** new web-only `public/agents/season.js` (`window.AgentSeason`).
It holds a `SEASONS` table (date window, accent, greeting, bat colour,
lanterns, puns) and `pick`, `tint`, `dress` and `paint`.
- **Choosing the season.** `pick` takes only an exact, known name from
  `?season=`. Anything else (other case, `constructor`, `__proto__`, empty) is
  ignored, and it falls back to the calendar.
- **What the module does.**
  - `tint` makes the palette's `decorLit` pumpkin orange.
  - `dress` hangs a `w.season` data object on each world.
  - `paint` runs after `drawActors`. It draws five jack-o'-lanterns, fixed per
    level, on air cells standing on floor; one is skipped if its floor is dug
    away. It also turns each new death into a ghost that rises and fades over
    30 ticks (still, under reduced motion) and a ticker pun such as
    "AGENT 004 WAS GHOSTED".
- **Draw.js** only reads that plain data: `homeTitle` (the greeting in front of
  N / M HOME), `batBrolly`/`drawBatEars` (one floater umbrella in three goes
  dark with ears and hooked tips), and `drawFeed` (shows the season's line
  when it is the newest). The puns live in `w.season.note`, not `w.feed`,
  because the office radio times itself off `w.feed`.
- **Wiring.** web.js calls the module around both `drawActors` calls (live and
  replay) and after building the palette.

To add Christmas, add a `SEASONS` entry. To remove a season, delete its entry.

**Measured:** playtest 1-150 × 24 is identical to 239, run for run. Without a
season every drawing test is byte-identical. `test/season.test.js` covers the
date window and edges, strict parsing, a dressed colony playing out exactly
like a plain one, the ghost and pun, the tint and the card title. Local
headless check at `?season=halloween` on levels 2, 9 and 14: lanterns on the
floors, no page errors. `?season=none` and `?season=xmas` both give no season.

## 241 — 2026-10-15 · Patch notes, and one tip

**Asked:** discoverability. Watchers can't know about pep talks, the
sweepstake, sightings, the replay or share links. Add a "what's new" link under
the controls that opens a short pixel-styled list (newest first, about six
items, one dry line each). It closes with Esc or a tap and shows a NEW dot
until opened (localStorage, try/catch). Keep the data static and in one place.
Also a one-time, dismissible first-visit hint: "Tip: tap an agent."

**Changed:**
- **`public/agents/news.js`** (web-only). `NEWS` is the one list: one `{ id,
  text }` per feature, newest first, so a feature adds one line. It also holds
  the `unseen`/`markSeen` and `tipDue`/`tipDone` helpers and `mount`.
- **The link.** A "what's new" link sits under the controls, outside `#stage`
  so it doesn't push the game below the fold on phones; it is 44 px tall on
  touch screens. The NEW dot shows while the stored id isn't the newest one,
  so adding a line lights it again.
- **The panel.** A "PATCH NOTES" dialog in the page's own panel style.
  Clicking or tapping anywhere closes it. Escape closes it too, and is caught
  before the game's own keys hear it.
- **The tip.** It shows on the board on the first visit and goes on its own
  tap or the first tap on the board. Tapping the tip doesn't pause the game or
  count as a pick.
- **Without storage,** the dot and the tip simply show again next time.

Seven lines: Halloween, instant replay, sweepstake, sightings, copy link, pep
talks, rubber duck.

**Measured:** `test/news.test.js` covers the data shape and order, the dot's
memory (including a new line relighting it), the tip showing once, and broken
or missing storage. Headless at 1280×900 and 390×844: the tip and the dot show
on the first visit, a tap on the tip hides it without pausing, the panel opens
with 7 lines, Esc closes it, the dot clears, and after a reload neither comes
back. No page errors. `npm run phone` is fine in all three views.

**Deployed** at 02:46 after 241 (name="build" content="f279cc1a"), gated on a
green full check (1124 tests). It covers 229–241: the event banner below the
outage, instant replay, the sweepstake, the office radio, the Rooftops and
Subway art, the crawlway lip, stairs that meet a roof, the long way home,
Halloween and the patch notes.

Verified on production in headless Chromium, read-only. Every non-GET to
`/api/*` was failed in the browser before it left (6 on desktop, 4 on the
phone), and each view used a throwaway profile, so the queued reports never
retried.
- **Sweepstake** (1280×900 and 390×844 with touch, `?level=5&seed=111`):
  tapping the first walker made it the pick (bet 1) with no pause and no
  nudge. The level played out on its own to its card: 12/12 home, "YOUR PICK
  AGENT 001 CAME HOME 5TH · CALLED 0 OF 1", tally 0/1.
- **Instant replay:** it showed on the next levels the page reached (level 7
  on desktop, level 6 on the phone, an AGI moment each), with the INSTANT
  REPLAY tag and "AGENT 006 IS FIRST HOME" on the ticker.
- **Halloween:** `?season=halloween` on level 2, seed 7919 gave five lanterns,
  a ghost and "AGENT 001 WENT TO THE GREAT /DEV/NULL". `?season=none` and
  `?season=xmas` gave no season.
- **Patch notes:** the tip and the NEW dot show on a first visit, the panel
  has 7 lines, Esc closes it, and after a reload neither shows.
- **All views:** build f279cc1a, no page errors.

## 242 — 2026-10-15 · Last light over the container port (on a branch)

**Brief:** Harbour (level 19), page resolution only. `codex/harbour` starts
at approved Subway `8d38d20` in the art worktree; preserve LOG 162–163's
quays, ferry crossings and existing harbour pieces.

**Changed:** cached night gradient and five muted container colours, varied
lengths and stacks, corrugated ribs and complete tiny CTX/RAG/LLM/API/BOT
stencils. A solid gantry with cabin, cable and bracing stands behind the quay;
two moored hulls have different mast/rigging positions. Sparse supported
bollards carry rope coils and occasional perched gulls. The original
lighthouse stays in its place, with a slow half-pixel cone and soft fringe.
Deep water glints shimmer below the ferry hull and wake. Only the cone and
glints animate; geometry is cached by world and terrain version, and all
motion is derived from ticks. No rendering RNG or simulation fields added.

Container colour/stack/length and boat bays vary between neighbours. Bodies
are subdued enough for matte-black and hackerman terrain edges to remain the
stronger plane. Complete stencil bounds reject terrain and original props;
quay fittings require full clear air and two solid footings. Full nets,
lanterns, crates, pots, existing ropes, booth, captive containers, pits,
hazards and exit bounds are reserved. Added beam paint precedes machinery,
hazards and agents; deep glints follow the opaque sea fill and precede the
ferry. Original ferry, passenger, gangway, wake, foam, gull, fog, lighthouse,
water, event and exit recipes remain unchanged. Sim.js and Palette.js are
untouched. Res 1 and unspecified resolution retain their original pixels.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-harbour-page/coverage-safe.sh` pass with exit 0: **993**
included tests in check and **993** in coverage. Check took
164.78 s; coverage 132.43 s (wall time includes host-queue pauses).
Thirteen bounded page-art tests cover biome/resolution gating, deterministic
half-pixel paint, no RNG/world writes, canvas restoration, cached fittings and
invalidation, solid support and complete stencil labels, five container
colours, distinct masts and perched gulls, bounded live footprints and fresh
air checks, water/ferry clearance, slow sweep and independent shimmer, exact
original prop/exit/booth/captive bounds, five-theme contrast, paint order,
opaque face/shirt/eye/umbrella pixels, original component digests and four
600-tick playthroughs with identical complete world digests. A completed
actor-frame pixel check catches deep glints hidden by the original sea fill.
CRAP: **0** functions at or above 30, maximum **29.3294**.
14/14 new helpers have 100% coverage; the highest new score is
**12.0**. Minimum new-helper coverage is **100.0%**.

**Looked:** level 19, seed 3, tick 400 at native 1× and actual `shoot.js crop
19`. Reviewed levels 19/38/57 at ticks 77/476 in native frame pairs, 2× crops
and 4× details in `/tmp/codex-harbour-page/sheet.png`; level 76 in all five
themes. `readability-sheet.png` pairs open/furled umbrellas and seven original
hazards at idle/charge/fire/rest. `ferries-sheet.png` follows one actual
102-step trip through waiting, running, drop, alighted and return, with clear
passengers, intact gangway/dock alignment and wake. Beam and deep-water phase
crops use one seeded world. Ran and viewed `npm run compare -- codex/harbour
19 --seed 3 --ticks 400 --out /tmp/codex-harbour-page/compare-main.png`, plus
`--base codex/subway` into `compare-parent.png`, read-only from main because
the parent branch predates that command. Both include native full
frames and automatically selected 2× crops; they took 0.63/0.61 s,
peak child RSS about 100.4 MB.

Seeded isolation: **1,080** identical other-biome frames, **60** identical
Harbour res-1/unspecified-res frames and **30** changed Harbour res-2 frames:
two layouts, ticks 77/240/600, five themes. Took **22.94 s**, peak RSS
**204.0 MB** with a 256 MB renderer heap (down from 750.1 MB
with the default heap). Original component digests retain the original recipes.

**Pipeline:** retained fast rasterization, zero-copy frame equality, bounded
digest assertions and one labelled sheet builder. Capped the isolation
renderer to avoid its default-heap RSS growth. Improved validation with start
and end source fingerprints: a pass marker cannot describe edited source.
Restarted our own validation after the water paint-order correction. Added
explicit per-phase exit records and repeated check after its launcher was
terminated despite passing test output. Final
check and coverage run with heap 2048 MB, `ulimit -v 6000000`, one check
worker/two coverage workers, and Factory art excluded. The shared host-aware
queue suspends only our own process tree when another test run starts;
pending logs and a completion marker prevent stale passes. Native comparison
is subsecond; no repository tool/package changes.

**Measured:** warmed res-2 Node software rasterizer at tick 476, median of
nine interleaved parent/branch batches of forty frames after tests/coverage.
Level 19 (Harbour) actors **0.908 → 0.934 ms**,
full terrain + actors **8.612 → 9.798 ms**.
Level 57 (Harbour) actors **0.882 → 0.925 ms**,
full terrain + actors **8.879 → 10.345 ms**.
Level 18 (Subway) actors **1.133 → 1.146 ms**,
full terrain + actors **16.485 → 16.560 ms**.
Added live work costs about 26–43 microseconds in these Harbour frames.
Terrain is cached during play; these are Node raster timings, not browser FPS.

**Next:** ready for Harbour art review. Commit on `codex/harbour` only;
no push or deployment.


## 243 — 2026-10-15 · Marked cargo and a visible beacon (on a branch)

**Brief:** one Harbour revision on `codex/harbour`, following review of
level 19, seed 3, tick 400. Preserve original harbour pieces and make cargo,
lighthouse and water read at native size; restore the untouched warm sky.

**Changed:** separated dim rust red, faded blue, teal, ochre and muted purple
container bodies. Whole-art-pixel corrugation ribs, narrow seam highlights,
double doors and two locking bars with hinges carry the silhouette at 1×;
complete stencil codes remain reserved against fixtures and terrain. All five
body colours stay below 80% of the walkable edge luminance in every theme.

The night wash now begins at `SKY * CELL`. Stacks, gantry and hull masts also
stay below that boundary. The original top sky pixels are restored exactly,
including its warm band. The fixed old lighthouse lost its lantern behind
the first corridor ceiling. A cached placement search now fits a complete
14×20 striped tower and lantern in clear supported space outside original
pieces, before choosing other new fittings. In the reported frame its box is
(274, 44). The faint 72-strip beam starts at its lantern and slowly sweeps;
its fringe is stronger, and fresh air checks still protect foreground cells.
The original harbour lighthouse/beam recipe remains intact. Deep-pool glints
are now 4×1 art pixels with a brighter blue-silver tint; they remain below the
ferry hull and foam, after the opaque water fill and before the ferry.
Sim.js and Palette.js are untouched. Original agent, umbrella, hazard, ferry,
exit and shared font recipes remain unchanged. Geometry is cached; no new animation state or per-frame
placement search.

**Checked:** `npm run stamp`, bounded `npm run check`, and
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-harbour-revision/coverage-safe.sh` pass with recorded exit 0:
**995** included tests in both check and coverage. Check took
**94.73 s**; coverage **133.58 s**.
The 15 bounded Harbour page tests now also check distinct hue families,
whole-pixel ribs and two door bars, complete lantern/beam visibility through
eight real tick-400 layouts, complete parent sky digests across four layouts,
four ticks and five themes, and no added paint above the sky boundary over
24 layouts. Earlier read-only/RNG, terrain/reservation, context, cache,
footprint budgets, opaque actor pixels, original component digests and four
600-tick replay checks still pass. CRAP: **0** functions at or above 30; maximum **29.3294**.
15 of 16 Harbour helpers have 100% coverage. Placement has 87.5% coverage
and scores 6.1; the highest Harbour score is **13.0**.

**Looked:** native 1× `level-19.png` and actual `shoot.js crop 19`, seed 3,
tick 400. The tower's lantern and stripe are visible, its beam crosses the
upper corridor, the containers have distinct colours and door hardware, and
the pool glints show beneath the ferry. Rebuilt `/tmp/codex-harbour-revision/
sheet.png` for levels 19/38/57, ticks 77/476, with full pairs, 2× crops and
4× details. Reviewed level 76 in all five themes; beam/water phases, original
hazard tells and open/furled umbrellas; and five poses of the same actual
102-step ferry trip in `ferries-sheet.png`.

Ran and viewed `npm run compare -- codex/harbour 19 --seed 3 --ticks 400`
with output in `/tmp/codex-harbour-revision/compare-main.png`, plus
`--base codex/subway` (`compare-parent.png`) and `--base d550c78`
(`compare-revision.png`). Main and Subway differences start at **(24, 56)**
canvas pixels, below the original sky band. The previous-pass comparison
shows the intentional restoration at the top. Each comparison took about
0.2–0.3 s. Isolation again passed **1,080** other-biome frames and **60** Harbour
res-1/unspecified-res frames unchanged, with **30** changed Harbour res-2
frames (two layouts, three ticks, five themes); **30.38 s**, peak RSS
**203.0 MB** under the 256 MB renderer heap.

**Pipeline:** retained the 256 MB renderer heap, zero-copy frame equality,
bounded digest recording, single-world phase crops and one bounded ferry
trip. Test launchers record explicit exit codes; start/end source hashes
prevent stale success markers. Full check uses one worker and coverage two,
heap 2048 MB under `ulimit -v 6000000`, with Factory art excluded. The shared
host-aware queue serializes full runs and suspends only our own tree if
another run starts. No new slow pipeline step or repository tool changes.

**Measured:** warmed res-2 software rasterizer at tick 476, nine interleaved
batches of forty frames, comparing first Harbour pass `d550c78` → revision.
Level 19 (Harbour) actors **0.929 → 0.941 ms**,
full terrain + actors **9.794 → 9.807 ms**.
Level 57 (Harbour) actors **0.915 → 0.908 ms**,
full terrain + actors **10.339 → 10.348 ms**.
Level 18 (Subway) actors **1.130 → 1.131 ms**,
full terrain + actors **16.693 → 16.681 ms**.
Terrain paint remains cached in play; these are Node raster times, not
browser FPS.

**Next:** ready for Harbour revision review. Commit on `codex/harbour` only;
no push or deployment.

Reviewed and merged by the loop (with `npm run compare`). Harbour: varied containers, a lighthouse, shimmer on the water and the sky band restored. This completes the page-art pass: all 19 biomes now have their own page art. Patch notes have a line for it.

## 244 — 2026-10-15 · Page weight: ship the code, not the prose

**Asked:** a page-weight health pass. Measure transfer size on production
(br/gzip as Cloudflare serves it). In headless Chromium with 4× CPU and a
Fast 3G / Slow 4G network, measure time to the first frame of the board,
script parse/compile time and long tasks on load. Make it `npm run loadtime`.
If the throttled phone's first frame is over ~2 s, propose and, if clearly
worth it, implement the smallest dependency-free fix with identical digests.

**Tool:** `tools/loadtime.js` (`npm run loadtime`).
- **Transfer:** reads each script's bytes off the wire as production sends
  them.
- **Load:** a cold-cache 390×844 phone, CPU 4×, on DevTools' Fast 3G (562.5
  ms, 1.44 Mbps; newer DevTools calls it Slow 4G) and Fast 4G. It reports the
  first frame with a world on the board, FCP and DOMContentLoaded. From a
  trace it gives per-script main-thread compile, streamed (background)
  compile and evaluation, plus the long tasks before the first frame.
- **Modes:** `--local` serves `public/` with brotli at Cloudflare's level, and
  `--dist` serves the shipped copy. POSTs to the API are refused, as in the
  production checks.

**Before (production, build f279cc1a):**
- **Wire:** 390 KB of 1340 KB raw. Draw.js is 198 KB (753 raw) and Sim.js
  149 KB (469 raw). Cloudflare's on-the-fly brotli is about quality 5.
- **Fast 3G:** first frame 3.8 s (FCP 1.4 s).
- **Fast 4G:** first frame 1.0 s.
- **Main thread:** no long tasks before the first frame, and main-thread
  compile is about 1 ms. V8 parses the big files on a background thread while
  they stream in, so load is bound purely by the network.

**Options weighed:**
- *Lazily loaded per-biome art.* The biome-named drawing is under a third of
  Draw.js and the rest is shared helpers. It would also need a loader and
  fallbacks in a file the Omarchy panel shares. Too big for this pass.
- *Precompressing at brotli 11.* Needs the Worker to serve encoded bodies by
  hand, for about 17%.
- *Dropping comments.* The source is heavily commented: 41% of Sim.js is
  whole-line comments. They cost bandwidth and no CPU, and the browser throws
  them away.

**Changed:** `tools/ship.js`.
- **The build.** `npm run deploy` now builds `dist/` and Wrangler serves it.
  It is a copy of `public/` whose scripts drop only comment-only lines and
  leading indentation. Nothing is renamed, reordered or minified; the source,
  the repo and the Omarchy panel keep every comment.
- **Safety.** A small scanner (quotes, template literals with `${}`, block
  comments, regex literals) leaves any line that starts inside a literal as it
  is. Today no line in the page's scripts does. Every shipped file passes
  `node --check`.
- **Testing.** `test/ship.test.js` plays ten levels to the end with the
  shipped Sim and the source, with identical results. It renders one level
  per biome (all 19) with the shipped Draw and the source and gets identical
  bytes. It also checks the scanner on the tricky cases, the exported names
  and the build.
- **Tooling.** `loadCoreFrom` can take its export names from the source,
  because a dedented copy has nested `var`s at column 0. `npm run dev` serves
  `public/` directly.

**After (local br server at Cloudflare's level, same throttling, 3 runs):**

| | Source | Shipped |
|---|---|---|
| Fast 3G first frame | 3.5 s | 2.7 s |
| Fast 4G first frame | 0.91 s | 0.76 s |
| Draw.js on the wire | 198 KB | 136 KB |
| Sim.js on the wire | 149 KB | 67 KB |
| Scripts total on the wire | about 384 KB | about 245 KB |
| Streamed compile, Fast 4G | 704 ms | 364 ms |

Production numbers follow after the next deploy.

**Not under 2 s on Fast 3G yet.** Before any script byte arrives, FCP is
already 1.3 s: DNS, TLS and the HTML over a 562 ms round trip. Getting under
2 s would mean roughly halving the script bytes again, and that is the lazy
per-biome art split above. Proposed as a separate pass if wanted. On Fast 4G
the first frame is well under a second.

## 245 — 2026-10-15 · Biome audit; hot and cold aisles

**Asked:** list each biome's signature mechanic or hazard, and give the 2–3
weakest a small one that fits their art and the puns. Playtest-neutral or
better, never a soft-lock. Commit each.

**Audit** (`BIOME_MECHANISMS`, the biome-only hazards, events and rules):

| Biome | Signature |
|---|---|
| Cavern | sinkholes |
| Ruins | the boulder |
| Frost | powder snow (softer falls) and the Cold Cache snowball |
| Foundry | hoist chains, lava |
| Jungle | vines, crocodile pools |
| Ice Cave | frozen colleagues |
| Spaceship | jump pads, coolant |
| Factory | conveyor belts, oil |
| Skyscraper | the tower plan and its office hazards (sprinkler, polisher, shredder) |
| Trench | swimming, currents, the Loan Shark |
| Desert | wind gusts, the Tail Call scorpion |
| Mail Room | pneumatic tubes |
| Building Site | cranes |
| Clock Tower | gates |
| Rooftops | ziplines |
| Subway | trains |
| Harbour | ferries |
| Data Center | only the Hot Aisle hazard (weak) |
| Library | nothing of its own (weakest) |

**Changed:** the Data Center's own mechanism, `placeAisles`, on a stream of
its own.
- **Placement.** On most corridors, a pair of floor grates: a hot aisle and the
  cold aisle beside it, 6–10 cells each, on open floor.
- **Effect.** Hot hurries whoever walks it (1.35×) and cold slows them
  (0.85×), whichever way they face. It is pace only, through `walkStep`, so
  hazard timing sees it too. Nothing is ever stopped or turned, so it can't
  strand anyone.
- **Ticker.** It names the first agent on each kind once a level: "HOT AISLE:
  AGENT 004 IS RUNNING HOT" and "COLD AISLE: … HAS BEEN THROTTLED".
- **Draw.** `drawAisles` shows a dashed orange or ice-blue grate on the
  floor's lip, with heat shimmering up or chilled air sinking at page
  resolution.
- **Patch notes** have a line for it.

**Measured:**
- **Other biomes:** playtest 1-150 × 24 is identical run for run.
- **Data Center at 1.3/0.7:** −8 home and one new clock-out (level 69, where
  a shift in tool spending left a 2-high wall and nothing to climb it with).
- **Tuning** on the 8 Data Center levels × 48 (base 5542): 1.3/0.7 gave 5532,
  1.25/0.8 gave 5557, 1.35/0.85 gave 5565 and 1.2/0.85 gave 5560. 1.35/0.85
  is shipped, with no bad endings.
- **Full run at 1.35/0.85:** 51445 → 51452 home. Data Center 2777 → 2784, no
  stalls or clock-outs. `test/aisles.test.js` covers it.

**Next:** the Library.

**Fix after 245:** 245 was committed with `test/news.test.js` failing. The
aisles line made nine patch notes and the test caps them at eight. The oldest
(rubber duck) drops off, and `NEWS` now says so: eight at most, oldest out.
I ran the news test, saw it fail, and committed anyway; from now on the full
check runs after the last edit before every commit.

## 246 — 2026-10-15 · The librarian

**Asked:** (from 245) the Library has no mechanic of its own; give it one that
fits its art and the puns, playtest-neutral, never a soft-lock.

**Changed:** `placeLibrarian`, the Library's own mechanism, on a stream of its
own.
- **Where she stands.** One librarian at a desk on the first corridor, which
  the whole colony walks, a few strides short of its first obstacle.
- **Who counts as noise.** Anyone who bashes, mines, digs or lays bricks within
  earshot (12 cells along, 6 rows down). Also the loud walkers (brave,
  stubborn, curious) passing within 3 cells of her desk. Heroes are left
  alone.
- **The shush.** She shushes the nearest one: it holds still for 40 ticks, says
  "SORRY", then carries on exactly where it was, the same way and with the
  same job. One whose floor goes falls as it would have. She needs 150 ticks
  between shushes.
- **Ticker.** It rotates "SHHH! AGENT 003 WAS TOO LOUD", "… HAS BEEN ASKED TO
  USE ITS INSIDE VOICE" and "… WAS RATE-LIMITED BY THE LIBRARIAN".
- **Draw.** `drawLibrarian` shows her (bun, glasses, purple cardigan) behind a
  desk with a green lamp and a pile of returns. She turns towards whoever she
  last shushed, with a SHHH bubble at page resolution.
- **Patch notes:** one line for the librarian and the aisles together, so the
  list stays at eight.

**Tuning:** she shushed in 6 of 48 runs at first, because tools are rarely
needed where she stood. Counting the loud walkers brought it to 28 of 48, and
a 150-tick cooldown gives about 1–2 shushes a level.

**Measured:** playtest 1-150 × 24, A/B against 245. Every other biome is
identical run for run. Library: 2764 → 2762 of 2832, and bad endings went
from 3 to 2. Total 51452 → 51450, no hangs. `test/librarian.test.js` covers
placement, the shush and its rules, falling while shushed, and the drawing.
Because the librarian changes level 13's colonies, `test/bouncer-art.test.js`
moves to seed 103011, one where the Bouncer is still put down; the test asks
for exactly that.

## 247 — 2026-10-15 · No test can hang a run

**Asked (supervisor):** `test/sightings.test.js` hung the full run in the main
worktree. The worker sat idle for about 3.5 min at 0% CPU with no Chromium
alive, until the supervisor killed it. Make it bounded: a per-test timeout,
always closing the browser in a finally, and a default test timeout for
`npm test`.

**Found:** the browser tests already close Chromium in a `finally`. The hang
was in the shared helper, `tools/phone.js` `browser()`. Each CDP command was a
promise that settled only when Chromium answered, so when Chromium died
mid-test (the same run also lost a replay check) the `await` never returned.
The `finally` was never reached either.

**Changed:**
- **Every command settles.** With its answer, after 20 s ("chromium did not
  answer Runtime.evaluate in 20000 ms"), or as soon as the socket closes, when
  every pending command is rejected. A later command on a closed connection
  fails at once.
- **`npm test`** is `node --test --test-timeout=120000`.
- **Every test that opens Chromium** has its own `timeout`: 30 s for the
  sightings test, 60 s for the others.
- **The replay page test** waits up to 15 s (was 6) for the replay to start,
  because under the full parallel run it didn't always get there in time.

**Measured:** full check 1159/1159 green in 24 s.

## 248 — 2026-10-15 · Let's go! Oh no! Yippee!

**Asked:** a Lemmings homage in sound. With sfx on, three tiny squeaky voice
clips synthesised in sfx.js (WebAudio, no files, formant-ish chirps with a
pitch contour so they read as words; retro and cute, not real speech):
- "Let's go!" when the hatch opens;
- "Oh no!" just before a bomb goes off;
- "Yippee!" for the first agent home, higher-pitched for the AGI.

Rate-limited, never more than one voice at a time, respecting the sfx toggle.
Add a patch-notes line.

**Changed:** `sfx.js` gets a tiny voice synth.
- **Vowels.** A syllable is a sawtooth gliding between two pitches, run
  through two band-pass filters at that vowel's formants (e, o, i, n). The
  formants are raised by 1.55 so it sounds small and squeaky. It has a quick
  attack, a hold and an exponential fade.
- **Consonants** are a short high hiss (s) or a band-passed click (p, g).
- **Words** are data (`WORDS`):
  - let's go: le-ts-g-o, falling at the end;
  - oh no: o-n-o, falling;
  - yippee: yi-p-pee, rising.
- **Triggers** are read off the world like every other cue:
  - let's go as `released` goes from 0 to 1;
  - oh no when a bomb's fuse reaches 40 ticks (about 1.3 s before the bang);
  - yippee as `saved` goes from 0 to 1, at 1.4× pitch when it's the AGI.
- **Limits.** A voice is dropped while another is still talking. Let's go has
  a 4 s gap and oh no 2.5 s. With sfx off nothing plays.

**Levels:** rendered in Chromium's OfflineAudioContext, the words peak at
0.036–0.042 (RMS 0.012), next to the pep chirp's 0.026. At first they peaked
around 0.06, mostly the "s" hiss, so the voice level and the consonants were
brought down.

**Patch notes:** "Added: voices, with sound on. Let's go, oh no, yippee. Any
resemblance is a tribute." The list stays at eight; the "new paint" line went
rather than pep talks, since watchers need to know what a tap does.

**Tests:** `test/sfx.test.js` checks each trigger, one voice at a time, and
silence with sfx off. The stand-in AudioContext's filters gained `Q`, and the
AGI-replaces-the-chirp count now starts past the first home.

## 249 — 2026-10-15 · First impressions

**Asked:** open the page fresh (cleared storage) in headless Chromium at
desktop and phone size, and watch levels 1–3 at normal speed through periodic
screenshots (1 to 90 s). Note, as a new visitor, anything confusing, ugly, too
busy or dead time. Fix the top 2–3 quick ones and log the rest.

**What a new visitor sees:** level 1 (Cavern) starts dropping agents at about
2 s. The first one is home at 14 s and the report card is up at 26 s, so it's
well paced. Level 2 (Ruins) starts about 2 s after the card, and level 3
arrives at about 85 s on the desktop.

**Fixed:**
1. **The tip never left.** "Tip: tap an agent." stayed on the board until
   someone tapped. It was still there over the report card and halfway
   through level 2. Now it also goes when its first level ends, or when the
   page moves to another level, and that counts as seen (`tipOver`).
2. **Said twice.** On a first visit the tip and the ticker's "TAP AN AGENT:
   WHO GETS HOME FIRST?" were up at the same moment. While the tip shows, the
   ticker hint stays quiet; levels 2 and 3 of the visit still get it.
3. **"12 home, 1 levels"** in the footer is now "1 level" (and "1 agent" in
   its title).

**Logged, not fixed:**
- **Dead time on level 2 (phone run, random colony):** 9 of 13 home at 60 s,
  then four stragglers on the bottom floor across a pool from the exit. Still
  9/13 at 90 s, so 30+ s with nothing changing. The desktop colony had one
  straggler for 15 s. It's a play-test item; the colony seed wasn't captured,
  so next time the first-look script should record `w.colonySeed`.
- **The ticker on a phone** starts flush against the screen edge (the board
  fills the width) and is small at 390 px. Readable, but cramped.
- **The first report card** shows "0/7 SIGHTINGS" with seven grey icons,
  which means little on a first visit. Maybe hide the strip until the first
  sighting.
- **The intro paragraph** is five lines on a phone, so the board starts
  halfway down the first screen.

**Fix after 249:** 249 was committed with the full check red. The sweepstake
page test still expected the ticker hint on a first visit, and fps and phone
failed once under load (both pass on a rerun). My commit command ran after the
check without checking its result. The sweepstake test now asserts both
cases: on a first visit the tip shows and the ticker stays quiet; on a return
visit the ticker gives the hint. From here on, commits go through a gate that
only commits when `npm run check` exits 0.

## 250 — 2026-10-15 · Christmas

**Asked:** if time remains, a Christmas season module following the Halloween
pattern: Dec 1–26 and `?season=christmas`, snow on the backdrop, Santa hats,
umbrellas sometimes candy-striped, a gift-wrapped exit, "HO HO HOME" as the
report title, a few festive ticker puns. Cosmetic only.

**Changed:** one more entry in `season.js`'s `SEASONS`, and the module grew
the general knobs Christmas needed. Every field is optional.
- **season.js:**
  - `snow` (flakes as a pure function of the tick, only over open air, still
    under reduced motion);
  - `gift` (a red ribbon down and across the exit, with a bow);
  - `hats`;
  - `candy`/`candyEvery`;
  - `homeSuffix`;
  - `homePuns`, for the first one home and every fifth after;
  - `ghosts`, now a flag Halloween sets.
- **Draw.js** reads more plain data:
  - `drawPartyHat` gains a "santa" kind (red cap with a flopped tip, fur brim
    and pompom), drawn when the season asks and no milestone hat is up;
  - `candyBrolly`/`drawCandyStripes` give one floater umbrella in three a
    white canopy with red stripes;
  - `homeTitle` takes the season's suffix, so the card reads "HO HO HOME:
    12 / 12".
- **Puns.** Home: "IS HOME FOR THE HOLIDAYS", "MADE THE NICE LIST" and
  "DELIVERED. NO CHIMNEY REQUIRED". Lost: "IS ON THE NAUGHTY LIST", "GOT COAL"
  and "WAS RETURNED, NO RECEIPT".
- **Patch notes.** The Halloween line covers both seasons now, so the list
  stays at eight.

Built on a branch in a worktree, so `main` stayed clean for the 03:46 `dist/`
deploy, which ships the working tree.

**Measured:** `test/season.test.js` covers the date window and the preview
link, a dressed colony playing out exactly like a plain one, the card title,
the festive lines, and hats and stripes drawn only with the season. Local
headless check at `?season=christmas`, level 1: Santa hats on every walker,
snow over the cave air, the exit wrapped with a bow, "AGENT 001 DELIVERED. NO
CHIMNEY REQUIRED" on the ticker, no page errors.

**Deployed** at 03:46 after 250 (name="build" content="5721422d"), gated on a
green full check (1165 tests) and the CRAP gate. It covers 242–250: the
Harbour art, page weight and the `dist/` ship, the aisles, the librarian, the
test-hang fix, the voices, first impressions and Christmas. It is the first
deploy built by `tools/ship.js`.

Verified on production, read-only (every non-GET to `/api/*` failed in the
browser, throwaway profiles):
- **`dist/` shipped as built.** All 9 scripts serve as brotli and are
  byte-identical to `dist/` after decoding, with no comment lines.
  Cache-Control is `public, max-age=31536000, immutable`. The `?v=` stamps in
  the served page match the source's `index.html`. The build agrees on the
  page meta, `src/version.js` and `/api/stats` (5721422d). The page itself
  differs from `dist/index.html` only by Cloudflare's injected challenge
  script before `</body>`, which is edge-side and not ours.
- **Version notice for open tabs.** A tab served the page as the previous
  build (meta rewritten to f279cc1a) learned the new build from
  `/api/stats`. When its level ended it reloaded itself into 5721422d. No
  console errors, no page errors.
- **Sweepstake and replay** (desktop 1280×900 and phone 390×844 with touch,
  `?level=5&seed=111`):
  - Sweepstake: the pick was recorded on both, and both cards say "YOUR PICK
    AGENT 001 CAME HOME 5TH · CALLED 0 OF 1".
  - Replay: on the desktop it played on level 9 (an AGI moment). On the phone
    none of the levels in the 150 s window had a moment worth replaying, so
    there was none, which is the designed behaviour.
- **Seasons:** `?season=halloween` gives lanterns, a ghost and "WENT TO THE
  GREAT /DEV/NULL"; `?season=christmas` gives "AGENT 001 DELIVERED. NO CHIMNEY
  REQUIRED".
- **Patch notes:** the tip, the dot, 8 lines and Esc all work at both sizes.

**Load time on production** (`npm run loadtime -- --runs 3`), before (f279cc1a) → after:

| | Before | After |
|---|---|---|
| Total on the wire | 390 KB | 250 KB |
| Draw.js on the wire | 198 KB | 146 KB |
| Sim.js on the wire | 149 KB | 73 KB |
| Fast 3G first frame | 3.8 s | 3.0 s |
| Fast 4G first frame | 1.0 s | 0.86 s |

Still no long tasks.

## 251 — 2026-10-15 · Give the gags whole pixels (on a branch)

**Brief:** art for the recent gameplay gags at native 1× and page res 2, on
`codex/gag-art`. Started from local main and rebased onto `902d5be` after the
developer merged the approved Harbour revision. No push, deployment or sibling
sync.

**Changed:** the dreamer's false exit has broken luminous jambs, a readable
EXIT header and a rippling silhouette. The bevelled 429 plate, post and queue
tickets read at native size; queue dialogue sits beside the sign rather than
over it or the hero card. Golden AGI glints sit outside the face and collar;
pep-talk stars use a separate mint accent. Both ducks have a rounded body,
orange beak, eye, wing and shaded belly. Their speech and merge-conflict
chevrons now have whole-pixel lettering at res 1, complete tails and dark
edges; conflict panels sit side by side and stay within either board edge.
Exit and hazard clearance includes the whole speech panel and shadow.

Outages retain their darkness, with paired eyes, dim hat/collar cues, small
hazard lamps and an exit threshold/frame that remains visible. Hidden riders
and departed bodies do not leave floating eyes. The standup has a clock,
sprint calendar, active-speaker mark, labelled TODO/DOING/DONE columns and
shadowed, inked sticky notes. Replay gets a bevelled recording badge below the
sky. Seven distinct report-card icons retain their labels and fresh-sighting
frame. Party hats have clear cones/stripes or a pronged crown; confetti flips
like paper, with its trajectory vectors calculated once at load.

Halloween gets ribbed, carved pumpkins with candle pixels and a small warm
floor pool; scalloped, hooked bat wings with a pale rim and amber eyes; and
rounded ghosts with shaded folds and tasselled hems. Seasonal props avoid
living faces, umbrella canopies, exits, hazards and unsupported/blocked floor
positions. Reduced motion holds decorative movement still. No simulation,
palette, web orchestration or gag timing changes.

**Looked:** all 17 contexts in `/tmp/codex-gag-art/final/contact-sheet.png`,
with before/after res-1 and res-2 crops, plus 68 native full frames and 68
native crops. Reviewed the native 400×248 frames together in `native-1x.png`,
including complete queue sign/dialogue and all seven report icons. Local
`?season=halloween&level=9&seed=3` page at tick 405 shows the lanterns and
readable agents; `halloween-page.png` and JSON are in `/tmp/codex-gag-art/`.
The preferred Chromium extension connection was unavailable; the repository's
isolated headless preview produced no page exceptions.

**Isolation:** 285 ordinary frames (19 biomes × five themes × unspecified,
res 1 and res 2) are byte-identical to merged main when gags are inactive.
The new tests compare complete simulation digests in all nineteen biomes
through 600 ticks, with identical random draws and only existing `season*`
display bookkeeping omitted. They also enforce deterministic, RNG-free,
read-only painting, finite positive rectangles, whole/half-pixel grids,
context restoration, protected sprite pixels, conflict/queue clearance,
seasonal occlusion, reduced motion and effect expiry. Assertions hash frames
or inspect bounded pixels rather than diffing canvas buffers.

**Pipeline:** `node --max-old-space-size=256 tools/gag-art.js --base 902d5be
--out /tmp/codex-gag-art/final` reproduces the sheet and native frames in about
1.3 s, peak RSS 166 MB. Reuses four seasonal VM contexts. Caching unchanged
terrain in the all-context test, as the real host does, reduced it from 6.8 s
to 1.4 s while keeping every context, resolution and theme.

The existing headless browser helper hung indefinitely when Chromium exited
under the required 6 GB virtual-address limit. Chromium reserves an address
cage larger than that limit. `tools/phone.js` now detects that limit and uses
an isolated transient user service with **MemoryMax=512M**, TasksMax=256 and a
five-minute lifetime; Node and test workers keep their 2048 MB heap and
`ulimit -v 6000000`. Startup, sockets, commands and cleanup have bounded
failure paths. Active-time deadlines tolerate a serialized test pause. The
host-aware art launcher also suspends only its own managed browser alongside
its Node tree when another full run starts. No user browser/profile or system
configuration is changed. The capped browser smoke test and existing page
replay integration test pass; no three-second cleanup timer remains after a
successful browser exit.

**Measured:** five interleaved warmed batches of twenty res-2 actor frames,
merged main → revision, Node software rasterizer: mirage **0.843 → 0.884 ms**,
queue **0.934 → 0.959**, AGI **0.836 → 0.843**, conflict **0.854 → 0.863**,
outage **1.945 → 1.982**, standup **1.886 → 2.031**, report **1.774 → 1.865**,
party **0.888 → 0.912**, bat **0.632 → 0.629**. These are cached-terrain draw
times, not browser FPS. No new per-frame canvases, gradients or scene state.

**Validation:** `npm run stamp` and the capped `npm run check` pass: **1,138
tests**, zero failures/skips, **212.11 s** including shared-host pauses. The
focused gag/429 run passes **20 tests** in **5.50 s**. Capped coverage also
passes **1,138 tests**, zero failures/skips, in **179.18 s**. `npm run crap --
--threshold 30 --coverage-command /tmp/codex-gag-art/coverage-safe.sh` passes;
highest score **30.0**, new gag helpers at most **13.0**, speech panel **17.1**,
browser helper at most **12.0**. Draw coverage is **99.77% lines / 98.26%
branches**. Factory art remains explicitly excluded; one worker for check
and two for coverage, never overlapping full runs. Start/end source hashes
match; simulation, palette, web and outcome files remain byte-identical to
merged main. No temporary browsers remain.

**Next:** ready for gag-art review. Commit on `codex/gag-art` only; no push,
deployment or sibling sync.

Reviewed and merged by the loop (with `npm run compare`). The mirage EXIT is crisp, the 429 bubble says AFTER YOU, the standup has a kanban board, the conflict and pep bubbles are drawn in whole pixels, and the Halloween pieces are tidied. `tools/phone.js` conflicted with 247: the branch's harness already settles every CDP command (a timeout counted in active time, and a rejection when the socket closes) and adds a memory-capped Chromium launch under the test runner's address-space cap. The merge keeps the branch's version, with 247's `CMD_TIMEOUT` constant naming its 10 s timeout. 247's per-test and global timeouts stay as they were. `season.js` keeps Christmas (250) alongside the branch's Halloween changes. Standup bubbles on a 390 px phone (headless, 4 speakers): none is clipped. They are clamped 4 px inside the board, though, and the board overhangs the screen by 5 px a side there, so `STANDUP_EDGE` is now 8.

## 252 — 2026-10-15 · A shared link with an umbrella (on a branch)

**Brief:** a 1200×630 social preview from our own renderer, numbered PNGs,
Open Graph/Twitter cards and crisp 16/32/180 pixel icons. `codex/share-art`
started from local main; at the supervisor's direction it now sits directly
on approved `codex/gag-art` (`36a8ba3`), ahead of that branch's merge. No game
or simulation code changed.

**Changed:** `public/share-1.png` combines the rainy Rooftops frame with the
game's own whole-pixel title glyphs: blue OH NO!, pale MORE AGENTS, the page's
hard shadow and "NO SUPERVISOR. NO PLAN. ONE UMBRELLA EACH." Seventeen actual
agent sprites walk supported roofs or descend beneath three open umbrellas.
A dreamer walks toward the approved mirage's readable false EXIT. This is a
static promotional composition over the real level-17/seed-3 terrain, not a
new game state or a new client-side render pass.

`favicon-1-16.png`, `favicon-1-32.png` and `apple-touch-icon-1.png` use an
optical 16-pixel silhouette: blue canopy, stem, dark hat, pale face/eye, white
collar and suit. Integer scaling preserves crisp edges at 32 and 180; the
large icon has a solid background and ten-pixel inset. Explicit PNG size
links replace the old data-URL staircase icon; no manifest. Social tags carry
the title, "No supervisor. No plan. One umbrella each. They'll work it out.
Or they won't.", absolute HTTPS image/canonical URLs, dimensions, MIME type
and matching accessible image descriptions. Normal page loading does not
fetch the social image.

**Cache promise:** all four PNGs have new numbered filenames. `_headers`
gives these numbered image families the same one-year immutable treatment as
other versioned assets. A future revision needs new filenames and links.
The reproduction test will require a new share-art version if later renderer
changes alter this frame; published images stay frozen.
`tools/share-art.js --out DIR --number N` reproduces the artwork and refuses
to overwrite any existing numbered output before writing anything. The
pre-rebase, unpublished draft was archived under `/tmp/codex-share-art/`;
no previously committed or published image was replaced.

**Weight and pipeline:** share PNG **28,332 bytes**; the three icons together
**1,177 bytes** (243 / 273 / 661). The new tags add only **165 bytes** to
the page at Brotli quality 5. `tools/render.js` has an opt-in lossless
Sub/Up row predictor and maximum zlib compression. It saves **13.1%** against
the ordinary 32,610-byte PNG, with **zero changed RGB pixels**, independently
checked with ImageMagick. Default screenshot writing retains its existing
fast path and PNG output. All four assets render in about **0.14 s** under a
256 MB Node heap, with no external image/font assets or package additions.
The decoder regression independently reconstructs PNG rows and hashes their
RGB bytes, including integer scaling; assertions never diff raw frame buffers.

**Looked:** full-size PNG, 600×315 social thumbnail, native icons and nearest-
neighbour enlarged icon sheet. Preview artifacts and the local-page DOM/
resource report live in `/tmp/codex-share-art/`. The isolated browser sees
the correct tags and all PNGs return 200/image/png; no page exceptions and
no automatic share-image request. It uses the approved gag branch's bounded
browser helper, with a 512 MB resident limit and temporary profile.

**Validation:** focused share/PNG tests pass **6/6** in **0.34 s**.
`npm run stamp` and capped `npm run check` pass **1,142 tests**, zero failures
or skips, **210.88 s** including shared-host pauses. Threshold-30 coverage
passes **1,142 tests**, zero failures/skips, **178.99 s**.
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-share-art/coverage-safe.sh` passes: highest score **30.0**; new
PNG filter **10.0** (93.3% branch coverage), share-art helpers at most **4.0**.
Default PNG bytes also match the approved parent writer exactly. Start/end
source and image hashes match; all `public/agents/` files are byte-identical
to the approved gag base. Browser services are closed.
Factory art remains excluded; Node heap 2048 MB, `ulimit -v 6000000`, one
worker for check and two for coverage. The host-aware launcher serializes
full runs and pauses only our own Node/browser tree when another starts.

**Next:** ready for shared-link art review. Commit on `codex/share-art` only;
no push, deployment or sibling sync.

Reviewed and merged by the loop. A 1200×630 share card, og and twitter tags, umbrella favicons (16, 32 and a 180 px apple-touch icon) and `_headers` for them. `index.html` conflicted on the build stamp and the old SVG favicon; the merge keeps the build line and the branch's icon links.

## 253 — 2026-10-15 · Level 2: through the floor, not back round

**Asked:** level 2's dead time from the first-impressions list. Pacing matters
most in the first levels: at normal speed a new visitor should see something
happen within ~5 s and an agent home within ~30 s on levels 1–3, without
making them trivial.

**Measured first** (48 colonies each, normal speed, 33 ms a tick):

| | Agents out | First home: median | First home: worst | Level length: median |
|---|---|---|---|---|
| Level 1 | 1.0 s | 12.9 s | 13.7 s | 23 s |
| Level 2 | 1.1 s | 22.4 s | 58.5 s (7/48 over 30 s) | 61 s |
| Level 3 | 1.0 s | 15.4 s | 18.2 s | 33 s |

On level 2 several colonies also had a 35–50 s gap between homecomings.

**Found:** level 2's middle floor ends at the board's edge (a skin of dirt in
front of steel), four rows straight above the exit. Colonies that walked
west along it reached the dead end and turned round. "Steel is the one honest
no", or the dirt in front of it went to the last-resort rules. So they walked
the whole level back the long way: over to the far right, down, then west
along the bottom floor. Two walls stand there, one floor-to-ceiling and one
with no room on top, and the bashers had all been spent upstairs.

**Changed:** `wallBypassed` asks, at a dead end (`deadEndAt`: steel at the
wall or one cell behind it) with the exit below and within a short walk (10
cells) and a corridor underneath (`deadEndOverHome`), for the ordinary
`startDescent`: a mine or a dig, paid through `spend` so a hoarder keeps its
thrift. If that can't happen it turns as before.

**What it cost to get right:**
- `startDescent` pays as `pay(w, skill)`. Handing it `spend(w, ag, skill)`
  directly refused silently every time (the skill landed in the agent slot),
  so the first version measured as "no effect". It now uses a wrapper.
- A reach of 16 cells cost level 120 (Ice Cave) 13 home: it dug at its right
  edge 11 cells from the exit. 10 keeps level 2 and leaves level 120 alone.
- I also tried treating walls nothing gets over (floor-to-ceiling, or no room
  on top) as reason enough for an immediate mine. It cost 39 home, mostly on
  level 63, and is not shipped.

**After (level 2, 48 colonies):**

| | Before | After |
|---|---|---|
| First home, median | 22.4 s | 20.6 s |
| First home, worst | 58.5 s | 24.1 s |
| Colonies over 30 s to the first home | 7 | 0 |
| Level length, median | 61 s | 43 s |

Levels 1 and 3 are unchanged.

Playtest 1-150 × 24 against 246: 51450 → 51446. Level 2 is 303 → 299 and
everything else is within ±3. The cost: 5 of 24 level-2 colonies now end on
the stall cutoff, a last agent who walked the other way along the middle
floor, climbed off to the right and was left behind (a 20 s tail).
`test/stragglers.test.js` covers digging through at the dead end and turning
when home is a long walk away; it fails without the fix.

**Next:** that level-2 straggler, then the rest of the first-impressions list.

## 254 — 2026-10-15 · Snow on the ledges (on a branch)

**Brief:** finish the developer's Christmas dressing (`adb2323`) at native 1×
and page res 2, keeping all nineteen biomes readable. `codex/christmas-art`
started from approved share-art and was rebased onto local main as requested.
The approved gag and share changes are retained above Christmas main, with
only their overlapping art/stamp/browser sections reconciled. The art baseline
is `31697e3`; no simulation or palette changes.

**Changed:** thin, broken snow caps sit on exposed surviving ledges, leaving
material texture and hazard/fixture reservations intact. They are drawn by
`drawTerrain`, so they cost nothing between terrain repaints; underwater caps
are dimmer and pass through the existing sea filter. A small, low-contrast fir
with a warm star and a few lights stands near the hatch where its fixed site
has clear air and support. Carving removes it rather than moving it somewhere
else. Live and replay worlds are dressed before their first terrain paint so
cached seasonal art appears immediately.

Santa hats now attach to the actual head, not to a point above the sprite:
trait tilts, walking/idle bob, mirrored/rotated poses and the diving helmet's
kick all carry them. Red folds, a shaded white brim and a pompom read at 1×;
half-pixel fur highlights appear at res 2. Existing faces, shades, collars,
ports and hand poses remain intact. Milestone hats retain their precedence.
Candy canopies have a proper dome, broad diagonal red/white bands, hanging
tips, a bright rim and a shaft to the grip at both resolutions. Stripe runs
are batched instead of painted one small square at a time.

The exit is wrapped around its jambs and lintel in green paper, small pale
marks, red ribbon, folded bow loops and a warm knot. The portal and threshold
stay open and visible; individual wrapping pieces sit out passing sprites.
Forty staggered flakes replace seventy noisy ones: triangle-wave drift avoids
per-flake trigonometry, full-footprint terrain tests stop flakes leaking into
rock, and expanded live sprite envelopes protect caps, faces and canopies.
Snow avoids the HUD and ticker; Christmas weather/wrapping sit out report
plates and blackout overlays. Reduced motion freezes the weather. HO HO HOME,
calendar selection, seasonal puns and all simulation rules are unchanged.

**Looked:** `/tmp/codex-christmas-art/final/` contains before/after sheets for
all nineteen biomes: `contact-sheet.png`, `exits-sheet.png`, `hatches-sheet.png`
and `umbrellas-sheet.png`, plus 76 native full frames and native exit/canopy
crops. The canopy sheet forces a real floater into clear air in each biome so
both resolutions can be judged even when the natural tick-400 colony has
already landed. Reviewed native 400×248 frames together and all biome crops;
the Trench's copper helmets, Library floors, original hazards and exit openings
stay legible. Local `?season=christmas&level=1&seed=3` and level 10 previews
show seasonal data from **tick 0**, correctly cached snow, caps and wrapping;
no page exceptions. Browser images/JSON are in the same task directory.

**Isolation:** **570** ordinary/Halloween frames (19 biomes × five palettes ×
unspecified/res-1/res-2 × two modes) are byte-identical to the rebased baseline;
**6.52 s**, peak RSS **212 MB** under the 256 MB renderer heap. Complete
simulation digests also match across 600 ticks in all nineteen biomes, with
matched random draws and only existing `season*` display fields omitted.
Protected-pixel checks cover every trait, both facings, five poses and diving
helmets, plus complete living sprite envelopes after seasonal painting.

**Pipeline:** cached unchanged worlds and terrain reduced the all-biome,
five-palette repeatability test from **4.40 s to 2.31 s**. The contact tool
simulates each biome once rather than once per before/after/resolution,
reuses comparison helpers and reports bounded Git errors. Four complete sheets
and all native images take about three seconds, peak RSS **346 MB**, under a
256 MB heap. Recordings and comparisons are bounded; frame assertions use
hashes/zero-copy equality rather than raw-buffer diffs. Node test heaps remain
2048 MB under `ulimit -v 6000000`, with Factory art excluded, one worker for
check and two for coverage, and host-aware serialization of full runs.

**Measured:** five interleaved warmed batches of twenty res-2 actor frames,
including seasonal paint, rebased first Christmas pass → revision. Cavern
**0.607 → 0.632 ms**, Factory **2.061 → 2.126**, Skyscraper **0.953 → 1.028**,
Trench **0.888 → 0.925**, Library **1.438 → 1.478**, Rooftops **0.938 → 0.970**,
Harbour **1.217 → 1.273**. Mean increase across all nineteen biomes is
**0.044 ms**; maximum **0.075 ms**. Cached snow/tree add no per-tick terrain
work. These are Node software-raster timings, not browser FPS.

**Validation:** final focused checks pass **20/20** in **9.05 s**. `npm run
stamp` is current. The final capped `npm run check` passes **1,178 tests**,
zero failures/skips, in **156.63 s**. Capped coverage also passes **1,178 tests**, zero failures/skips, in
**194.45 s**. `npm run crap -- --threshold 30 --coverage-command
/tmp/codex-christmas-art/coverage-safe.sh` passes: highest score **30.0**,
new Christmas drawing helpers at most **13.0**, actual-head wrapper **18.0**,
comparison command **15.0**. Start/end source hashes match; Sim, Palette,
Outcome and share assets remain unchanged. No temporary browsers remain.

**Next:** ready for Christmas art review. Commit on `codex/christmas-art` only;
no push, deployment or sibling sync.

Reviewed and merged by the loop. Crisp Santa hats, ribbon-wrapped exits, snow settling on ledges, and candy canopies in all 19 biomes. The branch had rebased the gag and share art onto 250; `main` already had both (with the loop's own conflict resolutions), so the merge takes the branch's `Draw.js` and `season.js`, re-applies `STANDUP_EDGE` from the gag-art merge, and keeps `main`'s `tools/phone.js` (`CMD_TIMEOUT`).

## 255 — 2026-10-15 · The last ones out don't climb away

**Asked:** (from 253) level 2's leftover dead time. In 5 of 24 colonies the
last agent was left on the stall cutoff with a 20 s tail.

**Found:** that agent had landed on the middle floor facing away from the
dug-through hole by the exit. It walked east, climbed the wall at the end of
the floor, then the next one, and ended on the top floor until the cutoff.
Every tool it spent took it further from a home below and behind it.

**Changed:** `wallTools` spends nothing for the last ones out (`lastOut`)
when home is below and they aren't facing it (`walkingOffHome`). The wall
turns them the ordinary way. Facing home, or with the colony still coming,
the old rules stand.

**Measured:**
- **Level 2** (48 colonies): median length 42.6 → 37.6 s; colonies ending on
  a straggler's 20 s tail 5 → 1. First home unchanged (median 20.6 s, worst
  24.1 s).
- **Playtest 1-150 × 24** against 253: 51446 → 51450, bad endings 33 → 31,
  no level moved by 3 or more.

`test/stragglers.test.js` covers it.

## 256 — 2026-10-15 · No empty sightings strip

**Asked:** next from the first-impressions list (249).

**Changed:** the report card shows the sightings strip only once this browser
has seen at least one. On a first visit's first card, "0/7 SIGHTINGS" and
seven grey icons said nothing; the strip appears with the first sighting,
which is gold and named. `test/sightings.test.js` covers it.

## 257 — 2026-10-15 · The ticker clear of a phone's edge

**Asked:** next from the first-impressions list (249).

**Changed:** the ticker's plate starts `STANDUP_EDGE` (8 px) in from the
board's left, instead of 4. On a 390 px phone the board overhangs the screen
by 5 px a side, so the ticker sat flush against the glass. Now it has the same
margin as the standup bubbles (251). The longest ticker lines (about 60
characters, 250 px with the plate) still fit the 400 px board.

## 258 — 2026-10-15 · A tighter blurb on phones

**Asked:** the last item on the first-impressions list (249).

**Changed:** at 599 px wide and below, the intro blurb is 10 px with 1.55
line height (was 11 px and 1.8). On a 390×844 phone (`npm run phone`) the
board's top moves from 244 to 223 px and its bottom from 492 to 471. It stays
five lines and readable. A correction to 249: the board was always entirely on
the first screen. "Halfway down" was my reading of a 2× screenshot; the board
starts about a quarter of the way down.

**The first-impressions list is done:**
- 249: the tip leaves after its first level; no duplicate hint; "1 level".
- 253 and 255: level 2's dead time.
- 256: no empty sightings strip.
- 257: the ticker clears a phone's edge.
- 258: this.

## 259 — 2026-10-15 · Two page tests that only failed under load

**Asked:** standing order: when dev tooling is slow or flaky, fix it.

**Found:** the gate for 258 went red once. The standup and sweepstake page
tests failed in the full parallel run and passed alone. Both slept a fixed
200–400 ms for the page to move on (a level advancing, a tally written) and
then asserted; under the full run's load the page sometimes hadn't got there.

**Changed:** those waits now poll, up to 4–5 s, for the thing they assert. The
sweepstake test also retries its click on a moving agent up to 12 times (was
6). No assertion changed. Two consecutive full checks after the change are
green.

## 260 — 2026-10-15 · Back to the gap

**Asked:** (from 253) level 2's dead time, rechecked. The first look was run
again at both sizes, recording the colony seed this time.

**Found:** the phone's level 2 (seed 1189176747) sat at 12/13 for 25 s. The
last agent laid a mine at the bottom floor's wall (the one with no room on
top) as the last-out rule says. Planting turns an agent away from its charge,
but nothing turned it back, so it walked 75 cells to the far end of the floor
and 75 back.

**Changed:** `plantMine` notes when and which way to come back. Walking,
`MINE_COMEBACK` (60) ticks after planting, the agent turns back towards the
gap (`comeBackToMine`). By then it is well outside the blast radius, and its
walk back lands after the 90-tick fuse.

**Measured:**
- That phone colony's level 2: 1751 → 913 ticks, all 13 home.
- Level 2 (48 colonies): median length 37.6 → 30.0 s, first home unchanged.
- Playtest 1-150 × 24 against 255: 51450 → 51468 home, bad endings 31 → 20,
  mean level length 1164 → 1155 ticks. Level 136 228 → 240; level 115
  397 → 389.

`test/stragglers.test.js` checks it steps away, comes back from outside the
blast, and arrives after the bang.

**Level 2 overall today:**

| | Before 253 | After 260 |
|---|---|---|
| Worst first home | 58.5 s | 24 s |
| Median level length | 61 s | 30 s |

## 261 — 2026-10-15 · Accessibility pass

**Asked:**
- **(a) Keyboard:** every control reachable by Tab in a sensible order, a
  visible focus ring in the page's style, Esc closes panels, no traps.
- **(b) Screen readers:** a polite live region announcing level starts and the
  report summary, buttons with proper names and pressed states, a short label
  on the canvas, nothing chatty per frame.
- **(c) Reduced motion:** confirm the outage, confetti, replay, standup, any
  screen shake and snow have gentle variants.
- **(d) Contrast:** page UI text at least 4.5:1 against its background in
  every theme.

Add tests where practical.

**(a) Keyboard.** Audited headless by pressing Tab 45 times. The order follows
the page: pause, prev, next, restart, speed, who, fullscreen, sfx, copy link,
what's new, the nine themes, the soundtrack and its seven tracks, the source
link, then back round with no trap. Every stop shows the page's 2 px solid
focus ring. Esc already closed the patch notes and faux fullscreen. **Fixed:**
Space on a focused button paused the game instead of pressing the button, so
"next level" by keyboard paused. Space and Enter on a focused control now
belong to the control; elsewhere Space still pauses.

**(b) Screen readers.**
- **Announcements.** A visually hidden `#announce` (`aria-live="polite"`,
  atomic) says "Level 3, Frost. 16 agents." when a level starts and "Level 4
  report: 18 of 18 home." (plus ", N lost.") when it ends. That's twice a
  level and never per frame.
- **The board.** The terrain canvas is `role="img"` with a short name that
  says levels and results are announced; the actors canvas is `aria-hidden`.
  The board's container stays an ordinary element, so the toast and tip
  inside it are still read.
- **Toggles.** Agent names, fullscreen, sound effects, the soundtrack
  play/pause, the themes and the tracks carry `aria-pressed`, kept in step
  wherever their state changes. The toggles have stable names ("Agent names",
  "Fullscreen", "Sound effects"); the track buttons are named "Soundtrack N".

**(c) Reduced motion,** checked in the code. `w.reducedMotion` comes from the
media query and reaches the replay's re-simulation as well.
- **Gentle versions already exist:** the outage (no flicker, lower dim, no
  wave), the confetti (static positions, no sparkle), the replay tag's blink,
  the 429 sign, the rubber duck's bob, ghosts (no rise), snow (still), and
  lanterns and umbrellas (no flicker or sway).
- **Standup:** speakers only idle in place, with no camera move.
- **No screen shake:** the only "shake" is a 1 px umbrella twitch when it
  parries.
- **CSS:** all animations and transitions are off under the media query.

**(d) Contrast.** New `tools/contrast.js` runs in the page and measures each
visible element with its own text against its effective background (layered
backgrounds, colour-mix values, own opacity). Every one of the nine themes
passes. The lowest are nord at 4.64:1 and everforest at 4.84:1; hackerman is
10.47:1.

**Tests:** `test/a11y.test.js`, in Chromium with prefers-reduced-motion
emulated:
- the level and report announcements;
- the canvas name and the hidden actors layer;
- reduced motion reaching the world;
- `aria-pressed` on a toggle and on exactly one theme;
- Space on a focused "next level" moving on without pausing;
- every theme at least 4.5:1.

**Deployed** at 04:46 after 261 (name="build" content="ba69eb43"), gated on a
green full check (1196 tests). It covers 251–261: the gag art, the share card
and favicons, level 2's pacing (253, 255, 260), the Christmas art, the
first-impressions fixes (256–258), the page-test polling fix and the
accessibility pass.

Verified on production:
- **`dist/`:** all scripts are brotli, byte-identical to `dist/`, with no
  comment lines. The build agrees on page, repo and API (ba69eb43), and the
  stamps match the source.
- **Open tab:** a tab served as the previous build (5721422d) reloaded itself
  into ba69eb43. No console or page errors.
- **Share card and icons:** `/share-1.png`, `/favicon-1-16.png`,
  `/favicon-1-32.png` and `/apple-touch-icon-1.png` are 200, `image/png`,
  `public, max-age=31536000, immutable`, and byte-identical to `dist/`.
  `og:image` points at `https://oh-no-more-agents.com/share-1.png`.
- **Accessibility:** "Level 3, Frost. 16 agents." announced; Space on a
  focused "next level" moves on without pausing; Enter on "who" sets
  `aria-pressed`; one theme pressed; "Level 4 report: 18 of 18 home."
  announced.

**Not read-only, and it should have been:** the accessibility check ran a
scratch script that finished a level on production (level 4, 18 home) without
blocking the counter's POSTs. That probably added 18 rescues to the worldwide
counter that nobody watched. It's the same mistake as the early production
check that finished levels by hand. The scratch scripts that lacked the block
now have it (a11y, a11y-prod, first look, news), and a standing note says any
production script must fail every non-GET `/api/*` request before it leaves.
The counter is not corrected: there's no endpoint for that, and the API rules
say nothing may change its bounds.

## 262 — 2026-10-15 · The cast gets its kit (on a branch)

Page-resolution art on `codex/cast-art`, from approved `codex/christmas-art`
(`4d9f727`). The red team gets squared oxblood service jackets, pale chevrons,
headsets and a readable pistol slide/front sight. Scope Creep has a folded
violet cloak, planted bipod and a larger blue scope lens; its glint brightens
through the actual aim. The Moderator's steel pauldrons have gold edging,
the visor powers up with the pistol, and the slung ban-hammer carries an
engraved red minus. Its hammer stays slung: there is no invented hammer attack.
Bouncers get stronger lapels, cuffs and signet rings, a glint on the stop palm
and shades, and a brief follow-through from `threwAt`. The Head Bouncer's
crown and chain are separate from its five HP pips; the crown now follows the
actual heavy stride and stagger instead of floating at the original head.
Drone, operator, xeno and hostile diver kit receive matching page detail.

The eight-tick gun discharge now has a short travelling round and local impact
spark at res 2. A return streak requires both a dated `ricochet` defeat and a
facing, held umbrella; ordinary parries get none. Backup's booth has a caged
red beacon, aerial and stepped signal rings while the existing reserve is
pending; reduced motion holds its warning steady. Cloud Provider remains
friendly blue/white: tailored coat with a cloud badge, a rolled canopy ready
only when its existing cooldown is near a hand-out and a recipient is nearby,
a paper-tied spinning delivery, and a ribbed blue/white cloud umbrella on its
actual `height` descent. All tells read existing states, timers or stamps.
No simulation clocks, fields, random draws or rules were added.

**Looked:** `/tmp/codex-cast-art/final/contact-sheet.png` covers 25 action
fixtures on real seeded terrain, with before/after at res 1 and res 2, 100
native full frames, native crops and a separate comparison row per scene.
The fixtures stage existing action poses and are labelled in the
manifest. `actual-play.png` adds nine unmodified-play comparisons: ordinary
aim (16/583), sniper aim (9/931), Moderator aim (7/571), Head Bouncer stop
(28/552), Backup call/arrival (30/368 and 125/510), Provider hand-out/descent
(61/193 and 61/511), and a real ricochet (129/663), all seed 3. Ordinary
Bouncer stop/throw are on the fixture sheet. `live-biomes.png` and 76 native
live frames cover every biome at tick 400. Reviewed native 400×248 and
800×496 images and pixel crops; floors, original hazards, colony faces,
umbrellas, exits and HP strips remain legible.

**Isolation:** 345 panel frames are byte-identical to approved Christmas art
(25 fixtures × five palettes × unspecified/res 1, plus nineteen live biomes
× five palettes). The detail-dispatch refactor is also byte-identical in 250
fixture frames across both resolutions and five palettes. All 190 terrain
comparisons also match (nineteen biomes, five palettes, both resolutions). The final probe took 4.15 s, peak RSS
285 MB under the 256 MB renderer heap. Complete gameplay digests match
rendered/unrendered play through 600 ticks in all nineteen biomes. Tests also
cover finite/grid-aligned poses, both facings, actual aim phases, the crown's
pose attachment, reserve expiry, recipient eligibility and dated ricochets.
Sim, Palette, seasonal code and numbered share/icon assets are unchanged.

**Pipeline and cost:** the comparison command simulates no repeated timelines
and caches one unchanged terrain image for each fixture/resolution, shared
by before and after; all sheets/images take 1.56 s, peak RSS 191 MB. Recordings
are bounded and frame assertions use SHA hashes rather than raw-buffer diffs.
A measured slow corner in the tied-umbrella effect was replaced with exact
quarter-turn coordinate swaps: 0.00419 → 0.00350 ms per effect (about 16%).
Five interleaved warmed batches of one hundred res-2 actor frames give mean
before/after increase **0.018 ms**, maximum **0.173 ms** across the 25 scenes.
Examples: ordinary aim 0.798 → 0.818 ms; sniper aim 1.875 → 1.812 ms;
Moderator aim 1.113 → 1.141 ms; Bouncer throw 1.796 → 1.850 ms; Provider
hand-out 0.541 → 0.556 ms. These are Node software-raster measurements,
not browser FPS. Longer warmed batches replace the noisy
twenty-frame spot probe; raw measurements remain in the task directory.

**Validation:** `npm run stamp` is current. Final capped `npm run check`
passes **1,188 tests**, zero failures/skips, in **170.82 s**; final capped
coverage passes **1,188 tests**, zero failures/skips, in **247.98 s**.
`npm run crap -- --threshold 30 --coverage-command
/tmp/codex-cast-art/coverage-safe.sh` passes: highest score **30.0**, new
drawing helpers at most **15.0**, comparison command **5.0** (fixture helper
**10.0**). Provider paint belongs in the existing res-2 detail pass: this
keeps `drawAgent` at complexity **27**, CRAP **27.06**, with identical pixels.
Full runs use 2048 MB Node heaps under `ulimit -v 6000000`, Factory art excluded,
one worker for check/two for coverage, 120-second test timeouts, and host-aware
serialization. The guard pauses only this branch's run when a foreign suite
starts. Final source hashes match those validated; no simulation or asset
changes slipped in.

**Next:** ready for cast art review. Commit on `codex/cast-art` only; no push,
deployment or sibling sync.

Reviewed and merged by the loop. The red team, Moderator, Bouncer, Backup and Cloud Provider have clearer silhouettes and tells at page resolution; resolution 1 is unchanged.

## 263 — 2026-10-15 · The Cloud

**Asked:** a twentieth biome, The Cloud, "the one place where umbrellas are the
point":
- platforms that are drifting cloud banks;
- constant rain;
- telegraphed lightning (flash and rumble, scorches a cell; umbrellas don't
  protect);
- updrafts that lift floaters;
- an ON-PREM exit door;
- agent puns on the ticker.

Appended to the end of `BIOMES`, as AGENTS.md requires. Sim, plain art,
palette, tests and a play-test across its levels, never a soft-lock. Page-res
art is left to Codex.

**Re-skin (read this first):** biomes are picked by level number, so with 20
of them every level from 20 up is now a different biome than before. Level 20
is The Cloud, level 21 a Cavern again, and so on, and every old share link to
a level above 19 opens a different-looking level with a different colony
outcome. Levels 1–19 are unchanged. `Palette.js`'s `poolTint`/`biomeTint` rule
moves from `% 19` to `% 20` in the same commit, and AGENTS.md's note says
`% 20` now.

**Changed (Sim):**
- **The biome.** `BIOMES` gains "The Cloud" at the end. Its mission is "BRING
  THE SYSADMINS ON-PREM" (2 civilians), and it has three events: Region Outage
  (blackout), Eventual Consistency (growth), Scale to Zero (floor collapse).
- **`skinCloud`.** Banks are DIRT with a ROCK core where thick. Shape is left
  exactly as generated (rounder banks are drawing's business), so every route
  stays proven.
- **`cloudLining`.** The Cloud's mechanism lays ORE on every exposed top once
  the level is final (the silver lining). Material only.
- **Updrafts.** Columns at a fixed pitch (17, offset by level) with
  `w.updraftLift`. In them a floater falls at half umbrella speed
  (`CLOUD_LIFT`); anyone without one gets nothing. The Data Center's updraft,
  which carries everyone, is unchanged.
- **Lightning.** "Flash Storage", a ceiling cycle hazard: a 46-tick visible
  wind-up, a 6-tick strike, a 170-tick rest. It's marked `weather`, so it
  comes on top of the level's ordinary hazard, as the Trench current does, on
  85% of Cloud levels. Nothing in the hazard rules lets an umbrella parry a
  cycle: umbrellas are not lightning rods.
- **Ticker** (`stepCloud`, once a level each): "YOUR FILES ARE IN THE CLOUD. SO
  IS AGENT 012." for the first one lost, and "AGENT 003 HAS GONE SERVERLESS"
  for the first floater an updraft holds up.
- **The hole** at the bottom is dry: just more sky.

**Changed (plain art, Draw and Palette):**
- `backCloud`: rows of distant rounded banks.
- Rain: the Rooftops' rain motes, denser.
- `drawExitCloud`: a grey door with rack lights and an "ON-PREM" sign.
- `drawHzLightning`: the thundercloud darkens and crackles faster through the
  wind-up; the strike is a white flash and a zigzag bolt; a scorch mark fades
  after.
- The updraft columns use the existing `drawUpdrafts`.
- Palette: a cloud tint (case 19), pale and blue.

Page-resolution art falls back to the plain art for Codex to replace.

**Measured:**
- **The Cloud** (7 levels × 48 colonies, levels 20–140): 95% home, no hangs,
  no stall endings or clock-outs. Level 20 is the hardest at 83%, level 100
  at 88%.
- **All 150 levels × 24:** 95.75% → 94.33% home and bad endings 20 → 45,
  because of the re-skin, not the Cloud: the Cloud's own levels are at 94.2%,
  mid-pack. The new trouble spots are re-skinned levels:
  - 109, now a Skyscraper: its hero is left last at a sealed wall with no
    tools; heroes are barred from the toolbar (15/24 stall endings, 6
    clock-outs);
  - 101, now a Cavern mission level: nobody home in 3/24, fixed in 264;
  - 45: 2 clock-outs.

`test/cloud.test.js` covers:
- the biome's place and that levels 1–19 keep theirs;
- the lining and updraft columns;
- an updraft holding up a floater and nobody else;
- lightning winding up, striking and killing a floater under it;
- both ticker lines;
- drawing at both resolutions;
- the tint (level 21 a Cavern again).

**What re-skinning cost the tests.** About 80 failures across 29 files, all
from level numbers that meant a biome under `% 19`:
- **Pinned levels.** Levels pinned in `generate(N)`, `level: N`, `sample(N)`
  and per-biome level arrays were mapped to the same biome's same occurrence
  under `% 20`.
- **Stored digests.** 38 stored render digests of those levels were
  re-baselined from the new output. No existing biome's drawing code changed;
  only The Cloud's paths and the rain branch were added.
- **Tests that needed a particular layout** got a new level by search: a
  Jungle level with a red-team hatch (5), a Library level where Deprecation
  Notice and Reindexing still cut terrain (33), a Foundry level with a guard
  on screen at page resolution (84), and a Cavern sniper that reaches its post
  (by predicate).
- **The rate-limit page test** plays levels 1–50 (was 1–30) to meet a queue.
- **Fixed rather than re-baselined:** the ship test now expects
  `BIOMES.length` biomes.
- **Lightning's drawing** follows the rules every fixture keeps: still a
  little alive at idle (the thundercloud drifts a cell), and its scorch fits
  the shared recovery window.
- **The Cloud's exit** got a minimal page-resolution pass so every biome has
  one; the real one is Codex's.
- **The event-duration mirror** knows Region Outage (300 ticks).

## 264 — 2026-10-15 · Descoping a mission nobody can reach

**Asked:** (from 263) level 101, re-skinned to a Cavern mission level, had
nobody home in 3 of 24 colonies.

**Found:** the mission's miners sit beyond two walls that hang to within two
rows of the floor, and the colony had spent its bashers upstairs. Nobody
could reach the miners, so the door stayed shut. The colony arrived at it and
paced between the door and a wall. The loop rule took that for a loop and
blew them up one at a time, all fifteen, by about tick 1470.

**Changed:**
- **Descope.** Once anybody has reached the shut door, the mission gets
  `MISSION_PATIENCE` (450 ticks). If nobody has made any progress on it by
  then, it's descoped (`descopeMission`): the door opens, the cages stay
  shut, and the ticker says "MISSION DESCOPED: FREE THE MINERS MOVED TO NEXT
  SPRINT".
- **No condemning.** An agent that has found the door shut is not condemned
  as a looper while the mission is untouched. The descope guarantees the door
  opens, so waiting can't hang the level.

**Measured:**
- **Level 101:** colonies that lost all 15 now get 12–14 home.
- **Playtest 1-150 × 24 with The Cloud:** home 94.33% → 94.50%, nobody-home
  runs 3 → 0. Level 101 239 → 307, level 51 360 → 382, no level worse by 5 or
  more.

The rule applies to every mission level, not just re-skinned ones.
`test/stragglers.test.js` covers it: a colony meets the unreachable mission,
it gets descoped, agents still get home, the cages stay shut, and a waiting
agent isn't condemned. The test fails without the change.

## 265 — 2026-10-15 · Banks that read as cloud

**Asked (supervisor, from level 20, seed 3, res 2, tick 500):** the ON-PREM
door and the rain read, but the walkable terrain looks like ordinary grey
stone slabs. At resolution 1 the platforms should read as cloud banks:
- a puffy, scalloped top edge;
- a lighter sunlit top and a darker damp underside;
- slightly soft, dithered edges.

Terrain drawing only, no sim change. And give the biome a palette with some
sky colour in it (dusky blue/lilac) so it doesn't look unfinished.

**Changed:**
- **`drawCloudBanks`** paints over the ordinary materials on Cloud levels,
  shading each solid cell by depth: sunlit (`dirtEdge`) where air is just
  above, lit (`decorLit`) one row down, then the pale body (`dirt`) with soft
  horizontal wisps, and damp (`dirtShade`) where air is just below.
- **Crowns** (`drawCloudCrown`): every 4 cells a round crown three pixels
  high, spanning two cells and easing in at the shoulders, rises into the air
  above the walking line.
- **Undersides** (`drawCloudUnderside`) hang in shallow darker scallops, with
  the bottom row dithered. The sides are dithered too, so no edge is a slab.
- **Palette:** the Cloud tint moves from near-white to dusk, a pale lilac
  (`CLOUD` 0.78/0.74/0.96) pulled from the theme's accent. Sky, back wall and
  banks now share an evening colour instead of one flat grey.

Draw and Palette only; the cells are the same cells. Page resolution draws the
same pass until Codex's art replaces it.

## 266 — 2026-10-15 · Levels 1–200 after the re-skin; level 109's hero

**Asked:** since levels from 20 up re-skinned, play-test levels 1–200 and fix
the new regressions. The Cloud especially: lightning near the door, updrafts
carrying non-floaters, banks that thin under a blocker.

**Measured** (1–200 × 24, 4800 runs): 94.35% home, no hangs, no nobody-home
runs, 56 bad endings.
- **The Cloud's levels:** 92.6% home, 2 bad endings.
- **Lightning:** never near the door. Over the ten Cloud levels up to 200 its
  nearest is 10 cells from the exit on another floor.
- **Updrafts:** carry only floaters, covered by `test/cloud.test.js`.
- **Banks:** don't thin; that part of the brief wasn't built, so it can't
  strand anyone.
- **Worst by far:** level 109 (a Skyscraper since the Cloud), with 21 bad
  endings out of 24.

**Found:** level 109 gives no miners or diggers, and its bashers are spent
before the hero reaches the exit floor. That floor has a six-thick wall
between the left-hand lift and the door. The colony gets round by the
right-hand lift; the hero takes the left one, gets to the wall last out and
can't pass. Heroes are barred from the toolbar except through
`borrowWallTools`, and nothing borrowable was left.

**Changed:** `borrowWallTools` (a last-out hero facing home) now falls back to
`bomberAsMine`. The colony's bombers are no use to anyone by then, so one is
laid as a mine, not worn. A tower's floor is steel, so the charge goes into
the foot of the wall when it can't go into the floor. The usual rules still
apply: within mine reach, no other charge nearby, the mine cooldown.

**Measured:** level 109 251 → 274 home of 288. 1–200 × 24: 68109 → 68131 home
and bad endings 56 → 41; no other level moved by 3 or more.
`test/stragglers.test.js` covers it; the test fails without the change.

## 267 — 2026-10-15 · Lightning you can see coming, and name

**Asked:** check that a lightning strike is readable: a visible wind-up about
a second before (flicker or glow at the strike column), and a death cause or
ticker line that names it.

**Found:** the wind-up already darkened the thundercloud and crackled faster,
over 46 ticks (1.5 s at normal speed), but nothing marked the column the bolt
would come down. A lightning death had no line of its own: the Cloud's first
loss read "YOUR FILES ARE IN THE CLOUD. SO IS AGENT 012." whatever the cause.

**Changed:**
- **Glow.** In the last second of the wind-up (progress over 0.35, about 30
  ticks), the strike column itself glows, faint and brightening, in the
  bolt's colour. It's the same at both resolutions, and steady, so reduced
  motion keeps it.
- **Cause.** A lightning kill records `ag.killedBy = "lightning"`.
- **Ticker.** The first strike each level says "STRUCK BY LIGHTNING: AGENT
  012. UMBRELLAS ARE NOT LIGHTNING RODS."; later ones say "AGENT 012 · STRUCK
  BY LIGHTNING". The files-in-the-cloud line is kept for losses of any other
  kind.

**Tests:** in `test/cloud.test.js`, a strike on a floater gives the named
first line and the cause, and there's no glow early in the wind-up but there
is in its last second. The test fails without the change. The sim is
unchanged apart from the cause field and the ticker line.

## 268 — 2026-10-15 · A shared lock for heavy test runs

**Asked (supervisor):** my coverage runs kept interrupting Codex's final
checks. Build a shared test lock: a small `tools/testlock.js`, a lock file in
the repo's common git dir so both worktrees see it, recording owner, PID and
start time, with stale-PID cleanup and a FIFO queue, wrapped around
`npm run check`, coverage and crap so the two worktrees take turns.

**Changed:** `tools/testlock.js`.
- **Where.** `<git common dir>/testlock/`, which the main worktree and Codex's
  share.
- **The lock.** `lock` records owner (worktree), pid, host, command and start
  time. It is created with O_EXCL, so of everyone who sees it free, exactly one
  wins.
- **The queue.** `queue/` holds one ticket per waiter, named by arrival time;
  only the first ticket may take the lock.
- **Heartbeats.** Holder and waiters touch their file every 5 s. A file nobody
  has touched for 90 s, or whose pid is gone on this host, is a crashed run
  and is cleared.
- **Waiting.** A waiter says every 30 s whom it is waiting for.
- **Interrupts.** Ctrl-C or SIGTERM releases.
- **Nesting.** A run started inside a locked run (crap runs coverage, check
  runs `npm test`) passes straight through, because `TESTLOCK_HELD` is set
  for the child.
- **Status.** `node tools/testlock.js status` shows the holder and the queue.

**Wired in:** `npm run check`, `npm test`, `npm run coverage` and
`npm run crap` all go through the lock; the old commands are kept as
`check:raw`, `test:raw` and `coverage:raw`. AGENTS.md says how to wrap any
other heavy run.

**Tests:** `test/testlock.test.js` covers:
- the lock living in the git common dir;
- FIFO order;
- O_EXCL letting one taker win;
- only the holder releasing;
- dead or silent holders being cleared and live ones kept;
- two concurrent runs from separate processes executing strictly one after
  the other.

Run as a single file, because full runs were paused for Codex's check.
Committed on single-file tests with the supervisor's go-ahead; the full gate
runs when full runs are allowed again.

## 269 — 2026-10-15 · The colony finds its stride (on a branch)

Art pass on `codex/agent-art`, based on approved `codex/cast-art` (`5b4905a`).
Ordinary dry agents at exactly res 2 use eight gait poses, half-pixel travel
and hat/torso bob, lifted passing feet, moving cuffs and a half-pixel tie flap.
The face, white collar, dark suit, hat and planted boot line remain the same
cast. Fall arms and trailing feet alternate; floating agents hold the shaft
beside the face while the canopy flexes and unfolds in eighths. Closing takes
the canopy outside the face, narrows it, then lowers it into the carried cane;
the last closing frame is exactly the furled umbrella.

Climbing adds intermediate reaches and bent knees while the existing wall
contact stays fixed. Six pick poses, seven spade poses and six brick-laying
poses coordinate head/torso, sleeve, palm and tool. Mining has no mining state:
the actual rule plants a charge and turns the walker away. Its existing
150-tick cooldown supplies a six-tick crouch/recovery; the existing charge gets
only small rivets and a fuse LED. Blockers breathe through the outstretched
hands with feet planted; existing idle fidgets stay. Shot/splat deaths get
half-pixel recoil and settling within the original death window; other causes
retain their art. Saved agents take small steps toward the actual exit and
wave while fading, instead of rising away from its floor.

**Review:** `/tmp/codex-agent-art/final/index.html` is the animated before/after
viewer; `contact-sheet.png` and fourteen `<action>-comparison.png` sheets show
eight frames at res 1 and 2, with separate native strips/frames. Reproduce with
`node --max-old-space-size=256 tools/agent-art.js --base 5b4905a --out
/tmp/codex-agent-art/final`. Includes walk, fall, opening/floating/closing,
climb, dig, actual mine planting, bash, build, block, shot/splat deaths and exit.
The final bundle takes 1.22 s, peak RSS 159 MB. `traits.png` checks every trait
in both facings; `live-biomes.png` and native `live/` pairs show all nineteen
biomes at seed 3/tick 400. Reviewed sheets and live frames at page and native
scale: faces, umbrellas, tools, ground contacts, original hazards and exits
remain distinct against light and dark terrain.

**Isolation:** 8,736 action frames at unspecified/res 1/res 3 are byte-identical
to approved cast art (fourteen actions, eight phases, two facings, thirteen
trait looks). All 5,824 excluded hero/diver action frames also match. All 95
native live frames and 190 terrain frames match across nineteen biomes and
five palettes. The probe takes 8.65 s, peak RSS 308 MB under a 256 MB renderer
heap. Complete rendered/unrendered gameplay digests match through 600 ticks in
all nineteen biomes. Tests cover deterministic read-only drawing without RNG,
half-pixel local poses, actual mine timing, planted blocker feet, folding-to-cane
continuity, reduced secondary motion, real exit direction, unknown death keys,
comparison dimensions, cache pixel equivalence and the animated viewer. The
rest-schedule test now permits only the three bounded hand-breath poses and
checks fixed head/boots; the umbrella recorder uses a real one-pixel canvas
context and checks all eight closing ages and restored alpha. The
exact res-2 gate also preserves the immutable res-3 share card. No Sim,
Palette, season, numbered share or icon asset changes.

**Cost:** scan levels 1–400, seed 3, at thirty-tick intervals up to tick 1500:
the busiest sampled frame is Cavern level 324/tick 570, eighteen colleagues
and three enemies. This is a sampled stress case, not a claim about every
possible colony. `npm run fps -- 324 --seed 3 --from-tick 450 --seconds 10
--speed 2 --json` measures normal live play, with the baseline served using
`--root /tmp/codex-agent-art/before/public`. Both versions reach the 21-character
peak, stay on level 324 through roughly tick 907, and hold median/p5 **60/60 fps**
with **0% long tasks**. The clean reversed-order repeat gives before/after CPU
**24%/23%**, worst frame **17/17 ms**. The first pair was noisier (CPU 10%/24%,
worst 17/50 ms); retained with raw results rather than treated as a precise
speedup. Five warmed interleaved batches of 500 actor frames at the peak give
**1.187 → 1.255 ms**, **+0.068 ms** per frame in the Node software renderer.

**Pipeline:** the default ten-second FPS probe used to hit the CDP command's
ten-second timeout. It now collects bounded four-second windows on the same
live run, disconnects observers, rejects bad samples and reports seed, start/end
level/tick and maximum cast. New seed/from-tick/root flags make before/after
repeatable; warm-up observes the page clock without mutating its world. Unit
checks cover chunk aggregation/error paths and an actual seeded browser sample.
Action comparisons cache static terrain and reuse canvases, cutting the initial
5.23-second render to 1.22 seconds. Animation pose tables are shared rather than
allocated per agent. Death-frame assertions use zero-copy buffer equality with
short failure messages, including below-boot, expired and whole-world checks;
no multi-megabyte assertion diffs. Early shared-machine attempts exposed stale wall-clock deadlines after long
pauses and a queue guard that was too broad about brief child tests. The final
run uses the supervisor's shared FIFO lock (`afa5be9` on main), via
`node /home/jonh/jonh.no/oh-no-more-agents/tools/testlock.js run -- <command>`;
the temporary process-scanning guard is retired. The final full check collects
LCOV in the same run, and CRAP reads it with `--use-existing-coverage`. This
removes the duplicate full-suite run while retaining syntax, stamps, all
selected tests, coverage and the threshold check.

**Validation:** `npm run stamp` is current. The final shared-lock
`npm run check` with `--experimental-test-coverage` passes **1,198 tests**,
zero failures/skips, in **219.01 s**, and writes the final `coverage/lcov.info`.
It uses a 2048 MB Node heap under `ulimit -v 6000000`, the established two-worker
coverage cap, 120-second test timeouts and an explicit file list excluding
`test/factory-art.test.js`. Shared-lock `npm run crap -- --threshold 30
--use-existing-coverage` passes, highest score **30.0**. New motion helpers
score at most **10.0**, comparison command **7.0**, fixture helper **15.0**;
`drawAgent` remains below the threshold at **26.1**. Final source hashes match
those checked and covered. Full/coverage/CRAP work now takes the shared FIFO
lock; no other full suite overlaps the final run.

**Next:** ready for ordinary-agent animation review. Commit on
`codex/agent-art` only; no push, deployment or sibling sync.

Reviewed and merged by the loop. Smoother walk and fall cycles at page resolution, and the umbrella held in the hand with a little sway; resolution 1 is unchanged, and the busy level holds 60 fps.

## 270 — 2026-10-15 · The tour

**Asked:** a biome picker, because most visitors only see the first few
biomes. A compact strip near prev/next of 20 tiny pixel thumbnails, rendered
once at startup from each biome's palette, with the current one highlighted.
A click or tap jumps to that biome's next level, and jumping doesn't count as
clearing. Keyboard accessible; on phones it scrolls in its own row with no
page scroll. Add a patch-notes line.

**Changed:**
- **The strip.** `#tour` sits under the controls: one 24×16 thumbnail per
  biome.
- **The thumbnails.** Each is painted from that biome's own palette in the
  current theme: sky, back wall, a bank of ground, one of four top-edge
  shapes, a lit decor mark and the way home. They're repainted when the theme
  changes.
- **The jump.** A stop goes forward to that biome's next level after this one
  (`AgentTour.level`). It's a move like prev/next, through `newLevel`: nothing
  is cleared and nothing is counted.
- **Accessibility.** Every stop is a button named "Go to <biome>", with
  `aria-current` on the biome being played.
- **Phones.** On a coarse pointer the stops are 44 px tall, and the row
  scrolls sideways inside itself.
- **Patch notes:** "Added: The Cloud, a 20th biome, and a tour strip to visit
  all twenty. Bring an umbrella." The sightings line drops off to keep eight.

**Tests:** `test/tour.test.js`, on a 390×844 phone, checks:
- 20 stops, with the current one marked;
- jumps go forward (from level 3 to the next Cavern is 21);
- a tap on The Cloud plays level 20, and "0 home, 0 levels" stays;
- no page scroll while the row scrolls;
- every thumbnail painted;
- no page errors.

Local headless check at 1280×900 and 390×844: the strip fits the board's width
on the desktop and scrolls on the phone.

## 271 — 2026-10-15 · Shorter AGENTS.md and LOG.md

**Asked:** a context-cost task. AGENTS.md was 1047 lines and LOG.md 8880, and
both agents read them every session.
- **(a)** A lean AGENTS.md core (about 250 lines: project, files, conventions,
  how to check and deploy, the safety rules including testlock,
  node-test-guard and read-only production scripts), with the per-biome and
  per-mechanic notes moved into `docs/`, each linked with a line saying when to
  read it. Lose nothing; just move.
- **(b)** Archive LOG.md entries older than about 150 into
  `docs/log-archive.md`, keeping the recent ones and a one-paragraph summary at
  the top.

**Changed:**
- **AGENTS.md** is 193 lines. It keeps Project, Important files, Working
  conventions, Validation, Sibling copies and Conventions. It gains **Safety
  rules** (the test lock, the memory caps and node-test-guard, read-only
  production checks, commit only on a green check, deploy from a clean tree
  about hourly) and **Deeper notes**, which links the three docs and the
  archive with when to read each.
- **`docs/mechanics.md`:** how a level is put together, One umbrella each,
  Fighting back, What breaks quietly.
- **`docs/biomes.md`:** every per-biome section, Trench through Harbour.
- **`docs/checking.md`:** Staying current, Checking gameplay changes, Checking
  looks, Checking the page itself.
- **LOG.md** is 4900 lines. Entries 1–149 are in `docs/log-archive.md`, and
  "Entries 1–149, in brief" sits at the top after the standing priorities.

**Checked:** every line of the old AGENTS.md is in the new AGENTS.md or a doc,
except one cross-reference rewritten from "see below" to `docs/checking.md`.
Every line of the old LOG.md is in LOG.md or the archive. The one code comment
that pointed at AGENTS.md's baselines (`tools/simcheck.js`) now points at
`docs/checking.md`.

## 272 — 2026-10-15 · Colony of the day

**Asked:** a "Colony of the day": a button that loads today's level and
colony seed, derived from the UTC date (the same for everyone worldwide,
deterministic via `generate(level, attempt, seed)`). It should be labelled
with the date and a dry subtitle ("Today's standup is mandatory."). The report
card says "COLONY OF THE DAY · 2026-10-15" and the share link carries it. No
server state, strict parameter checks, a patch-notes line, and a test that two
calls on the same date give identical runs and different dates differ.

**Changed:**
- **`share.js`.**
  - `daily(date)` hashes the date string twice (FNV-1a, two salts) into a
    level from 1 to 200 and a colony seed.
  - `today()` is the UTC date.
  - `?daily=YYYY-MM-DD` is accepted only when it's exactly that shape and a
    real calendar date from the 2000s; anything else is ignored, as with
    `?level&seed`.
  - `dailyUrl` builds the link.
- **The page.**
  - "colony of the day · 2026-10-15", with "Today's standup is mandatory."
    under it, sits at the left of the what's-new row. A click plays today's
    colony as a move, like a shared link (nothing cleared, nothing counted),
    and the toast says the subtitle.
  - A `?daily=` link opens that day's colony and the address bar is cleaned,
    as before.
  - Copy link on a daily colony copies `?daily=<date>`.
- **`Draw.reportHeading`:** the card reads "COLONY OF THE DAY · <date>" in place
  of "LEVEL N · REPORT".
- **Patch notes:** "Added: colony of the day, the same level and colony for
  everyone. Copy link shares it." It replaces the old copy-link line, which it
  covers.

**Tests** (`test/daily.test.js`):
- the same date gives the same level and seed, and identical full play-outs;
  the next day differs;
- a month visits more than 20 levels;
- strict parsing (bad shapes, impossible dates, the 1900s rejected);
- `today()` at either side of UTC midnight;
- `dailyUrl`;
- the card heading;
- on the page: the button's date, playing it, nothing cleared, and a `?daily=`
  link opening that colony.

Local headless check at both sizes: no page errors.

**Deployed** at 05:46 after 271 (272 was merged after it) (name="build" content="a5cbb381"), gated on a
green full check through the test lock (1245 tests). It covers 262–271: the
cast art, The Cloud and the re-skin of levels from 20 up, the mission descope,
the cloud banks, level 109's hero, readable lightning, the test lock, the
agent animation art, the tour and the AGENTS.md/LOG.md restructure.

Verified on production:
- **Level 20, read-only** (`?level=20&seed=3`, every non-GET to `/api/*`
  failed in the browser; none were attempted), at 1280×900 and 390×844:
  - The Cloud, with `updraftLift` on.
  - Lightning present (idle at tick 500).
  - "AGENT 002 IS FIRST HOME" on the ticker.
  - Scalloped lilac banks, the ON-PREM door, rain, umbrella floaters.
  - The tour strip with The Cloud marked.
  - No page errors.
- **`dist/`:** all scripts byte-identical to `dist/` (brotli, no comment
  lines). The build agrees on page, repo and API (a5cbb381).
- **Open tab:** a tab from the previous build (ba69eb43) reloaded into the new
  one between levels.
- **Share card and icons:** still 200, `image/png`, immutable, identical.
- **No console or page errors.**

**Fix after 272:** the merge of Colony of the Day conflicted in LOG.md, and the
gate committed the merge with the conflict markers in it. The check doesn't
read LOG.md, so it was green. This commit resolves it, with 272 first and then
the 05:46 deploy note. The gate script now refuses to commit while any file
holds conflict markers or a merge is unresolved.

## 273 — 2026-10-15 · A place in The Cloud (on a branch)

`codex/cloud` starts from approved agent art (`d67dcb7`) and merges current
main (`afa5be9`) as requested. Merge `c44398a` includes the twentieth biome,
its three Cloud commits, the latest gameplay fixes and the shared test lock.
Both logs are preserved; the approved agent-art entry follows main as 269.
The art below changes Draw only, with the new tests and generated stamps.

**Art:** layered stationary dusk cloud banks and tall thunderheads replace
the placeholder back wall. Their pale lilac tops, darker overlapping bodies
and veiled server-rack silhouettes stay behind the playable terrain. The
walkable banks have warm silver crowns, a continuous rim at the real foot
line, softly shaded billows, lilac depth, stippled sides and damp undersides.
Larger deep volumes fade into the weather. The placeholder cave scatter keeps
its support locations as small condensation mounds/curls instead of stone
spires and icicles, at page resolution only. The ON-PREM exit is a compact
brick refuge: thick masonry, a steel door, warm window, light through the
opening and a complete seven-letter plaque.

The existing rain, updrafts, lightning bolt/column, scorch, exit glow and gate
remain in their original passes. Short internal thunderhead flickers and a
few splashes on supported bank tops run before the colony. Lightning's real
wind-up controls a local lilac glow and stronger late column edges/ground
contact, so the art names the actual danger. Reduced motion removes the new
ambient flickers and splashes, retaining the steady warning. No scrolling or
parallax, simulation state, RNG draws or new particles.

**Cache:** a WeakMap keyed by world and terrain version holds depth rows,
real walking/underside edges, pre-shaded billow fragments and pre-clipped air
masks for distant flashes. Carving invalidates it. Steel and built bricks do
not become cloud. Static art uses the existing terrain cache; the live pass
reads three phase counters and ten splash slots without scanning terrain.
Supported condensation vanishes when its support is removed. All drawing
uses whole/half art pixels, with bounded recordings and digest comparisons.

**Review:** `npm run compare -- codex/cloud 20 --seed 3 --ticks 400 --out
/tmp/codex-cloud/compare-main.png`; the requested comparison takes 0.2 s.
`compare-cloud-only.png` uses merged baseline `c44398a`, isolating this pass
from the approved agent animations. `final/level-20.png` and `final/crop-20.png`
come from `tools/shoot.js` at res 2, seed 3, tick 400. The eleven-pair
`review/contact-sheet.png` includes Cloud levels 20/40/60/80/100 at tick 500,
level 20/tick 400, and natural early/late charge, strike and recovery at ticks
175/210/217/232, plus an internal flash at 249. Native frame pairs and
individual enlarged comparisons are alongside it. Reviewed full frames and
pixel crops: the route, faces, suits, umbrella rims, red team, hazards,
original fittings and ON-PREM door remain clear.

**Isolation:** 360 unspecified/res-1/res-3 live frames match the merged
baseline byte for byte (24 levels × five palettes × three scales). All 95
non-Cloud page frames match too. All eleven Cloud comparisons preserve the
original sky above the existing crown envelope; the first changed pixel in
the requested comparison is at canvas (24,50), not (0,0). The final probe takes
8.67 s, peak RSS 322 MB under a 256 MB renderer heap. Rendered/unrendered
Cloud play has identical complete digests through 600 ticks on levels
20/40/60/80/100. Sim, Palette, web integration and numbered assets are unchanged
from the merged baseline. Native/other-scale art retains the original bank,
scatter and door drawing.

**Cost:** scan Cloud levels 20–400, seed 3, every thirty ticks up to tick 1500:
the largest sampled cast is nineteen at level 340/tick 480. Five warmed,
interleaved batches of one hundred software-raster actor frames give
1.570 → 1.563 ms, effectively unchanged within noise. The sampled internal
flash costs 0.040 ms/76 rectangles; an idle splash phase costs 0.0015–0.0035 ms.
`npm run fps -- 340 --seed 3 --from-tick 360 --seconds 5 --speed 2 --json`
measures normal page play from tick 363 to 592, reaches nineteen characters,
and holds median/p5 60/60 fps, worst 17 ms, 0% long tasks, 12% CPU.

**Pipeline:** static billow shading and atmospheric clipping are computed
once per terrain version, with no allocation or scan in the live weather
loop. The native/progression sheet reuses each played world for both
renderers. A complexity preflight moved the coarse Cloud gate into its helper, keeping
the terrain dispatcher at 29. The backdrop preserves the coarse recipe's
canvas-state contract. Shared backdrop assertions now compare SHA digests
instead of risking full-frame buffer diffs.
The newly wrapped npm check/test scripts need four `--` separators before
Node options; a dry-run argument probe verified the exact file list and flags
reach Node, keeping Factory art excluded. Check writes LCOV in the same run;
CRAP consumes it with `--use-existing-coverage`, avoiding a second full suite.
All heavy steps use the shared FIFO test lock.

**Validation:** `npm run stamp` is current (Draw `d50a47c7`, build
`b2fb8642`). The capped full `npm run check` plus LCOV passes all 1,243 tests,
zero failures/skips, in 232.27 s; Factory art is explicitly excluded. Node
uses a 2,048 MB heap, `ulimit -v 6000000`, two test workers and a 120 s test
timeout. `npm run crap -- --threshold 30 --use-existing-coverage` passes;
maximum CRAP is 30.0, terrain/decor dispatchers are 29.0, and the largest
new Cloud helper is 21.0 with 100% coverage. All final source hashes match
the checked files. The focused backdrop/Cloud set also passes 74 tests in
5.90 s. Check and coverage share one execution and one FIFO lock, released
as soon as CRAP finished. `git diff --check` is clean.

**Next:** ready for Cloud art review. Commit on `codex/cloud` only; no push,
deployment or sibling sync.

## 274 — 2026-10-15 · Cumulus, not glass (on a branch)

Revision on `codex/cloud`, following review of level 20/seed 3/tick 500.
The previous smooth depth ramp reached straight cell edges and read as ice.
Cloud banks now have overlapping rounded cream crowns in the air above the
real walking line, irregular hanging lobes underneath and bulging side edges.
Every short bank gets a crown, with staggered widths and heights along longer
runs. The cream/silver foot line stays continuous and exactly on the terrain.
The original three-pixel crown envelope at the first bank preserves the sky.

Rounded highlights interrupt the body ramp. Exposed narrow columns have
height-local overlapping volumes so their stepped terrain reads as rising
cumulus; broad banks do not acquire false columns where depth groups meet.
The underside no longer has a continuous straight dark border. Side lobes
blend with the body depth rather than forming a bright rectangular frame.
The thunderheads, server silhouettes, brick refuge, weather and wind-up light
are unchanged. Native/res-3 and non-Cloud rendering remain unchanged.

Contour fragments and rising volumes are computed once in the existing
world/terrain-version cache. Air fragments must touch the actual bank; steel,
built bricks and carved openings retain their masks. All animation still
uses the existing cached masks without terrain scans or new per-frame work.
No simulation, RNG, host integration or palette changes.

**Review:** `/tmp/codex-cloud-revision/compare-main.png` is the requested
`npm run compare -- codex/cloud 20 --seed 3 --ticks 500`; `compare-revision.png`
uses first-pass `22ec45e` as the before image. `final/level-20.png`
and `final/crop-20.png` are res-2 shoot.js renders at that exact seed/tick.
The eleven-pair `review/contact-sheet.png` covers five Cloud layouts at tick
500 (including the review frame), tick 400, and natural
charge/strike/recovery/flash phases. Reviewed native-sized images and enlarged crops for ground, faces,
suits, umbrella rims, hazards and ON-PREM readability.

**Isolation and cost:** 360 unspecified/res-1/res-3 live frames and all
95 non-Cloud res-2 frames match the previous Cloud commit byte for byte.
Eleven Cloud frames preserve the original sky band. The sheet/isolation
probe takes 8.84 s, peak RSS 330 MB with a 256 MB heap. Both comparisons
finish in 0.2–0.3 s; their first changed pixel is canvas (24,50).
The busiest sampled Cloud scene remains nineteen characters at level 340,
tick 480. Five interleaved batches of one hundred actor frames measure
1.5304 → 1.5307 ms (0.0003 ms difference, within noise). Internal flicker
remains 76 rectangles/~0.040 ms, idle phase zero calls, splashes three/six
calls/~0.0016–0.0033 ms. The revision changes cached terrain paint only.

**Validation:** `npm run stamp` is current (Draw `9d2d3dd1`, build
`96acba68`). The capped full `npm run check` with LCOV passes all 1,245 tests,
zero failures/skips, in 230.96 s. Factory art remains explicitly excluded.
The shared-lock run uses a 2,048 MB Node heap, `ulimit -v 6000000`, two test
workers and 120 s test timeouts. `npm run crap -- --threshold 30
--use-existing-coverage` passes, maximum 30.0; new helpers score at most
13.0, with boundary layout/fragments 100% covered. All final source hashes
match the checked files. The focused 13-test Cloud set passes in 4.44 s,
including adjacent-air contour masks and a tower joined to a broad base.
Rendered/unrendered Cloud digests still match through 600 ticks on five
layouts. `git diff --check` is clean.

**Pipeline:** the comparison sheet reuses each played world for both Draw
versions. New shape fragments are clipped and shaded during cache creation,
so the detailed outline adds no live weather work. The full check emits
LCOV once and CRAP reuses it, avoiding a duplicate suite. All heavy runs use
the shared FIFO lock; this revision queued behind main's soak run.

**Next:** ready for Cloud revision review. Branch commit only; no push,
deployment or sibling sync.

Reviewed and merged by the loop. Cumulus lobes, a towering cumulus column, a brick ON-PREM refuge and thunderheads at page resolution; the banks read as ground.

## 275 — 2026-10-15 · A tiny tour of twenty places (on a branch)

`codex/tour-art` starts from approved Cloud `82f96c8` and merges main
`3a4db13` to obtain the tour and Colony of the Day. Main's archived/lean docs
and new UI are preserved. The two Cloud art entries follow main as 273–274.
The merge and this pass are committed together after a green check/CRAP gate.

**Art:** twenty distinct 20×12 pixel silhouettes sit inside the tour's
existing 24×16 canvas, with a common dark outline and a small game-colour
palette. Cavern crystals, the broken Ruins arch, snowy fir, hot furnace,
jungle canopy, icicles, saucer, sawtooth factory, office tower, kelp/fish,
cactus, server pair, books/ladder, stamped envelope, crane, clock, rooftop
aerial, station train, container ship/lighthouse and a cloud with its brick
door replace the four repeated ground shapes. Background plates still use
the active theme/biome palette. They repaint only on creation/theme change.
No external assets, animation, per-frame UI painting or simulation edits.

A 16×16 calendar badge with a green umbrella sits beside Colony of the Day.
Its pins, cream paper and gold edge use the same outline treatment. The date,
subtitle, click behaviour and accessible name remain intact. Decorative
canvases are hidden from assistive technology; the buttons keep their names,
current-state outline, keyboard focus and existing navigation behaviour.

**Sightings:** inspected all seven existing gag-pass silhouettes in their
real report-card context at desktop and phone sizes (14px and 7px), including
the gold fresh-item ring. Their AGI, mirage/keyhole, red queue sign, duck,
conflict arrows, outage eyes and party hat remain clear, so those already
polished sprites are retained unchanged.

**Review:** `/tmp/codex-tour-art/after/ui-sheet.png` is a browser screenshot
sheet with all twenty tour icons at their measured desktop 24×16 and phone
36×24 CSS sizes, and 3× beside each. It also includes the daily badge and the
report card/sightings at real size and 3×. `page-desktop.png`/`page-phone.png`
show the live page; `ui-context-desktop.png`/`ui-context-phone.png` scroll the
full tour/daily row into view. No page errors, no sideways page overflow at
1280 or 390px; phone targets remain at least 44×44. Tour jumps still move
forward, select the right biome and count nothing cleared. Daily links and
date behaviour pass their existing tests.

**Isolation/weight:** all twenty res-2 biome frames at seed 3/tick 400 are
byte-identical to the merged pre-art renderer, with unchanged complete world
digests. Sim.js, Palette.js and Outcome.js are untouched. Draw grows by
1,446 Brotli bytes; web loses 214 and the page gains 64: net **1,296 bytes**
(~1.3 KB compressed). No PNG, SVG, font or manifest is added to the page.

**Pipeline:** `node tools/tour-art.js <out>` uses the existing bounded local
browser helper and a throwaway profile/ephemeral server. Two live viewport
captures supply all icon canvases and measured CSS sizes for one labelled
sheet; it does not reload a page or launch a browser per icon. Ready checks
are bounded at three seconds, font settling at one, image decoding explicit,
and browser/server cleanup runs in `finally`. The live-art test completes
in 1.90 s; the focused nine-test UI/daily/tour set takes 5.99 s. Pixel tests
use bounded recordings and SHA digests. The full check writes LCOV once;
CRAP reuses it. All heavy runs use the shared FIFO lock.

**Validation:** `npm run stamp` is current (Draw `c7e558d0`, web `06381ec0`,
build `a256d64d`). The capped full `npm run check` with LCOV passes all
**1,254 tests**, no failures/skips, in **234.77 s**. Factory art is explicitly
excluded. Node uses a 2,048 MB heap, `ulimit -v 6000000`, two test workers
and 120 s timeouts. `npm run crap -- --threshold 30 --use-existing-coverage`
passes, highest score 30.0. New art helpers have 100% coverage and score at
most 9.0; the screenshot helper scores 10.5. Final checked source hashes
match. Conflict-marker and unresolved-merge-file checks are clean, as is
`git diff --check`. The merge/feature commit is gated on these green results.

**Next:** ready for tour-art review. Branch commit only; no push, deployment
or sibling sync.

Reviewed and merged by the loop. Recognisable pixel icons for all 20 biomes in the tour, at real size on desktop and phone, and a badge for the colony of the day.

## 276 — 2026-10-15 · Soak

**Asked:** a stability pass after the burst of features. Build a soak tool
(`npm run soak -- --minutes N`): headless Chromium on a local server, fastest
speed, levels advancing by themselves for N minutes with storage on and
counter POSTs blocked. Sample JS heap, DOM nodes, listeners, canvases and frame
time every 30 s. Fail on console errors, unbounded growth or frame-time creep.
Run it for 20 minutes, fix any leak, log the curve.

**Tool:** `tools/soak.js`, run through the test lock.
- **Setup.** It serves `public/`, sets the fastest speed (Brisk), refuses
  every non-GET to `/api/*`, and turns sound on with a real click so the
  AudioContext runs.
- **Probe.** A script injected before the page's own counts live audio nodes
  (created minus ended) and every frame's interval.
- **Samples,** every 30 s after a forced GC: heap, DOM nodes, listeners,
  canvases, localStorage size, live audio nodes, median and 95th-percentile
  frame time, level.
- **`judge`.** Compares the last third of the run with the middle third, so
  the start-up climb isn't counted, with an allowance per measure. It fails
  on growth that keeps going, frame time creeping, live audio nodes over 120,
  or any page or console error.
- **Tests:** `test/soak.test.js` covers the judge and a short real soak.

**The 20-minute curve** (levels 2–41 at Brisk, one sample in four shown):

| Time | Level | Heap (MB) | DOM nodes | Listeners | Canvases | localStorage | Audio nodes made |
|---|---|---|---|---|---|---|---|
| 30 s | 2 | 3.38 | 519 | 70 | 22 | 301 | 46 |
| 270 s | 9 | 5.97 | 535 | 70 | 22 | 483 | 470 |
| 510 s | 17 | 7.56 | 535 | 70 | 22 | 521 | 1018 |
| 750 s | 25 | 8.67 | 532 | 70 | 22 | 686 | 1526 |
| 990 s | 34 | 9.19 | 519 | 70 | 22 | 821 | 2072 |
| 1200 s | 41 | 9.69 | 532 | 70 | 22 | 883 | 2605 |

Live audio nodes stayed at 0 at every sample. Frame time held at 16.7 ms
median and 16.7–16.8 ms at the 95th percentile throughout. No page or console
errors. **Passed.**

**Not yet explained:** the heap still rises slowly. It climbed 0.38 MB a minute
early on, 0.1 MB a minute by the end, about 0.15 MB a level, and it is
flattening. Every page-level collection I read is capped: the report queue,
the standup's recent five, the feed, moments, particles. The Draw caches are
WeakMaps keyed by the world. A heap-snapshot diff to find what grows (run
through the test lock) timed out waiting behind Codex's validation and needs
a second attempt. localStorage grows with sightings, bet and milestone state,
under 1 KB here. Neither is a problem at this rate, but a tab left open for a
day would carry several more MB than it needs to; that's the next look.

**Deployed** at 06:46 after 276 (name="build" content="a256d64d"), gated on a
green full check through the test lock (1270 tests). It covers 272–276: Colony
of the Day, the Cloud art, the tour icons and the soak tool.

Verified on production, read-only (every non-GET to `/api/*` failed in the
browser; none were attempted):
- **`dist/` and the build:** all scripts byte-identical to `dist/`. The build
  agrees on page, repo and API (a256d64d).
- **Open tab:** a tab from a5cbb381 reloaded into a256d64d. The share card and
  icons are still correct. No console or page errors.
- **Level 20** at desktop and phone size: The Cloud with Codex's cumulus banks,
  the brick ON-PREM refuge, rain, umbrella floaters, lightning present, and
  "AGENT 002 IS FIRST HOME".
- **The tour strip** shows its 20 icons.
- **`?daily=2026-10-15`** opened level 13 with colony 188139894, exactly
  `AgentShare.daily("2026-10-15")`. The button shows its badge and the date.

## 277 — 2026-10-15 · A masthead with colleagues (on a branch)

`codex/logo` starts from approved tour art `2c2193b`.

**Art:** the header now draws the share card's chunky ROM lettering, with
bevel highlights and a small extrusion. OH NO! uses the selected theme's
accent; MORE AGENTS uses its foreground. A suited colleague grips the first
O with one hand and an open umbrella with the other. A dreamer steps beyond
the last S, following a tiny outlined EXIT thought. Faces, collars, hats,
coat edges and shoes use the game's existing pixel language. No font,
bitmap, SVG or asset request is added.

The drawing is 340×64 art pixels: 680×128 CSS pixels on desktop, 340×64 on
phones. At DPR 1/2, desktop backing sizes are 680×128/1360×256, phone sizes
340×64/680×128. All lettering, sprites and sway offsets use whole pixels.
The real heading text stays in the DOM, visually clipped only once the
canvas is ready; the decorative canvas is aria-hidden. The accessibility
tree still has a level-one "Oh No! More Agents" heading. Without canvas
initialisation the ordinary CSS title remains available.

**Idle:** the host caches all lettering and both colleagues on an offscreen
canvas. A one-second timer blits that cache and draws at most 32 umbrella
rectangles; only its canopy/shaft move by one art pixel. Initial and dynamic
prefers-reduced-motion both produce a still neutral pose. The timer stops
when the header is offscreen, the document hidden or the game fullscreen,
and resumes on return. Missing observer/motion APIs get a static logo.
Theme/size/DPR changes rebuild the small cache. There is no simulation
state, RNG, level timer or gameplay animation change.

**Review:** `/tmp/codex-logo/review/desktop-before-dpr1.png` and
`desktop-after-dpr1.png`, plus `phone-before-dpr1.png` and
`phone-after-dpr1.png`, show the full page before/after. Their `-header.png`
companions give the exact masthead crops. After captures also include DPR 2
on desktop and phone. At 390px the logo is centred at x25, width340, with no
page overflow. The two colleagues, grip/umbrella and EXIT thought stay
inside the canvas. All nine themes have distinct, legible logo colours.
No page errors.

Browser motion checks record four cached paints over roughly three seconds
and three distinct idle poses. Reduced motion is stable before animation
and after a live preference change; offscreen pixels freeze and scrolling
back resumes them. Pixel tests bound every rectangle and confirm that the
lettering/colleagues outside the small canopy region never change.

**Isolation/weight:** all twenty biome frames at seed 3/tick 400/res 2
match the approved tour renderer byte-for-byte, and rendering leaves complete
world digests unchanged. Sim.js, Palette.js and Outcome.js are untouched.
The added Draw/web/page code costs 656 + 641 + 105 = **1,402 Brotli bytes**
(~1.4 KB). The renderer probe peaks at 176 MB RSS under its 256 MB heap.

**Pipeline:** `node tools/logo-art.js <out> [before-public-root]` reuses one
bounded local browser and ephemeral servers for both versions, both CSS
sizes and DPR 1/2. Header crops come from the same live pages as full shots. The focused
three-test set takes 10.31 s, including the timed live-motion checks.
It uses the existing capped browser helper, explicit readiness/font bounds,
and cleanup in finally. Queue an immutable validation script: finish caps,
stamps and commands before the FIFO handoff. The full check emits LCOV
once, and CRAP reuses it; all heavy work takes the shared test lock. The
initial all-in-one screenshot helper scored 42.2, so evaluation, viewport
capture and live preference checks now have separate small functions.

**Validation:** `npm run stamp` is current (Draw `f9c23ae9`, web `e0fd746e`,
build `f62ff481`). The final capped `npm run check` with LCOV passes all
**1,257 tests**, zero failures/skips, in **240.29 s**. Factory art remains
explicitly excluded. The immutable wrapper exports a 2,048 MB Node heap,
uses `ulimit -v 6000000`, two test workers and 120 s timeouts. Shared-lock
`npm run crap -- --threshold 30 --use-existing-coverage` passes, maximum
30.0. Drawing helpers are 100% covered and score at most 6.0; the refactored
screenshot helpers score at most 13.1 (down from 42.2). All checked source
hashes match, and `git diff --check`/conflict-marker checks are clean. The
branch commit is gated on the final green check and CRAP results.

**Next:** ready for header-logo review. Branch commit only; no push,
deployment or sibling sync.

Reviewed and merged by the loop. A pixel header logo with the umbrella hanger and the dreamer walking to a false EXIT; it fits 390 px.

## 278 — 2026-10-15 · What the heap was; a smoke before each deploy

**Asked:** (a) finish the heap investigation from 276: take the snapshot diff
through the test lock across about 30 levels and name what retains the growth.
Fix it if it's ours, or log why it plateaus. (b) Keep the soak in the toolbox:
a 3-minute `npm run soak -- --minutes 3` smoke in the pre-deploy checklist,
not the per-commit gate.

**(a) Found:** heap snapshots after a forced GC at level 5 and at level 25,
ten minutes apart at Brisk, aggregated by type:

| What grew | Size | Objects |
|---|---|---|
| `(code)`: compiled code, bytecode and feedback | +3230 KB | +12293 |
| `(native)` | +281 KB | |
| Numbers, strings and object shapes | +42 KB together | |
| Plain `Object`s | +6 KB | +149 |

No world, canvas, array of samples, ticker line or closure grew in any number.
The growth is V8 compiling code: Draw.js is 770 KB and most of it is per-biome
art that runs only when its biome comes up. Every new biome the page reaches
compiles its share for the first time. Levels 5 to 25 visit all twenty
biomes, so the compiled set approaches its full size, which is why 276's curve
flattened from 0.38 to 0.1 MB a minute. It isn't ours to free and it doesn't
grow past the whole program. Nothing to fix; logged as the explanation.

**(b) Changed:** `npm run smoke` is the 3-minute soak (15 s samples) through
the test lock. AGENTS.md's deploy rule now says: before each deploy, the full
check, then `npm run smoke`. It is not part of the per-commit gate. First run:
levels 1–7, heap 5.2 MB, 524–540 nodes, 73–74 listeners, 24 canvases (the
pixel logo added two), frame time 16.7 ms throughout, at most one live audio
node at any sample. **Passed.**

## 279 — 2026-10-15 · Nothing to see (yet): fast-forward through dead time

**Chosen (autonomy):** the roughest thing a watcher saw tonight was dead
time. A level whose last few agents are pacing sits unchanged for up to twenty
seconds before the stall cutoff ends it (level 109's worst colony: 86 s). The
play-test list's remaining items each cost a few runs; dead time costs every
watcher on a third of all levels.

**Changed** (page only; the simulation's rules are untouched):
- **The rule** (`web.js` `fastForward`). Once every agent is out of the hatch,
  nothing has changed for 240 ticks (eight seconds: nobody home, nobody lost,
  not a cell dug) and the level isn't over, the page runs `FF_STEPS` (4) steps
  per tick. It drops back to normal the moment anything changes.
- **Why the run is unchanged.** It only calls `step` more often, so the run is
  exactly the run it would have been.
- **The tag** (`drawFastForwardTag`): ">> NOTHING TO SEE" in the replay tag's
  panel, top left, while it lasts. The replay tag wins if both are up.

**Threshold, measured** (levels 1–150 × 6 colonies, replicating the rule on
the Sim):

| Quiet threshold | Watch time removed | Runs that fast-forward at all | Notes |
|---|---|---|---|
| 3 s | 11% | | catches ordinary long walks, which are watchable |
| "nobody moving" (the stall detector) | nothing | 2 of 900 | pacing agents count as moving |
| 6 s | 4.3% | | |
| **8 s (shipped)** | **2.1%** | 326 of 900 | cuts only real dead stretches; level 109's worst colony saves 69 s, 127's 17 s, 81's 12 s |

**Tests** (`test/fastforward.test.js`):
- level 109's stalled colony on the page, driven through `fastForward`, ends
  with exactly the plain simulation's home, lost and tick counts, in fewer
  page ticks, having fast-forwarded;
- the tag draws only while fast-forwarding and never over a replay.

Headless screenshot: the tag shows at top left during a real fast-forward on
level 109. No page errors.

**Deployed** at 07:46 after 279 (name="build" content="84496cb6"), after a
green full check and a passing `npm run smoke` (levels 1–8, heap 5.4 MB, 524
nodes, 73 listeners, frame time 16.7 ms, no errors). It covers 277–279: the
pixel logo, the heap explanation with the smoke step, and fast-forward
through dead time.

Verified on production, read-only:
- **`dist/` and the build:** scripts byte-identical to `dist/`. The build
  agrees on page, repo and API (84496cb6). A tab from a256d64d reloaded into
  it. The share card and icons are correct. No console or page errors.
- **Level 20:** The Cloud at desktop and phone size.
- **`?daily=2026-10-15`:** level 13, colony 188139894, with the badge and the
  date.
- No counter writes attempted.

## 280 — 2026-10-15 · Umbrellas up sooner

**Chosen (autonomy):** the Building Site had the lowest home rate of the 20
biomes since the re-skin (88% against 94%), and that's where I started.

**Found:**
- **Bosses, not the biome.** On the Building Site's ten levels from 15 to
  195 the loss is concentrated on level 35, at 73% home and 47% at worst.
  Every death there is the red team: level 35 is a boss level (every 7th),
  and its gun boss is posted over the colony's route. Gun bosses are beaten on
  some layouts and not others; levels 35, 63 and 147 are the worst, at 68–81%
  home. The re-skin moved the Building Site onto two gun-boss levels.
- **How the boss kills.** It fires every ~89 ticks and almost never misses.
  On level 35, 56 deaths in 12 colonies were 25 agents walking, 18 falling a
  short drop with no canopy open (a clean shot, by design), 7 brawling and 6
  on crane hooks.
- **Why so few parries.** Umbrellas were plentiful (13 of 17 floaters left at
  the end), but parries averaged 2 a run. A walker raises its umbrella against
  a shot only on a 50% roll.

**Changed:** `BROLLY_PARRY` goes from 50 to 65, so a walker with an umbrella
sees the muzzle in time about two times in three. It's the game's own rule
("the round goes into the canopy") turned up, not a new rule. Falls, brawls
and hooks are unchanged, and so is the ricochet chance on a parry.

**Measured:** playtest 1-200 × 24 against main:
- home 94.38% → 94.92%, which recovers about 40% of what the re-skin cost;
- bad endings 41 → 38;
- no level worse by 6 or more;
- level 35 261 → 284 home (72% → 79%), so the boss stays the danger;
- 111 323 → 347, 146 237 → 255, 38 254 → 273, 191 329 → 345.

`test/brolly-kept.test.js` checks the rate comes out at two in three across
ticks and ids.

## 281 — 2026-10-15 · A brief introduction to the next mistake (on a branch)

**Brief:** `codex/titlecard`, from approved `codex/logo` (`2bd3f5a`). A short
level-start card with the new biome icon, pixel title and deterministic dry
subtitle; leave the hatch opening visible, allow input and tap-to-skip, and
stay out of replay, standup and results. Branch commit only.

**Art and behaviour:** twenty biome lists, three lines each. The subtitle
cycles by the biome's visit through the catalogue, so a restart or different
colony seed keeps the same line and later visits get the other lines. The
24×16 tour icon is enlarged with hard pixels beside the board's existing ROM
font. The themed plate goes opposite the hatch, leaving the opening and the
first falling agent clear; 400 generated layouts cover both hatch orientations.
Boss cards retain their warning line. There is no full-board dimming.

The page paints a separate res-2 canvas once per level or theme change. Only
CSS opacity changes afterwards: 1.2 s normally, or a stationary 0.6 s fade with
reduced motion. A specific reduced-motion rule keeps that requested fade while
the page's general animation ban still applies elsewhere. Rapid navigation
flushes the hidden state before starting the next fade. The timer uses wall
clock, independent of game speed and pause. Board taps dismiss the card and
continue through the existing bet/pep/pause handler. Replay, report and standup
clear it immediately. The subtitle joins the existing polite level announcement;
the canvas is hidden from screen readers to avoid announcing it twice.

The page opts out of the old sliding intro/iris; native hosts retain the exact
default intro and results path. No Sim.js, palette, level-generation or world
fields changed. Rendered versus unrendered playthrough digests match at both
resolutions, with cosmetic spawn/effect jitter pinned per tick.

**Review:** `/tmp/codex-titlecard/review/` contains full desktop 1280×900 and
phone 390×844 captures at DPR 1 and 2, matching board crops and `metrics.json`.
Frames show the Cloud at tick 18 with the hatch fully open and the title in
place. The phone card remains wholly visible within the viewport. All twenty
icons/titles/subtitles are together in `/tmp/codex-titlecard/all-biomes.png`.
No image requests, external artwork or dependencies were added.

**Tools:** `tools/titlecard-art.js` reuses one bounded browser and an ephemeral
server for all four views plus timing/input/lifecycle probes, instead of a
browser launch per shot. It records actual bounds and preference timings,
checks zero live title-canvas paints during the fade, and closes the server
even if browser startup fails. Standup fixtures use complete agents from
`spawn`, rather than incomplete lookalikes. The five focused checks take
7.75 s. Pixel assertions use hashes and bounded recordings, never raw buffer
diffs. Validation runs from an immutable script under the shared FIFO lock;
one full run emits LCOV and CRAP reuses it.

**Validation:** `npm run stamp` is current (Draw `be25fbd3`, web `2fa60ee2`,
build `350d989a`). The final capped `npm run check` with coverage passes all
**1,262 tests**, zero failures/skips, in **244.84 s**. Factory art remains
explicitly excluded. The wrapper exports a 2,048 MB Node heap, sets
`ulimit -v 6000000`, and uses two workers and 120 s test timeouts. Shared-lock
`npm run crap -- --threshold 30 --use-existing-coverage` passes, maximum 30.0;
the new renderer scores 6.0 and the review helpers at most 10.4. Final browser
probes have no exceptions; all checked source hashes match. Updated accessibility
and transition assertions cover the spoken subtitle and host intro option.
`git diff --check` is clean. The commit is gated on green check and CRAP.

**Next:** ready for title-card review. No push, deployment or sibling sync.


## 282 — 2026-10-15 · Compact titles, clear routes (on a branch)

**Review:** revise `codex/titlecard` after `19f788f`. The large plate hid the
lower route and sometimes the exit; keep the typography, icon and subtitle,
but halve the height, hug the text and choose a less obstructive position.
The phone review must show the board and card, not just the header.

**Art:** normal cards are now 30 art pixels high instead of 58; boss cards
are 36 instead of 68 and retain their warning. The icon is 24×16 instead of
48×32. The existing ROM font remains, with a 1.5-pixel heading and subtitle.
Width follows the longest line, including the warning: the Cloud is 249×30
instead of 360×58, about 64% less area; the Library is only 153×30. One
82%-opaque backing fill lets scenery through, with a fine border and opaque
lettering. There are no stacked fills that accidentally become opaque.

**Placement:** twelve candidates (three horizontal positions, four heights)
are scored against the initial terrain. Hatch swing/first-drop and exit-frame
overlap dominates the score. Walkable surface cells and the sixteen pixels
above them cost more than terrain interiors; empty space costs nothing. The
level number breaks ties without an RNG draw. Across 400 generated layouts,
the selected card overlaps neither protected portal region, and has the lowest
weighted terrain overlap among its candidates. A directed empty-pocket test
also checks that a newly obstructed exit moves the card elsewhere.

The page caches the chosen rectangle once at level creation, outside the
world. Repainting a theme cannot rescore it or make it follow a moving agent
or freshly dug floor. Normal 1.2 s fade, stationary reduced-motion 0.6 s fade,
tap-through skipping, replay/report/standup exclusion and polite announcement
are unchanged. Sim.js and simulation fields remain untouched; the complete
rendered/unrendered playthrough digests still match at both resolutions.

**Review and tools:** `/tmp/codex-titlecard-compact/comparison.png` compares
before/after whole boards for levels 20, 13 and ascending 29 (seed 3, tick 18).
`/tmp/codex-titlecard-compact/review/phone-sheet.png` contains three actual
390-pixel-wide phone board screenshots, with card, terrain, hatch and exit
visible. The same directory has desktop and phone full shots and board crops
at DPR 1/2, plus metrics. The capture tool now scrolls the board into view,
checks the entire board is inside the viewport, and accounts for page scroll
when clipping screenshots. The sheet uses those real crops, not header crops
or isolated cards. All six views and the sheet reuse one browser; the six
focused tests take 8.39 s, only about 0.64 s more than the previous five-test
probe. Bounded counters verify zero title drawing or placement work during
the fade, and no rescoring on a theme repaint. No dependencies or public
image assets were added.

**Validation:** stamped Draw `8dc1e4bd`, web `50c51984`, build `23669105`.
The final `npm run check` with LCOV passes **1,263 tests**, zero failures or
skips, in **252.41 s**. The immutable wrapper takes the shared FIFO lock,
exports a 2,048 MB Node heap, sets `ulimit -v 6000000`, uses two workers and
120 s timeouts, and explicitly excludes Factory art. Shared-lock
`npm run crap -- --threshold 30 --use-existing-coverage` passes, maximum 30.0.
The renderer scores 5.0, placement helpers at most 7.0, and capture helpers
at most 10.9. Browser probes report no exceptions; all validated source hashes
match, and `git diff --check` is clean. Commit gated on green check and CRAP.

**Next:** ready for compact-title review. Branch commit only; no push,
deployment or sibling sync.

Reviewed and merged by the loop. Compact, translucent level title cards placed clear of the hatch, the exit and the route, with lines such as 'Shh.' and 'Your next meeting is downstairs.'. The replay page test once missed its 15 s window under the full run's load during this merge; it now waits up to 30 s.

## 283 — 2026-10-15 · Navigation ends the intermission (review finding 1)

**Asked:** Codex's review of main (docs/review-2026-10-15.md, finding 1, P2).
Navigation doesn't cancel the previous level's intermission. Next during the
fifth level's standup made level 6, but the standup kept drawing over it, and
its finish then advanced again, so level 6 was never played. Restart, the tour
and Colony of the Day had the same problem, and a replay survived navigation
the same way.

**Changed:** `newLevel` clears `standup` and `replay` before making the new
world. Every navigation goes through it: prev/next, restart, the tour, the
daily, shared links, and the normal advance. Cancelling is now separate from
a standup's finish (`endStandup`, which still advances when a meeting runs its
course), so cancelling can't advance the world just chosen.

**Tests** (`test/navigation.test.js`, which fails without the fix):
- Next during a standup plays exactly one level on, and that level is being
  played;
- a board click afterwards doesn't advance again;
- the daily chosen during a standup is still the daily after the meeting would
  have ended;
- Next during a replay ends the replay and plays level 2.

## 284 — 2026-10-15 · Shared and daily links keep ?full (review finding 3)

**Asked:** review finding 3 (P2). `/?level=3&seed=42&full=1` and
`/?daily=2026-10-15&full=1` loaded the right colony but not in fullscreen:
the shared-link boot cleaned the whole query before `fullParam()` read it.
`?fullscreen` was affected too.

**Changed:** the boot reads `fullParam()` once, before the address is cleaned,
and uses that. The cleaned address keeps `?full` when it was asked for, so a
reload stays the kiosk it was. `?full=0` stays an explicit no.

**Tests:** `test/fullparam.test.js` (fails without the fix) checks a shared
link with `full=1`, a daily link with `full=1`, a shared link with
`fullscreen`, a shared link with `full=0` (stays off), and plain `?full`. In
each case it checks the faux-fullscreen stage, the colony that loaded, and the
cleaned address.

## 285 — 2026-10-15 · Fast-forward is heard on every tick (review finding 5)

**Asked:** review finding 5 (P3). With sound on, fast-forward's extra steps
weren't observed by `sfx.js`. Cues that fire on an exact tick (the outage's
power-down and power-up, a fuse's "oh no" at 40) were lost when that tick was
one of the skipped ones.

**Changed:** `fastForward` calls `AgentSfx.observe` after each of its extra
steps, as the normal tick does after its one. `sfx.js` keeps its own
real-time gaps per sound, so 4× steps don't mean 4× noise.

**Tests:** in `test/fastforward.test.js` (fails without the fix), level 109's
stalled colony is driven on the page through `fastForward` with the observer
wrapped. All 4904 ticks are observed, and it did fast-forward.

## 286 — 2026-10-15 · Review fixes: patch-notes focus and the departed queue (on a branch)

**Requested:** fix findings 2 and 4 from the second-model review, on
`codex/review-fixes` from main `280657c`. The developer owns the other three
findings; `web.js` is unchanged here.

**Changed:**
- Patch notes use a native modal `dialog` and a real, named Close button.
  Opening focuses Close; Tab and Shift+Tab stay there (the notes' only
  control). Native modality makes the background inert, and capture keeps
  game shortcuts out of the notes. Escape, Enter/Space on Close, and tapping
  the backdrop dismiss and restore focus to “what's new”. Reading/tapping the
  notes themselves leaves them open. The card scrolls within short viewports.
- The 429 sign counts only living, walking members with a positive hold.
  Dead/gone, saved and non-walking members cannot keep `clearAt` at -1 after
  the real queue drains. Holds, release cadence and the complete departure
  grace/animation are unchanged; no random draws or movement rules changed.

**Regression tests:** the keyboard test failed before the fix with focus
still on `news-open`. Both queue tests failed before the fix (a real
infection/turn left a dead member holding the sign; a fully departed crowd
never started the grace). They now pass. The browser test covers keyboard
opening, repeated Tab/Shift+Tab, inert background focus, blocked game keys,
Escape, Enter/Space, backdrop close and focus restoration. Queue tests cover
an infected member alongside a draining live queue and a fully departed mix
of gone/saved/falling members, including the complete sign grace.

**Checks:** the focused 25 tests passed in 2.46 s, including all nine repaired
Factory art tests (now included in every run). `npm run stamp` updated the
Sim/news and build stamps. The same bounded browser regression can emit its
desktop/phone screenshots with `REVIEW_FIX_SHOTS=<directory>`, avoiding a
separate screenshot harness; inspected `/tmp/codex-review-fixes/desktop.png`
and `phone.png`. The modal, notes and focused Close fit at 390 px.
Full `npm run check` with coverage passed: **1,275 tests, zero failures/skips,
248.99 s**, with every test file included. Both it and
`npm run crap -- --threshold 30 --use-existing-coverage` (maximum **30.0**)
ran sequentially under the shared test lock, Node heap 2,048 MB,
`ulimit -v 6000000`, two workers and 120-second test timeouts. Logs:
`/tmp/codex-review-fixes/check.log` and `crap.log`. `git diff --check` passed.

**Next:** review and merge this branch; no push or deployment from this pass.

Reviewed and merged by the loop. Finding 2: the patch notes are a native modal `<dialog>` with a Close button, and focus moves in, is contained and is restored. Finding 4: the 429 sign counts only live, walking members, so a gone one can't hold it up. Checked while merging: `queued()` runs for every live agent every tick and clears `queueFor` the moment a member isn't walking, so the walking-only count can't drop the sign early.

## 287 — 2026-10-15 · npm run verify

**Chosen (autonomy):** every deploy tonight was checked with four scratch
scripts from my temp directory, rebuilt and patched each time. One of them
once wrote fake rescues to the real counter because it lacked the block.
A committed tool, read-only by construction and exercised by the test suite,
makes every deploy check repeatable for me, Codex and the supervisor. It also
carries the three checks asked for at this deploy.

**Changed:** `tools/verify-prod.js` (`npm run verify`).
- **Read-only.** Every browser it opens (`readOnly()`) fails every non-GET to
  `/api/*` before the first navigation, counts the refusals, and uses a
  throwaway profile.
- **The deploy.** The shipped scripts are `dist/` byte for byte and brotli.
  The build agrees on page, repo and API. The script stamps match
  `public/index.html`. The share card and icons serve as immutable PNGs. With
  `--previous <build>`, a tab served as that build reloads into this one.
- **Behaviour,** checked locally too with `--local`:
  - level 20 (The Cloud, updrafts, 20 tour stops) at desktop and phone size;
  - `?daily=2026-10-15&full=1` opens that colony fullscreen;
  - Next during a standup moves on exactly one level and plays it;
  - the patch notes take focus when opened by keyboard, hold it on Tab, and
    give it back on Esc.
- **Errors.** Any page or console error fails the run.

AGENTS.md's deploy rule now ends with it.

**Measured:**
- **Against this build, served locally:** passes, with 5 counter writes
  refused on the way (`test/verify.test.js`).
- **Against production as deployed at 07:46 (84496cb6)**, before the review
  fixes: it reports `?daily&full=1` not fullscreen, Next during a standup
  going 7 → 8 with the new level never ticking, and the patch-notes focus
  failing twice. Those are the review's findings 1–3, caught by the tool. The
  build mismatch is expected, since main is ahead of the deploy. The shipped
  files and the open-tab reload pass.

The production-only parts are split into functions small enough for the CRAP
gate without a deploy to cover them.

## 288 — 2026-10-15 · Capped report bodies (server review finding 1)

**Asked:** Codex's server review (docs/review-2026-10-15-server.md, finding 1,
P2). `POST /api/saves` read and parsed the whole body before validating it or
checking the caller's quota, so 2 MiB of padding was buffered every time,
including from a caller already over its limit. Cap bodies (count the
streamed bytes, cancel at a small ceiling such as 4 KB, answer 413), check the
quota before parsing if that's cheap, and add the tests the review suggests.

**Changed:**
- **`readCappedBody` (`src/counter.js`).** It returns the body as text, or
  null past `MAX_BODY_BYTES` (4096; a real report is about seventy bytes). A
  declared `Content-Length` over the cap is refused without reading.
  Otherwise the stream is counted as it arrives and cancelled the moment it
  passes the cap, so a missing or false length can't make the Worker hold a
  large body.
- **`recordSaves` order:** read the capped body (413 past the cap), then charge
  the quota (429), then parse and validate (400), then write.
- **Behaviour changes:** a caller over its limit now costs at most 4 KB of
  reading and no parsing. A malformed report now counts against the quota. A
  small padded report still goes through.

**Tests** (`test/worker.test.js`):
- a 3.5 KB padded report is 200;
- a 2 MiB report is 413 with nothing asked of the database;
- a chunked 2 MiB stream with no Content-Length is 413 after pulling at most
  three chunks, and the stream is cancelled;
- a declared oversize length is 413;
- over the quota, an oversized body is still refused at the cap;
- a malformed body over the quota is 429, so the quota is checked before
  parsing.

**Checked locally** with `wrangler dev --local`, as asked:
- **Small report:** 200, and it counted.
- **2 MiB report with a declared length:** 413.
- **The same report sent chunked:** the Worker reaches the cap and cancels.
  Wrangler's local ProxyWorker then reports "Network connection lost" and
  returns 500, and the dev server goes down after it. That's the dev proxy
  failing when a Worker answers before the upload finishes; production has no
  such proxy, and the unit tests show the Worker's own behaviour.
- **Miniflare without wrangler:** I tried to drive the Worker directly, but
  this Miniflare version wants a different configuration and I stopped there.
  Not yet seen on production; a single oversized chunked POST would show it,
  and would write nothing, because it's refused before the quota.

## 289 — 2026-10-15 · Retired old rate-limit buckets (server review finding 5)

**Asked:** finding 5 (P3) of the same review. Each minute a client reports in
leaves one permanent row in `submission_limits`, but only the current minute
is ever read. The review replayed one event over 1,001 minutes and got 1
rescue and 1 event row, but 1,001 rate-limit rows. Retire old buckets with
bounded cleanup in the same batch, keep the event-id dedupe history, and add a
clock-advancing retention test.

**Changed:**
- **`enforceRateLimit` is now one D1 batch.** The existing upsert charges the
  current minute, and a `DELETE … WHERE rowid IN (SELECT rowid … WHERE
  minute_bucket < ? LIMIT ?)` retires up to `LIMIT_CLEANUP` (64) buckets older
  than `LIMIT_KEEP_MINUTES` (5). It uses the existing `submission_limits_bucket`
  index.
- **Why keep five minutes:** an edge whose clock runs a little behind still
  finds its own count.
- **Bounded either way:** each charge adds at most one row and can remove 64,
  so the table stays at about one window of active callers. The backlog
  already in production drains at 64 per report.
- **`rescue_events` is untouched;** it is what makes a retry idempotent.
- **Constants live in `counter.js`.** The first version exported them from
  `worker.js`. Unit tests passed, but `wrangler dev` refused to start with
  "Incorrect type for map entry 'LIMIT_CLEANUP'": a Worker module may export
  only handlers. Only the local runtime showed it.

**Tests** (`test/limit-retention.test.js`): the Worker's real SQL on node:sqlite
with both migrations applied, behind a small D1 stand-in, with a mocked clock.
- One event replayed for 1,001 minutes gives 1 rescue, 1 report and 1 event
  row, with at most 6 rate-limit rows.
- Twenty callers over 40 minutes stay within 20 × 6 rows, with all 800 events
  kept.
- The same-minute quota is unchanged: eight 200s, then 429, 429.

**Checked locally** with `wrangler dev --local`: I seeded three ancient
buckets into local D1, posted one report and got 200, and the three were gone.

**Next:** merge codex/build-fixes, then deploy (this one ships the Worker).

## 290 — 2026-10-15 · Restored the queue tests that 289 overwrote

**What happened:** 289 wrote its retention tests to `test/ratelimit.test.js`
with a shell redirect. That name was already taken by the tests for the
in-game rate-limit queue (the 429 sign, AFTER YOU, 200 OK). The check stayed
green because it simply ran 11 fewer tests: 1,286 against 1,294 before, while
I had added 3.

**Caught by** comparing the passing test names against the previous commit's.

**Fixed:**
- The queue tests are restored from ec85876.
- The retention tests now live in `test/limit-retention.test.js`.
- 289's entry above now names the new file.

**Lesson:** check that a test file is new before creating it, and compare the
test count against the last run, not only the fail count.

## 291 — 2026-10-15 · Safe shipping and actual content names (on a branch)

**Brief:** fix server-review findings 2–4 on `codex/build-fixes`, based on
main `f28b2c5`. Build/cache changes only; source game files and panel paths
stay as written.

**Changed:**
- `tools/ship.js` now counts every physical line, including escaped LF,
  CRLF, CR and Unicode line separators. Escapes never skip a terminator;
  the scanner and emitter both assert line-state alignment. Removing a
  comment leaves its terminator, preserving ASI and restricted productions.
- Regex recognition runs inside `${…}` too. Token context replaces the
  twelve-character look-behind, including control conditions, spaced/commented
  `return`, nested templates, spread and `extends` operands. Ambiguous slash
  goals (brace endings, postfix operations, ASI, contextual keywords), module
  syntax, unsupported code characters and nested/v regex sets use a whole-file
  fallback. It emits the original unchanged and prints the reason; invalid
  originals still fail `node --check` and cannot reach Wrangler.
- Every emitted script gets a full SHA-256 filename computed from its actual
  bytes. Only `dist/index.html` is rewritten, and `dist/_headers` gains exact
  immutable rules for those files. Bare `/agents/*.js`, with or without a
  query stamp, keep the original source and Workers Assets' revalidation
  default. Numbered artwork/audio rules stay intact. Source stamps and the
  shared build meta/version remain intact; `npm run stamp` reported no change.
- The load-time tool follows the deployed HTML's script URLs and maps hashes
  back to source names for its size/trace report. Otherwise it would silently
  measure the untrimmed compatibility scripts. Its regression uses injected
  page/transfer responses, requiring no network or additional browser run.

**Regression evidence:** the review's silent string/template corruption and
regex fixtures now compare evaluated values, not just parse success. Coverage
also includes all five JS line endings, tagged raw templates, nested braces,
escaped regex classes, keywords used as properties, explicit fallback notices,
invalid-source rejection, deterministic hashes, changed-content URLs, removal
of stale outputs, exact cache rules, unchanged source files/build stamps and
complete asset copying. The shipped simulation matches source outcomes on ten
levels; shipped Draw matches source pixels across all twenty biomes.

**Local cache proof:** a bounded Miniflare/Chromium probe warmed version A,
then swapped the same local origin to B. Bare `Sim.js` revalidated to B;
A and B had distinct hashed URLs with one-year immutable caching and the
JavaScript content type. Reloading the page executed B. No cache disabling,
production requests or deployment. Probe/results:
`/tmp/codex-build-fixes/cache-probe.mjs`, `cache-results.json`.

**Checks:** `npm run stamp` and the actual local `node tools/ship.js` build
passed. Full `npm run check` with coverage passed: **1,322 tests, zero
failures/skips, 272.85 s**, including Factory art and every new value fixture.
`npm run crap -- --threshold 30 --use-existing-coverage` passed at a maximum
of **30.0**. They ran sequentially under the shared test lock, Node heap
2,048 MB, `ulimit -v 6000000`, two workers and 120-second test timeouts.
The hashed `dist/` page then reached its first board frame in **757 ms**, with
zero page errors (`npm run loadtime -- --local --dist --net none --cpu 1
--json`), also through the lock. Logs: `/tmp/codex-build-fixes/check.log`,
`crap.log`, `dist-load.log`. All current scripts scan without fallback; Sim
ships at 269.2 KB from 484.9 KB. `git diff --check` passed.

**Next:** review and merge this branch; no push or deployment from this pass.

## 292 — 2026-10-15 · Merged the build fixes

Reviewed and merged by the loop: codex/build-fixes (fff8f09, entry 291, based
on f28b2c5), `--no-ff`, as approved.
- **LOG conflict:** both sides added entries after 286. Codex's entry is
  renumbered 291.
- **One adjustment for the hashed names:** `npm run verify` checked the
  deployed page's script URLs against `public/index.html`'s `?v=` stamps. The
  page now names content-hashed files, so `stampsMatch` compares against
  `dist/index.html`, which is what was deployed. `filesShipped` already reads
  the files from `dist/` by the served path.

**Checked locally,** as asked, with `wrangler dev --local` serving the built
`dist/`:
- **Cache headers:**
  - `agents/Sim.<sha256>.js` is `text/javascript`, `max-age=31536000, immutable`.
  - Bare `agents/Sim.js?v=…` and `/` are `max-age=0, must-revalidate`.
- **`npm run verify -- --base http://localhost:8799/ --previous 84496cb6`
  passed** (5 counter writes refused):
  - Every script the page names loads and matches `dist/` byte for byte.
  - The page, the repo and the API agree on the build.
  - A tab served as the previous build reloads into this one between levels
    and runs it without errors. That covers the update notice and a clean
    reload after a deploy.
  - Level 20, a `?daily&full=1` link, Next during a standup, and the patch
    notes by keyboard all work.

## 293 — 2026-10-15 · Deploy (08:47), and a verify that waits for a cold edge

**Deployed** build 7ee3fc5c (version 7979682d), replacing 84496cb6. It
covers 280–292:
- umbrellas sooner;
- review findings 1, 3 and 5;
- the review fixes;
- `npm run verify`;
- the Worker's capped bodies and retired buckets (this deploy ships the
  Worker);
- the build fixes with hashed script names.

No new migration.

**Before:** the full check (1,333 tests, at the merge), then `npm run smoke`,
which passed (3 min, levels 1–7).

**After:**
- **Hashed scripts:** all nine scripts the page names are 200 and
  `immutable`.
- **Body cap:** a 2 MB chunked POST to `/api/saves` got 413. That was the one
  production request that wasn't a GET; the cap comes before the quota and the
  parse, so it wrote nothing.
- **`npm run verify -- --previous 84496cb6`:** the first run threw a
  TypeError in the level-20 check, because `AgentWorld` was not up within the
  6 s that `open` waited. Every script fetched fine, and a second run passed
  everything (5 counter writes refused): shipped files, build agreement, the
  open tab reloading into the new build, level 20, `?daily&full=1`, Next
  during a standup, and the patch notes by keyboard.
- **The fix:** `open` now waits up to 20 s, and a page that never starts is
  reported as a problem, not a crash.

The first gate for this entry went red on one test: "every fifth level ends
in a standup", with "level 3 moved on". That's one level-advance taking more
than its 4 s poll while the full parallel run competed with Codex's caption
validation for the machine. This change cannot reach that test, so it was a
flake. The poll now waits up to 10 s, as the replay wait did earlier.

## 294 — 2026-10-15 · Let the colony be heard (on a branch)

**Chosen (autonomy):** make the event ticker readable outside the board. On
phones its five-pixel lettering hid the game's explanations and jokes, even
while the agents and scenery read clearly. Branch `codex/captions`, from main
`9642606`.

**Watched first:** eight local runs, watched for eight seconds each with frames at
three and eight seconds:
Cavern, Trench, Library, The Cloud, Rooftops at Halloween, Factory at Christmas,
Data Center and Harbour. Desktop 1280×900 and phone 390×844, Steady and Brisk,
seed 3. The live ticks advanced 90→244 at Steady and 136→366 at Brisk. The
seasonal props and umbrellas read; “AGENT 006 · RICOCHET” and “HALLUCINATION
DETECTED” were almost impossible to read along a phone's bedrock. Original
watch frames/metrics: `/tmp/codex-watch-art/` (`watch.json`, sixteen PNGs).

**Changed:**
- The page displays the same newest event in a 12px, theme-coloured caption
  beneath the board. It reserves one line at larger board sizes and two at
  1×; fixed space prevents controls jumping between notes. Phone spacing
  accommodates it, and the landscape board/caption centre as a group.
- A note remains for five wall-clock seconds unless superseded; Brisk and
  fast-forward cannot spend its reading time in skipped ticks. Pausing keeps
  it available. New levels, replays, reports and standups clear it. Seasonal
  lines share the original newer-note/tie rule, including “HOME FOR THE
  HOLIDAYS”. No new timers, listeners or animation; unchanged captions cause
  zero DOM rewrites. The note is ordinary accessible text, with `aria-live`
  off, preserving the existing twice-per-level announcements.
- A host option suppresses the old board-edge ticker only on the page. Its
  default drawing and the res-1 panel stay intact. No simulation, colony RNG,
  terrain, actor or seasonal-rule changes. No assets/dependencies added;
  source gzip delta across index/Draw/web is **769 bytes**.

**Evidence:** `/tmp/codex-captions/after/contact-sheet.png` (before/after
pairs for desktop, portrait, landscape and both seasons); each full-size view
is alongside it. Same level/seed/tick 400, real CSS sizes. Inspected the sheet
and phone/desktop/landscape originals. `metrics.json` records positions,
font sizes, event text and lifecycle checks. Before files are in
`/tmp/codex-captions/before/`; the untouched baseline is in `baseline/public/`.

**Pipeline:** `tools/captions.js` captures all five views with one bounded local
browser, waits for font/readiness, steps at most 400 ticks while paused, and
refreshes the host readouts. It hides only the paused capture's obsolete
wall-clock title card, rather than waiting through the run for every frame.
The same tool makes the comparison sheet and exercises expiry, pause,
fast-forward, seasonal priority, navigation and intermission exclusions.
Run with `node tools/captions.js <out> [public-root] [before-out] --checks`
through the shared test lock.

**Tests:** shared feed selection/future/age boundaries; retained native pixels
and page opt-out; read-only, RNG-free painting in all twenty biomes; actual
browser sizes, full phone/landscape fit, multi-line text, 4.9s→5.001s expiry,
paused reading, skipped ticks, replay/report/navigation clears, seasonal ties
and zero repeated DOM writes. Focused caption/brawl/phone tests: **23 passed,
zero failures/skips, 3.09 s**. `npm run stamp` updated Draw/web and build stamps.

**Full checks:** `npm run check` with coverage passed: **1,293 tests,
zero failures/skips, 317.30 s**, Factory art included. The subsequent
`npm run crap -- --threshold 30 --use-existing-coverage` passed with a maximum
of **30.0**. Both ran sequentially under the shared test lock, Node heap
2,048 MB, `ulimit -v 6000000`, two test workers and 120-second timeouts.
The final five-view evidence/lifecycle refresh also passed, with no browser
errors. Logs: `/tmp/codex-captions/check.log`, `crap.log`, `focused.log` and
`evidence-final.log`. `git diff --check` passed.

**Next:** review and merge this branch; no push or deployment from this pass.

## 295 — 2026-10-15 · Merged the readable captions

Reviewed and merged by the loop: codex/captions (bfcad0c, entry 294, based on
9642606), `--no-ff`, as approved. The LOG conflict was resolved by
renumbering Codex's entry to 294, and the page was re-stamped.

The supervisor asked for three checks during the merge.

- **Screen readers: no double announcements.** The caption is `role="note"`
  with `aria-live="off"`, and only its `aria-hidden` changes. Colony events
  were never in the existing live region (`#announce`: levels and results),
  so nothing is announced twice, or at all.
- **Omarchy panel: unaffected.**
  - `drawFeed` moved its selection into `feedNotice`, and it is skipped only
    when a host passes `feed: false`.
  - The panel passes no such option, and it is res 1, where drawFeed never
    drew anyway. Codex's test hashes the default/panel paths against the
    native art.
  - No core file reads a web-only global (check-core-refs passes).
- **`?full` / faux fullscreen: changed in this merge.** A headless check
  (`?level=3&full=1`, a note pushed into the feed) compared the branch with
  main before it:

  | View | main | branch |
  |---|---|---|
  | 1280×720 | board 2× (496 px) | **1×** |
  | 390×844 | 1× | 1× |
  | 844×390 landscape | board top −17 px | −28 px |

  The always-reserved caption row (30 px plus the gap) pushed a 720p kiosk
  under the 2× fit, and the landscape `translateY(-18px)` deepened an
  existing clip. A kiosk is what `?full` is for, so:
  - fullscreen (faux or native) now hides the caption (`display: none`, so
    the fit doesn't count it);
  - the board's own in-board ticker comes back there (`feed: isFullscreen()`
    in web.js), which is readable at the scales fullscreen reaches;
  - the board's landscape nudge is off in fullscreen.

  After: 2× at 1280×720, the same as main, with the caption hidden. 390×844
  is unchanged. Landscape is back to main's −17 px.

**Follow-up (not from this merge):** in faux fullscreen at 844×390 landscape,
the board's top 17 px sit above the viewport.

## 296 — 2026-10-15 · Put a face on the tools (on a branch)

**Chosen (autonomy):** give the passive skill stock tiny pixel action icons.
The scenery and agent actions now read well; the text-only CLIMB / BASH /
MINE / DIG tiles were harder to connect with what the colony was doing.
Branch `codex/skill-icons`, current main `930af97` plus the approved captions
branch (merged here while its developer merge was pending).

**Watched first:** six more eight-second local runs, with frames at three and
eight seconds: desktop Clock Tower, Subway and Building Site; phone Ruins,
Desert and Ice Cave. Both Steady and Brisk, seed 3; real live ticks advanced
91→245 and 136→366 respectively. Frames and metrics are in
`/tmp/codex-watch-again/` (`watch.json`, twelve PNGs). The seasonal follow-up
below also checks the Christmas inventory beside the decorated board.

**Changed:** eight distinct 16×16 glyphs: climber against a wall, open umbrella,
fused bomb, arms-out blocker, brick steps, horizontal hammer, diagonal pick,
and shovel with soil. They use the existing tour-icon palette and dark pixel
outline, with intact text names and counts. These are still passive inventory
readouts, not buttons; the canvases are hidden from assistive technology.
Exhausted tools dim to 30%; a just-used last tool stays bright for the existing
recent-use cue. No additional listeners, timers or per-frame painting: all eight
canvases paint once on toolbar creation, survive navigation, and retain their
pixels through all nine themes. No simulation, RNG, seasonal rules or sound
changes. No new assets/dependencies; index/Draw/web source gzip delta from the
approved-caption baseline is **620 bytes**.

**Evidence:** `/tmp/codex-skill-icons/after/contact-sheet.png`: paired native-CSS
stock strips for desktop, phone, DPR 2 phone, landscape, narrow 400px board and
Christmas; the eight glyphs at 16px and 3×; full phone and desktop context.
Inspected the sheet and original phone, desktop-stock and narrow-stock shots.
Before files are in `before/`, untouched baseline in `baseline/public/`, metrics
and originals alongside the after sheet. Counts never overlap the icons, and
phone and landscape controls remain entirely in the viewport.

**Pipeline:** `tools/toolbar-icons.js` reuses one bounded local browser for all
six views and cache/lifecycle assertions, rather than launching a browser per
view. Captures wait for font/readiness, step at most 400 ticks paused, then
refresh the real host readouts. Sheet height follows measured toolbar sizes,
so adding phone/DPR rows cannot clip the context shots. Run via the shared lock:
`node tools/toolbar-icons.js <out> [public-root] [before-out] --checks`.

**Tests:** all eight complete, distinct palette-valid glyphs; bounded pixel
painting, RNG refusal, context preservation, exact 2× scaling; browser label /
count / passive semantics, icon/count bounds, DPR 1/2 and phone/landscape fit;
zero icon repaints across repeated refreshes, theme changes and navigation;
unchanged world during refresh, recent-last-use and exhausted opacity. Focused
inventory/tour/phone tests: **14 passed, zero failures/skips, 4.84 s**. `npm run
stamp` refreshed Draw/web and the page/build stamps; `git diff --check` passed.

**Full checks:** `npm run check` with coverage passed: **1,337 tests, zero
failures/skips, 319.39 s**, Factory art included. The subsequent CRAP threshold
30 passed using that coverage, maximum **30.0** (new icon painter **2.0**,
capture helper **5.0**). Both ran sequentially in one shared FIFO lock
reservation, Node heap 2,048 MB, `ulimit -v 6000000`, two workers and
120-second test timeouts. Check/coverage completion was reported immediately
to release the developer's testing window. No browser errors in the evidence.
`git diff --check` passed.
Logs: `/tmp/codex-skill-icons/focused.log`, `check.log`, `crap.log`, and
`evidence.log`.

**Next:** review and merge this branch; no push or deployment from this pass.

## 297 — 2026-10-15 · Merged the skill icons

Reviewed and merged by the loop: codex/skill-icons (46f52eb, entry 296),
`--no-ff`, as approved.
- **Base:** the branch sat on Codex's captions commit, so its LOG entry for
  captions duplicated 294 and was dropped. Its own entry is renumbered 296.
- **Stamp conflicts** (build meta, web.js `?v=`, `src/version.js`) were
  resolved by re-stamping.
- **No code was lost on either side.** Against the branch, the merged
  code differs only in main's own later changes: the fullscreen caption rule
  from 295, the standup poll and the verify wait.
- **Fullscreen layout still matches main:** 2× at 1280×720, 1× at 390×844,
  and landscape at main's −17 px.
