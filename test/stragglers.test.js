import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The straggler fixes from the play-test (iteration 199): a bridge that lands
// with a hole still in its stride, a blocker in the last brick's cell, a
// spent build cap at a one-cell gap, and a hero's move spent on the wrong wall.
const S = loadCore("Sim.js")

// An open box: floor along row `floor`, a bottomless one-cell hole at `hole`.
function box(hole = 40, floor = 30) {
  const w = S.generate(1, 0, 3), k = w.k
  w.terrain.fill(k.EMPTY)
  for (let x = 0; x < k.COLS; x++) w.terrain[floor * k.COLS + x] = k.DIRT
  for (let y = floor; y < k.ROWS; y++) w.terrain[y * k.COLS + hole] = k.EMPTY
  w.pits = []; w.hazards = []; w.enemies = []; w.agents = []; w.lifts = []
  return w
}

test("a bridge has not landed while the nearer cell of its stride is still a hole", () => {
  const w = box(40)
  const ag = Object.assign(S.spawn(w), { x: 39.6, y: 29, dir: 1, state: "build", buildY: 29 })
  assert.equal(S.dropDepth(w, 40, 29), Infinity)
  assert.equal(S.bridgeLanded(w, ag, 41.6, 29), false, "x40 is still open")
  ag.x = 40.6
  assert.equal(S.bridgeLanded(w, ag, 42.6, 29), true, "both cells of the stride are floor")
})

test("laying a brick lifts a blocker standing in its cell, and it keeps blocking", () => {
  const w = box(60)
  const blocker = Object.assign(S.spawn(w), { x: 42.2, y: 29, state: "block" }), builder = S.spawn(w)
  w.agents = [blocker, builder]
  assert.equal(S.makeBuildRoom(w, [{ x: 42, y: 29 }], builder), true)
  assert.equal(blocker.y, 28)
  assert.equal(blocker.state, "block")
  const camper = Object.assign(S.spawn(w), { x: 50.2, y: 29, state: "camp" })
  w.agents.push(camper)
  assert.equal(S.makeBuildRoom(w, [{ x: 50, y: 29 }], builder), false, "other busy states still hold the brick up")
})

test("the last ones out may bridge a crossing past their build cap, but not lay free staircases", () => {
  const w = box(40)
  const ag = Object.assign(S.spawn(w), { x: 38.6, y: 29, dir: 1, state: "walk", trait: "steady", built: 2 })
  w.agents = [ag]
  w.released = w.toRelease; w.saved = 0; w.lost = 0
  assert.equal(S.lastOut(w), false)
  assert.equal(S.canStartBuild(w, ag, true), false, "mid-level, the cap holds")
  w.saved = w.toRelease - 1
  assert.equal(S.lastOut(w), true)
  assert.equal(S.canStartBuild(w, ag, true), true, "a crossing")
  assert.equal(S.canStartBuild(w, ag, false), false, "a free choice")
})

test("a hero facing away from home turns at a wall and keeps its move", () => {
  const w = box(90)
  for (let y = 24; y < 30; y++) w.terrain[y * w.k.COLS + 30] = w.k.DIRT      // a wall west of the agent
  w.exit = { x: 70, y: 25, w: 6, h: 5 }                                     // home is east
  const ag = Object.assign(S.spawn(w), { x: 31.4, y: 29, dir: -1, state: "walk", special: "quarryman", cool: 0 })
  w.special = "quarryman"; w.specialSpec = S.specialSpec("quarryman")
  w.agents = [ag]
  S.specialAtWall(w, ag)
  assert.equal(ag.dir, 1, "turned for home")
  assert.equal(ag.state, "walk", "no trick spent")
  assert.equal(ag.cool, 0, "and no cooldown")
})

