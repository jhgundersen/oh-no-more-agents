import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

const S = loadCore("Sim.js")
function fixture() {
  const w = S.generate(1, 0, 99)
  w.terrain.fill(S.EMPTY)
  for (let x = 0; x < S.COLS; x++) w.terrain[13 * S.COLS + x] = S.DIRT
  const en = S.makeXeno(w, 10, 12, 1), ag = S.spawn(w)
  Object.assign(ag, { id: 100, x: 11, y: 12, state: "wait", infected: 0 })
  w.agents = [ag]; w.enemies = [en]; w.infections = 0
  return { w, en, ag }
}

test("Xeno contact acquires prey, respects range and cooldown, and bounds infections", () => {
  for (const cool of [0, 2]) {
    const { w, en } = fixture(); w.agents = []; en.touchCool = cool; en.targetId = 99
    assert.equal(S.xenoCloses(w, en), false)
    assert.equal(en.targetId, 0); assert.equal(en.touchCool, Math.max(0, cool - 1))
  }
  for (const [x, y] of [[20, 12], [10.5, 14.5]]) {
    const { w, en, ag } = fixture(); Object.assign(ag, { x, y })
    assert.equal(S.xenoCloses(w, en), false)
    assert.equal(en.targetId, ag.id); assert.equal(en.dir, 1)
    assert.equal(ag.infected, 0); assert.equal(ag.wounds || 0, 0)
  }
  for (const [x, cool] of [[9.5, 0], [11, 1]]) {
    const { w, en, ag } = fixture(); ag.x = x; en.touchCool = cool
    assert.equal(S.xenoCloses(w, en), true)
    assert.equal(en.dir, x < en.x ? -1 : 1); assert.equal(en.targetId, ag.id)
    assert.equal(ag.infected, S.INCUBATION); assert.equal(w.infections, 1)
    assert.equal(en.touchCool, S.XENO_COOL); assert.equal(ag.wounds || 0, 0)
  }
  for (const reason of ["cooldown", "cap", "carrier"]) {
    const { w, en, ag } = fixture()
    en.touchCool = reason === "cooldown" ? 2 : 0
    w.infections = reason === "cap" ? S.XENO_CAP : reason === "carrier" ? 1 : 0
    ag.infected = reason === "carrier" ? 3 : 0
    const infections = w.infections
    assert.equal(S.xenoCloses(w, en), true)
    assert.equal(w.infections, infections); assert.equal(ag.infected, reason === "carrier" ? 3 : 0)
    assert.equal(ag.wounds, 1); assert.equal(ag.state, "stunned")
    assert.equal(en.touchCool, reason === "cooldown" ? 1 : 0)
  }
})
