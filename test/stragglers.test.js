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
