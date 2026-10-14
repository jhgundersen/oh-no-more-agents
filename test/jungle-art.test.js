import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [5, 24, 43, 62]
const layers = [D.drawJungleBackdrop, D.drawJungleSurfaces, D.drawJungleLife]
function sample(level = 5, name = "tokyo-night") {
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

test("Jungle additions are absent at panel resolution and in every other biome", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    const visible = level === 5 && res === 2
    assert.equal(D.junglePage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("forest drawing is deterministic, read-only, RNG-free and on the half-pixel grid", () => {
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

test("canopy and rooted terrain are cached; shafts, humidity and butterfly wings animate", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of layers.slice(0, 2)) {
      const before = picture(ctx => draw(ctx, w, pal)).buf
      w.ticks += 133
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, before)
    }
    const b = D.jungleGrove(w, 0, 0)
    w.terrain.fill(w.k.EMPTY)
    for (const draw of [D.drawJungleShaftLight, D.drawJungleHumidity, D.drawJungleButterfly]) {
      const frames = [0, 60, 130, 220].map(t => { w.ticks = t; return picture(ctx => draw(ctx, w, b)).buf })
      for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
    }
  }
})

test("ferns and tendrils need surviving ground; roots never repaint whole blocks or tools", () => {
  const { w, pal } = sample(), k = w.k
  for (const m of [k.EMPTY, k.BRICK, k.STEEL]) {
    w.terrain.fill(m)
    assert.equal(picture(ctx => D.drawJungleSurfaces(ctx, w, pal)).calls.length, 0)
  }
  // An isolated slab exposes both surfaces, exercising all seeds and materials.
  for (const m of [k.DIRT, k.ROCK, k.ORE]) {
    w.terrain.fill(k.EMPTY)
    for (let y = 20; y < 24; y++) for (let x = 2; x < k.COLS - 2; x++) w.terrain[y * k.COLS + x] = m
    const img = picture(ctx => D.drawJungleSurfaces(ctx, w, pal))
    assert.ok(img.calls.some(c => c[4] === D.JUNGLE_TIP), "fern tips")
    assert.ok(img.calls.some(c => c[1] >= 96), "hanging roots")
    for (const c of img.calls) {
      assert.ok(c[5] < 1, "original ground colour remains underneath")
      assert.ok(c[2] <= 0.5 || c[3] <= 0.5, "narrow roots and fern fronds")
      footprint(c, (x, y) => {
        if (D.mechanismAir(w, x, y)) return
        assert.equal(c[4], D.JUNGLE_ROOT, "only narrow roots enter soil")
        assert.equal(w.terrain[Math.floor(y / k.CELL) * k.COLS + Math.floor(x / k.CELL)], m)
      })
    }
    // Roots stop at a removed floor or steel/bridge cell, rather than continuing.
    for (const under of [k.EMPTY, k.STEEL, k.BRICK]) {
      w.terrain[21 * k.COLS + 30] = under
      const roots = picture(ctx => D.drawJungleRoot(ctx, w, 30, 20, 0))
      assert.ok(roots.calls.every(c => c[1] < 84))
    }
  }
  w.terrain.fill(k.EMPTY)
  assert.equal(picture(ctx => D.drawJungleSurfaces(ctx, w, pal)).calls.length, 0)
})

test("live light, mist and butterflies are occluded by all ground, including event growth", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const ticks of [0, 5, 10, 15, 476]) {
      w.ticks = ticks
      for (const c of picture(ctx => D.drawJungleLife(ctx, w, pal)).calls)
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
    }
    const fixed = D.jungleGrove(w, 0, 0)
    w.terrain.fill(w.k.DIRT)
    assert.equal(picture(ctx => D.drawJungleLife(ctx, w, pal)).calls.length, 0)
    assert.deepEqual(D.jungleGrove(w, 0, 0), fixed, "groves stay put after terrain changes")
    w.terrain.fill(w.k.EMPTY)
    const air = picture(ctx => D.jungleAirRect(ctx, w, -2, -1, 10, 6))
    assert.ok(air.calls.length)
    for (const c of air.calls) footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})

