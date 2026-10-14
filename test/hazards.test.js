import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Every danger has its own drawing — eight once shared one graphic and nobody
// could tell them apart. This draws each kind in each phase on a real raster
// and checks it put something on the board without throwing.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("every hazard kind has its own drawing", () => {
  for (const spec of S.HAZARDS) assert.ok(D.HAZARD_DRAW[spec.id], spec.id + " falls through to the default")
})

// Writes throw rather than being found by serialising the world before and
// after every frame, which was most of this file's time under coverage.
function readonly(value, cache = new WeakMap()) {
  if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) return value
  if (cache.has(value)) return cache.get(value)
  const proxy = new Proxy(value, {
    get(target, key) { return readonly(Reflect.get(target, key), cache) },
    set(target, key) { throw new Error("wrote " + String(key)) },
    defineProperty(target, key) { throw new Error("defined " + String(key)) },
    deleteProperty(target, key) { throw new Error("deleted " + String(key)) }
  })
  cache.set(value, proxy)
  return proxy
}
const sameBytes = (a, b) => Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length))

for (const spec of S.HAZARDS) {
  test(`${spec.id} draws in every phase`, () => {
    const theme = themeOf("tokyo-night")
    const w = S.generate(1, 0, 99)
    const pal = P.build(theme.theme, 1)
    const blanks = { 1: canvas(400, 248, theme.background).buf, 2: canvas(800, 496, theme.background).buf }
    for (const res of [1, 2]) for (const phase of ["idle", "charge", "fire", "rest"]) for (const ticks of [0, 5, 60]) for (const dir of [1, -1]) {
      w.res = res
      const img = canvas(400 * res, 248 * res, theme.background)
      img.ctx.setTransform(res, 0, 0, res, 0, 0)
      w.ticks = ticks
      const h = { kind: spec.id, phase, t: 3, fired: 1, dir, known: true, throttled: 0, lineTo: 30, lineY: 20,
        zx0: 40, zx1: 40 + spec.w - 1, zy0: 20, zy1: 20 + spec.h - 1, mount: spec.mount, name: spec.name }
      const terrain = w.terrain.slice()
      D.drawHazardKind(img.ctx, readonly(w), pal, readonly(h))
      assert.ok(sameBytes(w.terrain, terrain), spec.id + " wrote terrain in " + phase)
      assert.ok(!sameBytes(img.buf, blanks[res]), `${spec.id} ${phase} drew nothing`)
    }
  })
}

function fixture(spec, phase, t, dir = 1) {
  const x = dir > 0 ? 40 : 41 // animals face by mount parity, machines by dir
  return { kind: spec.id, phase, t, fired: 1, dir, known: true, throttled: 0, lineTo: 58, lineY: 21,
    zx0: x, zx1: x + spec.w - 1, zy0: 20, zy1: 20 + spec.h - 1,
    mount: spec.mount, name: spec.name, reach: spec.reach }
}

function fixturePixels(w, pal, h, res, ticks) {
  const theme = themeOf("tokyo-night")
  w.res = res
  w.ticks = ticks
  const img = canvas(400 * res, 248 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  D.drawHazardKind(img.ctx, w, pal, h)
  assert.equal(img.ctx.globalAlpha, 1, h.kind + " leaked effect opacity")
  return Buffer.from(img.buf)
}

test("visual charge clocks match the simulation without cross-file calls", () => {
  for (const spec of S.HAZARDS) {
    if (spec.mech !== "field") assert.equal(D.HAZARD_CHARGE[spec.id], spec.charge, spec.id)
  }
})

for (const spec of S.HAZARDS.filter(s => s.mech !== "field")) {
  test(`${spec.id} has a persistent, progressive tell and a distinct release at both resolutions`, () => {
    const w = S.generate(1, 0, 99), pal = P.build(themeOf("tokyo-night").theme, 1)
    for (const res of [1, 2]) for (const ticks of [4, 60, 63]) for (const dir of [1, -1]) {
      const draw = (phase, t) => fixturePixels(w, pal, fixture(spec, phase, t, dir), res, ticks)
      const idle = draw("idle", 0)
      const early = draw("charge", Math.ceil(spec.charge * 0.15))
      const late = draw("charge", Math.floor(spec.charge * 0.85))
      const fire = draw("fire", 2)
      assert.ok(!early.equals(idle), "early tell disappeared at tick " + ticks)
      assert.ok(!late.equals(idle), "late tell disappeared at tick " + ticks)
      assert.ok(!late.equals(early), "wind-up did not develop")
      assert.ok(!fire.equals(late), "release looks like charge")
      assert.ok(!draw("rest", 3).equals(idle), "no follow-through")
    }
  })
}

test("fixtures animate quietly at idle, without writing world or hazard state", () => {
  const w = S.generate(1, 0, 99), pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const spec of S.HAZARDS) for (const res of [1, 2]) {
    const h = fixture(spec, "idle", 0)
    const pictures = [0, 24, 60, 90].map(ticks => {
      w.res = res; w.ticks = ticks
      const before = JSON.stringify({ w, h })
      const pixels = fixturePixels(w, pal, h, res, ticks)
      assert.equal(JSON.stringify({ w, h }), before, spec.id + " changed simulation state")
      return pixels
    })
    assert.ok(pictures.some(p => !p.equals(pictures[0])), spec.id + " is motionless at idle")
  }
})

test("recovery effects expire and a fresh/throttled fixture has no phantom discharge", () => {
  const w = S.generate(1, 0, 99), pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const spec of S.HAZARDS.filter(s => s.mech !== "field")) for (const res of [1, 2]) {
    const draw = (t, fired, throttled = 0) => fixturePixels(w, pal, { ...fixture(spec, "rest", t), fired, throttled }, res, 60)
    assert.ok(draw(20, 1).equals(draw(20, 0)), spec.id + " recovery outlived its window")
    assert.ok(!draw(3, 1).equals(draw(3, 0)), spec.id + " recovery has no visible effect")
    assert.ok(draw(3, 1, 90).equals(draw(3, 0, 90)), spec.id + " throttling froze a discharge effect")
  }
})

test("hazard wrapper shows unlit wreckage and paused fixtures without mutating their phases", () => {
  const w = S.generate(18, 0, 99), pal = P.build(themeOf("tokyo-night").theme, 18)
  for (const res of [1, 2]) for (const mount of ["floor", "ceiling"]) {
    w.res = res
    const h = { ...fixture(S.HAZARDS.find(s => s.id === "grinder"), "fire", 2), mount }
    const draw = (hazard, opts) => {
      const img = canvas(400 * res, 248 * res, "#000000")
      img.ctx.setTransform(res, 0, 0, res, 0, 0)
      const before = JSON.stringify({ w, hazard })
      D.drawHazard(img.ctx, w, pal, hazard, opts)
      assert.equal(JSON.stringify({ w, hazard }), before)
      return img.buf
    }
    const live = draw(h, { labels: true })
    const wrecked = draw({ ...h, wrecked: true }, {})
    const paused = draw({ ...h, throttled: 100 }, undefined)
    assert.notDeepEqual(live, wrecked); assert.notDeepEqual(live, paused)
    w.hazard = h
    assert.deepEqual(draw(undefined, {}), draw(h, {}), "legacy single-hazard fallback")
    delete w.hazard
    assert.ok(draw(undefined, {}).every(n => n === 0), "absent fixture paints nothing")
  }
})
