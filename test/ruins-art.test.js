import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [2, 21, 40]
const layers = [D.drawRuinsTemple, D.drawRuinsMasonry, D.drawRuinsTorches]
function sample(level = 2, name = "tokyo-night") {
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

test("temple additions are absent at panel resolution and in every other biome", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    const visible = level === 2 && res === 2
    assert.equal(D.ruinsPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("temple layers read without world writes or RNG and keep the half-pixel grid", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name)
    const before = JSON.stringify(w), frozen = readonly(w), random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen, pal)), b = picture(ctx => draw(ctx, frozen, pal))
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("architecture and mortar are cached; torch flames and light pools flicker", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of layers.slice(0, 2)) {
      const before = picture(ctx => draw(ctx, w, pal)).buf
      w.ticks += 133
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, before)
    }
    const frames = [0, 5, 10, 15].map(t => {
      w.ticks = t
      return picture(ctx => D.drawRuinsTorches(ctx, w, pal)).buf
    })
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
  }
})

test("mortar and moss add narrow translucent marks without covering the stone texture", () => {
  const { w, pal } = sample(), k = w.k
  for (const m of [k.EMPTY, k.BRICK, k.STEEL]) {
    w.terrain.fill(m)
    assert.equal(picture(ctx => D.drawRuinsMasonry(ctx, w, pal)).calls.length, 0)
  }
  w.terrain.fill(k.EMPTY)
  for (let y = 20; y < 24; y++) for (let x = 30; x < 34; x++) w.terrain[y * k.COLS + x] = k.DIRT
  const img = picture(ctx => D.drawRuinsMasonry(ctx, w, pal))
  assert.ok(img.calls.length)
  for (const c of img.calls) {
    assert.ok(c[5] < 1, "original colour shows through every terrain mark")
    assert.ok(c[2] <= 0.5 || c[3] <= 0.5 || c[2] <= 2 && c[3] === 1, "no broad fill")
    footprint(c, (x, y) => {
      if (!D.mechanismAir(w, x, y)) return
      assert.ok([D.RUINS_ROOT, D.RUINS_MOSS].includes(c[4]), "only roots extend beyond a cell")
    })
  }
  for (const m of [k.ROCK, k.ORE]) {
    w.terrain.fill(m)
    assert.ok(picture(ctx => D.drawRuinsMasonry(ctx, w, pal)).calls.length)
  }
  w.terrain.fill(k.EMPTY)
  assert.equal(picture(ctx => D.drawRuinsMasonry(ctx, w, pal)).calls.length, 0, "demolished blocks leave no floating joints")
})

test("roots need a surviving ceiling; new Backfill hides torchlight without moving the niche", () => {
  const { w, pal } = sample(), k = w.k
  w.terrain.fill(k.EMPTY)
  const col = 32, row = 20 // (32 + level 2) % 17 === 0
  w.terrain[row * k.COLS + col] = k.ROCK
  const roots = picture(ctx => D.drawRuinsMasonry(ctx, w, pal)).calls.filter(c => c[4] === D.RUINS_ROOT)
  assert.ok(roots.length)
  for (const c of roots) footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  w.terrain[row * k.COLS + col] = k.EMPTY
  assert.equal(picture(ctx => D.drawRuinsMasonry(ctx, w, pal)).calls.length, 0)
  const b = D.ruinsBay(w, 0, w.level % 4)
  assert.ok(picture(ctx => D.drawRuinsTorches(ctx, w, pal)).calls.length)
  w.terrain.fill(k.DIRT)
  assert.equal(picture(ctx => D.drawRuinsTorches(ctx, w, pal)).calls.length, 0)
  assert.deepEqual(D.ruinsBay(w, 0, w.level % 4), b, "architecture is fixed to its original back wall")
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const t of [0, 5, 10, 15]) {
      w.ticks = t
      for (const c of picture(ctx => D.drawRuinsTorches(ctx, w, pal)).calls)
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y), "live light never paints solid terrain"))
    }
  }
})

test("temple silhouettes have full-frame presence, fluted capitals, arches and broken drums", () => {
  const { w, pal } = sample()
  const img = picture(ctx => D.drawRuinsTemple(ctx, w, pal))
  assert.ok(img.calls.some(c => c[2] === 62 && c[3] === 5), "broad lintel, visible without zoom")
  assert.ok(img.calls.some(c => c[2] === 13 && c[3] === 2), "capital")
  assert.ok(img.calls.some(c => c[2] === 0.5 && c[3] > 10), "fluting")
  assert.ok(img.calls.some(c => c[2] === 4 && c[3] === 6), "arch keystone")
  assert.ok(img.calls.some(c => c[2] === 15 && c[3] === 4), "fallen drum")
  assert.ok(img.calls.some(c => c[2] === 11 && c[3] === 1), "pediment relief or drum edge")
})

test("torches precede faces, umbrellas, guards, the exit and rolling boulder", () => {
  const { w, pal } = sample(21)
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const calls = [], img = canvas(800, 496), fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push([img.ctx.fillStyle, ...args]); fill(...args) }
  D.drawActors(img.ctx, w, pal, {})
  const flames = calls.findLastIndex(c => c[0] === D.RUINS_EMBER)
  assert.ok(flames >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, pal.exitLight, pal.decor])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > flames, `foreground ${colour} follows torchlight`)
  assert.ok(calls.findLastIndex(c => c[0] === D.BOULDER_STONE) > flames)
})

test("original Ruins columns, terrain, drips, decor, motes, exit and booth retain component bytes", () => {
  // Captured from main. Individual original recipes, never a whole-frame pin.
  for (const [resolutions, expected] of [
    [[undefined, 1], "e5434cb85d8d32ec57761ea36f0f902c76b34e74034d680bed341f3770549de2"],
    [[2], "d2ff220331f159d14d04892806fe363bbb4ae89740fed767073f9ccd41c9a214"]
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

test("Legacy Collapse, Backfill and Daemon Restart retain their visual mirrors", () => {
  const { w, pal } = sample()
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
  const h = { zx0: 30, zx1: 35, zy0: floor - 4, zy1: floor - 1, mount: "floor" }
  w.eventBoost = 300; w.eventMult = 2
  assert.ok(picture(ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)).calls.length)
  w.eventBoost = 0
  assert.equal(picture(ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)).calls.length, 0)
})
