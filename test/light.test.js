import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const sample = level => {
  const w = S.generate(level, 0, 99)
  w.res = 2; w.ticks = 100
  return { w, pal: P.build(themeOf("tokyo-night").theme, level) }
}
function record() {
  const img = canvas(800, 496, "#000000"), calls = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  img.ctx.fillRect = (x, y, width, height) => {
    calls.push([x, y, width, height, img.ctx.fillStyle, img.ctx.globalAlpha])
    fill(x, y, width, height)
  }
  return { ...img, calls }
}

test("terrain and animated light draw only at res 2, without changing the world", () => {
  for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(4); w.res = res
    w.blasts = [{ x: 30, y: 30, r: 5, t: 100 }]
    const before = JSON.stringify(w), staticLight = record(), movingLight = record()
    D.drawTerrainLight(staticLight.ctx, w, pal)
    D.drawAnimatedLight(movingLight.ctx, w, pal)
    assert.equal(staticLight.calls.length > 0, res === 2)
    assert.equal(movingLight.calls.length > 0, res === 2)
    assert.equal(JSON.stringify(w), before)
  }
})

test("light has bounded stepped rings and half-pixel Bayer stipple, with a fixed drawing budget", () => {
  const { w } = sample(1)
  for (const radius of [5, 18, 48]) {
    const img = record(); img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.4
    D.drawLightPool(img.ctx, w, "#80b4ff", 150.3, 120.2, radius, radius * 0.7, 0.12)
    assert.ok(img.calls.length >= 20 && img.calls.length <= 48)
    assert.ok(img.calls.some(c => c[2] === 0.5 && c[3] === 0.5))
    assert.ok(img.calls.every(c => c.slice(0, 4).every(n => Number.isInteger(n * 2))))
    assert.ok(img.calls.every(c => Math.abs(c[0] - 150.5) <= radius && Math.abs(c[1] - 120) <= radius))
    assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.4)
  }
  const dark = record()
  D.drawLightPool(dark.ctx, w, "#fff", 20, 20, 10, 10, 0)
  assert.equal(dark.calls.length, 0)
})

test("pool spill has steady terrain colour and a small tick-driven shimmer; ordinary water stays dark", () => {
  const { w, pal } = sample(4)
  const p = { x0: 20, x1: 25, surfaceY: 40, seed: 3 }
  for (const liquid of ["lava", "slag", "coolant", "water", "oil", null]) {
    p.liquid = liquid
    const a = record(), b = record(), steady = record(), again = record()
    D.drawPoolLight(a.ctx, w, pal, p, true)
    D.drawPoolLight(steady.ctx, w, pal, p, false)
    w.ticks += 20
    D.drawPoolLight(b.ctx, w, pal, p, true)
    D.drawPoolLight(again.ctx, w, pal, p, false)
    assert.deepEqual(steady.calls, again.calls)
    if (["lava", "slag", "coolant"].includes(liquid)) {
      assert.notDeepEqual(a.calls, b.calls)
      assert.ok(a.calls.every(c => c[4] === pal.poolLip))
    } else assert.equal(a.calls.length + steady.calls.length, 0)
  }
})

test("Library and franking fixture spill disappears when the support is removed", () => {
  for (const level of [13, 14]) {
    const { w, pal } = sample(level)
    w.terrain.fill(w.k.EMPTY)
    w.decor = [{ kind: "hang", x: 20, y: 20, seed: 3 },
      { kind: "tuft", x: 30, y: 20, seed: 5 }, { kind: "spire", x: 40, y: 20, seed: 3 }]
    for (const d of w.decor) w.terrain[(d.kind === "hang" ? 19 : 21) * w.k.COLS + d.x] = w.k.ROCK
    const lit = record(); D.drawFixtureLight(lit.ctx, w, pal)
    assert.ok(lit.calls.length > 0)
    w.terrain.fill(w.k.EMPTY)
    const dark = record(); D.drawFixtureLight(dark.ctx, w, pal)
    assert.equal(dark.calls.length, 0)
  }
})

test("fire flickers, explosions briefly flood a wider area, and expired sources draw nothing", () => {
  const { w, pal } = sample(1)
  for (const kind of ["flame", "molten", "brazier", "gun", "turret", "sniper"]) {
    const h = { kind, zx0: 30, zx1: 35, zy0: 20, zy1: 25, phase: "fire", t: 0 }
    const a = record(); D.drawHazardLight(a.ctx, w, pal, h); assert.ok(a.calls.length > 0)
    w.ticks += 2
    const b = record(); D.drawHazardLight(b.ctx, w, pal, h)
    if (["flame", "molten", "brazier"].includes(kind)) assert.notDeepEqual(a.calls, b.calls)
    h.phase = "rest"
    const c = record(); D.drawHazardLight(c.ctx, w, pal, h)
    assert.equal(c.calls.length > 0, kind === "brazier")
  }
  const blast = { x: 30, y: 30, r: 5, t: w.ticks }
  const a = record(); D.drawBlastLight(a.ctx, w, pal, blast)
  assert.ok(Math.max(...a.calls.map(c => c[2])) > blast.r * w.k.CELL * 2)
  w.ticks += 8
  const b = record(); D.drawBlastLight(b.ctx, w, pal, blast)
  assert.ok(Math.max(...b.calls.map(c => c[5])) < Math.max(...a.calls.map(c => c[5])))
  for (const age of [-1, 13, 26]) {
    w.ticks = blast.t + age
    const c = record(); D.drawBlastLight(c.ctx, w, pal, blast); assert.equal(c.calls.length, 0)
  }
})

test("transporter light follows both live beams; muzzle light follows living shooters", () => {
  const { w, pal } = sample(7)
  const p = { ax: 20, ay: 20, bx: 40, by: 30, usedAt: 100 }
  const a = record(); D.drawTransportLight(a.ctx, w, p)
  assert.ok(a.calls.some(c => c[0] < 100) && a.calls.some(c => c[0] > 150))
  for (const patch of [{ tube: true }, { usedAt: -1 }, { usedAt: 0 }, { usedAt: 101 }]) {
    const b = record(); D.drawTransportLight(b.ctx, w, { ...p, ...patch }); assert.equal(b.calls.length, 0)
  }
  w.agents = [{ x: 20, y: 20, dir: 1, shotFor: 3 }, { x: 25, y: 20, dir: -1, shotFor: 0 }]
  w.enemies = [{ x: 40, y: 20, dir: -1, shotFor: 8 }]
  const b = record(); D.drawMuzzleLight(b.ctx, w, pal); assert.ok(b.calls.length > 0)
  w.agents[0].gone = true; w.enemies[0].gone = true
  const c = record(); D.drawMuzzleLight(c.ctx, w, pal); assert.equal(c.calls.length, 0)
  w.agents[1].id = 7
  w.mission = { kind: "alien", done: false, scoutId: 7, shotFor: 3 }
  const scout = record(); D.drawMuzzleLight(scout.ctx, w, pal); assert.ok(scout.calls.length > 0)
  w.mission.shotFor = 0
  const waiting = record(); D.drawMuzzleLight(waiting.ctx, w, pal); assert.equal(waiting.calls.length, 0)
})
