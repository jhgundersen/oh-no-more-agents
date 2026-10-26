import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf, THEMES, frame, side } from "../tools/render.js"

// The working day ends during the level (Draw's drawDusk): late-afternoon sun,
// an afterglow, a blue wash and the exit's light coming on. Page resolution
// only, read-only, and on a clock of absolute ticks.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function world(level = 11, res = 2) {
  const w = S.generate(level, 0, 3)
  for (let i = 0; i < 300; i++) S.step(w)
  w.res = res
  return { w, pal: P.build(themeOf("tokyo-night").theme, level) }
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => {
    assert.ok(calls.length < 600, "bounded paint")
    assert.ok(r.every(Number.isFinite) && r[2] > 0 && r[3] > 0)
    assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid")
    calls.push([...r, ctx.fillStyle, ctx.globalAlpha])
  }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}
const brightness = img => { let sum = 0; for (let i = 0; i < img.buf.length; i++) sum += img.buf[i]; return sum / img.buf.length }

test("dusk runs on absolute ticks, in sixteenths, from afternoon to full dusk", () => {
  const w = { ticks: 0 }, seen = []
  for (let t = 0; t <= D.DUSK_FROM + D.DUSK_SPAN + 400; t += 7) { w.ticks = t; seen.push(D.duskLevel(w)) }
  w.ticks = D.DUSK_FROM; assert.equal(D.duskLevel(w), 0)
  w.ticks = D.DUSK_FROM + D.DUSK_SPAN; assert.equal(D.duskLevel(w), 1)
  w.ticks = 99999; assert.equal(D.duskLevel(w), 1)
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], "never gets lighter")
  for (const d of seen) assert.ok(Number.isInteger(d * D.DUSK_STEPS), "stepped")
  assert.equal(new Set(seen).size, D.DUSK_STEPS + 1)
})

test("dusk paints only at page resolution, and only once the level has started", () => {
  for (const res of [undefined, 1, 3]) {
    const { w, pal } = world(); w.res = res; w.ticks = 1500
    assert.equal(marks(ctx => D.drawDusk(ctx, w, pal)).length, 0, `res ${res}`)
  }
  const { w, pal } = world(); w.ticks = -5
  assert.equal(marks(ctx => D.drawDusk(ctx, w, pal)).length, 0)
  w.ticks = 0
  assert.ok(marks(ctx => D.drawDusk(ctx, w, pal)).length > 0, "the afternoon sun is there from the start")
})

test("the board darkens as the clock runs, and the agents are drawn over it", () => {
  for (const level of [5, 11, 19]) {
    const { w, pal } = world(level), frame = (ticks, opts) => {
      const img = canvas(800, 496, themeOf("tokyo-night").background); w.ticks = ticks
      D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, { intro: false, feed: false, ...opts }); return img
    }
    const early = brightness(frame(D.DUSK_FROM)), late = brightness(frame(D.DUSK_FROM + D.DUSK_SPAN))
    assert.ok(late < early * 0.95, `level ${level}: ${late.toFixed(1)} against ${early.toFixed(1)}`)
    const calls = marks(ctx => { w.ticks = D.DUSK_FROM + D.DUSK_SPAN; D.drawDusk(ctx, w, pal) })
    assert.ok(calls.some(c => c[0] === 0 && c[1] === 0 && c[2] === 400 && c[3] === 248 && c[4] === D.DUSK_NIGHT), "a full-board night wash")
    assert.ok(brightness(frame(D.DUSK_FROM + D.DUSK_SPAN, { dusk: false })) > late, "dusk: false leaves the light alone")
  }
})

test("the exit light comes on with a flicker, steadily under reduced motion", () => {
  const { w, pal } = world(), on = Math.ceil(D.DUSK_FROM + D.DUSK_LIGHTS * D.DUSK_SPAN / D.DUSK_STEPS)
  const lit = ticks => { w.ticks = ticks; return marks(ctx => D.drawDuskExitLight(ctx, w, pal, D.duskLevel(w))).length > 0 }
  assert.equal(lit(on - 1), false, "off while the sun is up")
  const flicker = []
  for (let t = on; t < on + D.DUSK_FLICKER.length * 2; t++) flicker.push(lit(t))
  assert.ok(flicker.includes(true) && flicker.includes(false), "it stutters on")
  for (const t of [on + D.DUSK_FLICKER.length * 2, on + 300, on + 2000]) assert.equal(lit(t), true, `steady at ${t}`)
  w.reducedMotion = true
  for (let t = on; t < on + D.DUSK_FLICKER.length * 2; t++) assert.equal(lit(t), true, "no flicker")
})