test("a crossing builder knocks a thin scrap of debris out of its way, but not a wall or steel", () => {
  const w = box(90)
  w.terrain[27 * w.k.COLS + 45] = w.k.DIRT; w.terrain[28 * w.k.COLS + 45] = w.k.DIRT
  assert.equal(S.trimOverhang(w, 45, 29), true)
  assert.ok(!S.solid(w, 45, 27) && !S.solid(w, 45, 28))
  for (let y = 26; y <= 29; y++) w.terrain[y * w.k.COLS + 50] = w.k.DIRT
  assert.equal(S.trimOverhang(w, 50, 29), false, "a wall is a wall")
  w.terrain[28 * w.k.COLS + 55] = w.k.STEEL
  assert.equal(S.trimOverhang(w, 55, 29), false, "steel stays")
  assert.equal(S.trimOverhang(w, 60, 29), false, "nothing to trim")
})

test("a hero on a nearly-done cooldown waits at a wall toward home; far off, or facing away, it turns", () => {
  const w = box(90)
  for (let y = 24; y < 30; y++) w.terrain[y * w.k.COLS + 40] = w.k.DIRT      // wall east of the agent
  w.exit = { x: 70, y: 25, w: 6, h: 5 }
  w.special = "quarryman"; w.specialSpec = S.specialSpec("quarryman")
  const hero = (cool, dir) => Object.assign(S.spawn(w), { x: 39.4, y: 29, dir, state: "walk", special: "quarryman", cool, still: 9 })
  const waiting = hero(S.HERO_WAIT, 1)
  S.specialAtWall(w, waiting)
  assert.equal(waiting.dir, 1); assert.ok(waiting.waitFor > 0); assert.equal(waiting.still, 0)
  const long = hero(S.HERO_WAIT + 1, 1)
  S.specialAtWall(w, long)
  assert.equal(long.dir, -1, "too long a wait: walk it off")
})

test("out of a current, a diver faces where it was going again", () => {
  const w = box(90)
  const ag = Object.assign(S.spawn(w), { x: 50.5, y: 29, dir: 1, state: "walk", sweptFor: 1, sweptDir: -1, sweptFrom: 1, sweptX0: 45, sweptX1: 55 })
  S.tickAgentTimers(w, ag)
  assert.equal(ag.sweptFor, 0)
  assert.equal(ag.dir, 1, "home was east")
  assert.equal(ag.sweptFrom, 0)
})

test("alone at a current that is running, a diver waits at its edge; in company, or once inside, it does not", () => {
  const w = box(90)
  w.hazards = [{ kind: "current", phase: "fire", zx0: 45, zx1: 52, zy0: 25, zy1: 29, dir: -1, known: true, throttled: 0, wrecked: false }]
  // Its reach runs two cells past the zone either side, so the edge is x43.
  const ag = Object.assign(S.spawn(w), { x: 42.2, y: 29, dir: 1, state: "walk" })
  w.agents = [ag]
  assert.ok(S.currentAhead(w, ag, 43.1))
  assert.equal(S.aloneHere(w, ag, 6), true)
  S.walkHazardAhead(w, ag, 43.1, 43, 29)
  assert.equal(ag.dir, 1); assert.equal(ag.x, 42.2); assert.ok(ag.waitFor > 0)
  const friend = Object.assign(S.spawn(w), { x: 39, y: 29, state: "walk" }); w.agents.push(friend)
  assert.equal(S.aloneHere(w, ag, 6), false)
  w.hazards[0].phase = "rest"
  assert.equal(S.currentAhead(w, ag, 43.1), null, "resting: walk on")
  w.hazards[0].phase = "fire"; ag.x = 46.5
  assert.equal(S.currentAhead(w, ag, 47.1), null, "already in it")
})

test("at a shut clockwork gate an agent waits at it, facing it, rather than walking away", () => {
  const w = box(90)
  for (let y = 26; y <= 29; y++) w.terrain[y * w.k.COLS + 45] = w.k.STEEL
  w.gates = [{ x0: 45, x1: 45, top: 26, bottom: 29, open: false }]
  const ag = Object.assign(S.spawn(w), { x: 44.4, y: 29, dir: 1, state: "walk", still: 7 })
  w.agents = [ag]
  assert.equal(S.wallBypassed(w, ag), true)
  assert.equal(ag.dir, 1); assert.ok(ag.waitFor > 0); assert.equal(ag.still, 0)
  w.gates[0].open = true
  assert.equal(S.gateShutAt(w, 45, 29), null)
})

