import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
const S = loadCore("Sim.js")
function platform() {
  const w = S.generate(18, 0, 99)
  w.terrain.fill(w.k.EMPTY)
  w.terrain.fill(w.k.ROCK, 31 * w.k.COLS, 32 * w.k.COLS)
  w.hazards = [{ kind: "grinder", zx0: 40, zx1: 45, zy0: 28, zy1: 30, floorY: 30, dir: 1, phase: "charge", known: true }]
  const ag = S.spawn(w)
  Object.assign(ag, { x: 40.5, y: 30, dir: 1, state: "walk", trait: "steady" })
  w.agents = [ag]
  return { w, ag, h: w.hazards[0] }
}
test("a commuter flees a charging platform fixture by the open lip, respecting walls and drops", () => {
  const { w, ag, h } = platform()
  assert.equal(S.fleeHazard(w, ag), -1)
  ag.x = 44.5
  assert.equal(S.fleeHazard(w, ag), 1)
  S.setCell(w, 46, 30, w.k.ROCK)
  assert.equal(S.fleeHazard(w, ag), -1, "other lip when the near one is blocked")
  S.setCell(w, 39, 31, w.k.EMPTY)
  assert.equal(S.fleeHazard(w, ag), 0, "no route through a wall or off a drop")
  for (const changes of [{ wrecked: true }, { throttled: 10 }, { phase: "idle" }, { known: false }, { zx0: 60, zx1: 65 }]) {
    const saved = { ...h }; Object.assign(h, changes)
    assert.equal(S.fleeHazard(w, ag), 0)
    Object.assign(h, saved)
  }
})
test("approaching a hazard advances under a shield, escapes from inside, or waits outside", () => {
  for (const dir of [1, -1]) {
    const { w, ag } = platform()
    ag.dir = dir
    S.walkHazardAhead(w, ag, ag.x + dir * 0.2, 40, 30)
    assert.equal(ag.dir, -1, "takes the nearer open lip")
    assert.ok(ag.x < 40.5)
  }
  const { w, ag } = platform()
  ag.x = 35.5; w.skills.blocker = 0
  S.walkHazardAhead(w, ag, 35.7, 35, 30)
  assert.equal(ag.dir, -1, "turns outside the known zone")
  ag.dir = 1; w.skills.blocker = 3
  S.walkHazardAhead(w, ag, 35.7, 35, 30)
  assert.equal(ag.state, "block", "holds the following queue outside the fixture")
  ag.state = "walk"; ag.special = "bulwark"; ag.shieldFor = 10; ag.shieldHeld = 0
  S.walkHazardAhead(w, ag, 35.7, 35, 30)
  assert.equal(ag.x, 35.7, "shield carrier advances")
  ag.shieldHeld = S.SHIELD_MAX
  S.walkHazardAhead(w, ag, 35.9, 35, 30)
  assert.equal(ag.x, 35.7, "tired shield carrier waits")
})