test("dusk paint is read-only, RNG-free and deterministic in every palette", () => {
  const random = Math.random
  try {
    const { w } = world()
    Math.random = () => { throw Error("draw RNG") }
    for (const name of Object.keys(THEMES)) for (const reduced of [false, true]) {
      const pal = P.build(themeOf(name).theme, 11); w.reducedMotion = reduced
      for (const ticks of [0, 240, 700, 1200, 1700, 3000]) {
        w.ticks = ticks
        const before = hash(JSON.stringify(w)), a = marks(ctx => D.drawDusk(ctx, w, pal))
        assert.deepEqual(marks(ctx => D.drawDusk(ctx, w, pal)), a)
        assert.equal(hash(JSON.stringify(w)), before)
      }
    }
  } finally { Math.random = random }
})

test("indoors the panes go amber to blue and the lamps are listed from the room's own layout", () => {
  assert.equal(D.duskPane(0).colour, D.DUSK_SUN); assert.ok(D.duskPane(0).alpha > 0)
  assert.equal(D.duskPane(0.4).alpha, 0, "clear glass between the two")
  assert.equal(D.duskPane(1).colour, D.DUSK_BLUE); assert.ok(D.duskPane(1).alpha > D.duskPane(0.6).alpha)
  const sky = world(9), lib = world(13), mail = world(14)
  assert.equal(sky.w.biome, "Skyscraper"); assert.ok(D.duskLights(sky.w).panes.length >= 8)
  assert.ok(D.duskLights(lib.w).lamps.length >= 4); assert.ok(D.duskLights(mail.w).lamps.length >= 1)
  const first = D.duskLights(lib.w)
  assert.equal(D.duskLights(lib.w), first, "cached")
  lib.w.terrainVersion++
  assert.notEqual(D.duskLights(lib.w), first, "rebuilt when the terrain changes")
})

test("by full dusk an indoor level is plainly darker, and early on it is barely touched", () => {
  for (const level of [9, 13, 14]) {
    const { w, pal } = world(level), frame = ticks => {
      const img = canvas(800, 496, themeOf("tokyo-night").background); w.ticks = ticks
      D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, { intro: false, feed: false }); return brightness(img)
    }, plain = (() => { const img = canvas(800, 496, themeOf("tokyo-night").background); w.ticks = 700
      D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, { intro: false, feed: false, dusk: false }); return brightness(img) })()
    assert.ok(frame(D.DUSK_FROM + D.DUSK_SPAN) < frame(D.DUSK_FROM) * 0.88, `level ${level} darkens`)
    assert.ok(Math.abs(frame(700) - plain) < plain * 0.06, `level ${level} is subtle early`)
  }
})

test("shots can draw what the page draws: page options, any clock, side by side", () => {
  const at = clock => frame(S, D, P, { level: 14, ticks: 60, res: 2, page: true, clock })
  const early = at(240), late = at(1640)
  assert.equal(late.world.ticks, 1640)
  assert.ok(brightness(late.img) < brightness(early.img), "the clock moves the light, not the colony")
  const two = side([early.img, late.img], 4)
  assert.deepEqual([two.W, two.H], [1604, 496])
  assert.deepEqual(Array.from(two.buf.subarray((800 + 4) * 3, (800 + 4) * 3 + 3)), Array.from(late.img.buf.subarray(0, 3)))
})

test("on the Rooftops the city's windows come on one by one, only where the towers show", () => {
  const { w } = world(17)
  assert.equal(w.biome, "Rooftops")
  const windows = D.duskCityWindows(w), lit = d => windows.filter(p => p.step <= d * D.DUSK_STEPS).length
  assert.ok(windows.length > 40)
  assert.equal(lit(0), 0); assert.ok(lit(0.5) > 0 && lit(0.5) < lit(1)); assert.equal(lit(1), windows.length)
  for (const p of windows) for (let y = p.y; y < p.y + 3; y += 0.5) for (let x = p.x; x < p.x + 2; x += 0.5) assert.ok(D.mechanismAir(w, x, y))
  assert.equal(D.duskCityWindows(w), windows, "cached")
  w.ticks = D.DUSK_FROM + D.DUSK_SPAN
  assert.equal(marks(ctx => D.drawDuskCity(ctx, w, 1)).length, windows.length)
})