// Ordinary agents meet a known fixture's reach in walkHazardZone first, which
// may be lethal all the time and so still turns them; a hero goes straight to
// walkHazardAhead, which only fires while the fixture charges or fires.
test("alone at a fixture about to fire, a hero waits at the edge of its reach", () => {
  const w = box(90)
  w.hazards = [{ kind: "flame", phase: "charge", zx0: 56, zx1: 59, zy0: 25, zy1: 29, floorY: 30, dir: -1, known: true, throttled: 0, wrecked: false, name: "Flame" }]
  // Stood down, as on level 36, or Beam Search would dig in at the sight of it.
  w.special = "beamsearch"; w.specialSpec = S.specialSpec("beamsearch"); w.stoodDown = true
  for (const special of ["beamsearch"]) {
    const ag = Object.assign(S.spawn(w), { x: 40, y: 29, dir: 1, state: "walk", special, cool: 999 })
    w.agents = [ag]
    let x = ag.x
    for (let t = 0; t < 400 && ag.waitFor === 0; t++) { x = ag.x; S.agentActs(w, ag) }
    assert.ok(ag.waitFor > 0, "it stopped")
    assert.equal(ag.dir, 1, "facing the fixture, not walking away")
    assert.equal(S.hazardZoneAt(w, Math.floor(ag.x), 29, true), null, "outside the reach")
  }
})

test("a stood-down camper at a wall toward home borrows the colony's tools; facing away, it turns", () => {
  const w = box(90)
  for (let y = 25; y <= 29; y++) w.terrain[y * w.k.COLS + 45] = w.k.DIRT
  w.exit = { x: 80, y: 25, w: 6, h: 5 }
  w.special = "beamsearch"; w.specialSpec = S.specialSpec("beamsearch"); w.stoodDown = true
  const ag = Object.assign(S.spawn(w), { x: 44.4, y: 29, dir: 1, state: "walk", special: "beamsearch" })
  w.agents = [ag]
  const before = JSON.stringify(w.skills)
  S.specialAtWall(w, ag)
  assert.notEqual(JSON.stringify(w.skills), before, "a tool was spent")
  assert.notEqual(ag.state, "camp")
  const away = Object.assign(S.spawn(w), { x: 46.6, y: 29, dir: -1, state: "walk", special: "beamsearch" })
  S.specialAtWall(w, away)
  assert.equal(away.dir, 1, "facing away from home: turned")
})

test("a hero whose own move cannot pass a wall toward home borrows the colony's tools — once the rest are settled", () => {
  const w = box(90)
  // A thin wall with no floor beyond it for ten cells: nothing to phase onto,
  // but a climber or a basher can still take it.
  for (let y = 26; y <= 29; y++) w.terrain[y * w.k.COLS + 45] = w.k.DIRT
  for (let x = 46; x <= 56; x++) w.terrain[30 * w.k.COLS + x] = w.k.EMPTY
  w.exit = { x: 80, y: 25, w: 6, h: 5 }
  w.special = "wraith"; w.specialSpec = S.specialSpec("wraith")
  const hero = () => Object.assign(S.spawn(w), { x: 44.4, y: 29, dir: 1, state: "walk", special: "wraith", cool: 0 })
  w.released = w.toRelease; w.saved = 0
  const busy = hero(); w.agents = [busy]
  const before = JSON.stringify(w.skills)
  S.specialAtWall(w, busy)
  assert.equal(JSON.stringify(w.skills), before, "mid-level: the colony keeps its tools")
  assert.equal(busy.dir, -1)
  w.saved = w.toRelease - 1
  const last = hero(); w.agents = [last]
  S.specialAtWall(w, last)
  assert.notEqual(JSON.stringify(w.skills), before, "last out: it borrows")
})

test("a stomper with home on its own floor, last out at a wall toward home, borrows the colony's tools", () => {
  const w = box(90)
  for (let y = 24; y <= 29; y++) w.terrain[y * w.k.COLS + 45] = w.k.DIRT
  w.exit = { x: 80, y: 25, w: 6, h: 5 }                                     // same floor: no stomping
  w.special = "piledriver"; w.specialSpec = S.specialSpec("piledriver")
  w.released = w.toRelease; w.saved = w.toRelease - 1
  const ag = Object.assign(S.spawn(w), { x: 44.4, y: 29, dir: 1, state: "walk", special: "piledriver", cool: 0 })
  w.agents = [ag]
  const before = JSON.stringify(w.skills)
  S.specialAtWall(w, ag)
  assert.notEqual(JSON.stringify(w.skills), before)
  assert.equal(ag.dir, 1)
})

