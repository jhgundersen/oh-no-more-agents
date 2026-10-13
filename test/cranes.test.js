import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// The Building Site's gantry cranes: a hook that lowers a walker down a hole
// in the floor to the corridor below, instead of letting them drop.

const S = loadCore("Sim.js")
const SITE = levelWith(S, "Building Site", (w) => w.cranes.length > 0)

test("cranes are the Building Site's, and always lower to another corridor's floor", () => {
  let found = 0
  for (let lv = 1; lv <= 150; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Building Site") { assert.equal(w.cranes.length, 0, `level ${lv}`); continue }
    assert.ok(w.cranes.length <= S.CRANE_MAX)
    for (const k of w.cranes) {
      found++
      assert.ok(w.corridors.some(c => c.floorY - 1 === k.land), "lands on a corridor floor")
      assert.ok(k.land > k.y, "downstream")
      assert.equal(k.y + S.dropDepth(w, k.hx, k.y), k.land, "the hole runs straight down to it")
    }
  }
  assert.ok(found > 0)
})

function underHook() {
  const w = S.generate(SITE, 0, 3), k = w.cranes[0]
  const ag = S.spawn(w)
  ag.state = "walk"; ag.x = k.ax + 0.5; ag.y = k.y; ag.dir = k.dir
  w.agents = [ag]
  return { w, k, ag }
}

test("a walker under the hook is lowered down the hole, alive and walking the same way", () => {
  const { w, k, ag } = underHook()
  S.stepCranes(w)
  assert.equal(ag.state, "hooked")
  let t = 0
  while (ag.state === "hooked" && t++ < 400) { S.stepCranes(w); w.ticks++ }
  assert.equal(ag.state, "walk")
  assert.equal(Math.floor(ag.x), k.hx)
  assert.equal(ag.y, k.land)
  assert.equal(ag.dir, k.dir, "a faller keeps its way, and so does a rider")
  assert.ok(S.solid(w, k.hx, k.land + 1), "set down on a floor")
  // Empty, the hook goes home and waits again.
  while (k.phase !== "wait" && t++ < 800) S.stepCranes(w)
  assert.equal(k.hookX, k.ax)
})

test("the hook takes nobody walking the other way, and nobody while it is out", () => {
  const { w, k, ag } = underHook()
  ag.dir = -k.dir
  S.stepCranes(w)
  assert.equal(ag.state, "walk")
  ag.dir = k.dir
  S.stepCranes(w)
  const second = S.spawn(w)
  second.state = "walk"; second.x = k.ax + 0.5; second.y = k.y; second.dir = k.dir
  w.agents.push(second)
  S.stepCranes(w)
  assert.equal(second.state, "walk")
})

test("a rider who is lost on the way frees the hook", () => {
  const { w, k, ag } = underHook()
  S.stepCranes(w)
  ag.gone = true
  S.stepCranes(w)
  assert.equal(k.phase, "back")
  assert.equal(k.who, -1)
})

test("a hook whose way is blocked lets go, and the rider falls like anyone", () => {
  const { w, k, ag } = underHook()
  S.stepCranes(w)
  for (let y = k.land - 3; y <= k.land; y++) w.terrain[y * S.COLS + k.hx] = S.ROCK
  let t = 0
  while (ag.state === "hooked" && t++ < 600) S.stepCranes(w)
  assert.equal(ag.state, "walk")
  assert.notEqual(k.phase, "down")
})
