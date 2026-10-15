import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// One umbrella each: the first fall that needs one takes it from the colony's
// stock, and the agent keeps it — furled, like a cane — for the next.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

function walker() {
  const w = S.generate(284, 0, 2001)
  while (!w.agents.some(a => a.state === "walk")) S.step(w)
  return [w, w.agents.find(a => a.state === "walk")]
}

function dropUnder(w, ag) {
  const x = Math.floor(ag.x)
  for (let y = Math.floor(ag.y) + 1; y < S.ROWS - 2; y++) w.terrain[y * S.COLS + x] = 0
}

test("the first deadly fall takes an umbrella from the stock; the next one uses the same umbrella", () => {
  const [w, ag] = walker()
  const stock = w.skills.floater
  dropUnder(w, ag)
  S.beginUncontrolledFall(w, ag)
  assert.ok(ag.floater && ag.ownBrolly)
  assert.equal(w.skills.floater, stock - 1)
  ag.floater = false; ag.state = "walk"          // landed: the canopy folds, the umbrella is kept
  S.beginUncontrolledFall(w, ag)
  assert.ok(ag.floater)
  assert.equal(w.skills.floater, stock - 1, "no second umbrella")
})

test("an agent that kept its umbrella floats even when the stock is empty", () => {
  const [w, ag] = walker()
  ag.ownBrolly = true
  w.skills.floater = 0
  dropUnder(w, ag)
  S.beginUncontrolledFall(w, ag)
  assert.ok(ag.floater)
})

test("in real play nobody draws a second umbrella from the stock", () => {
  for (const lv of [2, 37, 113, 284]) {
    const w = S.generate(lv, 0, lv * 31 + 7), start = w.skills.floater
    while (!w.done && w.ticks < 6000) S.step(w)
    const owners = w.agents.filter(a => a.ownBrolly).length
    assert.ok(start - w.skills.floater <= owners, `level ${lv}: ${start - w.skills.floater} taken, ${owners} owners`)
  }
})

test("the furled umbrella is drawn at page resolution only, for walkers that own one", () => {
  const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)
  const [w, ag] = walker()
  w.ticks = 400
  const shot = (res, own) => {
    w.res = res; ag.ownBrolly = own
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    D.drawAgent(img.ctx, w, pal, ag, {})
    return img.buf
  }
  assert.deepEqual(shot(1, true), shot(1, false), "the panel is unchanged")
  assert.notDeepEqual(shot(2, true), shot(2, false), "carried at res 2")
})

test("a parry or an overhead guard uses the agent's own umbrella when it has one", () => {
  const [w, ag] = walker()
  ag.ownBrolly = true
  const stock = w.skills.floater
  assert.ok(S.brollyInHand(w, ag))
  assert.equal(w.skills.floater, stock)
  const other = { ...ag, id: ag.id + 1000, ownBrolly: false }
  assert.ok(S.brollyInHand(w, other))
  assert.equal(w.skills.floater, stock - 1, "the first one comes from the stock")
  assert.ok(other.ownBrolly, "and is kept")
  w.skills.floater = 0; other.ownBrolly = false
  assert.equal(S.brollyInHand(w, other), false, "no umbrella anywhere")
})

test("a floater can parry a round in mid-air; a faller without an open umbrella cannot", () => {
  const [w, ag] = walker()
  let parried = false
  for (let t = 0; t < 100 && !parried; t++) {
    w.ticks = t
    Object.assign(ag, { state: "fall", floater: true, brollyFor: 0, ownBrolly: true })
    parried = S.umbrellaParries(w, ag, ag.x + 10)
  }
  assert.ok(parried, "some tick in a hundred parries")
  assert.equal(ag.brollyDir, 1, "toward the gun")
  for (let t = 0; t < 100; t++) {
    w.ticks = t
    Object.assign(ag, { state: "fall", floater: false, brollyFor: 0, ownBrolly: true })
    assert.equal(S.umbrellaParries(w, ag, ag.x + 10), false)
  }
})

test("a walker with an umbrella parries about two shots in three (BROLLY_PARRY)", () => {
  assert.equal(S.BROLLY_PARRY, 65)
  let up = 0, n = 0
  for (let t = 0; t < 200; t++) for (let id = 0; id < 20; id++) {
    const w = S.generate(1, 0, 3)
    w.ticks = t; w.agents = []
    const ag = Object.assign(S.spawn(w), { id, state: "walk", ownBrolly: true })
    if (S.umbrellaParries(w, ag, ag.x + 5)) up++
    n++
  }
  assert.ok(Math.abs(up / n - 0.65) < 0.03, `${up} of ${n}`)
})