test("the last one out lays a mine at a wall it cannot climb or bash, without waiting out its patience", () => {
  const w = box(90)
  for (let y = 20; y <= 25; y++) for (let x = 10; x <= 80; x++) w.terrain[y * w.k.COLS + x] = w.k.ROCK   // a low ceiling
  for (let y = 27; y <= 29; y++) for (let x = 45; x <= 47; x++) w.terrain[y * w.k.COLS + x] = w.k.DIRT   // no room on top
  w.exit = { x: 80, y: 25, w: 6, h: 5 }
  w.skills.basher = 0; w.skills.climber = 0; w.skills.builder = 0
  const ag = () => Object.assign(S.spawn(w), { x: 44.4, y: 29, dir: 1, state: "walk", idle: 10, still: 0, trait: "steady" })
  w.released = w.toRelease; w.saved = 0; w.mines = []
  const busy = ag(); w.agents = [busy]
  S.hitWall(w, busy)
  assert.equal(w.mines.length, 0, "mid-level: it waits out its patience first")
  w.saved = w.toRelease - 1
  const last = ag(); w.agents = [last]
  S.hitWall(w, last)
  assert.equal(w.mines.length, 1, "last out: a mine at once")
  assert.notEqual(last.state, "bomb", "a mine, never the agent itself")
})

test("with home below, a hero waits out its cooldown only at the wall on the way home", () => {
  const w = box(90)
  w.exit = { x: 10, y: 40, w: 6, h: 5 }                                    // below and to the west
  w.special = "collapse"; w.specialSpec = S.specialSpec("collapse")
  const hero = dir => Object.assign(S.spawn(w), { x: 50.5, y: 29, dir, state: "walk", special: "collapse", cool: 50 })
  assert.equal(S.crossingHelps(w, hero(1)), true, "crossingHelps says yes either way")
  assert.equal(S.facingHome(w, hero(1)), false)
  assert.equal(S.facingHome(w, hero(-1)), true)
  const west = hero(-1); w.agents = [west]
  S.specialAtWall(w, west)
  assert.equal(west.dir, -1); assert.ok(west.waitFor > 0, "waits at the wall toward home")
  const east = hero(1); w.agents = [east]
  S.specialAtWall(w, east)
  assert.equal(east.dir, -1, "turns at the other")
})

test("a hero among the last out gets the rescue after 200 idle ticks, not 900 — except on a tower", () => {
  const w = box(90)
  w.special = "wraith"; w.specialSpec = S.specialSpec("wraith")
  w.released = w.toRelease; w.saved = w.toRelease - 1
  const hero = Object.assign(S.spawn(w), { x: 40.5, y: 29, dir: 1, state: "walk", special: "wraith", idle: S.HERO_LAST_PATIENCE + 1, markD: 0, goalMark: S.goalX(w, { x: 40, y: 29 }), rescueCool: 0 })
  w.agents = [hero]
  S.watchProgress(w, hero)
  assert.equal(hero.rescueCool, 90, "the rescue ran (specialEscape sets its throttle)")
  const plain = Object.assign(S.spawn(w), { x: 40.5, y: 29, dir: 1, state: "walk", idle: S.HERO_LAST_PATIENCE + 1, markD: 0, rescueCool: 0 })
  plain.goalMark = S.goalX(w, plain); w.agents = [plain]
  S.watchProgress(w, plain)
  assert.equal(plain.idle, S.HERO_LAST_PATIENCE + 2, "an ordinary straggler keeps the long patience")
  const tower = Object.assign(S.spawn(w), { x: 40.5, y: 29, dir: 1, state: "walk", special: "wraith", idle: S.HERO_LAST_PATIENCE + 1, markD: 0, rescueCool: 0 })
  tower.goalMark = S.goalX(w, tower); w.agents = [tower]; w.lifts = [{}]
  S.watchProgress(w, tower)
  assert.equal(tower.rescueCool, 0, "not on a tower")
})

