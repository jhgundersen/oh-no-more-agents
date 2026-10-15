import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
import { levelWith } from "./levels.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const level = levelWith(S, "Clock Tower", w => w.gates.length > 0, 99)
function sample(name = "tokyo-night") {
  const w = S.generate(level, 0, 99)
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(w, draw) {
  const res = w.res || 1, img = canvas(400 * res, 248 * res, "#000000"), calls = []
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, width, height) => {
    for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "pixel grid")
    assert.ok(width > 0 && height > 0, "positive rectangles")
    assert.equal(typeof img.ctx.fillStyle, "string")
    assert.ok(calls.length < 25000, "bounded paint recording"); calls.push({ x, y, width, height, color: img.ctx.fillStyle }); fill(x, y, width, height)
  }
  draw(img.ctx)
  return { ...img, pixelHash: createHash("sha256").update(img.buf).digest("hex"), calls }
}
// Reject writes, including attempts to stash render caches in a nested object.
function readonly(value, cache = new WeakMap()) {
  if (!value || typeof value !== "object") return value
  if (cache.has(value)) return cache.get(value)
  const proxy = new Proxy(value, {
    get(target, key) { return readonly(Reflect.get(target, key), cache) },
    set() { throw new Error("world write") },
    defineProperty() { throw new Error("world define") },
    deleteProperty() { throw new Error("world delete") }
  })
  cache.set(value, proxy)
  return proxy
}

test("clockwork gates draw initial, shut, opening, open and closing at both resolutions without writes or RNG", () => {
  assert.equal(D.CLOCK_GATE_PERIOD, S.GATE_PERIOD)
  assert.equal(D.CLOCK_GATE_OPEN, S.GATE_OPEN)
  for (const name of Object.keys(THEMES)) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(name); w.res = res; w.ticks = 100
    for (const thickness of [1, 2, 3]) {
      const g = { ...w.gates[0], x1: w.gates[0].x0 + thickness - 1 }, frames = [], drops = []
      for (const [open, changedAt] of [[false, -1], [true, -1], [false, 90], [true, 100], [true, 95], [true, 90], [false, 100], [false, 95]]) {
        Object.assign(g, { open, changedAt }); w.gates = [g]
        const before = JSON.stringify(w), frozen = readonly(w), random = Math.random
        Math.random = () => { throw new Error("render RNG") }
        try {
          const a = picture(w, ctx => D.drawClockGate(ctx, frozen, pal, frozen.gates[0]))
          const b = picture(w, ctx => D.drawClockGate(ctx, frozen, pal, frozen.gates[0]))
          assert.equal(a.pixelHash, b.pixelHash)
          assert.ok(a.calls.length > 5)
          assert.equal(a.ctx.globalAlpha, 1)
          assert.equal(a.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
          frames.push(a.pixelHash); drops.push(D.clockGateDrawing(w, g).drop)
        } finally { Math.random = random }
        assert.equal(JSON.stringify(w), before)
      }
      assert.equal(frames[0], frames[2], "initial shut is fully down")
      assert.equal(frames[1], frames[5], "initial open is fully raised")
      assert.equal(drops[2], drops[3], "opening starts from shut")
      assert.equal(drops[5], drops[6], "closing starts from open")
      assert.notEqual(frames[2], frames[4]); assert.notEqual(frames[4], frames[5])
      assert.equal(drops[4], drops[7], "opposite transitions meet halfway")
    }
    const frozen = readonly(w), before = JSON.stringify(w)
    D.drawTerrain(canvas(400 * (res || 1), 248 * (res || 1)).ctx, frozen, pal)
    D.drawActors(canvas(400 * (res || 1), 248 * (res || 1)).ctx, frozen, pal, {})
    assert.equal(JSON.stringify(w), before)
  }
})

test("gate bars retract monotonically within the slot, and the dial follows phase and actual occupancy deferrals", () => {
  const { w, pal } = sample(), g = w.gates[0]
  for (const res of [1, 2]) for (const open of [true, false]) {
    w.res = res; Object.assign(g, { open, changedAt: 200 })
    const drops = []
    for (let age = 0; age <= 15; age++) {
      w.ticks = 200 + age
      const b = D.clockGateDrawing(w, g); drops.push(b.drop)
      const img = picture(w, ctx => D.drawClockShutter(ctx, w, b))
      for (const c of img.calls) {
        assert.ok(c.x >= b.x && c.x + c.width <= b.x + b.width)
        assert.ok(c.y >= b.y && c.y + c.height <= b.y + b.height)
      }
    }
    assert.equal(drops[0], open ? (g.bottom - g.top + 1) * 4 : 0)
    assert.equal(drops.at(-1), open ? 0 : (g.bottom - g.top + 1) * 4)
    assert.ok(drops.every((v, i) => i === 0 || (open ? v <= drops[i - 1] : v >= drops[i - 1])))
  }
  for (const phase of [0, 43, 239]) for (const t of [0, 149, 150, 239, 240, 1000]) {
    g.phase = phase; w.ticks = t
    const cycle = (t + phase) % S.GATE_PERIOD, b = D.clockGateDrawing(w, g)
    assert.equal(b.left, cycle < S.GATE_OPEN ? S.GATE_OPEN - cycle : S.GATE_PERIOD - cycle)
    assert.ok(b.left > 0 && b.left <= b.span)
  }
  w.ticks = 0; g.phase = 150; g.open = true; g.changedAt = -1
  assert.equal(D.clockGateDrawing(w, g).drop, 0, "occupied doorway stays visually open even in a shut phase")
  w.res = 2
  const ticks = [0, 15, 45].map(t => {
    w.ticks = t
    return picture(w, ctx => D.drawClockGateDial(ctx, w, pal, g, D.clockGateDrawing(w, g))).pixelHash
  })
  assert.notEqual(ticks[0], ticks[1]); assert.notEqual(ticks[1], ticks[2])
})

