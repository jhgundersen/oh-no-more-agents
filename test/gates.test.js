import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// The Clock Tower's clockwork gates: doorways through thin walls, open and
// shut on the tower's clock.

const S = loadCore("Sim.js")
const TOWER = levelWith(S, "Clock Tower", (w) => w.gates.length > 0)

test("gates are the Clock Tower's, and each is a doorway with a lintel", () => {
  let found = 0
  for (let lv = 1; lv <= 160; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Clock Tower") { assert.equal(w.gates.length, 0, `level ${lv}`); continue }
    assert.ok(w.gates.length <= S.GATE_MAX)
    for (const g of w.gates) {
      found++
      assert.equal(g.bottom - g.top + 1, S.AGENT_H)
      assert.ok(g.x1 - g.x0 + 1 <= S.GATE_THICK)
      for (let x = g.x0; x <= g.x1; x++) assert.ok(S.solid(w, x, g.top - 1), "a lintel over it")
    }
  }
  assert.ok(found > 0)
})

test("a gate opens and shuts on the clock, without counting as carving", () => {
  const w = S.generate(TOWER, 0, 3), g = w.gates[0]
  w.agents = []
  const carved = w.carved, seen = new Set()
  for (let t = 0; t < S.GATE_PERIOD * 2; t++) {
    w.ticks = t; S.stepGates(w); seen.add(g.open)
    for (let y = g.top; y <= g.bottom; y++) assert.equal(S.solid(w, g.x0, y), !g.open)
  }
  assert.deepEqual([...seen].sort(), [false, true])
  assert.equal(w.carved, carved, "a clock ticking is not progress")
})

test("a gate never shuts on somebody standing in it", () => {
  const w = S.generate(TOWER, 0, 3), g = w.gates[0]
  let t = 0
  while (!S.gateOpenAt(g, t)) t++
  w.ticks = t; S.stepGates(w)
  const ag = S.spawn(w); ag.state = "walk"; ag.x = g.x0 + 0.5; ag.y = g.bottom
  w.agents = [ag]
  while (S.gateOpenAt(g, t)) t++
  w.ticks = t; S.stepGates(w)
  assert.equal(g.open, true)
  w.agents = []; S.stepGates(w)
  assert.equal(g.open, false)
})

test("a walker at a shut gate waits for it rather than bashing it", () => {
  const w = S.generate(TOWER, 0, 3), g = w.gates[0]
  let t = 0
  while (S.gateOpenAt(g, t)) t++
  w.ticks = t; S.stepGates(w)
  assert.equal(g.open, false)
  const ag = S.spawn(w); ag.state = "walk"; ag.y = g.bottom
  ag.dir = 1; ag.x = g.x0 - 1 + 0.5
  w.agents = [ag]
  const bashers = w.skills.basher
  S.hitWall(w, ag)
  assert.equal(w.skills.basher, bashers)
  assert.notEqual(ag.state, "bash")
  assert.ok(ag.waitFor > 0)
})
