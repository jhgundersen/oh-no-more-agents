import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [1, 21, 41]
function sample(level = 1, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = 2; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.every(Number.isFinite), "finite geometry")
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    for (const n of args) assert.equal(n * 2, Math.round(n * 2), "hard half-pixel grid")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, calls }
}
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
const layers = [D.drawCavernBackdrop, D.drawCavernMaterials, D.drawCavernLife, (ctx, w, pal) => {
  for (const d of w.decor) if (D.lightDecorAlive(w, d)) D.drawCavernDecor(ctx, w, pal, d, d.x * 4, d.y * 4)
}]

test("Cavern additions draw nothing at panel resolution or in other biomes", () => {
  for (const level of [1, 21, 41, 4, 19]) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    if (w.biome === "Cavern" && res === 2) continue
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length, 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("Cavern components are read only, RNG free, deterministic and restore state", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), frozen = readonly(w), before = JSON.stringify(w)
    const random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen, pal)), b = picture(ctx => draw(ctx, frozen, pal))
        assert.ok(a.calls.length > 0)
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("Cavern rock, back wall and formations use the terrain cache without a clock", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of [layers[0], layers[1], layers[3]]) {
      const before = picture(ctx => draw(ctx, w, pal)); w.ticks += 137
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, before.buf)
    }
    for (const m of [w.k.EMPTY, w.k.STEEL]) {
      w.terrain.fill(m)
      assert.equal(picture(ctx => D.drawCavernMaterials(ctx, w, pal)).calls.length, 0)
    }
  }
})

test("Cavern wet detail is sparse, palette coloured and leaves ore untouched", () => {
  const { w, pal } = sample()
  for (const m of [w.k.DIRT, w.k.ROCK, w.k.ORE]) {
    w.terrain.fill(w.k.EMPTY)
    for (let y = 20; y < 25; y++) for (let x = 20; x < 40; x++)
      w.terrain[y * w.k.COLS + x] = m
    const base = picture(ctx => {
      D.drawTerrainMaterials(ctx, w, pal); D.drawTerrainFine(ctx, w, pal)
    })
    const detailed = picture(ctx => {
      D.drawTerrainMaterials(ctx, w, pal); D.drawTerrainFine(ctx, w, pal)
      D.drawCavernMaterials(ctx, w, pal)
    })
    if (m === w.k.ORE) { assert.deepEqual(detailed.buf, base.buf); continue }
    const img = picture(ctx => D.drawCavernMaterials(ctx, w, pal))
    assert.ok(img.calls.length > 0)
    let area = 0
    for (const c of img.calls) {
      assert.equal(c[4], D.materialEdge(w.k, pal, m))
      assert.ok(c[5] <= 0.6)
      area += c[2] * c[3]
      for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
        for (let x = c[0]; x < c[0] + c[2]; x += 0.5)
          assert.equal(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], m)
    }
    assert.ok(area < 100 * 16 * 0.02, "over 98% of terrain surface untouched")
  }
})

test("fungi breathe with time and disappear when their support or air is removed", () => {
  const { w, pal } = sample(), d = w.decor.find(d => D.cavernFungiAlive(w, d) && D.lightDecorAlive(w, d))
  assert.ok(d)
  const first = picture(ctx => D.drawCavernLife(ctx, w, pal))
  w.ticks += 61
  assert.notDeepEqual(picture(ctx => D.drawCavernLife(ctx, w, pal)).buf, first.buf)
  w.decor = [d]
  assert.ok(picture(ctx => D.drawCavernLife(ctx, w, pal)).calls.length)
  w.terrain[(d.y + 1) * w.k.COLS + d.x] = w.k.EMPTY
  assert.equal(picture(ctx => D.drawCavernLife(ctx, w, pal)).calls.length, 0)
  w.terrain[(d.y + 1) * w.k.COLS + d.x] = w.k.ROCK
  w.terrain[d.y * w.k.COLS + d.x - 2] = w.k.ROCK
  assert.equal(picture(ctx => D.drawCavernLife(ctx, w, pal)).calls.length, 0)
  assert.equal(picture(ctx => D.drawCavernDecor(ctx, w, pal, d, d.x * 4, d.y * 4)).calls.length, 0)
  w.terrain[d.y * w.k.COLS + d.x - 2] = w.k.EMPTY
  w.terrain[(d.y + 1) * w.k.COLS + d.x - 1] = w.k.EMPTY
  assert.equal(picture(ctx => D.drawCavernLife(ctx, w, pal)).calls.length, 0)
})

