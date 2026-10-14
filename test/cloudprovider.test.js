import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Cloud Provider: hands a colleague without one an umbrella of its own.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

function board() {
  const w = S.generate(61, 0, 1898)
  w.special = "cloudprovider"; w.specialSpec = S.specialSpec("cloudprovider")
  const hero = S.spawn(w), near = S.spawn(w), far = S.spawn(w), above = S.spawn(w)
  Object.assign(hero, { special: "cloudprovider", state: "walk", x: 40, y: 16, cool: 0 })
  Object.assign(near, { state: "walk", x: 46, y: 16, ownBrolly: false })
  Object.assign(far, { state: "walk", x: 70, y: 16, ownBrolly: false })
  Object.assign(above, { state: "walk", x: 41, y: 4, ownBrolly: false })
  w.agents = [hero, near, far, above]
  return { w, hero, near, far, above }
}

test("the nearest colleague on its floor with no umbrella gets one, kept, and the hero cools down", () => {
  const { w, hero, near, far, above } = board()
  const stock = w.skills.floater
  assert.equal(S.provisionBrolly(w, hero), true)
  assert.ok(near.ownBrolly)
  assert.ok(!far.ownBrolly, "out of reach")
  assert.ok(!above.ownBrolly, "another floor")
  assert.equal(w.skills.floater, stock, "not from the stock")
  assert.equal(hero.cool, S.specialSpec("cloudprovider").cool)
  assert.equal(w.feed.at(-1).text, "AGENT " + String(near.id).padStart(3, "0") + " · GETS AN UMBRELLA")
  assert.equal(S.provisionBrolly(w, hero), false, "nobody else in reach without one")
})

test("it is one of the heroes, with lines for its card and its own way down", () => {
  assert.ok(S.SPECIALS.some(s => s.id === "cloudprovider" && s.act === "provision" && s.height === "brolly"))
  assert.ok(D.SPECIAL_FACTS.cloudprovider.length >= 3)
  assert.equal(typeof D.GEAR_DRAW.brolly, "function")
})

test("the thrown umbrella flies for a moment, read-only, then is gone", () => {
  const { w, hero } = board()
  const pal = P.build(themeOf("tokyo-night").theme, 8)
  S.provisionBrolly(w, hero)
  const shots = []
  for (const age of [0, 8, 16, D.PROVISION_FLIGHT + 1]) {
    w.ticks = w.provisionFx.t + age
    const img = canvas(400, 248), before = JSON.stringify(w)
    D.drawProvisionFx(img.ctx, w, pal, w.provisionFx)
    assert.equal(JSON.stringify(w), before)
    shots.push(img.buf)
  }
  assert.notDeepEqual(shots[0], shots[1])
  assert.notDeepEqual(shots[1], shots[2])
  assert.deepEqual(shots[3], canvas(400, 248).buf, "gone after the flight")
})

test("the ticker hears about the first two hand-outs only", () => {
  const { w, hero } = board()
  const notes = () => w.feed.filter(f => f.text.endsWith("GETS AN UMBRELLA")).length
  for (let i = 0; i < 4; i++) {
    const a = S.spawn(w); Object.assign(a, { state: "walk", x: 42, y: 16, ownBrolly: false }); w.agents.push(a)
    hero.cool = 0; S.provisionBrolly(w, hero)
  }
  assert.equal(notes(), 2)
})
