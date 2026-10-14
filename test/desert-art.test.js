import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [11, 30, 49]
const layers = [D.drawDesertSky, D.drawDesertRelics, D.drawDesertSurfaces, D.drawDesertHeat]
function sample(level = 11, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = 2; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    for (const n of args) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
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
function footprint(c, visit) {
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("Desert additions are page-only, with no canvas calls in other biomes", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 11 && res === 2
    assert.equal(D.desertPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("Desert layers are deterministic, read-only, random-free and on the pixel grid", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name)
    const before = JSON.stringify(w), frozen = readonly(w), random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen)), b = picture(ctx => draw(ctx, frozen))
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("sand, strata and relics are cached while the mirage moves with ticks", () => {
  for (const level of levels) {
    const { w } = sample(level)
    for (const draw of layers.slice(0, 3)) {
      const before = picture(ctx => draw(ctx, w)).buf
      w.ticks += 133
      assert.deepEqual(picture(ctx => draw(ctx, w)).buf, before)
    }
    const frames = [0, 37, 180, 360, 600].map(t => {
      w.ticks = t
      return picture(ctx => D.drawDesertHeat(ctx, w)).buf
    })
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
  }
})

test("surface additions retain original colour and texture instead of repainting cells", () => {
  const { w } = sample(), k = w.k
  for (const m of [k.EMPTY, k.BRICK, k.STEEL]) {
    w.terrain.fill(m)
    assert.equal(picture(ctx => D.drawDesertSurfaces(ctx, w)).calls.length, 0)
  }
  w.terrain.fill(k.EMPTY)
  for (let y = 20; y < 24; y++) for (let x = 30; x < 34; x++) w.terrain[y * k.COLS + x] = k.DIRT
  const img = picture(ctx => D.drawDesertSurfaces(ctx, w))
  assert.ok(img.calls.some(c => c[4] === D.DESERT_SAND && c[2] === 4), "broad readable sand lip")
  for (const c of img.calls) footprint(c, (x, y) => {
    if (D.mechanismAir(w, x, y)) return
    assert.ok(c[3] === 0.5 && c[5] < 1, "only narrow translucent marks over original stone")
  })
  // A buried rock cell retains every byte; dirt receives hairline seams only.
  const rock = picture(ctx => D.drawDesertStrata(ctx, w, 31, 21, k.ROCK))
  assert.equal(rock.calls.length, 0)
  const dirt = picture(ctx => D.drawDesertStrata(ctx, w, 31, 21, k.DIRT))
  assert.ok(dirt.calls.length > 0)
  assert.ok(dirt.calls.every(c => c[3] === 0.5 && c[5] <= 0.55))
  w.terrain.fill(k.EMPTY)
  assert.equal(picture(ctx => D.drawDesertSurfaces(ctx, w)).calls.length, 0, "destroyed terrain leaves no sand")
})

test("sand piles up in inner corners and heat only crosses intact open floors", () => {
  const { w } = sample(), k = w.k
  w.terrain.fill(k.EMPTY)
  for (let x = 20; x < 60; x++) w.terrain[20 * k.COLS + x] = k.DIRT
  w.terrain[19 * k.COLS + 30] = k.DIRT
  const cap = picture(ctx => D.drawDesertSandCap(ctx, w, 31, 20))
  assert.ok(cap.calls.some(c => c[2] === 1 && c[3] === 3), "lee bank at wall")
  for (const c of cap.calls.filter(c => c[3] > 0.5))
    footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  assert.equal(D.desertHeatFloor(w, 100, 80), true)
  w.terrain[20 * k.COLS + 25] = k.EMPTY
  assert.equal(D.desertHeatFloor(w, 100, 80), false, "no mirage suspended above a hole")
  w.terrain.fill(k.ROCK)
  assert.equal(picture(ctx => D.drawDesertHeat(ctx, w)).calls.length, 0)
  for (const level of levels) {
    const { w } = sample(level)
    for (const t of [0, 37, 180]) {
      w.ticks = t
      for (const c of picture(ctx => D.drawDesertHeat(ctx, w)).calls)
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
    }
  }
})

test("relic placement avoids the original sun and heat precedes actors and fixtures", () => {
  for (const level of levels) {
    const { w } = sample(level)
    const sun = 40 + Math.floor(D.backRng(w)() * 320)
    for (let i = 0; i < w.corridors.length; i++) assert.ok(Math.abs(D.desertRelic(w, i).x - sun) >= 48)
  }
  const { w, pal } = sample(30)
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const img = canvas(800, 496), calls = [], fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push([img.ctx.fillStyle, ...args]); fill(...args) }
  D.drawActors(img.ctx, w, pal, {})
  const heat = calls.findLastIndex(c => c[0] === D.DESERT_SAND)
  assert.ok(heat >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, pal.exitLight, pal.decor])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > heat, `foreground ${colour} follows mirage`)
})

test("original Desert terrain, dunes, sun, cactus, motes, exit and booth retain component bytes", () => {
  // Captured from main. Separate unchanged recipes, never a whole-frame pin.
  for (const [resolutions, expected] of [
    [[undefined, 1], "4a3327111148c19c3a734750fea0575ae8d24236c0974d995c43c34c0868399a"],
    [[2], "4825d2d6b79b6837090be905aeba1b405a419a0cd9503acf337773f9902b35d1"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Model Drift, Sandbox and Cache Miss retain their independent visual mirrors", () => {
  const { w, pal } = sample()
  w.eventDrift = 380; w.driftWhat = "sight"
  const haze = picture(ctx => D.drawActiveEventAir(ctx, w, pal))
  assert.ok(haze.calls.length > 0)
  assert.ok(haze.calls.some(c => c[4] === pal.dust))
  w.eventDrift = 0
  assert.equal(picture(ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length, 0)
  const floor = w.corridors[0].floorY
  for (const mech of ["growth", "collapse"]) {
    const fx = { mech, at: "floor", x: 30, span: 6, floorY: floor, ceilY: floor - 8,
      warnAt: 0, fireAt: 60, firedAt: 60 }
    w.ticks = 24
    assert.ok(picture(ctx => D.drawEventSite(ctx, w, pal, fx)).calls.length)
    w.ticks = 70
    const fired = picture(ctx => D.drawEventSite(ctx, w, pal, fx))
    assert.equal(fired.calls.length > 0, mech === "collapse")
  }
})
