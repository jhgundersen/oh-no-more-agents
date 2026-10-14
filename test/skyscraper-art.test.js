import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [9, 28, 47, 66]
const MAX_CALLS = 20000
const layers = [D.drawOfficeBackdrop, D.drawOfficeSurfaces, D.drawOfficeLife]
function sample(level = 9, name = "tokyo-night") {
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
    assert.ok(calls.length < MAX_CALLS, "bounded fill recording")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  // A failed pixel comparison must produce a small diff, not megabytes.
  return { ...img, buf: createHash("sha256").update(img.buf).digest("hex"), calls }
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
  assert.ok(c.slice(0, 4).every(Number.isFinite), "finite rectangle")
  assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 400 && c[1] + c[3] <= 248, "footprint on board")
  assert.ok(c[2] <= 4 && c[3] <= 4, "bounded accent footprint")
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("office artwork is page-only; other biomes and low resolution receive no additions", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    const visible = level === 9 && res === 2
    assert.equal(D.skyscraperPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("office art uses read-only state, no RNG, deterministic half pixels and balanced canvas state", () => {
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

test("window bays remain fixed after carving; cached city stays still and distant lights cycle slowly", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    const old = picture(ctx => D.drawOfficeBackdrop(ctx, w)).buf
    const bays = w.corridors.map((_, i) => D.officeWindows(w, i))
    w.ticks += 160
    assert.deepEqual(picture(ctx => D.drawOfficeBackdrop(ctx, w)).buf, old)
    assert.ok(bays.every(row => row.length >= 5))
    w.terrain.fill(w.k.EMPTY); w.decor = []
    assert.deepEqual(w.corridors.map((_, i) => D.officeWindows(w, i)), bays)
    const a = picture(ctx => D.drawOfficeLife(ctx, w)).buf
    w.ticks += 160
    assert.notDeepEqual(picture(ctx => D.drawOfficeLife(ctx, w)).buf, a)
    w.ticks += 800
    assert.deepEqual(picture(ctx => D.drawOfficeLife(ctx, w)).buf,
      picture(ctx => { w.ticks -= 800; D.drawOfficeLife(ctx, w) }).buf)
    assert.equal(picture(ctx => D.drawOfficeSurfaces(ctx, w, pal)).calls.length, 0)
  }
  const { w } = sample()
  assert.ok(picture(ctx => D.drawOfficeBackdrop(ctx, w)).calls.some(c => c[2] === 42 && c[3] === 22))
})

test("glass glints leave terrain texture exposed, affect only dirt and disappear with it", () => {
  const { w, pal } = sample(), k = w.k
  for (const material of [k.EMPTY, k.ROCK, k.ORE, k.STEEL, k.BRICK]) {
    w.terrain.fill(material)
    assert.equal(picture(ctx => D.drawOfficeSurfaces(ctx, w, pal)).calls.length, 0)
  }
  w.terrain.fill(k.DIRT)
  const img = picture(ctx => D.drawOfficeSurfaces(ctx, w, pal)), covered = new Map()
  assert.ok(img.calls.length)
  for (const c of img.calls) {
    assert.ok(c[5] < 0.4)
    footprint(c, (x, y) => {
      const cell = Math.floor(y / k.CELL) * k.COLS + Math.floor(x / k.CELL)
      assert.equal(w.terrain[cell], k.DIRT)
      if (!covered.has(cell)) covered.set(cell, new Set())
      covered.get(cell).add(`${x},${y}`)
    })
  }
  assert.ok([...covered.values()].every(s => s.size <= 5), "over 90% of each accented face retains its original pixels")
})

test("animated city lights stay in air, behind the mullions and clear the exit and original decor", () => {
  for (const level of levels) {
    const { w } = sample(level), C = w.k.CELL, e = w.exit
    for (const ticks of [0, 77, 160, 476, 800]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawOfficeLife(ctx, w))
      assert.ok(img.calls.length)
      for (const c of img.calls) {
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
        assert.ok(D.officeClear(w, ...c.slice(0, 4)))
        assert.ok(c[0] >= (e.x + e.w + 2) * C || c[0] + c[2] <= (e.x - 2) * C ||
          c[1] >= (e.y + e.h + 1) * C || c[1] + c[3] <= e.y * C - 10)
        const bay = w.corridors.flatMap((_, i) => D.officeWindows(w, i)).find(b =>
          c[0] >= b.x && c[0] < b.x + b.width && c[1] >= b.y && c[1] < b.y + b.height)
        assert.ok(bay)
        const rx = c[0] - bay.x
        assert.ok(rx + c[2] <= 14 || rx >= 15)
        assert.ok(rx + c[2] <= 28 || rx >= 29)
      }
    }
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawOfficeLife(ctx, w)).calls.length, 0)
    }
  }
  const { w } = sample(); w.terrain.fill(w.k.EMPTY); w.decor = []
  assert.equal(D.officeClear(w, -1, 0, 1, 1), false)
  assert.equal(D.officeClear(w, 0, -1, 1, 1), false)
  const e = w.exit, img = picture(ctx => { const ink = D.officeInk(ctx, w); ink.fillRect(e.x * 4, e.y * 4, 1, 1) })
  assert.equal(img.calls.length, 0)
  w.decor = [{ x: 20, y: 20, kind: "desk" }]
  assert.equal(D.officeClear(w, 80, 80, 1, 1), false)
})

test("city lighting precedes lifts, hazards, guards, agents, umbrellas and exit", () => {
  const { w, pal } = sample(28)
  for (let i = 0; i < 240; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = () => { assert.ok(calls.length < MAX_CALLS, "bounded foreground recording"); calls.push(ctx.fillStyle) }
  D.drawActors(ctx, w, pal, {})
  const last = calls.findLastIndex(c => c === D.OFFICE_LAMP)
  assert.ok(last >= 0)
  for (const colour of [pal.rig, pal.skin, pal.umbrellaStem, pal.urgent, pal.exitLight])
    assert.ok(calls.findLastIndex(c => c === colour) > last, `original foreground ${colour} follows distant lights`)
})

test("original tower materials, skyline, desks, lamps, lifts, fire escape, hazards and exits retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "25941a9f114ab056b0df2ffcf5bd995b2ed7ec18413c0187dfb07ec8d98a16fd"], [[2], "7874bb9b0dd9cbb0d18240452d0947c7784ce55350e2cc8d55c419a425d1125e"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of [9, 28, 47, 66])
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawTerrainSky(img.ctx, w, pal); D.drawBackdrop(img.ctx, w, pal)
        D.drawTerrainMaterials(img.ctx, w, pal); D.drawDecor(img.ctx, w, pal)
        D.drawLifts(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Open Plan and Refactor still carve terrain and show their original event mirrors", () => {
  for (const id of ["openplan", "refurb"]) {
    const { w, pal } = sample(47), c = w.corridors[0], ev = S.EVENTS.find(e => e.id === id)
    const site = { c, x: 30 }, fx = { ...ev, x: 30, floorY: c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
    w.ticks = 24
    const img = canvas(800, 496)
    D.drawEventSite(img.ctx, w, pal, fx)
    const old = w.terrain.slice(), bays = D.officeWindows(w, 0)
    S.fireEvent(w, ev, site)
    assert.notDeepEqual(w.terrain, old)
    assert.deepEqual(D.officeWindows(w, 0), bays)
    w.ticks = 70; fx.firedAt = 60
    D.drawEventSite(img.ctx, w, pal, fx)
    for (const call of picture(ctx => D.drawOfficeLife(ctx, w)).calls)
      footprint(call, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})
