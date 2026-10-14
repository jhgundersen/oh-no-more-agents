import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [8, 27, 46, 65]
const MAX_CALLS = 20000
const layers = [D.drawAssemblyBackdrop, D.drawAssemblyEdges, D.drawAssemblyLife]
function sample(level = 8, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = 2; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw, grid = true) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    if (grid) for (const n of args) assert.equal(n * 2, Math.round(n * 2), "hard half-pixel grid")
    assert.ok(calls.length < MAX_CALLS, "bounded number of fills")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  // Pixels as a digest: a failed deepEqual on two raw 800x496 buffers makes
  // node build a diff of them, which took the machine down at 22 GB.
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
// Bounded: a rectangle wider than the board, or not finite, fails here rather
// than walking half-pixels until the machine runs out of memory.
function footprint(c, visit) {
  assert.ok(c.slice(0, 4).every(Number.isFinite), "finite rectangle")
  assert.ok(c[2] <= 400 && c[3] <= 248, "rectangle within the board")
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("assembly art is page-only and absent from the other eighteen biomes", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 8 && res === 2
    assert.equal(D.factoryPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("assembly art is read-only, deterministic, RNG-free and on the half-pixel grid", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random
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

test("cached rails, stencils and paint stay still; digging never relocates a production bay", () => {
  for (const level of levels) {
    const { w } = sample(level)
    for (const draw of layers.slice(0, 2)) {
      const before = picture(ctx => draw(ctx, w)).buf
      w.ticks += 137
      assert.deepEqual(picture(ctx => draw(ctx, w)).buf, before)
    }
    const bays = w.corridors.map((_, i) => D.assemblyBays(w, i))
    assert.ok(bays.every(row => row.length > 0 && row.length <= 2))
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual(w.corridors.map((_, i) => D.assemblyBays(w, i)), bays)
    assert.equal(picture(ctx => D.drawAssemblyEdges(ctx, w)).calls.length, 0)
  }
  const { w } = sample()
  const img = picture(ctx => D.drawAssemblyBackdrop(ctx, w))
  assert.ok(img.calls.some(c => c[2] > 300 && c[3] === 5), "large gantry silhouette at full-frame size")
})

test("packages travel both ways, robot elbows move, and welding flashes briefly", () => {
  const { w } = sample(), b = D.assemblyBays(w, 0)[0]
  w.terrain.fill(w.k.EMPTY); w.decor = []
  for (const dir of [-1, 1]) {
    const draw = ticks => { w.ticks = ticks; return picture(ctx => D.drawAssemblyProducts(ctx, w, { ...b, dir })) }
    assert.notDeepEqual(draw(0).buf, draw(35).buf)
  }
  for (const width of [40, 60, 80, 100]) for (const ticks of [0, 31, 98, 476]) {
    w.ticks = ticks
    const crates = picture(ctx => D.drawAssemblyProducts(ctx, w, { ...b, width })).calls
      .filter(c => c[4] === D.ASSEMBLY_DARK && c[2] === 11 && c[3] === 9)
    assert.ok(crates.length > 0)
    for (let i = 0; i < crates.length; i++) for (let j = i + 1; j < crates.length; j++)
      assert.ok(Math.abs(crates[i][0] - crates[j][0]) >= 11, "shipping crates never overlap on a short line")
  }
  const robot = age => {
    w.ticks = (180 - b.phase % 180) % 180 + age
    return picture(ctx => D.drawAssemblyRobot(ctx, w, b))
  }
  const cold = robot(90), hot = robot(150)
  assert.notDeepEqual(robot(0).buf, robot(45).buf)
  assert.ok(hot.calls.some(c => c[4] === D.ASSEMBLY_WELD))
  assert.ok(!cold.calls.some(c => c[4] === D.ASSEMBLY_WELD))
  assert.ok(!robot(159).calls.some(c => c[4] === D.ASSEMBLY_WELD))
  assert.notDeepEqual(robot(146).buf, hot.buf)
  assert.notDeepEqual(picture(ctx => D.drawAssemblyLife(ctx, w)).buf,
    picture(ctx => { w.ticks += 47; D.drawAssemblyLife(ctx, w) }).buf)
})

test("live assembly art stays in air and clears the shutter and original floor pipes", () => {
  for (const level of levels) {
    const { w } = sample(level)
    for (const ticks of [0, 77, 144, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawAssemblyLife(ctx, w)), reserved = D.assemblyReserved(w)
      assert.ok(img.calls.length > 0)
      for (const c of img.calls) {
        assert.ok(D.assemblyUnreserved(reserved, ...c.slice(0, 4)))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawAssemblyLife(ctx, w)).calls.length, 0)
    }
    w.terrain.fill(w.k.EMPTY)
    const clipped = picture(ctx => D.assemblyAirRect(ctx, w, -2, -1, 10, 6, []))
    assert.ok(clipped.calls.length)
    for (const c of clipped.calls) footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})

test("safety paint leaves most texture visible and avoids actual belts and new bridges", () => {
  const { w } = sample(), k = w.k, y = w.corridors[0].floorY
  w.terrain.fill(k.EMPTY); w.beltAt.fill(0)
  for (const material of [k.EMPTY, k.STEEL, k.BRICK]) {
    w.terrain.fill(material)
    assert.equal(picture(ctx => D.drawAssemblyEdges(ctx, w)).calls.length, 0)
  }
  for (const material of [k.DIRT, k.ORE, k.ROCK]) {
    w.terrain.fill(k.EMPTY)
    w.terrain.fill(material, y * k.COLS, (y + 1) * k.COLS)
    const img = picture(ctx => D.drawAssemblyEdges(ctx, w)), coverage = new Map()
    assert.ok(img.calls.length)
    for (const c of img.calls) {
      assert.ok(c[5] < 1, "old colour visible through paint")
      footprint(c, (x, yy) => {
        const cell = Math.floor(yy / 4) * k.COLS + Math.floor(x / 4)
        assert.equal(w.terrain[cell], material)
        if (!coverage.has(cell)) coverage.set(cell, new Set())
        coverage.get(cell).add(`${x},${yy}`)
      })
    }
    assert.ok([...coverage.values()].every(s => s.size <= 32), "at least half of each original face untouched")
    w.beltAt.fill(1)
    assert.equal(picture(ctx => D.drawAssemblyEdges(ctx, w)).calls.length, 0)
    w.beltAt.fill(0); w.terrain.fill(material)
    assert.equal(picture(ctx => D.drawAssemblyEdges(ctx, w)).calls.length, 0, "buried faces are not marked")
  }
})

test("assembly animation precedes cogs, pipes, agents, umbrellas, guards, booth and exit", () => {
  const { w, pal } = sample(27)
  for (let i = 0; i < 240; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = () => calls.push(ctx.fillStyle)
  D.drawActors(ctx, w, pal, {})
  const assemblyColours = [D.ASSEMBLY_DARK, D.ASSEMBLY_STEEL, D.ASSEMBLY_EDGE,
    D.ASSEMBLY_SIGN, D.ASSEMBLY_YELLOW, D.ASSEMBLY_LIGHT, D.ASSEMBLY_BOX, D.ASSEMBLY_TAPE, D.ASSEMBLY_WELD]
  const last = calls.findLastIndex(c => assemblyColours.includes(c))
  assert.ok(last >= 0)
  for (const colour of [pal.oreEdge, pal.skin, pal.umbrellaStem, pal.urgent, pal.exitLight])
    assert.ok(calls.findLastIndex(c => c === colour) > last, `original foreground ${colour} follows the line`)
})

test("original Factory backdrop, materials, decor, cogs, belts, motes, shutter, booth and hazards retain bytes", () => {
  // Component hashes from main, rather than whole-frame pins.
  for (const [resolutions, expected] of [
    [[undefined, 1], "0c02ef0e5dc5287529946a4f284db3ab9a1a79dcb1938665c2d9ce9f4038976f"],
    [[2], "29e456a71038174ba1ec8c587d65c1d600700ae0b7dba739ca2978b80b15ad88"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of [8, 27, 46])
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawFactoryPlates(img.ctx, w, pal); D.drawDecor(img.ctx, w, pal)
        D.drawFactoryMachines(img.ctx, w, pal); D.drawBelts(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawDrips(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Scale Up, Technical Debt and Hard Fault retain their mechanisms and visual mirrors", () => {
  const { w, pal } = sample(), h = w.hazards[0]
  const cold = picture(ctx => D.drawEventHazard(ctx, w, pal, h)).buf
  S.fireEvent(w, S.EVENTS.find(e => e.id === "scaleup")); w.eventBoost -= 80
  assert.equal(w.eventMult, 2)
  assert.notDeepEqual(picture(ctx => D.drawEventHazard(ctx, w, pal, h)).buf, cold)
  const pit = w.pits[0], surface = pit.surfaceY
  S.fireEvent(w, S.EVENTS.find(e => e.id === "oilspill"))
  assert.equal(pit.rising, 3)
  const oil = picture(ctx => D.drawPits(ctx, w, pal)).buf
  w.ticks = 104; S.stepSpill(w)
  assert.equal(pit.surfaceY, surface - 1)
  assert.notDeepEqual(picture(ctx => D.drawPits(ctx, w, pal)).buf, oil)
  const ev = S.EVENTS.find(e => e.id === "hardfault"), c = w.corridors[1], x = 10
  const fx = { ...ev, x, floorY: c.floorY, ceilY: c.floorY - 6, warnAt: 0, fireAt: 60, firedAt: -1 }
  w.ticks = 24
  assert.ok(picture(ctx => D.drawEventSite(ctx, w, pal, fx), false).calls.length)
  const old = w.terrain.slice(), bays = D.assemblyBays(w, 1)
  S.fireEvent(w, ev, { c, x }); assert.notDeepEqual(w.terrain, old)
  assert.deepEqual(D.assemblyBays(w, 1), bays)
  w.ticks = 70; fx.firedAt = 60
  assert.ok(picture(ctx => D.drawEventSite(ctx, w, pal, fx), false).calls.length)
  const animated = picture(ctx => D.drawAssemblyLife(ctx, readonly(w)))
  for (const call of animated.calls) footprint(call, (xx, yy) => assert.ok(D.mechanismAir(w, xx, yy)))
})
