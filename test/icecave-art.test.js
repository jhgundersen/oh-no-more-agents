import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [6, 25, 44, 63]
const layers = [D.drawGlacierBackdrop, D.drawGlacierSurfaces, D.drawGlacierLife]
function sample(level = 6, name = "tokyo-night") {
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

test("glacier additions are page-only and absent from every other biome", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    const visible = level === 6 && res === 2
    assert.equal(D.iceCavePage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("glacier drawing is read-only, deterministic, RNG-free and uses the half-pixel grid", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random
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

test("frozen columns and inclusions are cached; deep light and specular crosses animate", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of layers.slice(0, 2)) {
      const before = picture(ctx => draw(ctx, w, pal)).buf
      w.ticks += 133
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, before)
    }
    const frames = [0, 60, 130, 220].map(t => {
      w.ticks = t; return picture(ctx => D.drawGlacierLife(ctx, w)).buf
    })
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
  }
  const { w } = sample()
  const glints = [0, 6, 15, 25, 30, 210].map(t => {
    w.ticks = t; return picture(ctx => D.drawGlacierGlint(ctx, w, 100, 100, 0))
  })
  assert.equal(glints[4].calls.length, 0)
  assert.ok(glints[2].calls.some(c => c[2] === 2.5), "visible cross at peak")
  assert.notDeepEqual(glints[1].buf, glints[2].buf)
})

test("surface accents leave original faces exposed and disappear with ice", () => {
  const { w } = sample(), k = w.k
  for (const m of [k.EMPTY, k.BRICK, k.STEEL]) {
    w.terrain.fill(m)
    assert.equal(picture(ctx => D.drawGlacierSurfaces(ctx, w)).calls.length, 0)
  }
  for (const m of [k.DIRT, k.ROCK, k.ORE]) {
    w.terrain.fill(k.EMPTY)
    for (let y = 20; y < 24; y++) for (let x = 2; x < k.COLS - 2; x++) w.terrain[y * k.COLS + x] = m
    const img = picture(ctx => D.drawGlacierSurfaces(ctx, w)), coverage = new Map()
    assert.ok(img.calls.some(c => c[2] === 4 && c[3] === 0.5), "frosted top")
    for (const c of img.calls) {
      assert.ok(c[5] < 1, "original texture remains visible through accents")
      footprint(c, (x, y) => {
        const cell = Math.floor(y / 4) * k.COLS + Math.floor(x / 4)
        assert.equal(w.terrain[cell], m, "no art outside surviving ice")
        if (!coverage.has(cell)) coverage.set(cell, new Set())
        coverage.get(cell).add(`${x},${y}`)
      })
    }
    assert.ok([...coverage.values()].every(s => s.size < 32), "more than half of every original face remains untouched")
  }
  for (const [x, y] of [[-1, 20], [100, 20], [20, -1], [20, 62]]) assert.equal(D.glacierIce(w, x, y), false)
})

test("live glow is occluded by terrain and glints stay inside surviving ice", () => {
  const { w } = sample()
  for (const ticks of [0, 6, 15, 25, 77, 476]) {
    w.ticks = ticks
    const img = picture(ctx => D.drawGlacierLife(ctx, w))
    for (const c of img.calls) footprint(c, (x, y) => {
      if (c[4] === D.GLACIER_LIT || c[4] === D.GLACIER_FROST) assert.ok(D.mechanismAir(w, x, y))
      else assert.ok(D.glacierIce(w, Math.floor(x / 4), Math.floor(y / 4)))
    })
  }
  w.terrain.fill(w.k.STEEL)
  assert.equal(picture(ctx => D.drawGlacierLife(ctx, w)).calls.length, 0)
  w.terrain.fill(w.k.EMPTY)
  const clipped = picture(ctx => D.glacierAirRect(ctx, w, -2, -1, 10, 6))
  assert.ok(clipped.calls.length)
  for (const c of clipped.calls) footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
})

test("large glacier faces precede original crystals; live light precedes drips and actors", () => {
  const { w, pal } = sample()
  const back = picture(ctx => D.drawGlacierBackdrop(ctx, w))
  assert.ok(back.calls.some(c => c[2] >= 20 && c[3] === 2), "broad facets visible at full-frame size")
  const calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = (...args) => calls.push([ctx.fillStyle, ...args])
  D.drawTerrain(ctx, w, pal)
  const glacier = calls.findLastIndex(c => c[0] === D.GLACIER_BLUE)
  const original = calls.findIndex((c, i) => i > glacier && c[0] === pal.back)
  const terrain = calls.findIndex((c, i) => i > original && c[0] === pal.dirt)
  assert.ok(glacier >= 0 && original > glacier && terrain > original)
  for (let i = 0; i < 240; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]; calls.length = 0
  D.drawActors(ctx, w, pal, {})
  const glow = calls.findLastIndex(c => [D.GLACIER_LIT, D.GLACIER_FROST, D.GLACIER_FLASH, D.GLACIER_TEAL].includes(c[0]))
  const light = calls.findIndex(c => c[0] === D.GLACIER_LIT)
  assert.ok(light >= 0 && glow >= light)
  for (const colour of [pal.skin, pal.umbrellaStem, pal.exitLight, pal.poolGlint])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > light, `foreground ${colour} follows glacier light`)
})

test("original ice back art, terrain, decor, motes, drips, exit and booth keep component bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "62d2e30468627a6c76be9c7189c3591ad9ba3b566f14d4b898db4214b736db6f"],
    [[2], "a548bfecf5254926fa61c4afb794dbe41417468526023efb423f6665fd10b90f"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of [6, 25, 44])
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal); D.drawDrips(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Frozen Snapshot, Breaking Change and Packet Storm retain their visual mirrors", () => {
  for (const id of ["freezeover", "thecrack"]) {
    const { w, pal } = sample(44), c = w.corridors[0], ev = S.EVENTS.find(e => e.id === id)
    const site = { c, x: 30 }, fx = { ...ev, x: 30, floorY: c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
    w.ticks = 24
    assert.ok(picture(ctx => D.drawEventSite(ctx, w, pal, fx)).calls.length)
    const old = w.terrain.slice()
    S.fireEvent(w, ev, site)
    assert.notDeepEqual(w.terrain, old)
    w.ticks = 70
    if (id === "thecrack") fx.firedAt = 60
    assert.equal(picture(ctx => D.drawEventSite(ctx, w, pal, fx)).calls.length > 0, id === "thecrack")
    for (const c of picture(ctx => D.drawGlacierSurfaces(ctx, w)).calls)
      footprint(c, (x, y) => assert.ok(D.glacierIce(w, Math.floor(x / 4), Math.floor(y / 4))))
  }
  const { w, pal } = sample()
  S.fireEvent(w, S.EVENTS.find(e => e.id === "blizzard"))
  w.eventDrift -= 80
  assert.ok(picture(ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length)
  w.eventDrift = 0
  assert.equal(picture(ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length, 0)
})
