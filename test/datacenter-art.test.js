import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [12, 32, 52, 72], layers = [D.drawDataHall, D.drawDataFaces, D.drawDataStatus]
const MAX_CALLS = 20000
function sample(level = 12, name = "tokyo-night") {
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
    assert.ok(calls.length < MAX_CALLS, "bounded draw recording")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
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
  cache.set(value, proxy); return proxy
}
function footprint(c, visit) {
  assert.ok(c.slice(0, 4).every(Number.isFinite))
  assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 400 && c[1] + c[3] <= 248)
  assert.ok(c[2] <= 4 && c[3] <= 4, "one-cell accent footprint")
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("Data Center additions require page resolution and leave every other biome alone", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 12 && res === 2
    assert.equal(D.dataCenterPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("rack artwork is deterministic, read-only, RNG-free, half-pixel and canvas-state balanced", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random; Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen)), b = picture(ctx => draw(ctx, frozen))
        assert.equal(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("large cabinets, trays and uptime display are cached and stay anchored after carving", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawDataHall(ctx, w))
    const positions = w.corridors.map((_, row) => D.dataCabinets(w, row))
    w.ticks += 271
    assert.equal(picture(ctx => D.drawDataHall(ctx, w)).buf, back.buf)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual(w.corridors.map((_, row) => D.dataCabinets(w, row)), positions)
    assert.equal(picture(ctx => D.drawDataHall(ctx, w)).buf, back.buf)
    assert.ok(back.calls.some(c => c[2] === 17 && c[3] === 25 && c[4] === D.DATA_CASE))
    assert.ok(back.calls.some(c => c[2] > 200 && c[3] === 0.5 && c[4] === D.DATA_CABLE))
    assert.ok(back.calls.some(c => c[4] === D.DATA_LED && c[5] === 0.65), "UP 99 display")
  }
})

test("faceplates stay inside original surviving rack cells, never steel or newly built ground", () => {
  for (const level of levels) {
    const { w } = sample(level)
    const img = picture(ctx => D.drawDataFaces(ctx, w))
    assert.ok(img.calls.length > 0)
    for (const c of img.calls) footprint(c, (x, y) => {
      const cx = Math.floor(x / 4), cy = Math.floor(y / 4), material = w.terrain[cy * w.k.COLS + cx]
      assert.ok(w.updraft[cx + 1] || w.updraft[cx + 2])
      assert.ok([w.k.ROCK, w.k.ORE].includes(material))
    })
    for (const material of [w.k.EMPTY, w.k.DIRT, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawDataFaces(ctx, w)).calls.length, 0)
    }
  }
})