test("broad tropical silhouettes read without zoom, behind the original backdrop", () => {
  const { w, pal } = sample()
  const img = picture(ctx => D.drawJungleBackdrop(ctx, w, pal))
  assert.ok(img.calls.some(c => c[2] === 11 && c[3] > 100), "large trunks")
  assert.ok(img.calls.some(c => c[2] === 18 && c[3] === 1), "broad split leaves")
  assert.ok(img.calls.some(c => c[2] === 47 && c[3] === 4), "canopy boughs")
  const calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = (...args) => calls.push([ctx.fillStyle, ...args])
  D.drawTerrain(ctx, w, pal)
  const leaf = calls.findLastIndex(c => c[0] === D.JUNGLE_LEAF)
  const original = calls.findIndex((c, i) => i > leaf && c[0] === pal.back)
  const terrain = calls.findIndex((c, i) => i > original && c[0] === pal.dirt)
  assert.ok(leaf >= 0 && original > leaf && terrain > original)
})

test("humidity and butterflies precede colleagues, umbrellas, guards, fixtures and exit", () => {
  const { w, pal } = sample(24)
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = (...args) => calls.push([ctx.fillStyle, ...args])
  D.drawActors(ctx, w, pal, {})
  const forest = calls.findLastIndex(c => [D.JUNGLE_LIGHT, D.JUNGLE_MIST, ...D.JUNGLE_WINGS].includes(c[0]))
  assert.ok(forest >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, pal.exitLight, pal.decor])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > forest, `foreground ${colour} follows forest life`)
})

test("original Jungle back art, terrain, vines, motes, drips, exit and booth keep their bytes", () => {
  // Original component recipes captured from main; no whole-frame pins.
  for (const [resolutions, expected] of [
    [[undefined, 1], "890376d7ce20166d504318ac5a224368c4561c6003368bba1594d4cf9bbf8f0e"],
    [[2], "615c8a16fb89ec862c84fc9afd05c20a78c3cc19b4bf3196a3bfd161e35ffe63"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of [5, 24, 43])
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

test("Dependency Hell, Cloud Burst and Fork Bomb keep their sites, pools and warnings", () => {
  const { w, pal } = sample(43), k = w.k
  const site = { c: w.corridors[0], x: 30 }
  const fx = { mech: "growth", x: 30, span: 14, floorY: site.c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
  w.ticks = 24
  const warning = picture(ctx => D.drawEventSite(ctx, w, pal, fx))
  assert.ok(warning.calls.length)
  S.fireEvent(w, S.EVENTS.find(e => e.id === "overgrow"), site)
  w.ticks = 70
  assert.equal(picture(ctx => D.drawEventSite(ctx, w, pal, fx)).calls.length, 0)
  assert.ok(picture(ctx => D.drawJungleSurfaces(ctx, w, pal)).calls.length)
  const pit = w.pits.find(p => p.liquid)
  assert.ok(pit)
  const surface = pit.surfaceY
  S.fireEvent(w, S.EVENTS.find(e => e.id === "downpour"))
  assert.ok(pit.rising > 0)
  const before = picture(ctx => D.drawPits(ctx, w, pal)).buf
  for (let i = 0; i < 120; i++) { w.ticks++; S.stepSpill(w) }
  assert.ok(pit.surfaceY < surface)
  assert.notDeepEqual(picture(ctx => D.drawPits(ctx, w, pal)).buf, before)
  const fork = sample(24), old = fork.w.enemies.length
  assert.ok(fork.w.enemyHatch)
  S.fireEvent(fork.w, S.EVENTS.find(e => e.id === "forkbomb"))
  assert.equal(fork.w.enemies.length, old + 2)
  for (const en of fork.w.enemies.slice(old)) {
    assert.equal(en.kind, "gun")
    assert.ok(picture(ctx => D.drawEnemy(ctx, fork.w, fork.pal, en, {})).calls.length)
  }
  assert.equal(w.k, k)
})