test("grit falls only briefly and clips to open air; existing drips keep their spots", () => {
  const { w, pal } = sample(), spots = D.dripSpots(w)
  assert.ok(spots.length)
  const d = w.decor.find(d => d.kind === "hang" && D.lightDecorAlive(w, d))
  assert.ok(d)
  const frames = []
  for (const age of [0, 8, 16, 17, 80]) {
    w.ticks = (211 - d.seed % 211) % 211 + age
    const img = picture(ctx => D.drawCavernGrit(ctx, w, pal, d)); frames.push(img)
    assert.equal(img.calls.length > 0, age < 17)
    for (const c of img.calls) assert.ok(D.mechanismAir(w, c[0], c[1]))
    assert.deepEqual(D.dripSpots(w), spots)
  }
  assert.notDeepEqual(frames[0].buf, frames[1].buf)
  w.terrain.fill(w.k.ROCK); w.ticks = (211 - d.seed % 211) % 211
  assert.equal(picture(ctx => D.drawCavernGrit(ctx, w, pal, d)).calls.length, 0)
})

test("Cavern light draws behind the colony, umbrellas, guards and exit", () => {
  const { w, pal } = sample(41)
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  w.enemies = [{ kind: "gun", state: "walk", dir: 1, id: 2, x: 30, y: 16,
    anim: 0, shotFor: 0, lineTo: 40, lineY: 14, timer: 0 }]
  const img = canvas(800, 496), calls = [], fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push(img.ctx.fillStyle); fill(...args) }
  D.drawActors(img.ctx, w, pal, {})
  const glow = calls.findLastIndex(c => c === D.CAVERN_GLOW || c === D.CAVERN_CORE)
  assert.ok(glow >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, "#ff5268", pal.exitLight])
    assert.ok(calls.findLastIndex(c => c === colour) > glow, colour)
})

test("Cavern page keeps every original decor drawing command", () => {
  // Original main renderer, res 2: remove only the added fungi's four colours.
  const hash = createHash("sha256")
  const fungalColours = new Set([D.CAVERN_MOSS, D.CAVERN_SHADOW, D.CAVERN_GLOW, D.CAVERN_CORE])
  for (const name of Object.keys(THEMES)) for (const level of levels) {
    const { w, pal } = sample(level, name), img = canvas(800, 496), calls = []
    img.ctx.fillRect = (...args) => {
      if (!fungalColours.has(img.ctx.fillStyle)) calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha])
    }
    D.drawDecor(img.ctx, w, pal); hash.update(JSON.stringify(calls))
  }
  assert.equal(hash.digest("hex"), "f087268867e3ca95ee696733fa7f8628bd120b4fd3ce4a1b8cb7808b5f25e5ef")
})

test("Cavern panel backdrop, earth, decor, motes, exit and booth keep their bytes", () => {
  // Captured from the saved pre-change renderer, component group, no frame pin.
  const hash = createHash("sha256")
  for (const name of Object.keys(THEMES)) for (const level of levels)
    for (const res of [undefined, 1]) for (const ticks of [0, 77, 240]) {
      const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
      const img = canvas(400, 248, themeOf(name).background)
      D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
      D.drawDecor(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
      D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
      hash.update(img.buf)
    }
  assert.equal(hash.digest("hex"), "caba324490e3cd0de9e625e8339f977a42ce20f386972aaf1ebb10e331344d2e")
})
