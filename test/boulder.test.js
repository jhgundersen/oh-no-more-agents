import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"
import { canvas, themeOf } from "../tools/render.js"

// The Ruins' boulder: placed on every Ruins level and nowhere else, woken by
// the first walker on its floor, rolling until it meets something, and taking
// at most one agent with it.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
// A Ruins level whose boulder, played out, wakes, rolls and shatters.
const RUINS = levelWith(S, "Ruins", (w) => {
  const b = w.boulder, x0 = b && b.x
  if (!b) return false
  while (!w.done && w.ticks < 20000) S.step(w)
  return b.state === "done" && b.x !== x0
})

test("every Ruins level has a boulder, and no other biome does", () => {
  for (let lv = 1; lv <= 72; lv++) {
    const w = S.generate(lv, 0, 5)
    assert.equal(!!w.boulder, w.biome === "Ruins", `level ${lv} (${w.biome})`)
  }
})

test("it wakes, rolls and shatters, taking at most one", () => {
  const w = S.generate(RUINS, 0, 3), b = w.boulder, seen = [b.state]
  const x0 = b.x
  while (!w.done && w.ticks < 20000) {
    S.step(w)
    if (b.state !== seen[seen.length - 1]) seen.push(b.state)
  }
  assert.deepEqual(seen, ["rest", "wake", "roll", "done"])
  assert.notEqual(b.x, x0, "it went somewhere")
  assert.ok(b.crushed <= 1)
})

// Its own floor, cleared, with one agent placed on it.
function scene(state, ahead) {
  const w = S.generate(RUINS, 0, 3), b = w.boulder
  w.agents = [S.spawn(w)]
  const ag = w.agents[0]
  ag.state = state
  ag.x = b.x + b.dir * ahead
  ag.y = b.y
  ag.dir = -b.dir
  b.state = "roll"
  return { w, b, ag }
}

test("a walker ahead of it turns and runs", () => {
  const { w, b, ag } = scene("walk", 12)
  const pace = S.walkStep(ag, w)
  S.stepBoulder(w)
  assert.equal(ag.dir, b.dir)
  assert.ok(S.walkStep(ag, w) > pace * 1.5)
})

test("it takes the first body it reaches, and stops", () => {
  const { w, b, ag } = scene("walk", 1.6)
  S.stepBoulder(w)
  assert.ok(ag.gone)
  assert.equal(b.crushed, 1)
  assert.equal(b.state, "done")
})

test("nobody is crushed in mid-air, and a blocker stops it", () => {
  const fall = scene("fall", 1.6)
  S.stepBoulder(fall.w)
  assert.ok(!fall.ag.gone)
  const block = scene("block", 1.6)
  S.stepBoulder(block.w)
  assert.ok(!block.ag.gone)
  assert.equal(block.b.state, "done")
})

test("the boulder draws in every state", () => {
  const theme = themeOf("tokyo-night")
  const pal = P.build(theme.theme, 1)
  const w = S.generate(RUINS, 0, 3), b = w.boulder
  for (const res of [1, 2]) for (const state of ["rest", "wake", "roll", "done"]) {
    w.res = res
    w.ticks = 100
    b.state = state; b.wokeAt = 90; b.endedAt = 95; b.spin = 0.7
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const blank = Buffer.from(img.buf).toString("base64")
    D.drawBoulder(img.ctx, w, pal, b)
    assert.notEqual(Buffer.from(img.buf).toString("base64"), blank, `${state} at res ${res} drew nothing`)
  }
})