test("status dots blink on fixed cabinets with a cheap budget and clear terrain, fixtures and exit", () => {
  for (const level of levels) {
    const { w } = sample(level), count = w.corridors.reduce((n, _, row) => n + D.dataCabinets(w, row).length, 0)
    for (const ticks of [0, 77, 160, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawDataStatus(ctx, w)), boxes = D.dataReserved(w)
      assert.ok(img.calls.length > 0 && img.calls.length <= count * 3 && img.calls.length <= 162)
      for (const c of img.calls) {
        assert.equal(c[2], 1.5); assert.equal(c[3], 1); assert.equal(c[5], 1)
        assert.ok(D.assemblyUnreserved(boxes, ...c.slice(0, 4)))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    const old = picture(ctx => D.drawDataStatus(ctx, w)).buf
    w.ticks += 32
    assert.notEqual(picture(ctx => D.drawDataStatus(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawDataStatus(ctx, w)).calls.length, 0)
    }
  }
  const { w } = sample(), e = w.exit
  w.terrain.fill(w.k.EMPTY)
  const boxes = D.dataReserved(w)
  assert.equal(D.assemblyUnreserved(boxes, e.x * 4, e.y * 4, 0.5, 0.5), false)
  for (const h of w.hazards)
    assert.equal(D.assemblyUnreserved(boxes, h.zx0 * 4, h.zy0 * 4, 0.5, 0.5), false)
})

test("cached detail precedes original props and exit; live dots precede agents, umbrellas and hazard cues", () => {
  const { w, pal } = sample(32), calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = (...args) => { assert.ok(calls.length < MAX_CALLS); calls.push([ctx.fillStyle, ...args]) }
  D.drawTerrain(ctx, w, pal)
  const face = calls.findLastIndex(c => c[0] === D.DATA_CABLE)
  assert.ok(face >= 0)
  assert.ok(calls.findLastIndex(c => c[0] === pal.exitLight) > face)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; calls.length = 0
  D.drawActors(ctx, w, pal, {})
  const live = calls.findLastIndex(c => c[0] === D.DATA_LED)
  assert.ok(live >= 0)
  for (const colour of [pal.umbrellaStem, pal.exitLight])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > live)
})

test("original Data Center materials, rack lights, updrafts, props, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "ca7e136e8f7cf1a570caad5b907beabc91fae80e7c8b89d9b838e3ab104d4bd3"], [[2], "55088e5a1f136ae9bd20f5db49a5cff93afd7cd72ccd88516a7a7dedad806e79"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawRackLights(img.ctx, w); D.drawUpdrafts(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Hot Swap and Capacity Planning still carve/grow terrain without moving cabinet anchors", () => {
  for (const id of ["hotfix", "rackgrow"]) {
    const { w, pal } = sample(52), c = w.corridors[0], ev = S.EVENTS.find(e => e.id === id)
    const site = { c, x: 30 }, fx = { ...ev, x: 30, floorY: c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
    w.ticks = 24
    const img = canvas(800, 496)
    D.drawEventSite(img.ctx, w, pal, fx)
    const old = createHash("sha256").update(w.terrain).digest("hex"), anchors = D.dataCabinets(w, 0)
    S.fireEvent(w, ev, site)
    assert.notEqual(createHash("sha256").update(w.terrain).digest("hex"), old)
    assert.deepEqual(D.dataCabinets(w, 0), anchors)
    w.ticks = 70; fx.firedAt = 60
    D.drawEventSite(img.ctx, w, pal, fx)
    for (const call of picture(ctx => D.drawDataStatus(ctx, w)).calls)
      footprint(call, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})
test("drawing the rack hall leaves real updraft playthroughs identical", () => {
  const random = Math.random
  const jitter = seed => { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296) }
  try {
    for (const level of levels) {
      const seed = level * 7919 + 13
      const a = S.generate(level, 0, seed), b = S.generate(level, 0, seed)
      a.res = 2; b.res = 2
      const pal = P.build(themeOf("tokyo-night").theme, level), img = canvas(800, 496)
      for (let tick = 0; tick < 600; tick++) {
        // Spawn animation/blood jitter is outside the colony stream. Pin it
        // per step so a complete world digest also compares cosmetic fields.
        Math.random = jitter(seed + tick); S.step(a)
        Math.random = jitter(seed + tick); S.step(b)
        if (tick % 60 !== 0) continue
        Math.random = () => { throw new Error("render RNG during live play") }
        D.drawTerrain(img.ctx, a, pal); D.drawActors(img.ctx, a, pal, {})
        const digest = world => createHash("sha256").update(JSON.stringify(world)).digest("hex")
        assert.equal(digest(a), digest(b), `simulation replay ${level}, tick ${tick}`)
      }
    }
  } finally { Math.random = random }
})


test("rack lamps have visible green/amber/red clusters and independent fixed-position blink rates", () => {
  const { w } = sample(), b = { seed: 0 }, rates = [17, 41, 73], colours = new Set()
  for (let lamp = 0; lamp < 3; lamp++) {
    let last = D.dataLamp(b, lamp, 0), first = -1, transitions = 0
    for (let tick = 1; tick < 6000; tick++) {
      const colour = D.dataLamp(b, lamp, tick); colours.add(colour)
      if (colour === last) continue
      if (first >= 0) assert.equal((tick - first) % rates[lamp], 0, "blink has its own stable period")
      first = tick; last = colour; transitions++
    }
    assert.ok(transitions > 10)
  }
  for (const colour of [D.DATA_LED, D.DATA_AMBER, D.DATA_RED, D.DATA_IDLE]) assert.ok(colours.has(colour))
  w.terrain.fill(w.k.EMPTY); w.hazards = []; w.decor = []
  const frames = [0, 77, 476, 2300].map(tick => {
    w.ticks = tick
    return picture(ctx => D.drawDataStatus(ctx, w))
  })
  const coordinates = frame => frame.calls.map(c => c.slice(0, 4))
  for (const frame of frames) {
    assert.deepEqual(coordinates(frame), coordinates(frames[0]), "blink never moves the lamp")
    assert.ok(frame.calls.some(c => c[4] === D.DATA_LED && c[2] >= 1 && c[3] >= 1 && c[5] === 1))
    assert.ok(frame.calls.some(c => c[4] === D.DATA_AMBER && c[5] === 1))
  }
  assert.ok(frames.some(frame => frame.calls.some(c => c[4] === D.DATA_RED)))
})

test("cabinet bevel and floor-level blue pools are cached below the original silhouettes", () => {
  const { w } = sample(), img = picture(ctx => D.drawDataHall(ctx, w)), cabinets = w.corridors.flatMap((_, row) => D.dataCabinets(w, row))
  const pools = img.calls.filter(c => c[4] === D.DATA_COLD && c[3] <= 3)
  assert.equal(pools.length, cabinets.length * 3)
  for (const c of pools) {
    assert.ok(c[5] <= 0.3)
    assert.ok(w.corridors.some(row => c[1] >= row.floorY * 4 - 3 && c[1] + c[3] <= row.floorY * 4))
  }
  assert.ok(img.calls.some(c => c[4] === D.DATA_EDGE && c[2] > 10 && c[3] === 0.5))
})