test("clock movement and light shafts animate only in open air, and never use fine pixels at res 1", () => {
  const { w, pal } = sample()
  for (const res of [undefined, 1, 2]) {
    w.res = res; w.terrain.fill(w.k.EMPTY)
    const frames = [77, 92, 240].map(t => {
      w.ticks = t
      return picture(w, ctx => { D.drawClockMovement(ctx, readonly(w), pal); D.drawClockShafts(ctx, readonly(w), pal) })
    })
    assert.notEqual(frames[0].pixelHash, frames[1].pixelHash)
    assert.notEqual(frames[1].pixelHash, frames[2].pixelHash)
    assert.equal(frames[0].calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
    w.terrain.fill(w.k.ROCK)
    assert.equal(picture(w, ctx => { D.drawClockMovement(ctx, w, pal); D.drawClockShafts(ctx, w, pal) }).calls.length, 0)
  }
})

test("clock surfaces follow remaining terrain; built masonry and fine brass stay resolution-gated", () => {
  const { w, pal } = sample()
  assert.ok(D.BUILT[w.biome])
  for (const res of [1, 2]) {
    w.res = res
    const before = JSON.stringify(w), img = picture(w, ctx => D.drawClockMaterials(ctx, readonly(w), pal))
    assert.equal(JSON.stringify(w), before)
    for (const c of img.calls) for (let y = c.y; y < c.y + c.height; y += 0.5) for (let x = c.x; x < c.x + c.width; x += 0.5)
      assert.notEqual(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], w.k.EMPTY)
    assert.equal(img.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
  }
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(w, ctx => D.drawClockMaterials(ctx, w, pal)).calls.length, 0)
})

test("weights, spare gears, chains, oilers and watchdog booth have Clock Tower art", () => {
  const { w, pal } = sample(); w.res = 2
  for (const kind of ["spire", "clump", "hang", "tuft"]) for (const size of [0, 1, 2]) {
    const d = { kind, size, seed: 3 }
    const a = picture(w, ctx => D.drawClockDecor(ctx, pal, d, 40, 40, 4))
    const b = picture(w, ctx => { D.drawClockDecor(ctx, pal, d, 40, 40, 4); D.drawDecorFine(ctx, pal, d, 40, 40, 44, "clock") })
    assert.notEqual(a.pixelHash, b.pixelHash)
  }
  w.enemyHatch = { x: 30, y: 20, biome: w.biome }
  const labels = [], img = canvas(400, 248)
  img.ctx.fillText = label => labels.push(label)
  D.drawEnemyHatch(img.ctx, w, pal, { labels: true })
  assert.ok(labels.includes("WATCHDOG TIMER"))
})

test("Deadlock, Leap Second and Race Condition mirror their rules and expire", () => {
  const { w, pal } = sample(), evs = S.EVENTS.filter(e => e.biome === w.biome)
  for (const ev of evs.filter(e => e.mech === "blackout")) {
    w.eventMult = ev.mult
    assert.equal(D.eventVisualSpan(w, "boost"), ev.ticks)
    w.eventBoost = ev.ticks; assert.ok(D.activeEventFade(w, "boost") < 0.1)
    w.eventBoost = ev.ticks - 24; assert.equal(D.activeEventFade(w, "boost"), 1)
    w.eventBoost = 1; assert.ok(D.activeEventFade(w, "boost") < 0.1)
  }
  for (const res of [1, 2]) {
    w.res = res; w.ticks = 200
    const fx = { mech: "collapse", at: "floor", x: 40, floorY: 30, span: 6, deep: 2, warnAt: 190, fireAt: 210, firedAt: -1 }
    const before = JSON.stringify(w)
    assert.ok(picture(w, ctx => D.drawEventSite(ctx, readonly(w), pal, readonly(fx))).calls.length > 0)
    assert.equal(JSON.stringify(w), before)
    w.ticks = 210
    assert.equal(picture(w, ctx => D.drawClockEventMarker(ctx, w, pal, fx)).calls.length, 0)
    fx.firedAt = 210; w.ticks = 212
    const rubble = canvas(400 * res, 248 * res)
    D.drawEventSite(rubble.ctx, w, pal, fx)
    assert.ok(rubble.buf.some(n => n !== 0))
  }
})

test("Deadlock locks a fixture dial while Race Condition spins two hands; stale events leave no marks", () => {
  const { w, pal } = sample()
  w.terrain.fill(w.k.EMPTY); w.eventBoost = 200
  for (const res of [undefined, 1, 2]) for (const mount of ["floor", "ceiling"]) {
    w.res = res
    const h = { zx0: 40, zx1: 46, zy0: 20, zy1: 23, mount, throttled: 0 }
    const pairs = []
    for (const mult of [0, 2]) {
      w.eventMult = mult
      const frames = [80, 91].map(t => {
        w.ticks = t
        const before = JSON.stringify(w)
        const img = picture(w, ctx => D.drawEventHazardStatus(ctx, readonly(w), pal, readonly(h), 1))
        assert.equal(JSON.stringify(w), before)
        assert.equal(img.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
        return img.pixelHash
      })
      if (mult === 0) assert.equal(frames[0], frames[1], "Deadlock has no ticking hand")
      else assert.notEqual(frames[0], frames[1], "Race Condition keeps moving")
      pairs.push(frames[0])
    }
    assert.notDeepEqual(pairs[0], pairs[1])
    for (const patch of [{ wrecked: true }, { throttled: 30 }])
      assert.equal(picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, { ...h, ...patch }, 1)).calls.length, 0)
    w.eventBoost = 0
    assert.equal(picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)).calls.length, 0)
    w.eventBoost = 200
  }
})
