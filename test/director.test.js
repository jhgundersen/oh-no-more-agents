import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The director's nudge, branch by branch, on hand-built ground. Since an
// agent getting closer to the door resets the level's stall count (LOG 323)
// played levels reach it less often, so it is pinned here instead.
const S = loadCore("Sim.js")

function room() {
  const w = S.generate(1, 0, 3), k = w.k
  w.terrain.fill(k.EMPTY)
  for (let x = 0; x < k.COLS; x++) w.terrain[30 * k.COLS + x] = k.ROCK
  w.pits = []; w.hazards = []; w.enemies = []; w.agents = []; w.lifts = []; w.mines = []; w.buildSites = []
  for (const s of Object.keys(w.skills)) w.skills[s] = 5
  w.exit = { x: 80, y: 25, w: 6, h: 5 }                       // on this floor
  const ag = Object.assign(S.spawn(w), { x: 40.5, y: 29, dir: 1, state: "walk" })
  w.agents = [ag]
  return { w, ag, k }
}

test("on the door's floor, a wall ahead gets a basher", () => {
  const { w, ag, k } = room()
  for (let y = 24; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  S.directorNudge(w, ag)
  assert.equal(ag.state, "bash")
})

test("below the door, the nudge reaches for a way up, never a bash", () => {
  const { w, ag, k } = room()
  w.exit = { x: 80, y: 5, w: 6, h: 5 }                        // three floors up
  for (let y = 20; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  S.directorNudge(w, ag)
  assert.notEqual(ag.state, "bash")
  assert.ok(["climb", "build", "walk"].includes(ag.state), ag.state)
})

test("open ground and nothing to bash: a staircase or a bridge, or it is left walking", () => {
  const { w, ag } = room()
  S.directorNudge(w, ag)
  assert.ok(["build", "walk", "fall", "float"].includes(ag.state), ag.state)
  assert.notEqual(ag.state, "bomb", "no bomb on open ground")
})

test("boxed in with the rescues spent, the last resort is one bomb a level", () => {
  const { w, ag, k } = room()
  for (const s of Object.keys(w.skills)) w.skills[s] = 0
  w.skills.bomber = 3
  for (let y = 24; y < 30; y++) { w.terrain[y * k.COLS + 38] = k.STEEL; w.terrain[y * k.COLS + 42] = k.STEEL }
  for (let x = 38; x <= 42; x++) w.terrain[23 * k.COLS + x] = k.STEEL
  w.rescues = 7; w.bombsUsed = 0
  S.directorNudge(w, ag)
  assert.equal(ag.state, "bomb")
  const other = Object.assign(S.spawn(w), { x: 40.5, y: 29, dir: 1, state: "walk" })
  S.directorNudge(w, other)
  assert.equal(other.state, "walk", "only one a level")
})

// climbOut: the director's way up for an agent below the door.
function pit() {
  const r = room(), { w, k } = r
  w.exit = { x: 80, y: 5, w: 6, h: 5 }                        // well above
  return r
}
const pay = (w, skill) => { if (!(w.skills[skill] > 0)) return false; w.skills[skill]--; return true }

test("climbOut climbs the wall it faces, or turns to the one behind it", () => {
  let { w, ag, k } = pit()
  for (let y = 25; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  assert.equal(S.climbOut(w, ag, pay), true)
  assert.equal(ag.state, "climb"); assert.equal(ag.dir, 1)
  ;({ w, ag, k } = pit())
  for (let y = 25; y < 30; y++) w.terrain[y * k.COLS + 39] = k.DIRT
  assert.equal(S.climbOut(w, ag, pay), true)
  assert.equal(ag.dir, -1, "turned to the wall behind")
})

test("climbOut declines: no wall, a wall too tall, no climbers, or the door not above", () => {
  let { w, ag, k } = pit()
  assert.equal(S.climbOut(w, ag, pay), false, "open floor both ways")
  ;({ w, ag, k } = pit())
  for (let y = 0; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  assert.equal(S.climbOut(w, ag, pay), false, "taller than a rescue climb")
  ;({ w, ag, k } = pit())
  for (let y = 25; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  w.skills.climber = 0
  assert.equal(S.climbOut(w, ag, pay), false, "nobody to pay")
  assert.equal(ag.state, "walk")
  ;({ w, ag, k } = room())
  for (let y = 25; y < 30; y++) w.terrain[y * k.COLS + 41] = k.DIRT
  assert.equal(S.climbOut(w, ag, pay), false, "the door is on this floor")
})