test("a rescue that prefers a mine digs when the miners are gone", () => {
  const w = box(90)
  for (let y = 31; y <= 40; y++) for (let x = 0; x < w.k.COLS; x++) w.terrain[y * w.k.COLS + x] = w.k.EMPTY
  for (let x = 0; x < w.k.COLS; x++) w.terrain[45 * w.k.COLS + x] = w.k.DIRT          // a floor below
  w.exit = { x: 80, y: 40, w: 6, h: 5 }
  w.corridors.push({ x0: 1, x1: 98, floorY: 45, dir: 1, startX: 2, handoffX: 90 })
  w.skills.miner = 0; w.skills.digger = 3
  const ag = Object.assign(S.spawn(w), { id: 2, x: 40.5, y: 29, dir: 1, state: "walk" })        // even id: prefers a mine
  w.agents = [ag]
  assert.ok(S.canDescendHere(w, ag, true), "the geometry allows a descent")
  assert.equal(S.startDescent(w, ag, S.take, true, true, false, true), true)
  assert.equal(ag.state, "dig"); assert.equal(w.skills.digger, 2)
})

test("a hero may dig through a last layer over a lethal drop; an ordinary agent without umbrellas may not", () => {
  const w = box(90)
  for (let y = 31; y <= 61; y++) for (let x = 0; x < w.k.COLS; x++) w.terrain[y * w.k.COLS + x] = w.k.EMPTY
  for (let x = 0; x < w.k.COLS; x++) w.terrain[60 * w.k.COLS + x] = w.k.DIRT          // far below: lethal, not bottomless
  w.skills.floater = 0
  const hero = Object.assign(S.spawn(w), { x: 40.5, y: 29, special: "wraith" }), plain = Object.assign(S.spawn(w), { x: 40.5, y: 29 })
  w.special = "wraith"; w.specialSpec = S.specialSpec("wraith")
  assert.equal(S.digOpensDeath(w, plain, 40, 29), true)
  assert.equal(S.digOpensDeath(w, hero, 40, 29), false)
  for (let x = 0; x < w.k.COLS; x++) w.terrain[60 * w.k.COLS + x] = w.k.EMPTY          // bottomless
  assert.equal(S.digOpensDeath(w, hero, 40, 29), true, "but not into nothing")
})

test("a walker on the exit's floor heading for the door counts as moving, however long since its best", () => {
  const w = box(90)
  w.exit = { x: 10, y: 25, w: 6, h: 5 }                                    // floor 30, west
  const ag = Object.assign(S.spawn(w), { x: 30.5, y: 29, dir: -1, state: "walk", idle: 900 })
  assert.equal(S.homeStretch(w, ag), true)
  const counts = { active: 0, blockers: 0, moving: 0 }
  S.tallyAgent(w, counts, ag)
  assert.equal(counts.moving, 1)
  ag.dir = 1
  assert.equal(S.homeStretch(w, ag), false, "walking away from the door")
  ag.dir = -1; ag.y = 20
  assert.equal(S.homeStretch(w, ag), false, "another floor")
})

test("the Ice Cave gets a slightly bigger toolbar, and nothing else about the level changes", () => {
  const ice = S.BIOMES.indexOf("Ice Cave") + 1, other = ice + 1
  const a = S.generate(ice, 0, 7), b = S.generate(other, 0, 7)
  assert.equal(a.biome, "Ice Cave")
  assert.ok(S.ICE_BASHERS > 0 && S.ICE_CLIMBERS > 0)
  // The bonus is added after the roll: take it off and the toolbar is the roll.
  assert.ok(a.skills.basher - S.ICE_BASHERS >= 9 && a.skills.basher - S.ICE_BASHERS <= 15)
  assert.ok(a.skills.climber - S.ICE_CLIMBERS >= 12 && a.skills.climber - S.ICE_CLIMBERS <= 18)
  assert.ok(b.skills.basher <= 15 || b.ascending, "other biomes are untouched")
})
