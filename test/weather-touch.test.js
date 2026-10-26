import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf } from "../tools/render.js"

// Weather that touches the colony (Draw's drawWeatherTouch): rain bursting off
// umbrellas and tapping hats on the Rooftops and in the Cloud, snow settling on
// hats in Frost. Page resolution only, draw only.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function world(level) {
  const w = S.generate(level, 0, 3)
  for (let i = 0; i < 300; i++) S.step(w)
  w.res = 2
  return { w, pal: P.build(themeOf("tokyo-night").theme, level) }
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => {
    assert.ok(calls.length < 2000, "bounded paint")
    assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid")
    calls.push([...r, ctx.fillStyle, ctx.globalAlpha])
  }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}
function floater(w) {
  const ag = w.agents.find(a => !a.gone)
  Object.assign(ag, { state: "fall", floater: true, fall: 8 })
  // Somewhere with room for the canopy and its splashes: eight clear cells.
  open: for (let y = 12; y < 60; y++) for (let x = 6; x < 94; x++) {
    let clear = true
    for (let dy = 0; dy < 9 && clear; dy++) for (let dx = -3; dx <= 3; dx++) if (w.terrain[(y - dy) * 100 + x + dx]) { clear = false; break }
    if (clear) { ag.x = x + 0.5; ag.y = y; break open }
  }
  w.agents = [ag]
  return ag
}

test("only rain and snow biomes, only at page resolution", () => {
  for (const level of [1, 8, 13]) {
    const { w, pal } = world(level)
    assert.equal(marks(ctx => D.drawWeatherTouch(ctx, w, pal)).length, 0, w.biome)
  }
  const { w, pal } = world(17)
  floater(w)
  for (const res of [undefined, 1, 3]) { w.res = res; assert.equal(marks(ctx => D.drawWeatherTouch(ctx, w, pal)).length, 0) }
})

test("rain crowns an open umbrella and runs off a tip, in open air only", () => {
  const { w, pal } = world(17), ag = floater(w)
  let seen = 0
  for (let t = 0; t < 14; t++) {
    w.ticks = 400 + t
    const calls = marks(ctx => D.drawWeatherTouch(ctx, w, pal))
    seen += calls.length
    for (const [x, y, width, height, colour] of calls) {
      assert.equal(colour, D.RAIN_COLOUR)
      for (let yy = y; yy < y + height; yy += 0.5) for (let xx = x; xx < x + width; xx += 0.5) assert.ok(D.mechanismAir(w, xx, yy))
      assert.ok(Math.abs(x - (D.pageAgentX(w, ag) + 4.5)) < 10, "on this umbrella")
    }
  }
  assert.ok(seen > 14, "splashing most ticks")
})

test("snow settles on a hat the longer the agent has walked in it, and rides the bob", () => {
  const { w, pal } = world(3), ag = w.agents.find(a => !a.gone && a.state === "walk")
  assert.equal(w.biome, "Frost"); w.agents = [ag]
  const cap = anim => { ag.anim = anim; return marks(ctx => D.drawWeatherTouch(ctx, w, pal)).filter(c => c[4] === D.SNOW_CAP) }
  assert.equal(cap(100).length, 0, "fresh out: no snow yet")
  assert.equal(cap(300)[0][3], 0.5)
  assert.equal(cap(1000)[0][3], 1, "never more than a pixel")
  // The cap sits on the crown wherever the gait and trait put the head.
  for (const anim of [800, 802, 804, 806, 808, 810, 812, 814]) {
    const c = cap(anim)[0]
    assert.equal(c[1] + c[3], D.pageAgentY(w, ag) + D.weatherCrown(w, ag).y, `anim ${anim}`)
  }
  ag.anim = 802; const low = D.weatherCrown(w, ag).y; ag.anim = 804; const high = D.weatherCrown(w, ag).y  // down, then passing
  assert.ok(low > high, "the gait moves the head, and the cap with it")
  ag.state = "climb"; assert.equal(cap(1000).length, 0)
})

test("weather paint is read-only, RNG-free and deterministic", () => {
  const random = Math.random
  try {
    const worlds = [world(17), world(20), world(3)]
    Math.random = () => { throw Error("draw RNG") }
    for (const { w, pal } of worlds) for (const reduced of [false, true]) for (const ticks of [300, 301, 450]) {
      w.reducedMotion = reduced; w.ticks = ticks
      const before = hash(JSON.stringify(w)), a = marks(ctx => D.drawWeatherTouch(ctx, w, pal))
      assert.deepEqual(marks(ctx => D.drawWeatherTouch(ctx, w, pal)), a)
      assert.equal(hash(JSON.stringify(w)), before)
    }
  } finally { Math.random = random }
})

test("snow gathers on an open umbrella on the way down, sitting on the dome", () => {
  const { w, pal } = world(3), ag = floater(w)
  w.reducedMotion = true
  const flakes = fall => { ag.fall = fall; return marks(ctx => D.drawWeatherTouch(ctx, w, pal)).filter(c => c[4] === D.SNOW_CAP) }
  assert.equal(flakes(3).length, 1); assert.equal(flakes(6).length, 3); assert.equal(flakes(40).length, 5)
  const y = D.pageAgentY(w, ag), top = D.pageCanopyTop(w, ag, y), cx = D.pageAgentX(w, ag) + D.pageFloatSway(w, ag) + 4.5
  for (const [x, fy, , h] of flakes(40)) assert.equal(fy + h, D.canopySurface(top, x - cx), "resting on the canopy")
  // The dome's surface falls away from the crown to the rim.
  assert.ok(D.canopySurface(0, 0) < D.canopySurface(0, 5) && D.canopySurface(0, 5) <= 4)
})
