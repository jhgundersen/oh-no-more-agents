import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The xeno closes rather than shoots (xenoCloses). Reached here on purpose:
// whether a played level ever puts one in reach of somebody depends on the
// cast, and a new trait reshuffles every cast.
const S = loadCore("Sim.js")

function scene() {
  const w = S.generate(1, 0, 3), c = w.corridors[0], y = c.floorY - 1
  const ag = Object.assign(S.spawn(w), { x: 30.5, y, state: "walk", dir: 1 })
  w.agents = [ag]
  const en = S.makeXeno(w, 20.5, y, 1)
  w.enemies = [en]
  return { w, ag, en }
}

test("a xeno with nobody in reach lets go of its target", () => {
  const { w, en } = scene()
  w.agents = []
  en.targetId = 7
  assert.equal(S.xenoCloses(w, en), false)
  assert.equal(en.targetId, 0)
})

test("a xeno closes on somebody it can see, facing them, without touching them from afar", () => {
  const { w, ag, en } = scene()
  en.dir = -1
  assert.equal(S.xenoCloses(w, en), false)
  assert.equal(en.targetId, ag.id)
  assert.equal(en.dir, 1)
  assert.equal(ag.infected || 0, 0)
})

test("on contact it passes the infection on, then cools down, and is merely hostile meanwhile", () => {
  const { w, ag, en } = scene()
  en.x = ag.x - 1
  assert.equal(S.xenoCloses(w, en), true)
  assert.ok(ag.infected > 0)
  assert.equal(en.touchCool, S.XENO_COOL)
  assert.equal(w.infections, 1)

  const other = Object.assign(S.spawn(w), { x: ag.x, y: ag.y, state: "walk", dir: -1 })
  w.agents = [other]
  assert.equal(S.xenoCloses(w, en), true, "still acts")
  assert.equal(other.infected || 0, 0, "but cannot pass it on while cooling")
  assert.equal(en.touchCool, S.XENO_COOL - 1)
})

test("past the cap it never infects again", () => {
  const { w, ag, en } = scene()
  en.x = ag.x - 1
  w.infections = S.XENO_CAP
  assert.equal(S.xenoCloses(w, en), true)
  assert.equal(ag.infected || 0, 0)
  assert.equal(en.touchCool, 0)
})
